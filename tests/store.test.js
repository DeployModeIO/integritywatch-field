/* IntegrityWatch Field — store repository layer (TESTS §13) */
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const storeApi = require('../src/core/store.js');
const dbMemory = require('../src/core/dbMemory.js');
const bus = require('../src/core/bus.js');
require('../src/calc/corrosion.js'); // stub in this phase -> crFromWeightLoss throws NOT_IMPLEMENTED

const IW = globalThis.IW;

function freshStore() {
  return storeApi.create(dbMemory.create());
}

test('store create exposes 13 repos + meta.get/set', async () => {
  const s = freshStore();
  const names = ['meta', 'monitoringPoints', 'readings', 'coupons', 'psvs', 'pipelineSystems',
    'lineAssets', 'lineInspections', 'apmAssets', 'apmEvents', 'recommendations', 'importLog', 'mutationQueue'];
  assert.equal(names.length, 13);
  for (const name of names) {
    assert.ok(s[name], 'missing repo ' + name);
  }
  await s.meta.set('foo', 42);
  assert.equal(await s.meta.get('foo'), 42);
  assert.equal(await s.meta.get('missing'), undefined);
});

test('store save upserts + adds createdAt/updatedAt + emits data:changed', async () => {
  const s = freshStore();
  const events = [];
  const off = bus.on('data:changed:readings', function (p) { events.push(p); });
  const saved = await s.readings.save({ id: 'r1', mpId: 'mp1', crMpy: 3.2 });
  assert.equal(saved.id, 'r1');
  assert.equal(saved.crMpy, 3.2);
  assert.ok(saved.createdAt);
  assert.ok(saved.updatedAt);
  assert.equal(events.length, 1);
  assert.equal(events[0].store, 'readings');
  assert.equal(events[0].type, 'put');
  off();
});

test('store save preserves createdAt on update (upsert)', async () => {
  const s = freshStore();
  const nowISO = '2026-10-15T00:00:00.000Z';
  const first = await s.readings.save({ id: 'r1', mpId: 'mp1', crMpy: 3.2 }, nowISO);
  const second = await s.readings.save({ id: 'r1', mpId: 'mp1', crMpy: 4.5 }, nowISO);
  assert.equal(second.createdAt, first.createdAt);
  assert.equal(second.createdAt, nowISO);
  assert.equal(second.updatedAt, nowISO);
  assert.equal(second.crMpy, 4.5);
});

test('store list/get/remove/clear', async () => {
  const s = freshStore();
  await s.readings.saveAll([
    { id: 'r1', mpId: 'mp1', date: '2026-01-01', crMpy: 1 },
    { id: 'r2', mpId: 'mp1', date: '2026-01-02', crMpy: 2 }
  ]);
  assert.equal((await s.readings.list()).length, 2);
  assert.equal((await s.readings.get('r2')).crMpy, 2);
  await s.readings.remove('r1');
  assert.equal((await s.readings.list()).length, 1);
  await s.readings.clear();
  assert.equal((await s.readings.list()).length, 0);
});

test('dbMemory adapter query by index (readings[mpId])', async () => {
  const adapter = dbMemory.create();
  await adapter.bulkPut('readings', [
    { id: 'r1', mpId: 'mp1', date: '2026-01-01', crMpy: 1 },
    { id: 'r2', mpId: 'mp1', date: '2026-01-02', crMpy: 2 },
    { id: 'r3', mpId: 'mp2', date: '2026-01-03', crMpy: 3 }
  ]);
  const byMp = await adapter.query('readings', 'mpId', 'mp1');
  assert.equal(byMp.length, 2);
  assert.equal(await adapter.count('readings'), 3);
});

test('coupons.save computes exposedHours = 24*days and caches crMpy', async () => {
  const s = freshStore();
  const c = await s.coupons.save({ id: 'c1', mpId: 'mp1', wiMg: 100, wfMg: 98, densityGcm3: 7.87, areaIn2: 2, days: 30 });
  assert.equal(c.exposedHours, 720);
  assert.ok(typeof c.crMpy === 'number');
  assert.ok(c.crMpy > 0);
});

test('coupons.save tolerates a throwing crFromWeightLoss (crMpy stays undefined)', async () => {
  const s = freshStore();
  const original = IW.calc.corrosion.crFromWeightLoss;
  IW.calc.corrosion.crFromWeightLoss = function () { throw new Error('NOT_IMPLEMENTED'); };
  try {
    const c = await s.coupons.save({ id: 'c1', mpId: 'mp1', wiMg: 100, wfMg: 98, densityGcm3: 7.87, areaIn2: 2, days: 30 });
    assert.equal(c.exposedHours, 720);
    assert.equal(c.crMpy, undefined);
  } finally {
    IW.calc.corrosion.crFromWeightLoss = original;
  }
});

test('coupons.save caches crMpy returned by corrosion', async () => {
  const s = freshStore();
  const original = IW.calc.corrosion.crFromWeightLoss;
  IW.calc.corrosion.crFromWeightLoss = function () { return { mpy: 10.366, mmYear: 0.2633, umYear: 263.3 }; };
  try {
    const c = await s.coupons.save({ id: 'c1', mpId: 'mp1', wiMg: 100, wfMg: 98, densityGcm3: 7.87, areaIn2: 2, days: 30 });
    assert.equal(c.exposedHours, 720);
    assert.equal(c.crMpy, 10.366);
  } finally {
    IW.calc.corrosion.crFromWeightLoss = original;
  }
});

test('psvs.save recalculates status with injectable nowISO', async () => {
  const s = freshStore();
  const now = '2026-06-15T00:00:00.000Z';
  const ok = await s.psvs.save({ id: 'v1', tag: 'PSV-1', nextTestDate: '2026-09-01' }, now);
  assert.equal(ok.status, 'ok');
  const due = await s.psvs.save({ id: 'v2', tag: 'PSV-2', nextTestDate: '2026-06-14' }, now);
  assert.equal(due.status, 'due');
  const overdue = await s.psvs.save({ id: 'v3', tag: 'PSV-3', nextTestDate: '2026-04-15' }, now);
  assert.equal(overdue.status, 'overdue');
});

test('psvs.save status boundary: exactly 30 days ago is due, not overdue', async () => {
  const s = freshStore();
  const now = '2026-06-15T00:00:00.000Z';
  const boundary = await s.psvs.save({ id: 'v4', tag: 'PSV-4', nextTestDate: '2026-05-16' }, now);
  assert.equal(boundary.status, 'due');
  const today = await s.psvs.save({ id: 'v5', tag: 'PSV-5', nextTestDate: '2026-06-15' }, now);
  assert.equal(today.status, 'ok');
});
