/* IntegrityWatch Field — layout contract test (Fase 1, VISUAL-SPEC §1–2)
   Locks the DOM<->CSS agreement between src/app/shell.js and
   assets/styles/layout.css. A regression to the pre-fix structure
   (nav.sidebar / a.nav-item / main.main / div.layout) must fail here. */
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const layoutCss = fs.readFileSync(path.join(ROOT, 'assets/styles', 'layout.css'), 'utf8');
const shellJs = fs.readFileSync(path.join(ROOT, 'src', 'app', 'shell.js'), 'utf8');

function readCss(name) {
  return fs.readFileSync(path.join(ROOT, 'assets/styles', name), 'utf8');
}

test('layout.css body grid declares header / sidebar+main / footer areas', () => {
  assert.match(layoutCss, /grid-template-areas:\s*"header header"/);
  assert.match(layoutCss, /"sidebar main"/);
  assert.match(layoutCss, /"footer footer"/);
});

test('layout.css defines every selector shell.js emits', () => {
  const selectors = [
    '.app-header__bar',
    '.app-header__controls',
    '.app-brand__mark',
    '.app-brand__name',
    '.app-sidebar__item',
    '.app-sidebar__item .icon',
    '.app-sidebar__label',
    '.app-sidebar__group-label',
    '.app-main',
    '.app-footer',
    '.app-footer .disclaimer',
    '.app-footer .standard-chips',
    '.toast-region'
  ];
  for (const sel of selectors) {
    assert.ok(layoutCss.includes(sel), 'layout.css missing selector: ' + sel);
  }
});

test('header selects stay compact (inline-size:auto; min-inline-size:7rem)', () => {
  assert.match(
    layoutCss,
    /\.app-header__controls \.select,\s*\.app-header \.select\s*\{[^}]*inline-size:\s*auto;[^}]*min-inline-size:\s*7rem;/s,
    '.app-header select must not stretch full-width'
  );
});

test('hamburger hidden >=900px and shown below 900px', () => {
  assert.match(layoutCss, /\.app-header \.hamburger\s*\{[^}]*display:\s*none;/s);
  assert.match(
    layoutCss,
    /@media \(max-width:\s*899\.98px\)\s*\{[^}]*\.app-header \.hamburger\s*\{[^}]*display:\s*inline-flex;/s
  );
});

test('nav groups separated by a logical block border', () => {
  assert.match(
    layoutCss,
    /\.nav-group \+ \.nav-group\s*\{[^}]*margin-block-start:\s*var\(--sp-1\);[^}]*padding-block-start:\s*var\(--sp-1\);[^}]*border-block-start:\s*1px solid var\(--border\);/s
  );
});

test('footer wraps, resets disclaimer margin and never clips chips', () => {
  const footerBlock = layoutCss.match(/\.app-footer\s*\{[^}]*\}/s);
  assert.ok(footerBlock, 'layout.css must define .app-footer');
  assert.match(footerBlock[0], /flex-wrap:\s*wrap;/);
  assert.match(footerBlock[0], /row-gap:\s*var\(--sp-1\);/);
  assert.doesNotMatch(footerBlock[0], /white-space:\s*nowrap/);
  assert.doesNotMatch(footerBlock[0], /overflow:\s*hidden/);
  assert.doesNotMatch(footerBlock[0], /text-overflow/);
  assert.match(layoutCss, /\.app-footer \.disclaimer\s*\{[^}]*margin:\s*0;/s);
});

test('no view stylesheet re-introduces footer truncation', () => {
  for (const file of ['views-a.css', 'views-b.css', 'views-c.css']) {
    const css = readCss(file);
    assert.doesNotMatch(css, /\.app-footer[^{}]*\{[^}]*white-space:\s*nowrap/s, file + ' must not clip footer chips');
    assert.doesNotMatch(css, /\.app-footer[^{}]*\{[^}]*overflow:\s*hidden/s, file + ' must not clip footer chips');
    assert.doesNotMatch(css, /\.app-footer[^{}]*\{[^}]*text-overflow/s, file + ' must not clip footer chips');
  }
});

test('toast-region is fixed above all and does not intercept pointer events', () => {
  assert.match(
    layoutCss,
    /\.toast-region\s*\{[^}]*position:\s*fixed;[^}]*inset-block-end:\s*var\(--sp-3\);[^}]*inset-inline-end:\s*var\(--sp-3\);[^}]*z-index:\s*1000;[^}]*display:\s*flex;[^}]*flex-direction:\s*column;[^}]*pointer-events:\s*none;/s
  );
  assert.match(layoutCss, /\.toast\s*\{[^}]*pointer-events:\s*auto;/s);
});

test('shell.js builds the contract DOM (VISUAL-SPEC §1)', () => {
  assert.match(shellJs, /class:\s*'app-sidebar'/, 'nav.app-sidebar');
  assert.match(shellJs, /id:\s*'app-nav'/, 'nav id=app-nav');
  assert.match(shellJs, /class:\s*'app-sidebar__item'/, 'a.app-sidebar__item');
  assert.match(shellJs, /dataset:\s*\{\s*view:\s*viewId/, 'a.app-sidebar__item[data-view]');
  assert.match(shellJs, /class:\s*'app-sidebar__label'/, 'span.app-sidebar__label');
  assert.match(shellJs, /class:\s*'app-main'/, 'main.app-main');
  assert.match(shellJs, /id:\s*'main'/, 'main id=main');
  assert.match(shellJs, /class:\s*'app-header__controls'/, 'div.app-header__controls');
  assert.match(shellJs, /class:\s*'app-footer'/, 'footer.app-footer');
  assert.match(shellJs, /class:\s*'toast-region'/, 'div.toast-region');
});

test('shell.js never builds the legacy div.layout wrapper', () => {
  assert.doesNotMatch(shellJs, /class:\s*['"]layout['"]/, 'shell.js must not create a div.layout');
  assert.doesNotMatch(shellJs, /createElement\(['"]div['"]\).*layout/, 'shell.js must not create a layout wrapper');
});
