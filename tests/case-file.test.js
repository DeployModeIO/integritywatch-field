/* IntegrityWatch Field — case-file tests (F3a T3)
   Tests for canonicalStringify, fnv1a, buildCaseFile, parseCaseFile. */
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const cf = require('../src/core/caseFile.js');

test('CF1 canonicalStringify: keys sorted lexicographically', () => {
  var obj = { zebra: 1, alpha: 2, beta: { cat: 3, ant: 4 } };
  var s = cf.canonicalStringify(obj);
  // Outer keys: alpha, beta, zebra; inner: ant, cat
  var parsed = JSON.parse(s);
  var keys = Object.keys(parsed);
  assert.deepEqual(keys, ['alpha', 'beta', 'zebra']);
  assert.deepEqual(Object.keys(parsed.beta), ['ant', 'cat']);
});

test('CF2 fnv1a: deterministic 32-bit hex', () => {
  var h1 = cf.fnv1a('hello');
  var h2 = cf.fnv1a('hello');
  var h3 = cf.fnv1a('Hello');
  assert.equal(h1, h2, 'same input → same hash');
  assert.notEqual(h1, h3, 'different input → different hash');
  // 'hello' → FNV-1a 32-bit = 0xa82fb4a1 (verified against reference)
  assert.equal(h1, 'a82fb4a1');
  // empty string
  assert.equal(cf.fnv1a(''), '811c9dc5');
});

test('CF3 buildCaseFile: round-trip with valid payload', () => {
  var data = {
    apmAssets: [{ id: 'a1', code: 'P-102' }],
    apmEvents: [{ id: 'e1', assetId: 'a1', type: 'failure', start: '2026-01-01T00:00:00.000Z' }]
  };
  var result = cf.buildCaseFile(data, { sector: 'midstream' });
  assert.equal(result.format, 'iwf');
  assert.equal(result.version, 1);
  assert.equal(result.sector, 'midstream');
  assert.equal(result.app, '1.0.0');
  assert.ok(typeof result.exportedAt === 'string');
  assert.ok(typeof result.checksum === 'string');
  assert.equal(result.checksum.length, 8);
  assert.deepEqual(result.data, data);

  // Back to string and parse
  var text = JSON.stringify(result);
  var parsed = cf.parseCaseFile(text);
  assert.ok(parsed.ok, 'parse should be ok, got: ' + parsed.error);
  assert.deepEqual(parsed.payload.data.apmAssets, data.apmAssets);
  assert.deepEqual(parsed.payload.data.apmEvents, data.apmEvents);
  assert.equal(parsed.payload.checksum, result.checksum);
});

test('CF4 parseCaseFile: tampered data → E_CHECKSUM', () => {
  var data = { apmAssets: [{ id: 'a1' }] };
  var result = cf.buildCaseFile(data, { sector: 'midstream' });
  var raw = JSON.stringify(result);
  var tampered = raw.replace(/"a1"/, '"a2"');
  var parsed = cf.parseCaseFile(tampered);
  assert.ok(!parsed.ok);
  assert.equal(parsed.error, 'E_CHECKSUM');
});

test('CF5 parseCaseFile: bad JSON → E_BAD_JSON', () => {
  var parsed = cf.parseCaseFile('not json {');
  assert.ok(!parsed.ok);
  assert.equal(parsed.error, 'E_BAD_JSON');
});

test('CF6 parseCaseFile: wrong format → E_BAD_FORMAT', () => {
  var parsed = cf.parseCaseFile('{"format":"nope","version":1,"data":{}}');
  assert.ok(!parsed.ok);
  assert.equal(parsed.error, 'E_BAD_FORMAT');
});

test('CF7 parseCaseFile: future version → E_VERSION', () => {
  var data = { apmAssets: [{ id: 'a1' }] };
  var result = cf.buildCaseFile(data, { sector: 'midstream' });
  var obj = JSON.parse(JSON.stringify(result));
  obj.version = 99;
  // Recompute checksum so it matches the new version
  obj.checksum = cf.fnv1a(cf.canonicalStringify(obj.data));
  var parsed = cf.parseCaseFile(JSON.stringify(obj));
  assert.ok(!parsed.ok);
  assert.equal(parsed.error, 'E_VERSION');
});

test('CF8 parseCaseFile: null/undefined → E_BAD_JSON', () => {
  assert.equal(cf.parseCaseFile(null).error, 'E_BAD_JSON');
  assert.equal(cf.parseCaseFile(undefined).error, 'E_BAD_JSON');
  assert.equal(cf.parseCaseFile('').error, 'E_BAD_JSON');
});