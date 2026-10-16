/* IntegrityWatch Field — i18n locales parity (T2b)
   Anchors: TESTS.md §13 (parity), SCHEMA.md §5 (closed inventory). */
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const fr = require('../src/i18n/locales/fr.js');
const zh = require('../src/i18n/locales/zh.js');
const ru = require('../src/i18n/locales/ru.js');
const ar = require('../src/i18n/locales/ar.js');

function collectPaths(obj, prefix, leaves, containers) {
  Object.keys(obj).forEach(function (key) {
    const path = prefix ? prefix + '.' + key : key;
    const value = obj[key];
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      containers.push(path);
      collectPaths(value, path, leaves, containers);
    } else {
      leaves.push(path);
    }
  });
}

function leafPaths(locale) {
  const leaves = [];
  const containers = [];
  collectPaths(locale, '', leaves, containers);
  leaves.sort();
  containers.sort();
  return { leaves, containers };
}

function leafCount(locale) {
  return leafPaths(locale).leaves.length;
}

const targets = { fr, zh, ru, ar };
const codes = Object.keys(targets);

test('T2b.a parity fr/zh/ru/ar share identical deep key sets with >330 leaves each', () => {
  const first = leafPaths(targets[codes[0]]);
  assert.ok(first.leaves.length > 330, 'fr should have >330 leaves, got ' + first.leaves.length);
  for (let i = 1; i < codes.length; i++) {
    const cur = leafPaths(targets[codes[i]]);
    assert.ok(cur.leaves.length > 330, codes[i] + ' should have >330 leaves, got ' + cur.leaves.length);
    assert.deepEqual(cur.leaves, first.leaves, codes[i] + ' leaves differ from fr');
    assert.deepEqual(cur.containers, first.containers, codes[i] + ' containers differ from fr');
  }
});

test('T2b.b dir and meta: ar is rtl, others ltr', () => {
  assert.equal(ar.__meta.dir, 'rtl');
  assert.equal(fr.__meta.dir, 'ltr');
  assert.equal(zh.__meta.dir, 'ltr');
  assert.equal(ru.__meta.dir, 'ltr');
});

test('T2b.b2 meta codes and native names', () => {
  assert.equal(fr.__meta.code, 'fr');
  assert.equal(zh.__meta.code, 'zh');
  assert.equal(ru.__meta.code, 'ru');
  assert.equal(ar.__meta.code, 'ar');
  assert.equal(zh.__meta.nativeName, '简体中文');
  assert.equal(ru.__meta.nativeName, 'Русский');
  assert.equal(ar.__meta.nativeName, 'العربية');
  assert.equal(fr.__meta.nativeName, 'Français');
});

test('T2b.b3 every leaf is a non-empty string', () => {
  for (const code of codes) {
    const { leaves } = leafPaths(targets[code]);
    for (const path of leaves) {
      const parts = path.split('.');
      let cur = targets[code];
      for (const p of parts) { cur = cur[p]; }
      assert.equal(typeof cur, 'string', code + ' leaf ' + path + ' is not a string');
      assert.ok(cur.length > 0, code + ' leaf ' + path + ' is empty');
    }
  }
});

// Cross-parity against en.js, skipped while en is still the T2a stub (<100 leaves).
const en = require('../src/i18n/locales/en.js');
const enIsStub = leafCount(en) < 100;

test('T2b.c cross-parity en vs fr/zh/ru/ar', { skip: enIsStub ? 'en locale pending T2a' : false }, () => {
  const enPaths = leafPaths(en);
  for (const code of codes) {
    const cur = leafPaths(targets[code]);
    assert.deepEqual(cur.leaves, enPaths.leaves, code + ' leaves differ from en');
    assert.deepEqual(cur.containers, enPaths.containers, code + ' containers differ from en');
  }
});
