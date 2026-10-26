/* IntegrityWatch Field - tools/tests/e2e-core.mjs
   Autonomous E2E core harness (ESM). Boots its own static server on :8451,
   drives Microsoft Edge via playwright-core and runs 12 checks. Prints
   `PASS|FAIL|SKIP <id> <ms> <detalle>` lines plus a summary. exit(1) on FAIL.

   Run:  node tools\tests\e2e-core.mjs
   Writes evidence to docs/evidence/. Touches nothing under src/. */

import { chromium } from 'playwright-core';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import url from 'node:url';

const HERE = path.dirname(url.fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const PORT = 8451;
const BASE = `http://127.0.0.1:${PORT}`;
const EVID = path.join(ROOT, 'docs', 'evidence');
const CSV_FIXTURE = path.join(ROOT, 'datos-prueba', 'integritywatch-carga-prueba.csv');
const FILE_URL = 'file:///' + path.join(ROOT, 'index.html').replace(/\\/g, '/');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.xml': 'application/xml; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8',
  '.tsv': 'text/tab-separated-values; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8'
};

// ---------------------------------------------------------------- reporting ---
const rows = [];
let allConsoleErrors = [];

function pad(s, n) { s = String(s == null ? '' : s); return s.length >= n ? s.slice(0, n) : s + ' '.repeat(n - s.length); }
function clip(s, n) { s = String(s == null ? '' : s).replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1) + '…' : s; }

function report(status, id, ms, detail) {
  rows.push({ status, id, ms, detail });
  console.log(`${status} ${id} ${ms}ms ${clip(detail, 70)}`);
  if (process.env.IW_E2E_VERBOSE) { console.log(`   detalle[${id}]: ${detail}`); }
}

async function check(id, fn) {
  const t0 = Date.now();
  try {
    const detail = await fn();
    report('PASS', id, Date.now() - t0, detail || 'ok');
    return true;
  } catch (err) {
    const msg = err && err.message ? err.message : String(err);
    report('FAIL', id, Date.now() - t0, msg);
    console.log(`APP-BUG: ${id} -> ${clip(msg, 140)}`);
    return false;
  }
}

function skip(id, detail) { report('SKIP', id, 0, detail); }

function assert(cond, msg) { if (!cond) { throw new Error(msg); } }

// ------------------------------------------------------------------- server ---
function startServer() {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      if (req.method !== 'GET' && req.method !== 'HEAD') { res.statusCode = 405; res.end('Method Not Allowed'); return; }
      let pathname;
      try { pathname = decodeURIComponent((req.url || '/').split('?')[0].split('#')[0]); }
      catch (e) { pathname = '/'; }
      if (pathname === '' || pathname === '/') { pathname = '/index.html'; }
      const filePath = path.join(ROOT, pathname.replace(/^\/+/, ''));
      if (!filePath.startsWith(ROOT)) { res.statusCode = 403; res.end('Forbidden'); return; }
      fs.stat(filePath, (err, st) => {
        let target = filePath;
        if (!err && st.isDirectory()) { target = path.join(filePath, 'index.html'); }
        fs.stat(target, (err2, st2) => {
          if (err2 || !st2.isFile()) { res.statusCode = 404; res.end('Not found'); return; }
          const ext = path.extname(target).toLowerCase();
          res.setHeader('Content-Type', MIME[ext] || 'application/octet-stream');
          res.setHeader('Cache-Control', 'no-cache');
          if (req.method === 'HEAD') { res.statusCode = 200; res.end(); return; }
          const stream = fs.createReadStream(target);
          stream.on('error', () => { res.statusCode = 500; res.end('Read error'); });
          stream.pipe(res);
        });
      });
    });
    server.on('error', reject);
    server.listen(PORT, '127.0.0.1', () => resolve(server));
  });
}

// ------------------------------------------------------------------ helpers ---
async function closeToasts(page) {
  // Snapshot labels first (no auto-wait), then click the matching close buttons
  // with a short bounded timeout. Never block on detached nodes.
  try {
    const labels = await page.locator('#toast-region button').evaluateAll(
      (btns) => btns.map((b) => b.getAttribute('aria-label') || ''));
    for (let i = 0; i < labels.length; i++) {
      if (!/cerrar|close/i.test(labels[i])) { continue; }
      try { await page.locator('#toast-region button').nth(i).click({ timeout: 500 }); }
      catch (e) { /* detached or covered; cleared below */ }
    }
  } catch (e) { /* ignore */ }
  try {
    await page.evaluate(() => {
      const r = document.getElementById('toast-region');
      if (r) r.querySelectorAll('.toast').forEach((t) => t.remove());
    });
  } catch (e) { /* ignore */ }
}

async function waitBoot(page, timeout = 20000) {
  await page.waitForSelector('nav.app-sidebar', { timeout });
  await page.waitForSelector('main#main, main.app-main', { timeout });
}

function attachConsoleWatch(page) {
  page.on('console', (msg) => {
    if (msg.type() === 'error') { allConsoleErrors.push(`console.error: ${msg.text()}`); }
  });
  page.on('pageerror', (err) => {
    allConsoleErrors.push(`pageerror: ${err && err.message ? err.message : String(err)}`);
  });
}

function csvFileInput(page) {
  const byName = page.locator('input[type=file][name="csv-file"]');
  return byName;
}

async function importCsv(page, csvPath, { note = '', expectSummary = true } = {}) {
  const steps = [];
  const s0 = Date.now();
  const mark = (label) => steps.push(`${label}=${Date.now() - s0}ms`);

  // Ensure ingest view is mounted fresh.
  await page.evaluate(() => { if (location.hash !== '#/ingest') location.hash = '#/ingest'; });
  await page.waitForSelector('input#csv-file', { timeout: 15000 });
  mark('ingest');
  await closeToasts(page);

  let usedFallback = false;
  let input = csvFileInput(page);
  if ((await input.count()) === 0) { usedFallback = true; input = page.locator('input#csv-file'); }
  await input.setInputFiles(csvPath);
  mark('setFiles');

  await page.waitForSelector('#csv-create-missing', { timeout: 15000 });
  const cb = page.locator('#csv-create-missing');
  if (!(await cb.isChecked())) { await cb.check({ timeout: 5000 }); }
  mark('checked');
  await closeToasts(page);

  const validateBtn = page.locator('.csv-body button', { hasText: /validaci/i }).first();
  await validateBtn.click();
  await page.waitForSelector('.result-summary', { timeout: 15000 });
  mark('validated');
  if (expectSummary) {
    await page.waitForFunction(() => {
      const el = document.querySelector('.result-summary');
      if (!el) return false;
      const tx = el.textContent || '';
      return tx.includes('35') && tx.includes('4');
    }, { timeout: 8000 }).catch(() => {});
  }
  const summaryText = await page.locator('.result-summary').innerText();
  mark('summary');

  await closeToasts(page);
  const importBtn = page.locator('.csv-result button', { hasText: /^\s*importar\s*$/i }).first();
  await importBtn.click();
  mark('importClicked');
  const done = await page.waitForSelector('.import-done', { timeout: 15000 }).then(() => true).catch(() => false);
  mark('done=' + done);
  await page.waitForTimeout(2000);
  mark('settled');

  return { summaryText, usedFallback, note, steps: steps.join(' ') };
}

async function readDbCounts(page) {
  return await page.evaluate(() => new Promise((resolve) => {
    const req = indexedDB.open('integritywatch');
    req.onerror = () => resolve({ error: 'open-failed' });
    req.onsuccess = () => {
      const db = req.result;
      const out = { readings: 0, coupons: 0, points: [] };
      let tx;
      try { tx = db.transaction(['readings', 'coupons', 'monitoringPoints'], 'readonly'); }
      catch (e) { resolve({ error: 'tx-failed' }); return; }
      tx.objectStore('readings').count().onsuccess = (e) => { out.readings = e.target.result; };
      tx.objectStore('coupons').count().onsuccess = (e) => { out.coupons = e.target.result; };
      tx.objectStore('monitoringPoints').getAll().onsuccess = (e) => { out.points = e.target.result.map((p) => p.id); };
      tx.oncomplete = () => resolve(out);
      tx.onerror = () => resolve(out);
    };
  }));
}

// --------------------------------------------------------------------- main ---
async function main() {
  if (!fs.existsSync(EVID)) fs.mkdirSync(EVID, { recursive: true });
  const server = await startServer();
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const context = await browser.newContext({ acceptDownloads: true, viewport: { width: 1366, height: 768 } });

  // Spanish UI (spec expects es labels: «Ejecutar validación», «Importar», «Resolver»…).
  await context.addInitScript(() => {
    try { localStorage.setItem('iw.locale', 'es'); } catch (e) { /* file:// may forbid */ }
  });

  context.on('page', (p) => attachConsoleWatch(p));
  const page = await context.newPage();
  attachConsoleWatch(page);
  page.setDefaultTimeout(20000);

  let seededReadings = null;
  let seededCoupons = null;

  // 1 --- boot ---------------------------------------------------------------
  await check('boot', async () => {
    const resp = await page.goto(`${BASE}/index.html`, { waitUntil: 'domcontentloaded' });
    assert(resp && resp.ok(), `index.html HTTP ${resp ? resp.status() : 'no-response'}`);
    await waitBoot(page);
    await page.waitForSelector('.grid-bento', { timeout: 20000 });
    const title = await page.title();
    assert(title === 'IntegrityWatch Field', `title="${title}"`);
    const counts = await readDbCounts(page);
    seededReadings = counts.readings; seededCoupons = counts.coupons;
    return `title ok · seed readings=${counts.readings} coupons=${counts.coupons}`;
  });

  // 2 --- fresh-seed ---------------------------------------------------------
  await check('fresh-seed', async () => {
    const del = await page.evaluate(() => new Promise((resolve) => {
      let done = false;
      const fin = (v) => { if (!done) { done = true; resolve(v); } };
      try {
        const req = indexedDB.deleteDatabase('integritywatch');
        req.onsuccess = () => fin('success');
        req.onerror = () => fin('error');
        req.onblocked = () => fin('blocked');
        setTimeout(() => fin('timeout'), 3000);
      } catch (e) { fin('throw:' + (e && e.message)); }
    }));
    await page.reload({ waitUntil: 'domcontentloaded' });
    await waitBoot(page);
    await page.waitForSelector('.grid-bento', { timeout: 20000 });
    const bento = await page.locator('.grid-bento').first().locator('> *').count();
    await page.waitForFunction(() => document.querySelectorAll('.heat-cell').length >= 8, { timeout: 20000 });
    const cells = await page.locator('.heat-cell').count();
    assert(bento >= 5, `.grid-bento children=${bento} (<5)`);
    assert(cells >= 8, `heatmap cells=${cells} (<8)`);
    return `delete=${del} · grid-bento=${bento} · heatcells=${cells}`;
  });

  // 3 --- csv-import ---------------------------------------------------------
  await check('csv-import', async () => {
    assert(fs.existsSync(CSV_FIXTURE), `fixture missing: ${CSV_FIXTURE}`);
    const before = await readDbCounts(page);
    const { summaryText, usedFallback, steps } = await importCsv(page, CSV_FIXTURE);
    const after = await readDbCounts(page);
    const dRead = after.readings - before.readings;
    const dCoup = after.coupons - before.coupons;
    const pts = after.points || [];
    const hasImp = ['MP-IMP-001', 'MP-IMP-002', 'MP-IMP-003'].every((id) => pts.includes(id));
    assert(summaryText.includes('35') && summaryText.includes('4'), `summary="${clip(summaryText, 60)}"`);
    assert(dRead >= 25 && dRead <= 35, `readings delta=${dRead} (expected ~30)`);
    assert(dCoup === 5, `coupons delta=${dCoup} (expected 5)`);
    assert(hasImp, `missing MP-IMP-001/002/003 in [${pts.filter((p) => /^MP-IMP/.test(p)).join(',')}]`);
    return `readings+${dRead} coupons+${dCoup} newPoints ok${usedFallback ? ' (sel fallback #csv-file: no name attr)' : ''} [${steps}]`;
  });

  // 4 --- rules --------------------------------------------------------------
  await check('rules', async () => {
    await page.evaluate(() => { if (location.hash !== '#/dashboard') location.hash = '#/dashboard'; });
    await page.waitForSelector('#run-rules', { timeout: 15000 });
    await closeToasts(page);
    await page.locator('#run-rules').click();
    await page.waitForTimeout(3000);
    await page.evaluate(() => { location.hash = '#/recommendations'; });
    await page.waitForSelector('.rec-card', { timeout: 15000 });
    const resolveCount = await page.locator('.rec-card-actions button')
      .filter({ hasText: /^\s*Resolver\s*$/i }).count();
    const bodyText = await page.locator('body').innerText();
    assert(resolveCount >= 1, `resolve buttons=${resolveCount} (<1)`);
    assert(!bodyText.includes('rules.msg.'), 'raw i18n key "rules.msg." visible');
    assert(!bodyText.includes('severity.'), 'raw i18n key "severity." visible');
    const cards = await page.locator('.rec-card').count();
    return `cards=${cards} resolve=${resolveCount} no raw i18n keys`;
  });

  // 5 --- report-pdf ---------------------------------------------------------
  await check('report-pdf', async () => {
    await closeToasts(page);
    await page.evaluate(() => { location.hash = '#/reports'; });
    await page.waitForSelector('.report-controls', { timeout: 15000 });
    const genBtn = page.locator('.report-controls button', { hasText: /generar/i }).first();
    await genBtn.click();
    await page.waitForSelector('.print-root', { timeout: 20000 });
    const outPath = path.join(EVID, 'p0-quarterly.pdf');
    const buf = await page.pdf({ format: 'A4', printBackground: true, path: outPath });
    const onDisk = fs.readFileSync(outPath);
    const magic = onDisk.slice(0, 4).toString('latin1');
    assert(magic === '%PDF', `magic="${magic}"`);
    assert(onDisk.length > 20000, `size=${onDisk.length} bytes (<=20000)`);
    return `p0-quarterly.pdf ${onDisk.length}B magic=%PDF (buf ${buf ? buf.length : 0})`;
  });

  // 6 --- offline ------------------------------------------------------------
  await check('offline', async () => {
    await page.evaluate(() => { location.hash = '#/dashboard'; });
    await page.waitForSelector('.heat-cell', { timeout: 15000 });
    const controlled = await page.evaluate(async () => {
      try {
        const reg = await navigator.serviceWorker.getRegistration();
        return !!(reg && reg.active);
      } catch (e) { return false; }
    });
    await page.waitForFunction(async () => {
      try { const r = await navigator.serviceWorker.getRegistration(); return !!(r && r.active); }
      catch (e) { return false; }
    }, { timeout: 15000 }).catch(() => {});
    const active = await page.evaluate(async () => {
      try { const r = await navigator.serviceWorker.getRegistration(); return !!(r && r.active); }
      catch (e) { return false; }
    });
    assert(active || controlled, 'serviceWorker.ready not active within 15s');
    // Make sure this client is controlled by the SW before pulling the plug.
    if (!(await page.evaluate(() => !!navigator.serviceWorker.controller))) {
      await page.reload({ waitUntil: 'domcontentloaded' });
      await waitBoot(page);
      await page.waitForFunction(() => !!navigator.serviceWorker.controller, { timeout: 10000 }).catch(() => {});
    }
    await context.setOffline(true);
    try {
      await page.reload({ waitUntil: 'domcontentloaded' });
      await waitBoot(page, 15000);
      await page.evaluate(() => { location.hash = '#/dashboard'; });
      await page.waitForFunction(() => document.querySelectorAll('.heat-cell').length >= 8, { timeout: 15000 });
    } finally {
      await context.setOffline(false);
    }
    const cells = await page.locator('.heat-cell').count();
    return `SW active · offline reload served · heatcells=${cells}`;
  });

  // 7 --- file-protocol ------------------------------------------------------
  await check('file-protocol', async () => {
    const fp = await context.newPage();
    fp.setDefaultTimeout(20000);
    await fp.goto(FILE_URL, { waitUntil: 'domcontentloaded' });
    await fp.waitForSelector('nav.app-sidebar', { timeout: 20000 });
    const navVisible = await fp.locator('nav.app-sidebar').isVisible();
    const bannerCount = await fp.locator('.fileguard-banner').count();
    assert(navVisible, 'nav.app-sidebar not visible under file://');
    assert(bannerCount >= 1, '.fileguard-banner missing under file://');
    await closeToasts(fp);
    const link = fp.locator('nav.app-sidebar a', { hasText: /corrosi/i }).first();
    await link.click();
    await fp.waitForFunction(() => {
      const m = document.getElementById('main');
      return !!(m && (m.querySelector('h1') || m.querySelector('table')));
    }, { timeout: 15000 });
    const hasH1 = await fp.locator('#main h1').count();
    const hasTable = await fp.locator('#main table').count();
    return `banner ok · nav ok · main rendered (h1=${hasH1} table=${hasTable})`;
  });

  // 8 --- xss-import ---------------------------------------------------------
  await check('xss-import', async () => {
    const payload = '<img src=x onerror="window.__xssFired=1">';
    const tmp = path.join(os.tmpdir(), `iw-xss-${Date.now()}.csv`);
    const csvText = 'punto,fecha,tasa,nota\n' + 'MP-CORR-001,2026-01-15,3.5,"' + payload.replace(/"/g, '""') + '"\n';
    fs.writeFileSync(tmp, csvText, 'utf8');
    try {
      const imp = await importCsv(page, tmp, { expectSummary: false });
      await page.evaluate(() => { location.hash = '#/corrosion/mp/MP-CORR-001'; });
      await page.waitForSelector('#main table', { timeout: 15000 });
      const literal = await page.waitForFunction(
        () => document.body.innerText.includes('<img'),
        { timeout: 8000 }
      ).then(() => true).catch(() => false);
      const fired = await page.evaluate(() => window.__xssFired);
      assert(fired === undefined, `XSS EXECUTED: window.__xssFired=${fired}`);
      return `no exec · literal '<img' in DOM=${literal ? 'yes' : 'no'} [${imp.steps}]`;
    } finally {
      try { fs.unlinkSync(tmp); } catch (e) { /* ignore */ }
    }
  });

  // 9 --- viewports ----------------------------------------------------------
  await check('viewports', async () => {
    const cases = [
      { w: 1366, h: 768, mobile: false },
      { w: 800, h: 700, mobile: true },
      { w: 390, h: 844, mobile: true }
    ];
    const notes = [];
    for (const c of cases) {
      await page.setViewportSize({ width: c.w, height: c.h });
      await page.evaluate(() => { location.hash = '#/dashboard'; });
      await page.waitForSelector('.grid-bento', { timeout: 15000 });
      await page.waitForTimeout(250);
      const m = await page.evaluate(() => {
        const ham = document.querySelector('.hamburger');
        const nav = document.querySelector('.app-sidebar');
        return {
          overflow: document.documentElement.scrollWidth - window.innerWidth,
          hamburgerShown: ham ? getComputedStyle(ham).display !== 'none' : false,
          hamDisplay: ham ? getComputedStyle(ham).display : 'missing',
          mqMobile: window.matchMedia('(max-width: 899.98px)').matches,
          navWidth: nav ? Math.round(nav.getBoundingClientRect().width) : -1,
          inner: window.innerWidth
        };
      });
      assert(m.overflow <= 2, `${c.w}px: horizontal overflow ${m.overflow}px`);
      if (c.mobile) {
        assert(m.hamburgerShown, `${c.w}px: .hamburger hidden (expected visible ≤900)`);
      } else {
        assert(m.navWidth >= 212 && m.navWidth <= 228, `${c.w}px: nav width=${m.navWidth} (expected ~220)`);
        assert(!m.hamburgerShown,
          `${c.w}px: .hamburger display=${m.hamDisplay} (mqMobile=${m.mqMobile}); expected hidden >900 ` +
          '(CSS: layout.css .hamburger{display:none} is overridden by components.css .btn{display:inline-flex})');
      }
      notes.push(`${c.w}x${c.h} ovf=${m.overflow} nav=${m.navWidth} ham=${m.hamDisplay}`);
    }
    return notes.join(' | ');
  });

  // 10 --- console-clean -----------------------------------------------------
  await check('console-clean', async () => {
    if (allConsoleErrors.length === 0) { return 'no console errors / pageerrors'; }
    allConsoleErrors.forEach((e, i) => console.log(`  [${i + 1}] ${clip(e, 160)}`));
    throw new Error(`${allConsoleErrors.length} console error(s)/pageerror(s): ${clip(allConsoleErrors[0], 50)}`);
  });

  // 11 --- alarm-banner ------------------------------------------------------
  await check('alarm-banner', async () => {
    await closeToasts(page);
    await page.evaluate(() => { if (location.hash !== '#/dashboard') location.hash = '#/dashboard'; });
    await page.waitForSelector('#run-rules', { timeout: 15000 });
    const visible0 = await page.locator('.alarm-banner').isVisible().catch(() => false);
    if (!visible0) {
      await page.locator('#run-rules').click();
      await page.waitForTimeout(3000);
    }
    await page.waitForFunction(() => {
      const b = document.querySelector('.alarm-banner');
      if (!b || b.hidden) return false;
      return /\d/.test(b.textContent || '');
    }, { timeout: 15000 }).catch(() => {});
    const visible = await page.locator('.alarm-banner').isVisible().catch(() => false);
    const text = await page.locator('.alarm-banner').innerText().catch(() => '');
    assert(visible, '.alarm-banner not visible after rules sweep');
    assert(/\d/.test(text), `banner text has no number: "${clip(text, 60)}"`);
    return `banner="${clip(text, 50)}"`;
  });

  // 12 --- admin -------------------------------------------------------------
  await check('admin', async () => {
    await closeToasts(page);
    await page.evaluate(() => { location.hash = '#/admin'; });
    await page.waitForSelector('.view-admin', { timeout: 15000 });
    const btn = page.locator('.view-admin button').filter({ hasText: /actualizaci|update/i }).first();
    const count = await btn.count();
    assert(count >= 1, 'no force-update button (expected text /actualización|update/i)');
    const label = (await btn.innerText()).trim();
    return `button="${clip(label, 40)}"`;
  });

  // 13 --- assistant ----------------------------------------------------------
  await check('assistant', async () => {
    const errorsBefore = allConsoleErrors.length;
    await page.evaluate(() => { if (location.hash !== '#/assistant') location.hash = '#/assistant'; });
    await page.waitForSelector('#assistant-input', { timeout: 15000 });
    const inputCount = await page.locator('#assistant-input').count();
    assert(inputCount >= 1, '#assistant-input no encontrado');
    const suggestions = await page.locator('.assistant-suggestions button').count();
    assert(suggestions >= 3, `suggestions=${suggestions} (<3)`);
    const registered = await page.evaluate(() => {
      const iw = window.IW || {};
      return {
        view: !!((iw.views || {}) && (iw.views || {}).assistant),
        engine: !!((iw.app || {}) && (iw.app || {}).assistantEngine)
      };
    });
    assert(registered.view, 'IW.views.assistant no registrado');
    assert(registered.engine, 'IW.app.assistantEngine no registrado');
    assert(allConsoleErrors.length === errorsBefore, `nuevos errores de consola en #/assistant`);
    return `input=${inputCount} suggestions=${suggestions} view=${registered.view} engine=${registered.engine} consola=limpia`;
  });

  await browser.close();
  await new Promise((r) => server.close(r));

  // ------------------------------------------------------------------ summary --
  const pass = rows.filter((r) => r.status === 'PASS').length;
  const fail = rows.filter((r) => r.status === 'FAIL').length;
  const skipN = rows.filter((r) => r.status === 'SKIP').length;
  const totalMs = rows.reduce((a, r) => a + r.ms, 0);
  console.log('------------------------------------------------------------');
  console.log(`RESUMEN: ${pass} PASS · ${fail} FAIL · ${skipN} SKIP · ${totalMs} ms total · ${rows.length} checks`);
  if (fail > 0) {
    console.log('FALLIDOS: ' + rows.filter((r) => r.status === 'FAIL').map((r) => r.id).join(', '));
    process.exitCode = 1;
  } else {
    console.log('TODOS LOS CHEQUEOS PASARON');
  }
}

main().catch((err) => {
  console.error('FATAL:', err && err.stack ? err.stack : err);
  process.exitCode = 1;
});
