/* IntegrityWatch Field — motion tokens & reduced-motion contract (Fase 3)
   Validates new design tokens and that prefers-reduced-motion nullifies animations. */
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const tokensCss = fs.readFileSync(path.join(ROOT, 'assets/styles', 'tokens.css'), 'utf8');
const componentsCss = fs.readFileSync(path.join(ROOT, 'assets/styles', 'components.css'), 'utf8');
const baseCss = fs.readFileSync(path.join(ROOT, 'assets/styles', 'base.css'), 'utf8');

function readCss(name) {
  return fs.readFileSync(path.join(ROOT, 'assets/styles', name), 'utf8');
}

test('tokens.css declares new motion tokens: --dur-3, --ease-in-out', () => {
  assert.match(tokensCss, /--dur-3:\s*300ms;/);
  assert.match(tokensCss, /--ease-in-out:\s*cubic-bezier\([^)]+\)/);
});

test('tokens.css declares new shadow tokens: --shadow-2, --shadow-3 (light & dark)', () => {
  // Light theme (root)
  assert.match(tokensCss, /--shadow-2:\s*[^;]+rgba\(16, 24, 32/);
  assert.match(tokensCss, /--shadow-3:\s*[^;]+rgba\(16, 24, 32/);
  // Dark theme
  assert.match(tokensCss, /\[data-theme="dark"\]/);
  const darkSection = tokensCss.match(/\[data-theme="dark"\]\s*\{[\s\S]*?\}/);
  assert.ok(darkSection, 'dark theme section must exist');
  assert.match(darkSection[0], /--shadow-2:\s*[^;]+rgba\(0, 0, 0/);
  assert.match(darkSection[0], /--shadow-3:\s*[^;]+rgba\(0, 0, 0/);
  // prefers-color-scheme dark fallback
  const prefersDark = tokensCss.match(/@media \(prefers-color-scheme: dark\)\s*\{[\s\S]*?\}/);
  assert.ok(prefersDark, 'prefers-color-scheme dark section must exist');
  assert.match(prefersDark[0], /--shadow-2:\s*[^;]+rgba\(0, 0, 0/);
  assert.match(prefersDark[0], /--shadow-3:\s*[^;]+rgba\(0, 0, 0/);
});

test('components.css defines toast & dialog keyframes and applies them', () => {
  assert.match(componentsCss, /@keyframes toast-slide-in\s*\{[\s\S]*?from\s*\{[^}]*opacity:\s*0;[^}]*transform:\s*translateX\(100%\)/);
  assert.match(componentsCss, /@keyframes toast-slide-out\s*\{[\s\S]*?to\s*\{[^}]*opacity:\s*0;[^}]*transform:\s*translateX\(100%\)/);
  assert.match(componentsCss, /@keyframes dialog-scale-in\s*\{[\s\S]*?from\s*\{[^}]*opacity:\s*0;[^}]*transform:\s*scale\(0\.96\)/);

  // Classes use the animations with --dur-2 and easing tokens
  assert.match(componentsCss, /\.toast\s*\{[^}]*animation:\s*toast-slide-in\s+var\(--dur-2\)\s+var\(--ease-out\)/);
  assert.match(componentsCss, /\.toast\[data-exiting\]\s*\{[^}]*animation:\s*toast-slide-out\s+var\(--dur-2\)\s+var\(--ease-in-out\)/);
  assert.match(componentsCss, /\.dialog\s*\{[^}]*animation:\s*dialog-scale-in\s+var\(--dur-2\)\s+var\(--ease-out\)/);
});

test('components.css defines .btn:active micro-interaction (scale 0.98)', () => {
  assert.match(componentsCss, /\.btn:active:not\(:disabled\)\s*\{[^}]*transform:\s*scale\(0\.98\)/);
});

test('components.css has reduced-motion overrides for new animations', () => {
  // Match the full block (greedy to capture all rules including .btn:active)
  const reduceBlock = componentsCss.match(/@media \(prefers-reduced-motion: reduce\)\s*\{[\s\S]*\}/);
  assert.ok(reduceBlock, 'components.css must have a prefers-reduced-motion block for new animations');
  assert.match(reduceBlock[0], /\.skeleton\s*,\s*\.toast\s*,\s*\.dialog\s*\{[^}]*animation:\s*none\s*!important/);
  assert.match(reduceBlock[0], /\.btn:active:not\(:disabled\)\s*\{[^}]*transform:\s*none/);
});

test('base.css global reduced-motion block nullifies all transitions/animations', () => {
  const reduceBlock = baseCss.match(/@media \(prefers-reduced-motion: reduce\)\s*\{[\s\S]*?\}/);
  assert.ok(reduceBlock, 'base.css must have a global prefers-reduced-motion block');
  assert.match(reduceBlock[0], /\*\s*,\s*\*::before\s*,\s*\*::after\s*\{[^}]*animation-duration:\s*0\.01ms\s*!important/);
  assert.match(reduceBlock[0], /transition-duration:\s*0\.01ms\s*!important/);
});

test('components.css defines .card--elevated with --shadow-2', () => {
  assert.match(componentsCss, /\.card--elevated\s*\{[^}]*box-shadow:\s*var\(--shadow-2\)/);
});

test('components.css defines .grid-cards and .empty-state canonical classes', () => {
  assert.match(componentsCss, /\.grid-cards\s*\{[^}]*display:\s*grid/);
  assert.match(componentsCss, /\.empty-state\s*\{[^}]*display:\s*grid/);
});

test('no view stylesheet redefines dialog/tabs/field-error (canonical in components.css)', () => {
  for (const file of ['views-a.css', 'views-b.css', 'views-c.css']) {
    const css = readCss(file);
    assert.doesNotMatch(css, /\.dialog\s*\{/s, file + ' must not redefine .dialog');
    assert.doesNotMatch(css, /\.tabs\s*\{/s, file + ' must not redefine .tabs');
    assert.doesNotMatch(css, /\.field-error\s*\{/s, file + ' must not redefine .field-error');
  }
});