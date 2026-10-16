/* IntegrityWatch Field — export/import round-trip (TESTS §13) */
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const storeApi = require('../src/core/store.js');
const dbMemory = require('../src/core/dbMemory.js');
const exportImport = require('../src/core/exportImport.js');

function freshStore() {
  return storeApi.create(dbMemory.create());
}

function stripUpdatedAt(recs) {
  return recs.map(function (r) {
    const out = {};
    for (const k in r) { if (k !== 'updatedAt') { out[k] = r[k]; } }
    return out;
  });
}

function seed(s) {
  return Promise.all([
    s.monitoringPoints.saveAll([
      { id: 'mp1', code: 'MP-CORR-001', name: 'A', sector: 'upstream' },
      { id: 'mp2', code: 'MP-CORR-002', name: 'B', sector: 'midstream' }
    ]),
    s.readings.saveAll([
      { id: 'r1', mpId: 'mp1', date: '2026-01-01', crMpy: 3.2 },
      { id: 'r2', mpId: 'mp1', date: '2026-01-02', crMpy: 4.1 }
    ])
  ]);
}

test('round-trip export -> clear -> import(merge) deep-equal except updatedAt', async () => {
  const s = freshStore();
  await seed(s);
  const before = {
    monitoringPoints: stripUpdatedAt(await s.monitoringPoints.list()),
    readings: stripUpdatedAt(await s.readings.list())
  };
  const payload = await exportImport.exportAll(s);
  assert.equal(payload.app, 'integritywatch-field');
  assert.equal(payload.version, 1);
  assert.ok(payload.exportedAt);

  await s.monitoringPoints.clear();
  await s.readings.clear();
  assert.equal((await s.monitoringPoints.list()).length, 0);
  assert.equal((await s.readings.list()).length, 0);

  const result = await exportImport.importAll(s, payload, { mode: 'merge' });
  assert.equal(result.errors.length, 0);

  const after = {
    monitoringPoints: stripUpdatedAt(await s.monitoringPoints.list()),
    readings: stripUpdatedAt(await s.readings.list())
  };
  assert.deepEqual(after, before);
});

test('exportAll excludes meta and mutationQueue (mutationQueue debug-only)', async () => {
  const s = freshStore();
  await s.meta.set('theme', 'dark');
  const payload = await exportImport.exportAll(s);
  assert.equal(payload.data.meta, undefined);
  assert.equal(payload.data.mutationQueue, undefined);
  const withDebug = await exportImport.exportAll(s, { debug: true });
  assert.ok(withDebug.data.mutationQueue);
  assert.equal(withDebug.data.meta, undefined);
});

test('replace mode only clears stores present in payload', async () => {
  const s = freshStore();
  await s.readings.save({ id: 'r1', mpId: 'mp1', crMpy: 1 });
  await s.coupons.save({ id: 'c1', mpId: 'mp1', days: 30 });
  const payload = {
    app: 'integritywatch-field', version: 1, exportedAt: '2026-01-01T00:00:00.000Z',
    data: { readings: [{ id: 'r2', mpId: 'mp1', crMpy: 9 }] }
  };
  const result = await exportImport.importAll(s, payload, { mode: 'replace' });
  assert.equal(result.errors.length, 0);

  const readings = await s.readings.list();
  assert.equal(readings.length, 1);
  assert.equal(readings[0].id, 'r2');

  const coupons = await s.coupons.list();
  assert.equal(coupons.length, 1);
  assert.equal(coupons[0].id, 'c1');
});

test('dryRun does not mutate any store', async () => {
  const s = freshStore();
  await s.readings.save({ id: 'r1', mpId: 'mp1', crMpy: 1 });
  const payload = {
    app: 'integritywatch-field', version: 1, exportedAt: '2026-01-01T00:00:00.000Z',
    data: { readings: [{ id: 'r9', mpId: 'mp1', crMpy: 9 }] }
  };
  await exportImport.importAll(s, payload, { mode: 'replace', dryRun: true });
  const readings = await s.readings.list();
  assert.equal(readings.length, 1);
  assert.equal(readings[0].id, 'r1');
});

test('import reports per-record errors with code and skips bad records', async () => {
  const s = freshStore();
  const payload = {
    app: 'integritywatch-field', version: 1, exportedAt: '2026-01-01T00:00:00.000Z',
    data: { readings: [{ id: 'ok', mpId: 'mp1', crMpy: 1 }, { bad: true }, null] }
  };
  const result = await exportImport.importAll(s, payload, { mode: 'merge' });
  assert.equal(result.errors.length, 2);
  assert.equal(result.errors[0].code, 'E_BAD_RECORD');
  assert.equal(result.errors[0].store, 'readings');
  const readings = await s.readings.list();
  assert.equal(readings.length, 1);
  assert.equal(readings[0].id, 'ok');
});

test('import rejects unknown stores with E_UNKNOWN_STORE', async () => {
  const s = freshStore();
  const payload = {
    app: 'integritywatch-field', version: 1, exportedAt: '2026-01-01T00:00:00.000Z',
    data: { notAStore: [{ id: 'x' }] }
  };
  const result = await exportImport.importAll(s, payload, { mode: 'merge' });
  assert.equal(result.errors.length, 1);
  assert.equal(result.errors[0].code, 'E_UNKNOWN_STORE');
});
