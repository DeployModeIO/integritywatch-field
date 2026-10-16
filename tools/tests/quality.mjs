// IntegrityWatch Field — P0 quality gate (ESM, playwright-core + axe-core)
// Static server: own node:http on 127.0.0.1:8453, ROOT resolved from import.meta.url.
// Output: "PASS|FAIL|SKIP <id> <detail>" per check, then a summary; exit(1) if any FAIL.
// Justified SKIPs (browser not available) do not fail the run.
//
//   node tools/tests/quality.mjs
//
// Checks:
//   axe-dashboard, axe-corrosion, axe-dialog  (axe-core, WCAG a11y gate)
//   locale-<code>  x7 (en es fr zh ru ar pt)  (i18n / RTL / raw-key leak)
//   ff-boot                                   (Firefox headless smoke)
//   edge-boot                                 (Edge channel boot + title)
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, firefox } from 'playwright-core';

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..', '..');

const HOST = '127.0.0.1';
const PORT = 8453;
const BASE = `http://${HOST}:${PORT}`;
const EVIDENCE = path.join(ROOT, 'docs', 'evidence');
const APP_TITLE = 'IntegrityWatch Field';
const WAIT = 15000;
const AXE_PATH = require.resolve('axe-core/axe.min.js');

const RAW_KEY_RE = /\b(nav|common|corrosion|psv|pipelines|apm|ingest|rules|reports|glossary|admin|severity|units|a11y)\.([a-zA-Z][A-Za-z0-9_.]+)/;
const LOCALES = ['en', 'es', 'fr', 'zh', 'ru', 'ar', 'pt'];

// Newer playwright-core expects a browser build that may not be the one installed
// on this machine; fall back to the newest installed chromium build if needed.
function resolveChromiumPath() {
  try {
    const p = chromium.executablePath();
    if (p && existsSync(p)) return p;
  } catch { /* fall through to a scan */ }
  const base = path.join(process.env.LOCALAPPDATA || '', 'ms-playwright');
  if (!base || !existsSync(base)) return null;
  const dirs = readdirSync(base).filter((d) => /^chromium-\d+$/.test(d)).sort().reverse();
  const rels = [['chrome-win64', 'chrome.exe'], ['chrome-win', 'chrome.exe'], ['chrome-linux', 'chrome'], ['chrome-mac', 'Chromium.app', 'Contents', 'MacOS', 'Chromium']];
  for (const d of dirs) {
    for (const rel of rels) {
      const p = path.join(base, d, ...rel);
      if (existsSync(p)) return p;
    }
  }
  return null;
}

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
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8'
};

// ---------------------------------------------------------------- reporting --
let failures = 0;
function log(status, id, detail) {
  const d = String(detail == null ? '' : detail).replace(/\s+/g, ' ').trim();
  console.log(`${status} ${id}${d ? ' ' + d : ''}`);
  if (status === 'FAIL') failures += 1;
}

// ------------------------------------------------------------- static server --
function startServer() {
  const server = createServer(async (req, res) => {
    try {
      const u = new URL(req.url, BASE);
      let p = decodeURIComponent(u.pathname);
      if (p === '/' || p === '') p = '/index.html';
      const rel = p.replace(/^[/\\]+/, '');
      const fp = path.join(ROOT, path.normalize(rel));
      if (fp !== ROOT && !fp.startsWith(ROOT + path.sep)) { res.writeHead(403); res.end('forbidden'); return; }
      const data = await readFile(fp);
      res.writeHead(200, {
        'Content-Type': MIME[path.extname(fp).toLowerCase()] || 'application/octet-stream',
        'Cache-Control': 'no-store'
      });
      res.end(data);
    } catch (e) {
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
async function clearToasts(page) {
  await page.evaluate(() => {
    const region = document.getElementById('toast-region');
    if (region) { while (region.firstChild) region.removeChild(region.firstChild); }
  }).catch(() => {});
}

async function injectAxe(page) {
  await page.addScriptTag({ path: AXE_PATH });
}

const IMPACT_RANK = { critical: 4, serious: 3, moderate: 2, minor: 1 };

async function runAxe(page) {
  const violations = await page.evaluate(async () => {
    const r = await window.axe.run(document, { resultTypes: ['violations'] });
    return r.violations.map((v) => ({ id: v.id, impact: v.impact || 'minor', nodes: v.nodes.length }));
  });
  const crit = violations.filter((v) => v.impact === 'critical');
  const serious = violations.filter((v) => v.impact === 'serious');
  const moderate = violations.filter((v) => v.impact === 'moderate');
  const minor = violations.filter((v) => v.impact === 'minor');
  const top = violations
    .slice()
    .sort((a, b) => (IMPACT_RANK[b.impact] || 0) - (IMPACT_RANK[a.impact] || 0))
    .slice(0, 3)
    .map((v) => v.id);
  return {
    pass: crit.length === 0 && serious.length === 0,
    detail: `critical=${crit.length} serious=${serious.length} moderate=${moderate.length} minor=${minor.length} top3=[${top.join(', ') || 'none'}]`
  };
}

async function axeCheck(id, page) {
  try {
    const v = await runAxe(page);
    log(v.pass ? 'PASS' : 'FAIL', id, v.detail);
  } catch (e) {
    log('FAIL', id, `axe error: ${(e && e.message) || e}`);
  }
}

async function waitShell(page) {
  await page.waitForSelector('nav.app-sidebar', { timeout: WAIT });
}

async function waitDashboard(page) {
  await waitShell(page);
  await page.waitForSelector('.heat-cell', { timeout: WAIT });
}

// -------------------------------------------------------------------- main ----
let server = null;
let browser = null;
let ffBrowser = null;
let edgeBrowser = null;

try {
  await mkdir(EVIDENCE, { recursive: true });
  server = await startServer();

  // ---------------------------------------------------------- A) axe-core ----
  const chromiumPath = resolveChromiumPath();
  if (!chromiumPath) {
    for (const id of ['axe-dashboard', 'axe-corrosion', 'axe-dialog']) {
      log('SKIP', id, 'no chromium build available for playwright-core');
    }
  } else {
    browser = await chromium.launch({ headless: true, executablePath: chromiumPath });
    const ctx = await browser.newContext({ bypassCSP: true, viewport: { width: 1366, height: 900 } });
    const page = await ctx.newPage();

    // 1. axe-dashboard
    await page.goto(BASE + '/', { waitUntil: 'load' });
    await waitDashboard(page);
    await clearToasts(page);
    await injectAxe(page);
    await axeCheck('axe-dashboard', page);

    // 2. axe-corrosion
    await page.evaluate(() => { location.hash = '#/corrosion'; });
    await page.waitForSelector('#main .page-header .actions button', { timeout: WAIT });
    await clearToasts(page);
    await axeCheck('axe-corrosion', page);

    // 3. axe-dialog (open "New point" dialog and audit with it open)
    await page.locator('#main .page-header .actions button').first().click();
    await page.waitForSelector('.dialog[role="dialog"]', { timeout: WAIT });
    await clearToasts(page);
    await axeCheck('axe-dialog', page);
    // close the dialog (Escape; fall back to the Cancel action).
    await page.keyboard.press('Escape');
    await page.waitForSelector('.dialog[role="dialog"]', { state: 'detached', timeout: WAIT }).catch(async () => {
      await page.locator('.dialog .dialog-actions button').first().click().catch(() => {});
    });

    // -------------------------------------------------------- B) locales x7 ----
    await page.evaluate(() => { location.hash = '#/dashboard'; });
    await page.waitForSelector('.heat-cell', { timeout: WAIT });
    const enLabel = (await page.locator('nav.app-sidebar .app-sidebar__label').first().innerText()).trim();

    for (const code of LOCALES) {
      try {
        await page.evaluate((c) => { window.IW.i18n.setLocale(c); }, code);
        await page.waitForTimeout(400);
        await clearToasts(page);

        const dir = await page.evaluate(() => document.documentElement.dir);
        const bodyText = await page.evaluate(() => document.body.innerText);
        const label = (await page.locator('nav.app-sidebar .app-sidebar__label').first().innerText()).trim();

        const expectedDir = code === 'ar' ? 'rtl' : 'ltr';
        const dirOk = dir === expectedDir;
        const raw = bodyText.match(RAW_KEY_RE);
        const rawOk = !raw;
        const labelOk = code === 'en' ? label === enLabel : label !== enLabel;
        const pass = dirOk && rawOk && labelOk;

        await page.screenshot({ path: path.join(EVIDENCE, `p0-locale-${code}.png`), fullPage: true });

        const bits = `dir=${dir}${dirOk ? '' : `(want ${expectedDir})`} rawKeys=${raw ? raw[0] : 0} label="${label}"${labelOk ? '' : ' UNCHANGED'}`;
        log(pass ? 'PASS' : 'FAIL', `locale-${code}`, bits);
      } catch (e) {
        log('FAIL', `locale-${code}`, `error: ${(e && e.message) || e}`);
      }
    }

    await ctx.close();
  }

  // -------------------------------------------------- C) Firefox smoke -------
  try {
    ffBrowser = await firefox.launch({ headless: true });
  } catch (e) {
    ffBrowser = null;
    log('SKIP', 'ff-boot', `firefox unavailable: ${((e && e.message) || e).split('\n')[0]}`);
  }
  if (ffBrowser) {
    try {
      const ffCtx = await ffBrowser.newContext({ viewport: { width: 1366, height: 900 } });
      const ffPage = await ffCtx.newPage();
      const errs = [];
      ffPage.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
      ffPage.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
      await ffPage.goto(BASE + '/', { waitUntil: 'load' });
      await waitShell(ffPage);
      await ffPage.waitForSelector('.heat-cell', { timeout: WAIT });
      await clearToasts(ffPage);
      await ffPage.screenshot({ path: path.join(EVIDENCE, 'p0-firefox.png'), fullPage: true });
      const pass = errs.length === 0;
      log(pass ? 'PASS' : 'FAIL', 'ff-boot', pass ? 'shell+heatmap ok, 0 console errors' : `${errs.length} console error(s): ${errs.slice(0, 3).join(' | ')}`);
      await ffCtx.close();
    } catch (e) {
      log('FAIL', 'ff-boot', `smoke error: ${(e && e.message) || e}`);
    }
  }

  // ------------------------------------------------------ D) Edge boot -------
  try {
    edgeBrowser = await chromium.launch({ channel: 'msedge', headless: true });
  } catch (e) {
    edgeBrowser = null;
    log('SKIP', 'edge-boot', `msedge unavailable: ${((e && e.message) || e).split('\n')[0]}`);
  }
  if (edgeBrowser) {
    try {
      const eCtx = await edgeBrowser.newContext({ viewport: { width: 1366, height: 900 } });
      const ePage = await eCtx.newPage();
      await ePage.goto(BASE + '/', { waitUntil: 'load' });
      await waitShell(ePage);
      const title = await ePage.title();
      const ok = title === APP_TITLE;
      log(ok ? 'PASS' : 'FAIL', 'edge-boot', `title="${title}"${ok ? ' shell ok' : ` (want "${APP_TITLE}")`}`);
      await eCtx.close();
    } catch (e) {
      log('FAIL', 'edge-boot', `boot error: ${(e && e.message) || e}`);
    }
  }
} catch (e) {
  log('FAIL', 'harness', `fatal: ${(e && e.stack) || e}`);
} finally {
  for (const b of [browser, ffBrowser, edgeBrowser]) {
    if (b) { await b.close().catch(() => {}); }
  }
  if (server) { await new Promise((r) => server.close(r)); }
}

console.log('');
console.log(`SUMMARY: ${failures === 0 ? 'OK' : 'FAILED'} (${failures} failing check${failures === 1 ? '' : 's'})`);
process.exit(failures === 0 ? 0 : 1);
