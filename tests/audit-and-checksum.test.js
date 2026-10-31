/* IntegrityWatch Field — audit trail + strong checksum + import schema (T4)
   Tests for permissions.stamp, caseFile.buildCaseFileV2/parseCaseFileAsync,
   and exportImport schema validation. */
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const storeApi = require('../src/core/store.js');
const dbMemory = require('../src/core/dbMemory.js');
const lock = require('../src/security/lock.js');
const permissions = require('../src/security/permissions.js');
const caseFile = require('../src/core/caseFile.js');
const exportImport = require('../src/core/exportImport.js');

lock.__setCrypto(globalThis.crypto);

function freshStore() {
  return storeApi.create(dbMemory.create());
}

// ---- TASK 1: stamp -----------------------------------------------------------

test('stamp() create sets createdBy/createdAt/updatedBy/updatedAt to same actor+now', async () => {
  const s = freshStore();
  await lock.enable({ pin: '123456', role: 'engineer' }, s.meta);
  const rec = { id: 'a', code: 'X' };
  const out = await permissions.stamp(s.meta, rec, null);
  assert.equal(out.createdBy, 'engineer');
  assert.equal(out.updatedBy, 'engineer');
  assert.ok(typeof out.createdAt === 'string');
  assert.equal(out.createdAt, out.updatedAt);
  assert.equal(out.id, 'a');
  assert.equal(out.code, 'X');
});

test('stamp() update refreshes updatedBy/updatedAt and preserves createdBy/createdAt', async () => {
  const s = freshStore();
  await lock.enable({ pin: '123456', role: 'engineer' }, s.meta);
  const existing = {
    id: 'a',
    createdBy: 'engineer',
    createdAt: '2020-01-01T00:00:00.000Z',
    updatedBy: 'engineer',
    updatedAt: '2020-01-01T00:00:00.000Z'
  };
  const rec = { id: 'a', code: 'Y' };
  const out = await permissions.stamp(s.meta, rec, existing);
  assert.equal(out.createdBy, 'engineer');
  assert.equal(out.createdAt, '2020-01-01T00:00:00.000Z');
  assert.equal(out.updatedBy, 'engineer');
  assert.notEqual(out.updatedAt, '2020-01-01T00:00:00.000Z');
  assert.ok(!isNaN(Date.parse(out.updatedAt)));
});

test('stamp() falls back to local when lock is disabled', async () => {
  const s = freshStore();
  const out = await permissions.stamp(s.meta, { id: 'a' }, null);
  assert.equal(out.createdBy, 'local');
  assert.equal(out.updatedBy, 'local');
  assert.ok(typeof out.createdAt === 'string');
});

// ---- TASK 2: strong checksum -------------------------------------------------

test('buildCaseFileV2 produces a SHA-256 envelope that parseCaseFileAsync verifies', async () => {
  const data = { apmAssets: [{ id: 'a1', code: 'P-102' }] };
  const env = await caseFile.buildCaseFileV2(data, { sector: 'midstream' }, 'engineer');
  assert.equal(env.format, 'iwf');
  assert.equal(env.app, '1.1.0');
  assert.equal(env.checksumAlgo, 'SHA-256');
  assert.equal(env.signedBy, 'engineer');
  assert.equal(env.sector, 'midstream');
  assert.ok(typeof env.checksum === 'string');
  assert.equal(env.checksum.length, 8, 'legacy FNV checksum retained');
  assert.ok(typeof env.checksumSha256 === 'string');
  assert.ok(env.checksumSha256.length > 8, 'SHA-256 base64 present');

  const parsed = await caseFile.parseCaseFileAsync(JSON.stringify(env));
  assert.ok(parsed.ok, 'expected ok, got ' + parsed.error);
  assert.deepEqual(parsed.payload.data.apmAssets, data.apmAssets);
});

test('buildCaseFileV2 tampered data → E_CHECKSUM_SHA', async () => {
  const data = { apmAssets: [{ id: 'a1', code: 'P-102' }] };
  const env = await caseFile.buildCaseFileV2(data, {}, 'engineer');
  const raw = JSON.stringify(env);
  const tampered = raw.replace('"P-102"', '"P-999"');
  const parsed = await caseFile.parseCaseFileAsync(tampered);
  assert.ok(!parsed.ok);
  assert.equal(parsed.error, 'E_CHECKSUM_SHA');
});

test('V2 downgrade attack: stripping checksumSha256 (leaving checksumAlgo) → E_CHECKSUM_SHA', async () => {
  const data = { apmAssets: [{ id: 'a1', code: 'P-102' }] };
  const env = await caseFile.buildCaseFileV2(data, {}, 'engineer');
  delete env.checksumSha256;
  const parsed = await caseFile.parseCaseFileAsync(JSON.stringify(env));
  assert.ok(!parsed.ok);
  assert.equal(parsed.error, 'E_CHECKSUM_SHA');
});

test('V2 envelope coverage: tampering signedBy → E_CHECKSUM_SHA', async () => {
  const data = { apmAssets: [{ id: 'a1', code: 'P-102' }] };
  const env = await caseFile.buildCaseFileV2(data, {}, 'engineer');
  env.signedBy = 'admin';
  const parsed = await caseFile.parseCaseFileAsync(JSON.stringify(env));
  assert.ok(!parsed.ok);
  assert.equal(parsed.error, 'E_CHECKSUM_SHA');
});

test('V2 envelope coverage: tampering sector → E_CHECKSUM_SHA', async () => {
  const data = { apmAssets: [{ id: 'a1' }] };
  const env = await caseFile.buildCaseFileV2(data, { sector: 'midstream' }, 'engineer');
  env.sector = 'downstream';
  const parsed = await caseFile.parseCaseFileAsync(JSON.stringify(env));
  assert.ok(!parsed.ok);
  assert.equal(parsed.error, 'E_CHECKSUM_SHA');
});

test('legacy envelope still parses synchronously and asynchronously', async () => {
  const data = { apmAssets: [{ id: 'a1' }] };
  const env = caseFile.buildCaseFile(data, { sector: 'midstream' });
  const sync = caseFile.parseCaseFile(JSON.stringify(env));
  assert.ok(sync.ok, 'expected sync ok, got ' + sync.error);
  const asyncRes = await caseFile.parseCaseFileAsync(JSON.stringify(env));
  assert.ok(asyncRes.ok, 'expected async ok, got ' + asyncRes.error);
});

// ---- TASK 3: schema validation ----------------------------------------------

test('importAll schema: missing required field → E_SCHEMA, valid one imports', async () => {
  const s = freshStore();
  const payload = {
    app: 'integritywatch-field', version: 1, exportedAt: '2026-01-01T00:00:00.000Z',
    data: { monitoringPoints: [{ id: 'good', code: 'MP-1' }, { id: 'bad' }] }
  };
  const result = await exportImport.importAll(s, payload, { mode: 'merge' });
  assert.equal(result.errors.length, 1);
  assert.equal(result.errors[0].code, 'E_SCHEMA');
  assert.equal(result.errors[0].store, 'monitoringPoints');
  assert.equal(result.errors[0].index, 1);
  const mps = await s.monitoringPoints.list();
  assert.equal(mps.length, 1);
  assert.equal(mps[0].id, 'good');
});

test('importAll rejects __proto__ store name with E_UNKNOWN_STORE and does not crash', async () => {
  const s = freshStore();
  const data = JSON.parse('{"__proto__":[{"id":"x"}]}');
  const payload = {
    app: 'integritywatch-field', version: 1, exportedAt: '2026-01-01T00:00:00.000Z',
    data: data
  };
  const result = await exportImport.importAll(s, payload, { mode: 'merge' });
  assert.equal(result.errors.length, 1);
  assert.equal(result.errors[0].code, 'E_UNKNOWN_STORE');
  assert.equal(result.errors[0].store, '__proto__');
});
