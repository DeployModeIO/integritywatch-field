/* IntegrityWatch Field - tools/tests/e2e-og.mjs
   Autonomous E2E harness for the O&G star symbols (Trend chart, Gauge, Sparkline,
   Skeleton). Boots its own static server on :8455, drives Microsoft Edge via
   playwright-core and runs 8 checks. Prints `PASS|FAIL <id> <ms> <detalle>` lines
   plus a summary. exit(1) on FAIL.

   Run:  node tools\tests\e2e-og.mjs
   Writes evidence to docs/evidence/. Touches nothing under src/. */

import { chromium } from 'playwright-core';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const HERE = path.dirname(url.fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const PORT = 8455;
const BASE = `http://127.0.0.1:${PORT}`;
const EVID = path.join(ROOT, 'docs', 'evidence');

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
  '.txt': 'text/plain; charset=utf-8'
};

// ---------------------------------------------------------------- reporting ---
const rows = [];
let allConsoleErrors = [];

function pad(s, n) { s = String(s == null ? '' : s); return s.length >= n ? s.slice(0, n) : s + ' '.repeat(n - s.length); }
function clip(s, n) { s = String(s == null ? '' : s).replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1) + '…' : s; }

function report(status, id, ms, detail) {
  rows.push({ status, id, ms, detail });
  console.log(`${status} ${pad(id, 12)} ${String(ms).padStart(5)}ms ${clip(detail, 80)}`);
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
function attachConsoleWatch(page) {
  page.on('console', (msg) => {
    if (msg.type() === 'error') { allConsoleErrors.push(`console.error: ${msg.text()}`); }
  });
  page.on('pageerror', (err) => {
    allConsoleErrors.push(`pageerror: ${err && err.message ? err.message : String(err)}`);
  });
}

async function waitBoot(page, timeout = 20000) {
  await page.waitForSelector('nav.app-sidebar', { timeout });
  await page.waitForSelector('main.app-main, main#main, main#view', { timeout });
}

async function closeToasts(page) {
  try {
    await page.evaluate(() => {
      const r = document.getElementById('toast-region');
      if (r) r.querySelectorAll('.toast').forEach((t) => t.remove());
    });
  } catch (e) { /* ignore */ }
}

// --------------------------------------------------------------------- main ---
async function main() {
  if (!fs.existsSync(EVID)) fs.mkdirSync(EVID, { recursive: true });
  const server = await startServer();
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const context = await browser.newContext({ viewport: { width: 1366, height: 900 } });

  context.on('page', (p) => attachConsoleWatch(p));
  const page = await context.newPage();
  attachConsoleWatch(page);
  page.setDefaultTimeout(20000);

  // 1 --- boot-clean ---------------------------------------------------------
  await check('boot-clean', async () => {
    const resp = await page.goto(`${BASE}/index.html`, { waitUntil: 'domcontentloaded' });
    assert(resp && resp.ok(), `index.html HTTP ${resp ? resp.status() : 'no-response'}`);
    await waitBoot(page);
    await page.waitForSelector('.grid-bento', { timeout: 20000 });
    const title = await page.title();
    assert(title === 'IntegrityWatch Field', `title="${title}"`);
    await closeToasts(page);
    return `title ok · shell + dashboard mounted`;
  });

  // 2 --- trend-render -------------------------------------------------------
  await check('trend-render', async () => {
    await page.evaluate(() => { location.hash = '#/corrosion/mp/MP-CORR-001'; });
    await page.waitForSelector('.trend-chart svg', { timeout: 20000 });
    const n = await page.locator('.trend-chart svg polyline, .trend-chart svg path.trend-line').first()
      .evaluate((el) => {
        if (el.tagName.toLowerCase() === 'polyline') {
          const p = (el.getAttribute('points') || '').trim();
          return p ? p.split(/\s+/).length : 0;
        }
        const d = el.getAttribute('d') || '';
        return (d.match(/[ML]/g) || []).length;
      });
    assert(n >= 10, `.trend-chart polyline points=${n} (<10)`);
    const thresholds = await page.locator('.trend-chart svg .trend-threshold').count();
    assert(thresholds >= 2, `threshold lines=${thresholds} (<2)`);
    return `svg polyline points=${n} · threshold lines=${thresholds}`;
  });

  // 3 --- range-buttons ------------------------------------------------------
  await check('range-buttons', async () => {
    const btnCount = await page.locator('.trend-range button').count();
    assert(btnCount === 5, `range buttons=${btnCount} (expected 5)`);
    const btn = page.locator('.trend-range button', { hasText: /^\s*7 d\s*$/ }).first();
    await btn.click();
    const pressed = await btn.getAttribute('aria-pressed');
    assert(pressed === 'true', `"7 d" aria-pressed="${pressed}"`);
    await page.waitForSelector('.trend-chart svg', { timeout: 10000 });
    const still = await page.locator('.trend-chart svg').count();
    assert(still >= 1, 'chart disappeared after range change');
    const active = await page.locator('.trend-range button.is-active').innerText();
    return `5 buttons · clicked "7 d" · active="${active.trim()}" · chart still rendered`;
  });

  // 4 --- tooltip-hover ------------------------------------------------------
  await check('tooltip-hover', async () => {
    const btn30 = page.locator('.trend-range button', { hasText: /^\s*30 d\s*$/ }).first();
    if (await btn30.count()) { await btn30.click({ timeout: 5000 }); }
    const svg = page.locator('.trend-chart svg').first();
    await svg.waitFor({ state: 'visible', timeout: 10000 });
    const box = await svg.boundingBox();
    assert(box && box.width > 0, 'trend svg has no layout box');
    await svg.hover({ position: { x: Math.round(box.width * 0.5), y: Math.round(box.height * 0.5) } });
    const tip = page.locator('.trend-tooltip').first();
    await tip.waitFor({ state: 'visible', timeout: 8000 });
    const text = await tip.innerText();
    assert(/mpy/i.test(text), `tooltip text lacks "mpy": "${clip(text, 60)}"`);
    const badge = await page.locator('.trend-tooltip .badge').count();
    assert(badge >= 1, 'tooltip missing severity badge');
    await page.screenshot({ path: path.join(EVID, 'og-trend-chart.png') });
    return `tooltip visible: "${clip(text, 40)}" · badge=${badge}`;
  });

  // 5 --- gauge-dashboard ----------------------------------------------------
  await check('gauge-dashboard', async () => {
    await page.evaluate(() => { location.hash = '#/dashboard'; });
    await page.waitForSelector('.grid-bento', { timeout: 20000 });
    await page.waitForSelector('.gauge svg', { timeout: 15000 });
    const title = await page.locator('.gauge svg title').first().textContent();
    assert(title && /mpy/i.test(title), `.gauge <title> lacks mpy: "${title}"`);
    const zones = await page.locator('.gauge svg .gauge-zone').count();
    assert(zones >= 3, `gauge zones=${zones} (<3)`);
    const needle = await page.locator('.gauge svg .gauge-needle').count();
    assert(needle >= 1, 'gauge needle missing');
    // The KPI on the dashboard draws a compact 72px gauge next to an explicit
    // number, so it must be created with showValue:false: no in-dial value
    // text (and no <text> carrying the value) may exist inside its SVG. Any
    // other gauge on the page keeps its value text.
    const kpi = await page.evaluate(() => {
      const svg = document.querySelector('.grid-bento .kpi .kpi__gauge svg');
      if (!svg) { return { found: false }; }
      const texts = Array.from(svg.querySelectorAll('text')).map((t) => t.textContent.trim());
      const valueTexts = Array.from(svg.querySelectorAll('text.gauge-value')).map((t) => t.textContent.trim());
      const title = svg.querySelector('title');
      return { found: true, texts, valueTexts, title: title ? title.textContent : '' };
    });
    assert(kpi.found, 'KPI gauge SVG not found (.grid-bento .kpi .kpi__gauge svg)');
    assert(kpi.valueTexts.length === 0, `KPI gauge draws an in-dial value (showValue:false expected): ${JSON.stringify(kpi.valueTexts)}`);
    assert(!kpi.texts.some((t) => /\d/.test(t)), `KPI gauge SVG carries a numeric <text>: ${JSON.stringify(kpi.texts)}`);
    assert(/mpy/i.test(kpi.title), `KPI gauge <title> must still report the value/unit: "${kpi.title}"`);
    await closeToasts(page);
    await page.waitForTimeout(650); // let the KPI count-up settle for the evidence shot
    await page.screenshot({ path: path.join(EVID, 'og-gauge-dashboard.png') });
    return `gauge title="${title}" · zones=${zones} · needle=${needle} · kpiValueTexts=${kpi.valueTexts.length}`;
  });

  // 6 --- console-clean ------------------------------------------------------
  await check('console-clean', async () => {
    if (allConsoleErrors.length === 0) { return 'no console errors / pageerrors'; }
    allConsoleErrors.forEach((e, i) => console.log(`  [${i + 1}] ${clip(e, 160)}`));
    throw new Error(`${allConsoleErrors.length} console error(s)/pageerror(s): ${clip(allConsoleErrors[0], 50)}`);
  });

  // 7 --- readings-cell-geometry --------------------------------------------
  // Guards the "block filling the cell" regression on the detail ficha: no SVG
  // inside a reading cell may be stretched past its intended box, the readings
  // table keeps exactly Date | Corrosion rate (mpy) | Status | Note (the Trend
  // column belongs to the point LIST only) and every severity badge stays a
  // readable pill instead of a solid severity-coloured block.
  await check('readings-cell-geometry', async () => {
    await page.evaluate(() => { location.hash = '#/corrosion/mp/MP-CORR-001'; });
    await page.waitForSelector('table.data tbody td', { timeout: 20000 });
    const info = await page.evaluate(() => {
      const tables = Array.from(document.querySelectorAll('table.data'));
      const t = tables.find((tb) => {
        const hs = Array.from(tb.querySelectorAll('thead th')).map((th) => th.textContent.trim());
        return hs.length === 4 && /^date$/i.test(hs[0]) && /corrosion rate/i.test(hs[1]);
      });
      if (!t) { return { ok: false, reason: 'readings table (Date | Corrosion rate) not found' }; }
      const heads = Array.from(t.querySelectorAll('thead th')).map((th) => th.textContent.trim());
      const svgs = Array.from(t.querySelectorAll('td svg')).map((s) => {
        const r = s.getBoundingClientRect();
        return { w: Math.round(r.width * 100) / 100, h: Math.round(r.height * 100) / 100 };
      });
      const maxW = svgs.reduce((m, s) => Math.max(m, s.w), 0);
      const maxH = svgs.reduce((m, s) => Math.max(m, s.h), 0);
      const badges = Array.from(t.querySelectorAll('td .badge')).map((b) => {
        const cs = getComputedStyle(b);
        const r = b.getBoundingClientRect();
        return { text: b.textContent.trim(), color: cs.color, bg: cs.backgroundColor, w: Math.round(r.width), h: Math.round(r.height) };
      });
      return { ok: true, heads, cols: heads.length, svgCount: svgs.length, maxW, maxH, badges };
    });
    assert(info.ok, info.reason);
    assert(info.cols === 4, `readings table has ${info.cols} columns (expected 4: no Trend column on the ficha) — heads=${info.heads.join('|')}`);
    assert(info.svgCount >= 1, 'no svg found inside readings cells');
    assert(info.maxW <= 90, `largest svg in a readings cell is ${info.maxW}px wide (>90px: stretched SVG)`);
    assert(info.badges.length >= 1, 'no severity badge found in readings cells');
    info.badges.forEach((b) => {
      assert(b.bg !== b.color, `badge "${b.text}" paints its text colour as background (${b.bg}) → invisible/block-like`);
      assert(b.w <= 160, `badge "${b.text}" width=${b.w}px (>160px: oversized block)`);
    });
    // 1b: on the point LIST the sparkline must stay a fixed 72x16 tick mark and
    // must not stretch the row.
    await page.evaluate(() => { location.hash = '#/corrosion'; });
    await page.waitForSelector('.sparkline', { timeout: 20000 });
    const list = await page.evaluate(() => {
      const nodes = Array.from(document.querySelectorAll('.sparkline'));
      const dims = nodes.map((s) => { const r = s.getBoundingClientRect(); return { w: Math.round(r.width * 100) / 100, h: Math.round(r.height * 100) / 100 }; });
      const maxW = dims.reduce((m, d) => Math.max(m, d.w), 0);
      const maxH = dims.reduce((m, d) => Math.max(m, d.h), 0);
      const rowH = Math.max(0, ...nodes.map((s) => Math.round(s.closest('tr').getBoundingClientRect().height)));
      return { count: nodes.length, maxW, maxH, rowH };
    });
    assert(list.count >= 1, 'no sparkline rendered on the point list');
    assert(list.maxW <= 80, `list sparkline width=${list.maxW}px (>80px: stretched)`);
    assert(list.maxH <= 16, `list sparkline height=${list.maxH}px (>16px: stretched)`);
    assert(list.rowH <= 80, `list row height=${list.rowH}px (>80px: row deformed)`);
    return `ficha cols=${info.heads.join('|')} · svg in td=${info.svgCount} maxW=${info.maxW}px maxH=${info.maxH}px · badges=${info.badges.length} readable · list sparkline ${list.maxW}x${list.maxH}px rows≤${list.rowH}px`;
  });

  // 8 --- kpi-gauge-no-overlap ----------------------------------------------
  // Guards the KPI card regression: the 72px gauge must never intersect the
  // value text at 1366 / 800 / 390 px of viewport width.
  await check('kpi-gauge-no-overlap', async () => {
    const notes = [];
    for (const width of [1366, 800, 390]) {
      await page.setViewportSize({ width, height: 900 });
      await page.evaluate(() => { location.hash = '#/dashboard'; });
      await page.waitForSelector('.grid-bento .kpi .gauge__svg', { timeout: 20000 });
      await page.waitForTimeout(700); // count-up settles (~500ms); rects stable
      const m = await page.evaluate(() => {
        const card = document.querySelector('.grid-bento .kpi');
        const val = card.querySelector('.kpi__value');
        const gauge = card.querySelector('.gauge__svg') || card.querySelector('.gauge');
        const box = (e) => { const r = e.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), right: Math.round(r.right), bottom: Math.round(r.bottom), w: Math.round(r.width), h: Math.round(r.height) }; };
        const a = box(val); const b = box(gauge);
        const overlapX = Math.min(a.right, b.right) - Math.max(a.x, b.x);
        const overlapY = Math.min(a.bottom, b.bottom) - Math.max(a.y, b.y);
        return { value: a, gauge: b, overlap: overlapX > 0 && overlapY > 0, overlapX: Math.round(overlapX), gap: b.x - a.right };
      });
      assert(!m.overlap, `@${width}px the gauge intersects the KPI value (overlapX=${m.overlapX}px: value right=${m.value.right}, gauge x=${m.gauge.x})`);
      assert(m.gap >= 0, `@${width}px negative gap (${m.gap}px) between value and gauge`);
      notes.push(`@${width} value=[${m.value.x},${m.value.right}] gaugeX=${m.gauge.x} gap=${m.gap}px`);
    }
    await page.setViewportSize({ width: 1366, height: 900 });
    return notes.join(' · ');
  });

  await browser.close();
  await new Promise((r) => server.close(r));

  // ------------------------------------------------------------------ summary --
  const pass = rows.filter((r) => r.status === 'PASS').length;
  const fail = rows.filter((r) => r.status === 'FAIL').length;
  const totalMs = rows.reduce((a, r) => a + r.ms, 0);
  console.log('------------------------------------------------------------');
  console.log(`RESUMEN: ${pass} PASS · ${fail} FAIL · ${totalMs} ms total · ${rows.length} checks`);
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
