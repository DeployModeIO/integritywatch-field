'use strict';
// Version guards: the product version lives in package.json and is duplicated in
// two runtime spots that cannot import JSON (browser UMD + Electron). This test
// fails if they drift, which is how the 1.1.0 case-file stamp survived a release.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

const root = path.join(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

test('case file APP_VERSION matches package.json', () => {
  const src = fs.readFileSync(path.join(root, 'src', 'core', 'caseFile.js'), 'utf8');
  const m = src.match(/APP_VERSION\s*=\s*'([0-9]+\.[0-9]+\.[0-9]+)'/);
  assert.ok(m, 'APP_VERSION constant not found in caseFile.js');
  assert.equal(m[1], pkg.version, 'caseFile APP_VERSION drifted from package.json');
});

test('electron package version matches package.json', () => {
  const el = JSON.parse(fs.readFileSync(path.join(root, 'electron', 'package.json'), 'utf8'));
  assert.equal(el.version, pkg.version, 'electron/package.json version drifted');
});

test('service worker cache name is a bumpable iw-vNN', () => {
  const sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
  const m = sw.match(/CACHE_NAME\s*=\s*'iw-v(\d+)'/);
  assert.ok(m, 'CACHE_NAME not found');
  assert.ok(Number(m[1]) >= 19, 'cache version should have been bumped after asset changes');
});
