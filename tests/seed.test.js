/* IntegrityWatch Field — seed (TESTS §14 / SCHEMA §8.5)
   Deterministic demo seed over dbMemory: exact counts, determinism across stores,
   rule triggers (R1/R5/R13/R3), no future dates, stable ids. */
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

require('../src/calc/units.js');
require('../src/calc/corrosion.js');
require('../src/calc/apm.js');
require('../src/calc/psv.js');
const dbMemory = require('../src/core/dbMemory.js');
const storeApi = require('../src/core/store.js');
const seed = require('../src/data/seed.js');
const apmView = require('../src/views/apm.js');

const NOW = '2026-09-15T00:00:00.000Z';
const DAY = 86400000;
const HOUR = 3600000;

function freshStore() {
  return storeApi.create(dbMemory.create());
}

function seedNow(repos, nowISO) {
  return seed.demo(repos, { nowISO: nowISO });
}

test('seed produces exact deterministic counts and returns them', async () => {
  const s = freshStore();
  const res = await seedNow(s, NOW);
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
  assert.equal((await s.pipelineSystems.list()).length, 1);
  assert.equal((await s.lineAssets.list()).length, 12);
  assert.equal((await s.lineInspections.list()).length, 5);
  assert.equal((await s.iliAnomalies.list()).length, 6);
  assert.equal((await s.monitoringPoints.list()).length, 8);
  assert.equal((await s.readings.list()).length, 120);
  assert.equal((await s.coupons.list()).length, 4);
  assert.equal((await s.psvs.list()).length, 5);
  assert.equal((await s.apmAssets.list()).length, 18);
  assert.equal((await s.apmEvents.list()).length, 24);
  assert.equal((await s.recommendations.list()).length, 0);

  // New O&G equipment assets exist with the right sector + category.
  const byId = {};
  (await s.apmAssets.list()).forEach((a) => { byId[a.id] = a; });
  const expectedNew = {
    'APM-MD-105': { code: 'PUMP-201A', sector: 'midstream', category: 'centrifugalPump' },
    'APM-MD-106': { code: 'GEN-101', sector: 'midstream', category: 'generator' },
    'APM-MD-107': { code: 'FP-01', sector: 'midstream', category: 'firePump' },
    'APM-MD-108': { code: 'FPS-01', sector: 'midstream', category: 'fireSystem' },
    'APM-DN-003': { code: 'PUMP-305', sector: 'downstream', category: 'centrifugalPump' }
  };
  for (const id of Object.keys(expectedNew)) {
    const a = byId[id];
    assert.ok(a, 'missing new O&G asset ' + id);
    assert.equal(a.code, expectedNew[id].code, id + ' code');
    assert.equal(a.sector, expectedNew[id].sector, id + ' sector');
    assert.equal(a.category, expectedNew[id].category, id + ' category');
  }

  // New categories are members of at least one sector enum.
  const newCats = ['centrifugalPump', 'reciprocatingPump', 'generator', 'substation', 'firePump', 'fireSystem'];
  const allSectorCats = [].concat(
    apmView.sectorCategories.upstream,
    apmView.sectorCategories.midstream,
    apmView.sectorCategories.downstream
  );
  newCats.forEach((c) => {
    assert.ok(allSectorCats.indexOf(c) !== -1, 'new category not in any sector enum: ' + c);
  });
});

test('seed is deterministic across independent stores', async () => {
  const a = freshStore();
  const b = freshStore();
  await seedNow(a, NOW);
  await seedNow(b, NOW);

  const mpA = (await a.monitoringPoints.list()).map((r) => r.id).sort();
  const mpB = (await b.monitoringPoints.list()).map((r) => r.id).sort();
  assert.deepEqual(mpA, mpB);

  const rdA = (await a.readings.list()).map((r) => r.id).sort();
  const rdB = (await b.readings.list()).map((r) => r.id).sort();
  assert.deepEqual(rdA, rdB);

  const spikeA = (await a.readings.list()).find((r) => r.mpId === 'MP-CORR-001' && r.crMpy >= 10);
  const spikeB = (await b.readings.list()).find((r) => r.mpId === 'MP-CORR-001' && r.crMpy >= 10);
  assert.ok(spikeA && spikeB, 'expected a >=10 mpy reading in both stores');
  assert.equal(spikeA.crMpy, spikeB.crMpy);
  assert.equal(spikeA.date, spikeB.date);

  const psvA = await a.psvs.get('PSV-520-001');
  const psvB = await b.psvs.get('PSV-520-001');
  assert.equal(psvA.sizing.AreqIn2, psvB.sizing.AreqIn2);
  assert.equal(psvA.sizing.marginPct, psvB.sizing.marginPct);
  assert.equal(psvA.sizing.WrealLbh, psvB.sizing.WrealLbh);

  const couponA = await a.coupons.get('CP-P2-INH');
  const couponB = await b.coupons.get('CP-P2-INH');
  assert.equal(couponA.crMpy, couponB.crMpy);
});

test('R1 trigger: MP-001 has a >=10 mpy reading in the last 24 h', async () => {
  const s = freshStore();
  await seedNow(s, NOW);
  const nowMs = Date.parse(NOW);
  const readings = (await s.readings.list()).filter((r) => r.mpId === 'MP-CORR-001');
  const hot = readings.filter((r) => {
    const ms = Date.parse(r.date);
    return r.crMpy >= 10 && ms <= nowMs && ms >= nowMs - 24 * HOUR;
  });
  assert.ok(hot.length >= 1, 'expected a hot (>=10 mpy, last 24 h) reading for MP-CORR-001');
});

test('R5 trigger: MP-003 is an ER probe with >=10 consecutive identical readings', async () => {
  const s = freshStore();
  await seedNow(s, NOW);
  const mp = (await s.monitoringPoints.list()).find((r) => r.id === 'MP-CORR-003');
  assert.equal(mp.sensorType, 'erProbe');
  const readings = (await s.readings.list()).filter((r) => r.mpId === 'MP-CORR-003');
  assert.ok(readings.length >= 10, 'expected at least 10 readings');
  const sorted = readings.slice().sort((x, y) => Date.parse(x.date) - Date.parse(y.date));
  let maxRun = 0;
  let run = 0;
  let prev = null;
  sorted.forEach((r) => {
    if (prev !== null && r.crMpy === prev) { run += 1; } else { run = 1; }
    if (run > maxRun) { maxRun = run; }
    prev = r.crMpy;
  });
  assert.ok(maxRun >= 10, 'expected >=10 identical consecutive readings, got ' + maxRun);
});

test('R13 trigger: a PSV has nextTestDate older than 30 days', async () => {
  const s = freshStore();
  await seedNow(s, NOW);
  const nowMs = Date.parse(NOW);
  const psvs = await s.psvs.list();
  const overdue = psvs.filter((p) => Date.parse(p.nextTestDate) < nowMs - 30 * DAY);
  assert.ok(overdue.length >= 1, 'expected at least one PSV overdue by more than 30 days');
});

test('R3 trigger: coupon pair P2 EI < 70%, pair P1 EI >= 90%', async () => {
  const s = freshStore();
  await seedNow(s, NOW);
  const coupons = await s.coupons.list();
  function cr(pairId, role) {
    const c = coupons.find((x) => x.pairId === pairId && x.role === role);
    return c.crMpy;
  }
  const ei1 = ((cr('P1', 'blank') - cr('P1', 'inhibited')) / cr('P1', 'blank')) * 100;
  const ei2 = ((cr('P2', 'blank') - cr('P2', 'inhibited')) / cr('P2', 'blank')) * 100;
  assert.ok(ei1 >= 90, 'P1 EI should be excellent, got ' + ei1);
  assert.ok(ei2 < 70, 'P2 EI should be poor, got ' + ei2);
});

test('R9/R11/R12 triggers: overdue RBI, low availability, repeated failures', async () => {
  const s = freshStore();
  await seedNow(s, NOW);
  const nowMs = Date.parse(NOW);
  const assets = await s.apmAssets.list();

  const r9 = assets.filter((a) => a.rbi && a.rbi.nextInspectionISO && Date.parse(a.rbi.nextInspectionISO) < nowMs);
  assert.ok(r9.length >= 1, 'expected an asset with overdue RBI inspection');

  const fp01 = assets.find((a) => a.id === 'APM-MD-107');
  assert.ok(fp01, 'expected the fire pump FP-01 (APM-MD-107) asset');
  assert.equal(fp01.category, 'firePump');
  assert.ok(
    fp01.rbi && fp01.rbi.nextInspectionISO && Date.parse(fp01.rbi.nextInspectionISO) < nowMs,
    'FP-01 must have an overdue nextInspectionISO (triggers R9)'
  );

  const events = await s.apmEvents.list();
  const pps = assets.find((a) => a.id === 'APM-MD-001');
  const ppsDowntime = events
    .filter((e) => e.assetId === pps.id && Date.parse(e.start) >= nowMs - 90 * DAY)
    .reduce((sum, e) => sum + (e.downtimeH || 0), 0);
  const ppsAvailability = ((90 * 24 - ppsDowntime) / (90 * 24)) * 100;
  assert.ok(ppsAvailability < 90, 'APM-MD-001 availability should be below 90%, got ' + ppsAvailability);

  const pmp = assets.find((a) => a.id === 'APM-DN-002');
  const failures = events.filter(
    (e) => e.assetId === pmp.id && e.type === 'failure' && Date.parse(e.start) >= nowMs - 90 * DAY
  );
  assert.ok(failures.length >= 3, 'APM-DN-002 should have >=3 failures in 90 days, got ' + failures.length);
});

test('seed line inspections: severe + high on concrete assets, coherent km, expired cert', async () => {
  const s = freshStore();
  await seedNow(s, NOW);
  const nowMs = Date.parse(NOW);
  const inspections = await s.lineInspections.list();
  assert.equal(inspections.length, 5);
  assert.ok(inspections.every((i) => i.systemId === 'SYS-NORTE-16'), 'all inspections belong to SYS-NORTE-16');
  const severities = inspections.map((i) => i.severity);
  assert.ok(severities.includes('severe'), 'expected a severe inspection');
  assert.ok(severities.includes('high'), 'expected a high inspection');
  assert.ok(severities.includes('moderate'), 'expected a moderate inspection');
  inspections.forEach((i) => {
    assert.ok(typeof i.lineAssetId === 'string' && i.lineAssetId.length > 0, 'every inspection is tied to an asset');
    assert.ok(i.fromKm <= i.toKm, 'fromKm must be <= toKm, got ' + i.fromKm + '..' + i.toKm);
    assert.ok(i.fromKm >= 0 && i.toKm <= 120, 'km within system range (0..120)');
    assert.ok(Date.parse(i.date) <= nowMs, 'no future inspection date');
  });
  const bv03 = await s.lineAssets.get('LA-N16-003');
  assert.ok(bv03.certExpiryISO, 'LA-N16-003 has a certExpiryISO');
  assert.ok(Date.parse(bv03.certExpiryISO) < nowMs, 'cert expiry is in the past');
});

test('all seeded dates are <= nowISO (no future dates)', async () => {
  const s = freshStore();
  await seedNow(s, NOW);
  const nowMs = Date.parse(NOW);
  const stores = ['readings', 'coupons', 'psvs', 'pipelineSystems', 'lineAssets', 'apmAssets', 'apmEvents'];
  const dateFields = ['date', 'startDate', 'endDate', 'lastTestDate', 'nextTestDate',
    'lastInspectionISO', 'certExpiryISO', 'start', 'end', 'computedAtISO', 'createdAt', 'updatedAt'];

  for (const storeName of stores) {
    const recs = await s[storeName].list();
    for (const r of recs) {
      for (const f of dateFields) {
        if (typeof r[f] === 'string' && r[f]) {
          const ms = Date.parse(r[f]);
          assert.ok(!isNaN(ms), storeName + ' ' + r.id + ' invalid date in ' + f);
          assert.ok(ms <= nowMs, storeName + ' ' + r.id + ' future date in ' + f + ': ' + r[f]);
        }
      }
      if (r.rbi && typeof r.rbi.nextInspectionISO === 'string' && r.rbi.nextInspectionISO) {
        assert.ok(Date.parse(r.rbi.nextInspectionISO) <= nowMs, 'future nextInspectionISO on ' + r.id);
      }
      if (r.sizing && typeof r.sizing.computedAtISO === 'string' && r.sizing.computedAtISO) {
        assert.ok(Date.parse(r.sizing.computedAtISO) <= nowMs, 'future computedAtISO on ' + r.id);
      }
    }
  }
});

test('stable ids: MP-CORR-001..008 and PSV-520-001..005', async () => {
  const s = freshStore();
  await seedNow(s, NOW);
  const mpIds = (await s.monitoringPoints.list()).map((r) => r.id).sort();
  assert.deepEqual(mpIds, [
    'MP-CORR-001', 'MP-CORR-002', 'MP-CORR-003', 'MP-CORR-004',
    'MP-CORR-005', 'MP-CORR-006', 'MP-CORR-007', 'MP-CORR-008'
  ]);
  const psvTags = (await s.psvs.list()).map((r) => r.tag).sort();
  assert.deepEqual(psvTags, ['PSV-520-001', 'PSV-520-002', 'PSV-520-003', 'PSV-520-004', 'PSV-520-005']);
});

test('PSV sizing is computed with the real engine (positive area + margin)', async () => {
  const s = freshStore();
  await seedNow(s, NOW);
  const gas = await s.psvs.get('PSV-520-001');
  assert.ok(gas.sizing.AreqIn2 > 0, 'expected positive required area');
  assert.ok(gas.sizing.critical === true, 'methane at 10% overpressure should be critical flow');
  assert.ok(typeof gas.sizing.marginPct === 'number');
  assert.equal(gas.status, 'due');
  const liquid = await s.psvs.get('PSV-520-003');
  assert.ok(liquid.sizing.AreqIn2 > 0);
  assert.ok(typeof liquid.sizing.Re === 'number');
  assert.ok(liquid.sizing.iterations >= 1);
});
