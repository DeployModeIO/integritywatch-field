/* IntegrityWatch Field - tools/tests/capture-evidence.mjs
   Visual evidence capture: 24 PNGs for the README gallery.
   Boots static server, drives Edge via playwright-core, captures each
   view/state at the required resolution. Theme via data-theme, locale
   via localStorage. Prints PASS/FAIL per capture + final summary.

   Run:  node tools\tests\capture-evidence.mjs */

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
const CSV_FIXTURE = path.join(ROOT, 'datos-prueba', 'integritywatch-carga-prueba.csv');

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

const captureResults = [];
let failures = 0;

function pad(s, n) { s = String(s == null ? '' : s); return s.length >= n ? s.slice(0, n) : s + ' '.repeat(n - s.length); }

// ---- Static file server ----
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

// ---- Fresh browser context per capture ----
async function freshContext(browser, locale, theme, viewport) {
  const ctx = await browser.newContext({
    viewport,
    deviceScaleFactor: 1,
    colorScheme: theme === 'dark' ? 'dark' : 'light'
  });
  // Set locale before any page load
  await ctx.addInitScript((loc) => {
    try { localStorage.setItem('iw.locale', loc); } catch (e) {}
    try { localStorage.setItem('iw.theme', 'light'); } catch (e) {}
  }, locale);
  const page = await ctx.newPage();
  page.setDefaultTimeout(25000);
  return { ctx, page };
}

// ---- Navigate and wait ----
async function navigateAndSettle(page, hash, extraWait = 250) {
  await page.goto(`${BASE}/index.html${hash}`, { waitUntil: 'networkidle' });
  // Wait for app shell to be fully rendered
  await page.waitForSelector('nav.app-sidebar', { timeout: 20000 }).catch(() => {});
  await page.waitForSelector('main#main, main.app-main', { timeout: 20000 }).catch(() => {});
  if (extraWait > 0) { await page.waitForTimeout(extraWait); }
}

// ---- Set theme after boot ----
async function setTheme(page, theme) {
  if (theme === 'dark') {
    await page.evaluate(() => {
      document.documentElement.setAttribute('data-theme', 'dark');
      try { localStorage.setItem('iw.theme', 'dark'); } catch (e) {}
    });
    await page.waitForTimeout(300);
  }
}

// ---- Open sidebar drawer on mobile ----
async function openDrawer(page) {
  const hb = page.locator('.app-header .hamburger');
  if (await hb.isVisible().catch(() => false)) {
    await hb.click();
    await page.waitForTimeout(200);
  }
}

// ---- Dismiss toasts ----
async function closeToasts(page) {
  try {
    await page.evaluate(() => {
      const r = document.getElementById('toast-region');
      if (r) r.querySelectorAll('.toast').forEach((t) => t.remove());
    });
  } catch (e) { /* ignore */ }
}

// ---- Single capture ----
async function capture(browser, opts) {
  const { file, hash, locale, theme, viewport, extraWait, mobile, preAction } = opts;
  const cfile = path.join(EVID, file);
  const t0 = Date.now();

  let ctx = null;
  try {
    const fresh = await freshContext(browser, locale, theme, viewport);
    ctx = fresh.ctx;
    const page = fresh.page;
    await navigateAndSettle(page, hash, extraWait || 250);
    await setTheme(page, theme);

    if (mobile) { await openDrawer(page); }
    if (preAction) { await preAction(page); }

    await closeToasts(page);
    await page.waitForTimeout(200);

    await page.screenshot({ path: cfile, fullPage: false });

    const stat = fs.statSync(cfile);
    const ok = stat.size > 20000;
    const ms = Date.now() - t0;

    if (ok) {
      console.log(`PASS ${pad(file, 42)} ${pad(String(stat.size), 8)} bytes  ${ms}ms`);
      captureResults.push({ status: 'PASS', file, size: stat.size, ms });
    } else {
      failures++;
      console.log(`FAIL ${pad(file, 42)} ${pad(String(stat.size), 8)} bytes  <20KB`);
      captureResults.push({ status: 'FAIL', file, size: stat.size, ms });
    }
    return ok;
  } catch (err) {
    failures++;
    const msg = err && err.message ? err.message : String(err);
    console.log(`FAIL ${pad(file, 42)} ERROR  ${msg.substring(0, 60)}`);
    captureResults.push({ status: 'FAIL', file, size: 0, ms: Date.now() - t0, error: msg });
    return false;
  } finally {
    if (ctx) { await ctx.close().catch(() => {}); }
  }
}

// ---- Pre-actions for specific views ----
async function ingestMapping(page) {
  // Go to ingest, upload CSV, wait for mapping step
  await page.evaluate(() => { location.hash = '#/ingest'; });
  await page.waitForTimeout(500);
  await page.waitForSelector('input#csv-file', { timeout: 15000 }).catch(() => {});
  const input = page.locator('input#csv-file');
  if (await input.count() > 0) {
    await input.setInputFiles(CSV_FIXTURE);
    await page.waitForTimeout(500);
    // Check "create missing" if visible
    try {
      const cb = page.locator('#csv-create-missing');
      if (await cb.isVisible({ timeout: 2000 })) { await cb.check(); }
    } catch (e) {}
    // Wait for mapping UI
    await page.waitForTimeout(300);
  }
}

async function ingestValidation(page) {
  // Upload CSV, run validation
  await page.evaluate(() => { location.hash = '#/ingest'; });
  await page.waitForTimeout(500);
  await page.waitForSelector('input#csv-file', { timeout: 15000 }).catch(() => {});
  const input = page.locator('input#csv-file');
  if (await input.count() > 0) {
    await input.setInputFiles(CSV_FIXTURE);
    await page.waitForTimeout(500);
    try {
      const cb = page.locator('#csv-create-missing');
      if (await cb.isVisible({ timeout: 2000 })) { await cb.check(); }
    } catch (e) {}
    // Click validate button
    const btn = page.locator('.csv-body button').filter({ hasText: /valid/i }).first();
    try {
      if (await btn.isVisible({ timeout: 2000 })) {
        await btn.click();
        await page.waitForSelector('.result-summary', { timeout: 10000 }).catch(() => {});
        await page.waitForTimeout(300);
      }
    } catch (e) {}
  }
}

async function openCorrosionDetail(page) {
  await page.evaluate(() => { location.hash = '#/corrosion'; });
  await page.waitForTimeout(500);
  // Click first monitoring point link
  const link = page.locator('.row-link').first();
  try {
    if (await link.isVisible({ timeout: 5000 })) { await link.click(); }
    await page.waitForTimeout(500);
  } catch (e) {}
}

async function openPsvSizing(page) {
  await page.evaluate(() => { location.hash = '#/psv'; });
  await page.waitForTimeout(500);
  // Click first valve
  const link = page.locator('.row-link').first();
  try {
    if (await link.isVisible({ timeout: 5000 })) { await link.click(); }
    await page.waitForTimeout(500);
  } catch (e) {}
}

async function openApmDetail(page) {
  await page.evaluate(() => { location.hash = '#/apm'; });
  await page.waitForTimeout(500);
  // Click first asset
  const link = page.locator('.row-link').first();
  try {
    if (await link.isVisible({ timeout: 5000 })) { await link.click(); }
    await page.waitForTimeout(500);
  } catch (e) {}
}

// ---- Main ----
async function main() {
  if (!fs.existsSync(EVID)) { fs.mkdirSync(EVID, { recursive: true }); }

  console.log('Starting static server on port', PORT, '...');
  const server = await startServer();

  console.log('Launching Edge (headless) ...');
  const browser = await chromium.launch({ channel: 'msedge', headless: true });

  const DESKTOP = { width: 1366, height: 900 };
  const MOBILE = { width: 390, height: 844 };

  const captures = [
    // 1: dashboard-light-es
    { file: 'dashboard-light-es.png', hash: '#/dashboard', locale: 'es', theme: 'light', viewport: DESKTOP },
    // 2: dashboard-dark-es
    { file: 'dashboard-dark-es.png', hash: '#/dashboard', locale: 'es', theme: 'dark', viewport: DESKTOP },
    // 3: dashboard-light-ar (RTL)
    { file: 'dashboard-light-ar.png', hash: '#/dashboard', locale: 'ar', theme: 'light', viewport: DESKTOP },
    // 4: corrosion-detail-light-es
    { file: 'corrosion-detail-light-es.png', hash: '#/corrosion', locale: 'es', theme: 'light', viewport: DESKTOP, preAction: openCorrosionDetail },
    // 5: corrosion-detail-dark-es
    { file: 'corrosion-detail-dark-es.png', hash: '#/corrosion', locale: 'es', theme: 'dark', viewport: DESKTOP, preAction: openCorrosionDetail },
    // 6: psv-list-light-es
    { file: 'psv-list-light-es.png', hash: '#/psv', locale: 'es', theme: 'light', viewport: DESKTOP },
    // 9: psv-sizing-light-es
    { file: 'psv-sizing-light-es.png', hash: '#/psv', locale: 'es', theme: 'light', viewport: DESKTOP, preAction: openPsvSizing },
    // 10: psv-sizing-dark-es
    { file: 'psv-sizing-dark-es.png', hash: '#/psv', locale: 'es', theme: 'dark', viewport: DESKTOP, preAction: openPsvSizing },
    // 11: pipelines-light-es
    { file: 'pipelines-light-es.png', hash: '#/pipelines', locale: 'es', theme: 'light', viewport: DESKTOP },
    // 12: map-light-es
    { file: 'map-light-es.png', hash: '#/pipelines/0', locale: 'es', theme: 'light', viewport: DESKTOP },
    // 13: map-dark-es
    { file: 'map-dark-es.png', hash: '#/pipelines/0', locale: 'es', theme: 'dark', viewport: DESKTOP },
    // 14: map-light-ar
    { file: 'map-light-ar.png', hash: '#/pipelines/0', locale: 'ar', theme: 'light', viewport: DESKTOP },
    // 15: map-mobile-light-es
    { file: 'map-mobile-light-es.png', hash: '#/pipelines/0', locale: 'es', theme: 'light', viewport: MOBILE, mobile: true },
    // 16: apm-list-light-es
    { file: 'apm-list-light-es.png', hash: '#/apm', locale: 'es', theme: 'light', viewport: DESKTOP },
    // 17: apm-detail-light-es
    { file: 'apm-detail-light-es.png', hash: '#/apm', locale: 'es', theme: 'light', viewport: DESKTOP, preAction: openApmDetail },
    // 18: apm-detail-dark-es
    { file: 'apm-detail-dark-es.png', hash: '#/apm', locale: 'es', theme: 'dark', viewport: DESKTOP, preAction: openApmDetail },
    // 19: ingest-mapping-light-es
    { file: 'ingest-mapping-light-es.png', hash: '#/ingest', locale: 'es', theme: 'light', viewport: DESKTOP, preAction: ingestMapping },
    // 20: ingest-validation-light-es
    { file: 'ingest-validation-light-es.png', hash: '#/ingest', locale: 'es', theme: 'light', viewport: DESKTOP, preAction: ingestValidation },
    // 21: recommendations-light-es
    { file: 'recommendations-light-es.png', hash: '#/recommendations', locale: 'es', theme: 'light', viewport: DESKTOP },
    // 22: reports-light-es
    { file: 'reports-light-es.png', hash: '#/reports', locale: 'es', theme: 'light', viewport: DESKTOP },
    // 24: reports-dark-es
    { file: 'reports-dark-es.png', hash: '#/reports', locale: 'es', theme: 'dark', viewport: DESKTOP },
    // 25: glossary-light-es
    { file: 'glossary-light-es.png', hash: '#/glossary', locale: 'es', theme: 'light', viewport: DESKTOP },
    // 26: glossary-light-ar
    { file: 'glossary-light-ar.png', hash: '#/glossary', locale: 'ar', theme: 'light', viewport: DESKTOP },
    // 27: admin-light-es
    { file: 'admin-light-es.png', hash: '#/admin', locale: 'es', theme: 'light', viewport: DESKTOP },
  ];

  let passCount = 0;
  try {
    for (let i = 0; i < captures.length; i++) {
      const c = captures[i];
      console.log(`\n[${String(i + 1).padStart(2, '0')}/24] ${c.file}`);
      const ok = await capture(browser, c);
      if (ok) passCount++;
    }
  } finally {
    await browser.close().catch(() => {});
    server.close();
  }

  // Summary
  console.log('\n' + '='.repeat(70));
  console.log(`SUMMARY: ${passCount}/24 PASS (${failures} FAIL)`);
  captureResults.forEach((r) => {
    console.log(`${r.status === 'PASS' ? '  ✓' : '  ✗'} ${pad(r.file, 42)} ${r.status === 'PASS' ? pad(String(r.size), 8) + ' bytes' : r.error || 'FAIL'}`);
  });

  if (failures > 0) {
    console.error(`\n${failures} capture(s) failed. Check docs/evidence/ for missing files.`);
    process.exit(1);
  }
  console.log('\nAll 24 captures PASS. Evidence in docs/evidence/');
  process.exit(0);
}

main().catch((err) => {
  console.error('FATAL:', err.message || err);
  process.exit(1);
});