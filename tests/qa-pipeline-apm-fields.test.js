/* IntegrityWatch Field — qa-pipeline-apm-fields (TESTS §A10)
   Focused QA suite: apm.js metrics, dbMemory/store CRUD + index query,
   seed counts/enums/cross-consistency and determinism.
   Replaces the prior single mega-test; valid asserts from it are preserved. */
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

require('../src/calc/units.js');
require('../src/calc/corrosion.js');
require('../src/calc/psv.js');
const apm = require('../src/calc/apm.js');
const dbMemory = require('../src/core/dbMemory.js');
const bus = require('../src/core/bus.js');
const storeApi = require('../src/core/store.js');
const seed = require('../src/data/seed.js');

const NOW = '2026-10-16T00:00:00.000Z';

function freshStore() {
  return storeApi.create(dbMemory.create());
}

// ---- 1..7: apm.js metrics ---------------------------------------------------

test('1. availability: (720,36) ≈95 y bordes válidos', () => {
  assert.strictEqual(apm.availability({ windowH: 720, downtimeH: 36 }), 95);
  // preserved from prior mega-test
  assert.strictEqual(apm.availability({ windowH: 100, downtimeH: 0 }), 100);
  assert.strictEqual(apm.availability({ windowH: 50, downtimeH: 50 }), 0);
  assert.strictEqual(apm.availability({ windowH: 0, downtimeH: 10 }), null);
  assert.strictEqual(apm.availability({ windowH: -5, downtimeH: 0 }), null);
});

test('2. mtbf: (2160,60,3) ≈700 y failureCount 0 → null', () => {
  assert.strictEqual(apm.mtbf({ windowH: 2160, downtimeH: 60, failureCount: 3 }), 700);
  assert.strictEqual(apm.mtbf({ windowH: 100, downtimeH: 10, failureCount: 0 }), null);
});

test('3. mttr: (60h,3) ≈20 y 0 fallos → null', () => {
  assert.strictEqual(apm.mttr({ downtimeH: 60, failureCount: 3 }), 20);
  assert.strictEqual(apm.mttr({ downtimeH: 0, failureCount: 0 }), null);
  // preserved: mttr tolera windowH ausente
  assert.strictEqual(apm.mttr({ downtimeH: 10, failureCount: 1 }), 10);
});

test('4. oee: a·p·q ≈0.8379 (args reales a,p,q)', () => {
  assert.strictEqual(apm.oee({ a: 0.95, p: 0.90, q: 0.98 }), 0.8379);
  // preserved from prior mega-test: failureRate
  assert.strictEqual(apm.failureRate({ failureCount: 5, windowH: 720 }), 5 / 720);
  assert.strictEqual(apm.failureRate({ failureCount: 1, windowH: 0 }), null);
});

test('5. rbiRisk: bandas y fronteras', () => {
  assert.deepEqual(apm.rbiRisk({ pof: 4, cof: 5 }), { score: 20, band: 'veryHigh' });
  assert.deepEqual(apm.rbiRisk({ pof: 2, cof: 2 }), { score: 4, band: 'low' });
  assert.deepEqual(apm.rbiRisk({ pof: 3, cof: 2 }), { score: 6, band: 'medium' });
  assert.deepEqual(apm.rbiRisk({ pof: 3, cof: 4 }), { score: 12, band: 'high' });
  assert.deepEqual(apm.rbiRisk({ pof: 1, cof: 4 }), { score: 4, band: 'low' }); // frontera 4/5
  // preserved boundaries
  assert.strictEqual(apm.rbiRisk({ pof: 5, cof: 3 }).band, 'high');   // 15
  assert.strictEqual(apm.rbiRisk({ pof: 1, cof: 1 }).band, 'low');    // 1
});

test('6. inspectionIntervalMonths base 24: 24/18/12/6', () => {
  assert.strictEqual(apm.inspectionIntervalMonths({ band: 'low', baseMonths: 24 }), 24);
  assert.strictEqual(apm.inspectionIntervalMonths({ band: 'medium', baseMonths: 24 }), 18);
  assert.strictEqual(apm.inspectionIntervalMonths({ band: 'high', baseMonths: 24 }), 12);
  assert.strictEqual(apm.inspectionIntervalMonths({ band: 'veryHigh', baseMonths: 24 }), 6);
  // preserved: banda desconocida cae al base
  assert.strictEqual(apm.inspectionIntervalMonths({ band: 'unknown', baseMonths: 24 }), 24);
});

test('7. nextInspectionDate 2026-01-15 +6m → 2026-07-15', () => {
  const iso = apm.nextInspectionDate({ fromISO: '2026-01-15', months: 6 });
  assert.ok(typeof iso === 'string' && iso.startsWith('2026-07-15'), 'got ' + iso);
  // preserved: fromISO inválido → null
  assert.strictEqual(apm.nextInspectionDate({ fromISO: 'not-a-date', months: 1 }), null);
});

// ---- 8..9: store / dbMemory -------------------------------------------------

test('8. store dbMemory: save/get/list/remove/clear + updatedAt', async () => {
  const repos = freshStore();
  const seen = [];
  const off = bus.on('data:changed:apmAssets', (p) => seen.push(p));

  const rec = { id: 'T-1', code: 'T-1', name: 'T', sector: 'upstream', category: 'well', criticality: 'A', status: 'running', rbi: { pof: 1, cof: 1 } };
  const saved = await repos.apmAssets.save(rec, '2026-01-01T00:00:00.000Z');
  assert.strictEqual(saved.createdAt, '2026-01-01T00:00:00.000Z');
  assert.strictEqual(saved.updatedAt, '2026-01-01T00:00:00.000Z');
  assert.ok(seen.some((e) => e.store === 'apmAssets' && e.type === 'put'), 'save emitió data:changed:apmAssets');

  const got = await repos.apmAssets.get('T-1');
  assert.ok(got && got.id === 'T-1');
  assert.strictEqual((await repos.apmAssets.list()).length, 1);

  // updatedAt automático: re-save avanza updatedAt y conserva createdAt
  const again = await repos.apmAssets.save({ ...saved, name: 'T2' }, '2026-02-01T00:00:00.000Z');
  assert.strictEqual(again.createdAt, '2026-01-01T00:00:00.000Z');
  assert.strictEqual(again.updatedAt, '2026-02-01T00:00:00.000Z');
  // updatedAt automático sin nowISO: ISO válido e igual a createdAt
  const auto = await repos.lineAssets.save({ id: 'A-1' });
  assert.ok(!isNaN(Date.parse(auto.createdAt)) && !isNaN(Date.parse(auto.updatedAt)));
  assert.strictEqual(auto.updatedAt, auto.createdAt);

  await repos.apmAssets.remove('T-1');
  assert.strictEqual(await repos.apmAssets.get('T-1'), null);
  assert.strictEqual((await repos.apmAssets.list()).length, 0);

  await repos.apmAssets.save({ id: 'T-2' }, '2026-01-01T00:00:00.000Z');
  await repos.apmAssets.clear();
  assert.strictEqual((await repos.apmAssets.list()).length, 0);

  off();
});

test('9. dbMemory.query por índices (lineAssets.systemId, apmEvents.assetId)', async () => {
  const adapter = dbMemory.create();
  const repos = storeApi.create(adapter);
  await seed.demo(repos, { nowISO: NOW });

  const bySystem = await adapter.query('lineAssets', 'systemId', 'SYS-NORTE-16');
  assert.strictEqual(bySystem.length, 12);
  bySystem.forEach((a) => assert.strictEqual(a.systemId, 'SYS-NORTE-16'));

  const byAsset = await adapter.query('apmEvents', 'assetId', 'APM-DN-002');
  assert.ok(byAsset.length >= 1);
  byAsset.forEach((e) => assert.strictEqual(e.assetId, 'APM-DN-002'));
  // preserved: APM-DN-002 acumula >= 3 fallos
  assert.ok(byAsset.filter((e) => e.type === 'failure').length >= 3);
});

// ---- 10..13: seed data ------------------------------------------------------

test('10. seed.demo: counts exactos por store', async () => {
  const repos = freshStore();
  const res = await seed.demo(repos, { nowISO: NOW });
  assert.deepEqual(res.counts, {
    pipelineSystems: 1,
    lineAssets: 12,
    lineInspections: 5,
    iliAnomalies: 6,
    monitoringPoints: 8,
    readings: 120,
    coupons: 4,
    psvs: 5,
    apmAssets: 18,
    apmEvents: 24,
    recommendations: 0
  });
  assert.strictEqual((await repos.lineAssets.list()).length, 12);
  assert.strictEqual((await repos.apmEvents.list()).length, 24);

  // preserved from prior mega-test: enums y cordura de cupones
  const coupons = await repos.coupons.list();
  assert.strictEqual(coupons.length, 4);
  coupons.forEach((cp) => {
    assert.ok(['blank', 'inhibited'].includes(cp.role), 'coupon.role ' + cp.role);
    assert.ok(typeof cp.wiMg === 'number' && cp.wiMg >= 0, 'wiMg');
    assert.ok(typeof cp.wfMg === 'number' && cp.wfMg >= 0 && cp.wfMg <= cp.wiMg, 'wfMg<=wiMg');
    assert.ok(typeof cp.areaIn2 === 'number' && cp.areaIn2 > 0, 'areaIn2');
    assert.ok(['active', 'expired', 'retired'].includes(cp.status), 'coupon.status');
  });
});

test('11. seed lineAssets: type/stationKm/side válidos', async () => {
  const repos = freshStore();
  await seed.demo(repos, { nowISO: NOW });
  const types = [
    'sectionValve', 'blockValve', 'flange', 'fitting', 'pumpStation', 'compressorStation',
    'tank', 'sump', 'valveChamber', 'crossing', 'row', 'meteringStation'
  ];
  const systems = new Set((await repos.pipelineSystems.list()).map((s) => s.id));
  const assets = await repos.lineAssets.list();
  assert.strictEqual(assets.length, 12);
  assets.forEach((a) => {
    assert.ok(types.includes(a.type), 'type ' + a.type);
    assert.ok(typeof a.stationKm === 'number' && a.stationKm >= 0 && a.stationKm <= 120, 'stationKm ' + a.stationKm);
    assert.ok(['left', 'right', 'center'].includes(a.side), 'side ' + a.side);
    // preserved: systemId referencia un sistema existente
    assert.ok(systems.has(a.systemId), 'systemId ref ' + a.systemId);
  });
});

test('12. seed lineInspections: type y fromKm ≤ toKm', async () => {
  const repos = freshStore();
  await seed.demo(repos, { nowISO: NOW });
  const types = ['ild', 'externalCorrosion', 'visual', 'ut', 'repair', 'replacement'];
  const nowMs = Date.parse(NOW);
  const list = await repos.lineInspections.list();
  assert.strictEqual(list.length, 5);
  list.forEach((i) => {
    assert.ok(types.includes(i.type), 'type ' + i.type);
    assert.ok(i.fromKm <= i.toKm, 'fromKm<=toKm ' + i.fromKm + '..' + i.toKm);
    // preserved: km dentro del rango y fecha no futura
    assert.ok(i.fromKm >= 0 && i.toKm <= 120, 'km range');
    assert.ok(Date.parse(i.date) <= nowMs, 'no future inspection date');
  });
});

test('13. seed APM: enums por sector y apmEvent.assetId existente', async () => {
  const repos = freshStore();
  await seed.demo(repos, { nowISO: NOW });

  const sectorCats = {
    upstream: ['well', 'platform', 'fpso', 'subsea', 'esp', 'suckerRod', 'gasLift', 'wellheadCompression', 'separator', 'storageTank', 'centrifugalPump', 'generator', 'firePump', 'fireSystem'],
    midstream: ['pipeline', 'pumpStation', 'compressorStation', 'loadingTerminal', 'storageTank', 'gasPlant', 'centrifugalPump', 'reciprocatingPump', 'generator', 'substation', 'firePump', 'fireSystem', 'separator'],
    downstream: ['refinery', 'distillationUnit', 'hydrodesulfurization', 'reformer', 'heatExchanger', 'pump', 'compressor', 'column', 'furnace', 'utilitySteam', 'utilityAir', 'utilityNitrogen', 'centrifugalPump', 'reciprocatingPump', 'generator', 'substation', 'firePump', 'fireSystem', 'sensor']
  };

  const assets = await repos.apmAssets.list();
  const assetIds = new Set(assets.map((a) => a.id));
  assert.strictEqual(assets.length, 18);
  assets.forEach((a) => {
    assert.ok(sectorCats[a.sector], 'sector ' + a.sector);
    assert.ok(sectorCats[a.sector].includes(a.category), 'category ' + a.category + ' no válida para ' + a.sector);
    assert.ok(a.rbi.pof >= 1 && a.rbi.pof <= 5, 'rbi.pof ' + a.rbi.pof);
    assert.ok(a.rbi.cof >= 1 && a.rbi.cof <= 5, 'rbi.cof ' + a.rbi.cof);
    assert.ok(['A', 'B', 'C'].includes(a.criticality), 'criticality ' + a.criticality);
    assert.ok(['running', 'standby', 'down', 'maintenance'].includes(a.status), 'status ' + a.status);
  });

  const events = await repos.apmEvents.list();
  assert.strictEqual(events.length, 24);
  events.forEach((ev) => {
    assert.ok(['failure', 'maintenance', 'unplannedOutage', 'workOrder', 'inspection'].includes(ev.type), 'event.type ' + ev.type);
    assert.ok(assetIds.has(ev.assetId), 'apmEvent.assetId huérfano: ' + ev.assetId);
    // preserved: start ISO válido y downtimeH >= 0
    assert.ok(!isNaN(Date.parse(ev.start)), 'start ISO');
    if (ev.downtimeH !== undefined) {
      assert.ok(typeof ev.downtimeH === 'number' && ev.downtimeH >= 0, 'downtimeH');
    }
  });
});

// ---- 14: determinismo -------------------------------------------------------

test('14. determinismo: dos demo() → mismos ids y counts (mulberry32(42))', async () => {
  const a = freshStore();
  const b = freshStore();
  const ra = await seed.demo(a, { nowISO: NOW });
  const rb = await seed.demo(b, { nowISO: NOW });
  assert.deepEqual(ra.counts, rb.counts);

  const stores = ['pipelineSystems', 'lineAssets', 'lineInspections', 'monitoringPoints',
    'readings', 'coupons', 'psvs', 'apmAssets', 'apmEvents'];
  for (const storeName of stores) {
    const idsA = (await a[storeName].list()).map((r) => r.id).sort();
    const idsB = (await b[storeName].list()).map((r) => r.id).sort();
    assert.deepEqual(idsA, idsB, storeName + ' ids divergen');
  }

  // preserved: el jitter determinista produce valores idénticos
  const rdA = (await a.readings.list()).map((r) => r.id + ':' + r.crMpy).sort();
  const rdB = (await b.readings.list()).map((r) => r.id + ':' + r.crMpy).sort();
  assert.deepEqual(rdA, rdB);
});
