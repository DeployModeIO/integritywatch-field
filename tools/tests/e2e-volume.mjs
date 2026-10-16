// IntegrityWatch Field — P0 VOLUME E2E (ESM, playwright-core Edge channel, headless).
//
// Twin of tools/tests/volume.cjs (in-process harness): same 10 000-row shape, but
// driven end-to-end through the real UI in a real browser. Deterministic LCG seed
// 4242, points MP-E2E-001..020.
//
//   node tools/tests/e2e-volume.mjs
//
// Own static node:http server on 127.0.0.1:8452 (ROOT from import.meta.url).
// Output per check: "PASS|FAIL <id> <ms> <detalle>"; summary; exit(1) if any FAIL.
//
// Checks:
//   gen-csv          generate os.tmpdir()/iw-e2e-volume.csv (10 000 rows) + real-parser counts
//   fresh            goto index.html, deleteDatabase('integritywatch'), reload, wait dashboard
//   import-ui        #/ingest -> (create missing points) -> validate -> import, total time <60 s
//   data-count       IndexedDB readings >= 9000 and new monitoring points present
//   dashboard-perf   #/dashboard hash -> heatmap cells, <3 s
//   detail-perf      a high-volume point ficha -> readings table rows, <5 s with >=400 rows
//   ui-alive         click "Run rules" -> header status/badge updates, <5 s
//
// Evidence: docs/evidence/p0-volume-dashboard.png
//
// Notes (documented behaviour, not bugs):
//   * The "Create missing points" checkbox (#csv-create-missing) is rendered only
//     AFTER a file is parsed (src/views/ingest.js renderCsvBody), so the file is
//     selected first and the checkbox marked immediately after it appears.
//   * New points created by the CSV importer get id "MP-IMP-<nnn>" (src/ingest/csv.js),
//     while the CSV "punto" column carries the code "MP-E2E-<nnn>". data-count accepts
//     the real app pattern (MP-IMP-*) and documents it.
//   * deleteDatabase is executed from a script-less same-origin document so it is not
//     blocked by the app's open IndexedDB connection; the app is then (re)loaded fresh.
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { writeFileSync, statSync, mkdirSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const HOST = '127.0.0.1';
const PORT = 8452;
const BASE = `http://${HOST}:${PORT}`;
const EVIDENCE = path.join(ROOT, 'docs', 'evidence');
const DAY_MS = 86400000;
const WAIT = 30000;
const IMPORT_WAIT = 120000;

// ------------------------------------------------------------------ reporting --
let failures = 0;
function log(status, id, ms, detail) {
  const d = String(detail == null ? '' : detail).replace(/\s+/g, ' ').trim();
  const msTxt = ms == null ? '-' : String(Math.round(ms));
  console.log(`${status} ${id} ${msTxt}${d ? ' ' + d : ''}`);
  if (status === 'FAIL') failures += 1;
}
const now = () => performance.now();

// ------------------------------------------------------- 1. deterministic CSV --
// Mirrors tools/tests/volume.cjs (LCG, per-point mix) but seed 4242 + MP-E2E codes.
const CSV_PATH = path.join(tmpdir(), 'iw-e2e-volume.csv');
function aaux(rand) {
  const CATS = ['sweet', 'sour', 'oxygen', 'sweet', 'sour'];
  const NOTES = ['volumen', 'lectura de campo', 'cupon gravimetrico', 'yacimiento A', 'linea 12'];
  return [
    Math.floor(rand() * 51),
    (20 + rand() * 75).toFixed(1),
    (rand() * 2).toFixed(3),
    CATS[Math.floor(rand() * CATS.length)],
    NOTES[Math.floor(rand() * NOTES.length)]
  ];
}

function generateCsv() {
  let lcg = 4242;
  const rand = () => { lcg = (Math.imul(lcg, 1103515245) + 12345) & 0x7fffffff; return lcg / 0x80000000; };
  const randInt = (m) => Math.floor(rand() * m);
  const START_MS = Date.UTC(2026, 0, 1);
  const END_MS = Date.UTC(2026, 9, 16);
  const SPAN_DAYS = Math.round((END_MS - START_MS) / DAY_MS);
  const randDate = () => new Date(START_MS + randInt(SPAN_DAYS + 1) * DAY_MS).toISOString().slice(0, 10);
  const pad = (n, w) => String(n).padStart(w, '0');

  const HEADER = 'punto,fecha,tasa,wi,wf,área,días,residual,temperatura,bsw,categoría,nota';
  const PER_POINT = { valid: 450, future: 25, negRate: 15, badDate: 5, coupon: 5 }; // 500/point
  const lines = [HEADER];
  const row = (...v) => lines.push(v.join(','));

  for (let p = 1; p <= 20; p++) {
    const point = 'MP-E2E-' + pad(p, 3);

    // 450 distinct rates per point (shuffled) => no (code|date|rate) duplicate key.
    const rates = [];
    for (let j = 0; j < PER_POINT.valid; j++) {
      rates.push(Math.round((0.5 + ((j + 0.5) / PER_POINT.valid) * 11.5) * 10000) / 10000);
    }
    for (let j = rates.length - 1; j > 0; j--) {
      const k = randInt(j + 1);
      const t = rates[j]; rates[j] = rates[k]; rates[k] = t;
    }

    for (let j = 0; j < PER_POINT.valid; j++) {
      const a = aaux(rand);
      row(point, randDate(), rates[j].toFixed(4), '', '', '', '', a[0], a[1], a[2], a[3], a[4]);
    }
    for (let j = 0; j < PER_POINT.future; j++) {           // 2027-06-01 -> E_DATE_FUTURE
      const a = aaux(rand);
      row(point, '2027-06-01', (1 + rand() * 5).toFixed(3), '', '', '', '', a[0], a[1], a[2], a[3], a[4]);
    }
    for (let j = 0; j < PER_POINT.negRate; j++) {          // -1 -> E_RANGE
      const a = aaux(rand);
      row(point, randDate(), '-1', '', '', '', '', a[0], a[1], a[2], a[3], a[4]);
    }
    for (let j = 0; j < PER_POINT.badDate; j++) {          // 99/99/2026 -> E_DATE_FORMAT
      const a = aaux(rand);
      row(point, '99/99/2026', (1 + rand() * 5).toFixed(3), '', '', '', '', a[0], a[1], a[2], a[3], a[4]);
    }
    for (let j = 0; j < PER_POINT.coupon; j++) {           // valid coupon
      const targetMpy = j + 1;
      const deltaWmg = targetMpy * 7.85 * 3.72 * 720 / 534;
      const wfMg = (24100 - deltaWmg).toFixed(4);
      const a = aaux(rand);
      row(point, randDate(), '', '24100', wfMg, '3.72', '30', a[0], a[1], a[2], a[3], a[4]);
    }
  }

  const text = lines.join('\n') + '\n';
  writeFileSync(CSV_PATH, text, 'utf8');
  return { text, rows: lines.length - 1, bytes: statSync(CSV_PATH).size };
}

// ------------------------------------------------------------- static server --
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.xml': 'application/xml; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8',
  '.tsv': 'text/tab-separated-values; charset=utf-8'
};

function startServer() {
  const server = createServer(async (req, res) => {
    try {
      const u = new URL(req.url, BASE);
      let p = decodeURIComponent(u.pathname);
      // Script-less same-origin document used only to delete IndexedDB (see fresh).
      if (p === '/__e2e_blank') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
        res.end('<!doctype html><meta charset="utf-8"><title>blank</title>');
        return;
      }
      if (p === '/' || p === '') { p = '/index.html'; }
      const fp = path.join(ROOT, path.normalize(p.replace(/^[/\\]+/, '')));
      if (fp !== ROOT && !fp.startsWith(ROOT + path.sep)) { res.writeHead(403); res.end('forbidden'); return; }
      const data = await readFile(fp);
      res.writeHead(200, {
        'Content-Type': MIME[path.extname(fp).toLowerCase()] || 'application/octet-stream',
        'Cache-Control': 'no-store'
      });
      res.end(data);
    } catch {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('not found');
    }
  });
  return new Promise((resolve, reject) => {
    server.on('error', (err) => reject(new Error(`server ${PORT}: ${err.code || err.message}`)));
    server.listen(PORT, HOST, () => resolve(server));
  });
}

// ------------------------------------------------------------------ helpers ---
async function dismissToasts(page) {
  await page.evaluate(() => {
    const region = document.getElementById('toast-region');
    if (!region) { return; }
    // Click CLOSE buttons only (they carry aria-label). NEVER click action buttons:
    // the SW-update toast's action is "Reload" (timeoutMs:0) and clicking it reloads
    // the app mid-flow (that was the observed page.click navigation stall).
    region.querySelectorAll('.toast button[aria-label]').forEach((b) => { try { b.click(); } catch { /* ignore */ } });
    // Drop any toast node still present, without side effects.
    region.querySelectorAll('.toast').forEach((t) => t.remove());
  }).catch(() => {});
}

async function waitDashboard(page, timeout = WAIT) {
  await page.waitForSelector('nav.app-sidebar', { timeout });
  await page.waitForSelector('.heat-cell', { timeout });
}

async function idbSnapshot(page) {
  return page.evaluate(() => new Promise((resolve, reject) => {
    const req = indexedDB.open('integritywatch');
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      const db = req.result;
      const tx = db.transaction(['readings', 'monitoringPoints'], 'readonly');
      const c = tx.objectStore('readings').count();
      const pts = tx.objectStore('monitoringPoints').getAll();
      tx.oncomplete = () => {
        const points = (pts.result || []).map((p) => ({ id: p.id, code: p.code }));
        db.close();
        resolve({ readings: c.result, points });
      };
      tx.onerror = () => reject(tx.error);
    };
  }));
}

// -------------------------------------------------------------------- main ----
let server = null;
let browser = null;

try {
  mkdirSync(EVIDENCE, { recursive: true });
  server = await startServer();
  browser = await chromium.launch({ channel: 'msedge', headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const consoleErrors = [];
  page.on('console', (m) => { if (m.type() === 'error') { consoleErrors.push(m.text()); } });
  page.on('pageerror', (e) => { consoleErrors.push('pageerror: ' + e.message); });

  /* ------------------------------ 1) gen-csv ------------------------------ */
  {
    const t0 = now();
    let detail = 'APP-BUG: generation failed';
    let ok = false;
    try {
      const gen = generateCsv();
      // Independent confirmation with the REAL app parser (no browser).
      const csv = require(path.join(ROOT, 'src', 'ingest', 'csv.js'));
      const delim = csv.detectDelimiter(gen.text);
      const parsed = csv.parse(gen.text, { delimiter: delim });
      const mapped = csv.mapColumns(parsed.headers);
      const objects = parsed.rows.map((cells) => {
        const o = {};
        parsed.headers.forEach((h, i) => { const f = mapped.mapping[h]; if (f && cells[i] !== undefined) { o[f] = String(cells[i]).trim(); } });
        return o;
      });
      const v = csv.validateRows({ rows: objects, existingPointIds: [], nowISO: new Date().toISOString(), autoCreatePoints: true });
      const recs = csv.toRecords(v.valid, mapped.mapping);
      ok = gen.rows === 10000 && v.valid.length === 9100 && v.invalid.length === 900 &&
        v.duplicates.length === 0 && v.newPoints.length === 20 &&
        recs.readings.length === 9000 && recs.coupons.length === 100;
      detail = `rows=${gen.rows} valid=${v.valid.length} invalid=${v.invalid.length} dup=${v.duplicates.length} ` +
        `newPoints=${v.newPoints.length} readings=${recs.readings.length} coupons=${recs.coupons.length} ` +
        `bytes=${gen.bytes} file=${CSV_PATH}`;
      if (!ok) { detail += ' | APP-BUG: CSV shape diverges from the 10000/9000/900 spec'; }
    } catch (e) {
      detail = 'APP-BUG: ' + ((e && e.message) || e);
    }
    log(ok ? 'PASS' : 'FAIL', 'gen-csv', now() - t0, detail);
  }

  /* ------------------------------ 2) fresh -------------------------------- */
  {
    const t0 = now();
    let ok = false;
    let detail = 'APP-BUG: fresh boot failed';
    try {
      await page.goto(BASE + '/index.html', { waitUntil: 'load', timeout: WAIT });
      // The running app holds an open IndexedDB connection, which blocks deletion.
      // Delete from a script-less same-origin document, then load the app fresh.
      await page.goto(BASE + '/__e2e_blank', { waitUntil: 'load', timeout: WAIT });
      const del = await page.evaluate(() => new Promise((resolve, reject) => {
        const req = indexedDB.deleteDatabase('integritywatch');
        req.onsuccess = () => resolve('deleted');
        req.onerror = () => reject(req.error);
        req.onblocked = () => resolve('blocked');
      }));
      await page.goto(BASE + '/index.html', { waitUntil: 'load', timeout: WAIT });
      await waitDashboard(page, WAIT);
      const cells = await page.locator('.heat-cell').count();
      ok = del === 'deleted' && cells > 0;
      detail = `deleteDatabase=${del} heatCells=${cells} (fresh seed)`;
      if (!ok) { detail += ' | APP-BUG: fresh DB reload did not reach the dashboard'; }
    } catch (e) {
      detail = 'APP-BUG: ' + ((e && e.message) || e);
    }
    log(ok ? 'PASS' : 'FAIL', 'fresh', now() - t0, detail);
  }

  /* ------------------------------ 3) import-ui ---------------------------- */
  let importMs = null;
  {
    const t0 = now();
    let ok = false;
    let detail = 'APP-BUG: CSV import through the UI failed';
    try {
      // Same-document hash navigation (avoid page.goto here: a hash-only goto
      // leaves Playwright's navigation tracking open and stalls the next click).
      await page.evaluate(() => { location.hash = '#/ingest'; });
      await page.waitForSelector('#csv-file', { timeout: WAIT });
      await dismissToasts(page);

      await page.setInputFiles('#csv-file', CSV_PATH);
      // "Create missing points" only exists after the file is parsed.
      await page.waitForSelector('#csv-create-missing', { timeout: WAIT });
      await page.evaluate(() => {
        const c = document.querySelector('#csv-create-missing');
        if (c && !c.checked) { c.checked = true; c.dispatchEvent(new Event('change', { bubbles: true })); }
      });

      await dismissToasts(page);
      const tVal = now();
      await page.click('#panel-csv .csv-body .row button.btn-primary'); // Ejecutar validación
      await page.waitForSelector('#panel-csv .csv-result .result-summary', { timeout: IMPORT_WAIT });

      await dismissToasts(page);
      await page.click('#panel-csv .csv-result .row button.btn-primary'); // Importar
      await page.waitForSelector('.csv-result .import-done', { timeout: IMPORT_WAIT });
      importMs = now() - tVal;

      // Confirm the import history entry landed too.
      const hist = await page.locator('.import-history table tbody tr').count().catch(() => 0);
      ok = importMs < 60000;
      detail = `validation+import=${Math.round(importMs)}ms historyRows=${hist}`;
      if (importMs >= 60000) { detail += ' APP-BUG: import budget >60000ms'; }
      else if (importMs >= 30000) { detail = 'WARN ' + detail + ' (30-60 s, above the 10 s target)'; }
    } catch (e) {
      detail = 'APP-BUG: ' + ((e && e.message) || e);
    }
    log(ok ? 'PASS' : 'FAIL', 'import-ui', importMs != null ? importMs : now() - t0, detail);
  }

  /* ------------------------------ 4) data-count --------------------------- */
  {
    const t0 = now();
    let ok = false;
    let detail = 'APP-BUG: IndexedDB did not hold the imported volume';
    try {
      const snap = await idbSnapshot(page);
      // Real app pattern: csv.js creates id "MP-IMP-<nnn>" for auto-created points.
      const newPts = snap.points.filter((p) => /^MP-IMP-/.test(p.id));
      const codes = snap.points.filter((p) => /^MP-E2E-/.test(p.code));
      ok = snap.readings >= 9000 && (newPts.length > 0 || codes.length > 0);
      detail = `readings=${snap.readings} (>=9000) newPoints=${newPts.length} idPattern=MP-IMP-* ` +
        `csvCodes(MP-E2E-*)=${codes.length} totalPoints=${snap.points.length}`;
      if (!ok) { detail += ' | APP-BUG: expected >=9000 readings and MP-IMP-* points'; }
    } catch (e) {
      detail = 'APP-BUG: ' + ((e && e.message) || e);
    }
    log(ok ? 'PASS' : 'FAIL', 'data-count', now() - t0, detail);
  }

  /* ---------------------------- 5) dashboard-perf ------------------------- */
  {
    let ok = false;
    let ms = null;
    let detail = 'APP-BUG: dashboard did not render the heatmap';
    try {
      const t0 = now();
      await page.evaluate(() => { location.hash = '#/dashboard'; });
      await page.waitForSelector('.heat-cell', { timeout: WAIT });
      ms = now() - t0;
      const cells = await page.locator('.heat-cell').count();
      await dismissToasts(page);
      await page.screenshot({ path: path.join(EVIDENCE, 'p0-volume-dashboard.png'), fullPage: true });
      ok = ms < 3000;
      detail = `hashToHeatCells=${Math.round(ms)}ms cells=${cells} shot=docs/evidence/p0-volume-dashboard.png`;
      if (!ok) { detail += ' APP-BUG: dashboard hash->heatmap >3000ms'; }
    } catch (e) {
      detail = 'APP-BUG: ' + ((e && e.message) || e);
    }
    log(ok ? 'PASS' : 'FAIL', 'dashboard-perf', ms, detail);
  }

  /* ------------------------------ 6) detail-perf -------------------------- */
  {
    let ok = false;
    let ms = null;
    let detail = 'APP-BUG: point detail did not render readings';
    try {
      // Prefer the high-volume point (code MP-E2E-001); fall back to MP-IMP-001.
      const snap = await idbSnapshot(page);
      const target = snap.points.find((p) => p.code === 'MP-E2E-001') || snap.points.find((p) => p.id === 'MP-IMP-001');
      const mpId = target ? target.id : 'MP-IMP-001';

      const t0 = now();
      await page.evaluate((id) => { location.hash = '#/corrosion/mp/' + encodeURIComponent(id); }, mpId);
      // The readings card is the one holding the trend svg; its data-table rows are counts.
      await page.waitForFunction(() => {
        const svg = document.querySelector('svg.trend');
        if (!svg) { return false; }
        const card = svg.closest('.card');
        return !!card && card.querySelectorAll('table.data tbody tr').length > 0;
      }, { timeout: WAIT });
      ms = now() - t0;
      await dismissToasts(page);
      const rows = await page.evaluate(() => {
        const card = document.querySelector('svg.trend').closest('.card');
        return card.querySelectorAll('table.data tbody tr').length;
      });
      // App renders ALL readings (no pagination/limit) -> expect >=400 rows.
      ok = ms < 5000 && rows >= 400;
      detail = `point=${mpId} rows=${rows} render=${Math.round(ms)}ms (table not paginated: all rows rendered)`;
      if (!ok) { detail += ' APP-BUG: detail perf/rows below budget (want <5000ms and >=400 rows)'; }
    } catch (e) {
      detail = 'APP-BUG: ' + ((e && e.message) || e);
    }
    log(ok ? 'PASS' : 'FAIL', 'detail-perf', ms, detail);
  }

  /* ------------------------------- 7) ui-alive ---------------------------- */
  {
    let ok = false;
    let ms = null;
    let detail = 'APP-BUG: UI did not react to Run rules';
    try {
      await dismissToasts(page);
      await page.waitForSelector('#run-rules', { timeout: WAIT });
      // The shell rebuilds <body>, so the live nodes are .rules-status / .badge-recs
      // (the index.html #rules-status / #recs-badge placeholders are gone).
      const readChrome = () => page.evaluate(() => ({
        status: (document.querySelector('.rules-status') || {}).textContent || '',
        badgeHidden: !!(document.querySelector('.badge-recs') || {}).hidden,
        count: (document.querySelector('.badge-recs .badge-count') || {}).textContent || ''
      }));
      const before = await readChrome();
      const t0 = now();
      await page.click('#run-rules');
      // UI alive == a real status/badge update after the click (Run rules -> sweep -> chrome refresh).
      await page.waitForFunction((b) => {
        const s = document.querySelector('.rules-status');
        const badge = document.querySelector('.badge-recs');
        const count = document.querySelector('.badge-recs .badge-count');
        const status = s ? s.textContent : '';
        const hidden = badge ? badge.hidden : true;
        const ct = count ? count.textContent : '';
        return status !== b.status || hidden !== b.badgeHidden || ct !== b.count;
      }, before, { timeout: 5000 });
      ms = now() - t0;
      await dismissToasts(page);
      const after = await readChrome();
      ok = ms < 5000 && (after.status !== before.status || after.badgeHidden !== before.badgeHidden || after.count !== before.count);
      detail = `runRulesReact=${Math.round(ms)}ms status="${after.status}" badgeHidden=${after.badgeHidden} ` +
        `count=${after.count}; before status="${before.status}" count="${before.count}"`;
      if (!ok) { detail += ' APP-BUG: Run rules did not update the UI within 5000ms'; }
    } catch (e) {
      detail = 'APP-BUG: ' + ((e && e.message) || e);
    }
    log(ok ? 'PASS' : 'FAIL', 'ui-alive', ms, detail);
  }

  await ctx.close();
} catch (e) {
  log('FAIL', 'harness', null, `fatal: ${(e && e.stack) || e}`);
} finally {
  if (browser) { await browser.close().catch(() => {}); }
  if (server) { await new Promise((r) => server.close(r)); }
}

console.log('');
console.log(`SUMMARY: ${failures === 0 ? 'OK' : 'FAILED'} (${failures} failing check${failures === 1 ? '' : 's'})`);
process.exit(failures === 0 ? 0 : 1);
