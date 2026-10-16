/* IntegrityWatch Field — rules engine (TESTS §11)
   Anchors for R1–R14, reconcile and sweep over dbMemory. */
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

require('../src/calc/corrosion.js');
require('../src/calc/apm.js');
const bus = require('../src/core/bus.js');
const dbMemory = require('../src/core/dbMemory.js');
const storeApi = require('../src/core/store.js');
const definitions = require('../src/rules/definitions.js');
const engine = require('../src/rules/engine.js');

const corrosion = globalThis.IW.calc.corrosion;

const NOW = '2026-10-15T00:00:00.000Z';
const HOUR = 3600000;
const DAY = 86400000;

function hoursAgo(h) { return new Date(Date.parse(NOW) - h * HOUR).toISOString(); }
function daysAgo(d) { return new Date(Date.parse(NOW) - d * DAY).toISOString(); }
function daysAhead(d) { return new Date(Date.parse(NOW) + d * DAY).toISOString(); }

function rule(id) { return definitions.rules.find(function (r) { return r.id === id; }); }
function ev(id, state) { return rule(id).evaluate(state); }

function mkState(partial) {
  const s = {
    nowISO: NOW,
    monitoringPoints: [],
    readings: [],
    coupons: [],
    psvs: [],
    apmAssets: [],
    apmEvents: [],
    recommendations: [],
    settings: { residualBandPct: 20, availabilityThresholdPct: 90, stuckSensorCount: 10, zScoreThreshold: 3 }
  };
  return Object.assign(s, partial);
}

function mp(id, extra) {
  return Object.assign({ id: id, code: id, name: 'MP ' + id, sensorType: 'couponGravimetric', process: {} }, extra);
}

function rdg(mpId, iso, cr, id) {
  return { id: id || (mpId + '-' + iso + '-' + cr), mpId: mpId, date: iso, crMpy: cr };
}

test('R1 reading >=10 mpy in last 24 h -> critical; 9.9 or >24 h -> 0 (TESTS §11)', () => {
  const st = mkState({
    monitoringPoints: [mp('MP-1')],
    readings: [rdg('MP-1', hoursAgo(12), 12, 'r1')]
  });
  const f = ev('R1', st);
  assert.equal(f.length, 1);
  assert.equal(f[0].severity, 'critical');
  assert.equal(f[0].entityStore, 'monitoringPoints');
  assert.equal(f[0].entityId, 'MP-1');
  assert.equal(f[0].messageKey, 'rules.msg.R1');
  assert.equal(f[0].fingerprint, 'R1:monitoringPoints:MP-1');
  assert.equal(f[0].params.code, 'MP-1');
  assert.equal(f[0].params.cr, 12);

  assert.equal(ev('R1', mkState({
    monitoringPoints: [mp('MP-1')],
    readings: [rdg('MP-1', hoursAgo(12), 9.9, 'r1')]
  })).length, 0);

  assert.equal(ev('R1', mkState({
    monitoringPoints: [mp('MP-1')],
    readings: [rdg('MP-1', hoursAgo(30), 12, 'r1')]
  })).length, 0);
});

test('R2 avg7 >= 2*avg30 with >=5 readings each -> warning; below ratio -> 0 (TESTS §11)', () => {
  const recent = [1, 2, 3, 4, 5].map((i) => rdg('MP-1', daysAgo(i), 6.0, 'w' + i));
  const olderLow = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22].map((i) => rdg('MP-1', daysAgo(i), 1.0, 'o' + i));
  const f = ev('R2', mkState({ monitoringPoints: [mp('MP-1')], readings: recent.concat(olderLow) }));
  assert.equal(f.length, 1);
  assert.equal(f[0].severity, 'warning');
  assert.ok(Math.abs(f[0].params.avg7 - 6.0) < 1e-9, 'avg7 = 6.0');
  assert.ok(Math.abs(f[0].params.avg30 - 2.25) < 1e-9, 'avg30 = 2.25');
  assert.ok(f[0].params.ratio > 2, 'ratio > 2');

  const olderHigh = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22].map((i) => rdg('MP-1', daysAgo(i), 2.2, 'o' + i));
  assert.equal(ev('R2', mkState({ monitoringPoints: [mp('MP-1')], readings: recent.concat(olderHigh) })).length, 0);
});

test('R2 requires >=5 readings per window (TESTS §11)', () => {
  const only4 = [1, 2, 3, 4].map((i) => rdg('MP-1', daysAgo(i), 6.0, 'w' + i));
  const older = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17].map((i) => rdg('MP-1', daysAgo(i), 1.0, 'o' + i));
  assert.equal(ev('R2', mkState({ monitoringPoints: [mp('MP-1')], readings: only4.concat(older) })).length, 0);
});

test('R3 coupon pair EI < 70 -> warning; EI 72 -> 0 (TESTS §11)', () => {
  const coupons = [
    { id: 'c-b', mpId: 'MP-1', pairId: 'p1', role: 'blank', crMpy: 8 },
    { id: 'c-i', mpId: 'MP-1', pairId: 'p1', role: 'inhibited', crMpy: 2.8 }
  ];
  const f = ev('R3', mkState({ monitoringPoints: [mp('MP-1')], coupons: coupons }));
  assert.equal(f.length, 1);
  assert.equal(f[0].severity, 'warning');
  assert.equal(f[0].params.code, 'MP-1');
  assert.ok(Math.abs(f[0].params.ei - 65) < 1e-9, 'EI = 65');

  const ok = [
    { id: 'c-b', mpId: 'MP-1', pairId: 'p1', role: 'blank', crMpy: 8 },
    { id: 'c-i', mpId: 'MP-1', pairId: 'p1', role: 'inhibited', crMpy: 2.24 }
  ];
  assert.equal(ev('R3', mkState({ monitoringPoints: [mp('MP-1')], coupons: ok })).length, 0);
});

test('R4 residual 60%/180% -> warning, 84% -> 0, 76% -> info (TESTS §11)', () => {
  const withResidual = (residual) => mkState({
    monitoringPoints: [mp('MP-1', { process: { inhibitorTargetPpm: 25, inhibitorResidualPpm: residual } })]
  });

  const wLow = ev('R4', withResidual(15));
  assert.equal(wLow.length, 1);
  assert.equal(wLow[0].severity, 'warning');
  assert.equal(wLow[0].params.pct, 60);
  assert.equal(wLow[0].params.band, 'under');

  assert.equal(ev('R4', withResidual(21)).length, 0);

  const wHigh = ev('R4', withResidual(45));
  assert.equal(wHigh.length, 1);
  assert.equal(wHigh[0].severity, 'warning');
  assert.equal(wHigh[0].params.pct, 180);
  assert.equal(wHigh[0].params.band, 'over');

  const info = ev('R4', withResidual(19));
  assert.equal(info.length, 1);
  assert.equal(info[0].severity, 'info');
  assert.equal(info[0].params.pct, 76);
  assert.equal(info[0].params.band, 'under');
});

test('R5 z-score outlier fires, steady does not; stuck 10 identical fires, 9 does not (TESTS §11)', () => {
  const probe = mp('MP-1', { sensorType: 'erProbe' });

  // 11 x 2.00, 1 x 2.20, 1 x 4.00 -> population z ~= 3.45 > 3, no >=10 identical run.
  const fireVals = [2, 2, 2, 2, 2, 2, 2.2, 2, 2, 2, 2, 2, 4.0];
  const fireRdgs = fireVals.map((v, i) => rdg('MP-1', hoursAgo(13 - i), v, 'z' + i));
  const fired = ev('R5', mkState({ monitoringPoints: [probe], readings: fireRdgs }));
  assert.equal(fired.length, 1);
  assert.equal(fired[0].severity, 'warning');
  assert.equal(fired[0].params.reason, 'zscore');
  assert.equal(fired[0].params.value, 4.0);

  const noVals = [2, 2, 2, 2, 2, 2.3, 2, 2, 2, 2, 2.5];
  const noRdgs = noVals.map((v, i) => rdg('MP-1', hoursAgo(11 - i), v, 'n' + i));
  assert.equal(ev('R5', mkState({ monitoringPoints: [probe], readings: noRdgs })).length, 0);

  const stuck10 = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((i) => rdg('MP-1', daysAgo(i), 2.5, 's' + i));
  const stuck = ev('R5', mkState({ monitoringPoints: [probe], readings: stuck10 }));
  assert.equal(stuck.length, 1);
  assert.equal(stuck[0].params.reason, 'stuck');

  const stuck9 = [1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => rdg('MP-1', daysAgo(i), 2.5, 's' + i));
  assert.equal(ev('R5', mkState({ monitoringPoints: [probe], readings: stuck9 })).length, 0);
});

test('R6 endDate 91 d ago -> info, 181 d ago -> warning, retired -> 0 (TESTS §11)', () => {
  const c91 = ev('R6', mkState({
    monitoringPoints: [mp('MP-1')],
    coupons: [{ id: 'c1', mpId: 'MP-1', endDate: daysAgo(91), status: 'active' }]
  }));
  assert.equal(c91.length, 1);
  assert.equal(c91[0].severity, 'info');
  assert.equal(c91[0].entityStore, 'coupons');
  assert.equal(c91[0].entityId, 'c1');
  assert.equal(c91[0].params.days, 91);

  const c181 = ev('R6', mkState({
    monitoringPoints: [mp('MP-1')],
    coupons: [{ id: 'c1', mpId: 'MP-1', endDate: daysAgo(181), status: 'active' }]
  }));
  assert.equal(c181.length, 1);
  assert.equal(c181[0].severity, 'warning');
  assert.equal(c181[0].params.days, 181);

  assert.equal(ev('R6', mkState({
    monitoringPoints: [mp('MP-1')],
    coupons: [{ id: 'c1', mpId: 'MP-1', endDate: daysAgo(181), status: 'retired' }]
  })).length, 0);
});

test('R7 DWM model ~100 mpy: measured 250 -> critical, 25 -> info, 150 -> 0 (TESTS §11)', () => {
  // pCO2_bar = 1000 kPa * (100000 ppm / 1e6) / 100 = 1.0 bar; tempC 43.75 -> DWM ~99.8 mpy.
  const sourPoint = mp('MP-1', {
    process: { tempC: 43.75, co2Ppm: 100000, totalPressureKpa: 1000 }
  });
  const model = corrosion.deWaardMilliams({ tempC: 43.75, pCo2Bar: 1.0 }).mpy;
  assert.ok(Math.abs(model - 100) < 1, 'model ~ 100 mpy (actual ' + model + ')');

  const crit = ev('R7', mkState({ monitoringPoints: [sourPoint], readings: [rdg('MP-1', daysAgo(3), 250, 'r1')] }));
  assert.equal(crit.length, 1);
  assert.equal(crit[0].severity, 'critical');
  assert.ok(crit[0].params.ratio > 2);

  const info = ev('R7', mkState({ monitoringPoints: [sourPoint], readings: [rdg('MP-1', daysAgo(3), 25, 'r1')] }));
  assert.equal(info.length, 1);
  assert.equal(info[0].severity, 'info');
  assert.ok(info[0].params.ratio < 0.3);

  assert.equal(ev('R7', mkState({ monitoringPoints: [sourPoint], readings: [rdg('MP-1', daysAgo(3), 150, 'r1')] })).length, 0);
});

test('R8 pH2S 300 kPa -> critical, 13.8 -> warning, 0.015 -> 0 (TESTS §11)', () => {
  const s300 = mp('MP-1', { process: { h2sPpm: 300000, totalPressureKpa: 1000 } });
  const f300 = ev('R8', mkState({ monitoringPoints: [s300] }));
  assert.equal(f300.length, 1);
  assert.equal(f300[0].severity, 'critical');
  assert.equal(f300[0].params.level, 'high');

  const s138 = mp('MP-1', { process: { h2sPpm: 13800, totalPressureKpa: 1000 } });
  const f138 = ev('R8', mkState({ monitoringPoints: [s138] }));
  assert.equal(f138.length, 1);
  assert.equal(f138[0].severity, 'warning');
  assert.equal(f138[0].params.level, 'moderate');

  const sLow = mp('MP-1', { process: { h2sPpm: 30, totalPressureKpa: 517 } });
  assert.equal(ev('R8', mkState({ monitoringPoints: [sLow] })).length, 0);
});

test('R9 next inspection -10 d -> warning, -100 d -> critical, +5 d -> 0 (TESTS §11)', () => {
  const w = ev('R9', mkState({ apmAssets: [{ id: 'A1', name: 'Pump A', rbi: { nextInspectionISO: daysAgo(10) } }] }));
  assert.equal(w.length, 1);
  assert.equal(w[0].severity, 'warning');
  assert.equal(w[0].entityStore, 'apmAssets');
  assert.equal(w[0].entityId, 'A1');
  assert.equal(w[0].params.days, 10);

  const c = ev('R9', mkState({ apmAssets: [{ id: 'A1', name: 'Pump A', rbi: { nextInspectionISO: daysAgo(100) } }] }));
  assert.equal(c.length, 1);
  assert.equal(c[0].severity, 'critical');
  assert.equal(c[0].params.days, 100);

  assert.equal(ev('R9', mkState({ apmAssets: [{ id: 'A1', name: 'Pump A', rbi: { nextInspectionISO: daysAhead(5) } }] })).length, 0);
});

test('R10 MTBF 300 vs 700 -> warning; 400 vs 700 -> 0 (TESTS §11)', () => {
  const nowFail300 = [10, 20, 30].map((i) => ({ id: 'e' + i, assetId: 'A1', type: 'failure', start: daysAgo(i), downtimeH: 420 }));
  const prevFail = [100, 110].map((i) => ({ id: 'p' + i, assetId: 'A1', type: 'failure', start: daysAgo(i), downtimeH: 380 }));
  const f = ev('R10', mkState({ apmAssets: [{ id: 'A1', name: 'Pump A' }], apmEvents: nowFail300.concat(prevFail) }));
  assert.equal(f.length, 1);
  assert.equal(f[0].severity, 'warning');
  assert.ok(Math.abs(f[0].params.mtbfNow - 300) < 1e-9, 'mtbfNow = 300');
  assert.ok(Math.abs(f[0].params.mtbfPrev - 700) < 1e-9, 'mtbfPrev = 700');

  const nowFail400 = [10, 20, 30].map((i) => ({ id: 'e' + i, assetId: 'A1', type: 'failure', start: daysAgo(i), downtimeH: 320 }));
  assert.equal(ev('R10', mkState({ apmAssets: [{ id: 'A1', name: 'Pump A' }], apmEvents: nowFail400.concat(prevFail) })).length, 0);
});

test('R11 availability 85 < 90 -> warning; override 80 -> 0 (TESTS §11)', () => {
  const evt324 = [{ id: 'e1', assetId: 'A1', type: 'failure', start: daysAgo(10), downtimeH: 324 }];
  const f = ev('R11', mkState({ apmAssets: [{ id: 'A1', name: 'Pump A' }], apmEvents: evt324 }));
  assert.equal(f.length, 1);
  assert.equal(f[0].severity, 'warning');
  assert.ok(Math.abs(f[0].params.pct - 85) < 1e-9, 'pct = 85');
  assert.equal(f[0].params.threshold, 90);

  const overridden = [{ id: 'A1', name: 'Pump A', availabilityOverridePct: 80 }];
  assert.equal(ev('R11', mkState({ apmAssets: overridden, apmEvents: evt324 })).length, 0);
});

test('R12 3 failures/90 d -> warning; 2 -> 0 (TESTS §11)', () => {
  const three = [10, 20, 30].map((i) => ({ id: 'e' + i, assetId: 'A1', type: 'failure', start: daysAgo(i) }));
  const f = ev('R12', mkState({ apmAssets: [{ id: 'A1', name: 'Pump A' }], apmEvents: three }));
  assert.equal(f.length, 1);
  assert.equal(f[0].severity, 'warning');
  assert.equal(f[0].params.count, 3);

  const two = [10, 20].map((i) => ({ id: 'e' + i, assetId: 'A1', type: 'failure', start: daysAgo(i) }));
  assert.equal(ev('R12', mkState({ apmAssets: [{ id: 'A1', name: 'Pump A' }], apmEvents: two })).length, 0);
});

test('R13 nextTest -5 d -> warning, -40 d -> critical (TESTS §11)', () => {
  const w = ev('R13', mkState({ psvs: [{ id: 'PSV-1', tag: 'PSV-1', nextTestDate: daysAgo(5) }] }));
  assert.equal(w.length, 1);
  assert.equal(w[0].severity, 'warning');
  assert.equal(w[0].entityStore, 'psvs');
  assert.equal(w[0].entityId, 'PSV-1');
  assert.equal(w[0].params.days, 5);

  const c = ev('R13', mkState({ psvs: [{ id: 'PSV-1', tag: 'PSV-1', nextTestDate: daysAgo(40) }] }));
  assert.equal(c.length, 1);
  assert.equal(c[0].severity, 'critical');
  assert.equal(c[0].params.days, 40);
});

test('R14 sizing.marginPct -8 -> critical (TESTS §11)', () => {
  const f = ev('R14', mkState({ psvs: [{ id: 'PSV-1', tag: 'PSV-1', sizing: { marginPct: -8 } }] }));
  assert.equal(f.length, 1);
  assert.equal(f[0].severity, 'critical');
  assert.equal(f[0].params.margin, -8);

  assert.equal(ev('R14', mkState({ psvs: [{ id: 'PSV-1', tag: 'PSV-1', sizing: { marginPct: 20 } }] })).length, 0);
});

test('engine.evaluate aggregates all 14 rule definitions', () => {
  assert.equal(definitions.rules.length, 14);
  const ids = definitions.rules.map((r) => r.id);
  for (let i = 1; i <= 14; i++) { assert.ok(ids.includes('R' + i), 'missing R' + i); }
  assert.equal(engine.evaluate(mkState({})).length, 0);
});

test('reconcile new -> toCreate, open -> toUpdate, resolved -> toReopen, absent -> no change (TESTS §11)', () => {
  const finding = {
    ruleId: 'R1', severity: 'critical', entityStore: 'monitoringPoints', entityId: 'MP-1',
    messageKey: 'rules.msg.R1', params: { code: 'MP-1', cr: 12 },
    fingerprint: 'R1:monitoringPoints:MP-1', entityLabel: 'MP-1'
  };
  const actor = 'operator';
  const at = NOW;

  // new
  const created = engine.reconcile([finding], [], { nowISO: at, actor: actor });
  assert.equal(created.toCreate.length, 1);
  const rec = created.toCreate[0];
  assert.equal(rec.status, 'open');
  assert.equal(rec.fingerprint, 'R1:monitoringPoints:MP-1');
  assert.equal(rec.triggerCount, 1);
  assert.deepEqual(rec.history, [{ action: 'created', at: at, by: actor }]);
  assert.equal(rec.entityLabel, 'MP-1');

  // open -> toUpdate
  const openRec = {
    id: 'R1:monitoringPoints:MP-1', fingerprint: 'R1:monitoringPoints:MP-1', status: 'open',
    triggerCount: 1, history: [{ action: 'created', at: at, by: actor }]
  };
  const updated = engine.reconcile([finding], [openRec], { nowISO: at, actor: actor });
  assert.equal(updated.toCreate.length, 0);
  assert.equal(updated.toUpdate.length, 1);
  assert.equal(updated.toUpdate[0].triggerCount, 2);
  assert.equal(updated.toUpdate[0].history[1].action, 'triggered');

  // resolved -> toReopen
  const resolvedRec = {
    id: 'R1:monitoringPoints:MP-1', fingerprint: 'R1:monitoringPoints:MP-1', status: 'resolved',
    triggerCount: 1, history: [{ action: 'created', at: at, by: actor }],
    resolvedAt: at, resolvedBy: actor
  };
  const reopened = engine.reconcile([finding], [resolvedRec], { nowISO: at, actor: actor });
  assert.equal(reopened.toReopen.length, 1);
  assert.equal(reopened.toReopen[0].status, 'open');
  assert.equal(reopened.toReopen[0].triggerCount, 2);
  assert.equal(reopened.toReopen[0].resolvedAt, undefined);
  assert.equal(reopened.toReopen[0].history[1].action, 'reopened');

  // absent fingerprint -> no auto-resolve
  const stale = { id: 'R2:monitoringPoints:MP-2', fingerprint: 'R2:monitoringPoints:MP-2', status: 'open' };
  const untouched = engine.reconcile([finding], [stale], { nowISO: at, actor: actor });
  assert.equal(untouched.toCreate.length, 1);
  assert.equal(untouched.toUpdate.length, 0);
  assert.equal(untouched.toReopen.length, 0);
});

test('reconcile trims history to 50 entries (TESTS §11)', () => {
  const finding = {
    ruleId: 'R1', severity: 'critical', entityStore: 'monitoringPoints', entityId: 'MP-1',
    messageKey: 'rules.msg.R1', params: {}, fingerprint: 'R1:monitoringPoints:MP-1'
  };
  const bigHistory = [];
  for (let i = 0; i < 60; i++) { bigHistory.push({ action: 'triggered', at: NOW, by: 'local' }); }
  const openRec = { id: 'R1:monitoringPoints:MP-1', fingerprint: 'R1:monitoringPoints:MP-1', status: 'open', triggerCount: 60, history: bigHistory };
  const plan = engine.reconcile([finding], [openRec], { nowISO: NOW, actor: 'local' });
  assert.equal(plan.toUpdate[0].history.length, 50);
});

test('sweep persists recs, updates meta, emits events, refreshes psv status and lineAsset severity (TESTS §11)', async () => {
  const s = storeApi.create(dbMemory.create());
  const now = Date.now();
  const iso = (ms) => new Date(ms).toISOString();

  await s.monitoringPoints.save({ id: 'MP-1', code: 'MP-1', name: 'MP-1', sensorType: 'couponGravimetric' });
  await s.readings.save({ id: 'r1', mpId: 'MP-1', date: iso(now - 6 * HOUR), crMpy: 12, source: 'seed' });
  await s.psvs.save({ id: 'PSV-1', tag: 'PSV-1', nextTestDate: iso(now - 40 * DAY) });
  await s.psvs.save({ id: 'PSV-2', tag: 'PSV-2', nextTestDate: iso(now + 40 * DAY) });
  await s.lineAssets.save({ id: 'LA-1', code: 'LA-1', name: 'Valve 1', type: 'sectionValve' });
  await s.lineInspections.save({ id: 'i1', lineAssetId: 'LA-1', severity: 'moderate' });
  await s.lineInspections.save({ id: 'i2', lineAssetId: 'LA-1', severity: 'severe' });

  const events = [];
  const offRun = bus.on('rules:run', (p) => events.push({ type: 'run', p: p }));
  const offNew = bus.on('recs:new', (p) => events.push({ type: 'new', p: p }));

  let summary;
  try {
    summary = await engine.sweep(s, undefined, 'test');
  } finally {
    offRun();
    offNew();
  }

  assert.equal(summary.created, 2, 'R1 + R13 created');
  assert.equal(summary.updated, 0);
  assert.equal(summary.reopened, 0);
  assert.equal(summary.criticals, 2, 'R1 and R13 are critical');

  const recs = await s.recommendations.list();
  assert.equal(recs.length, 2);
  const byRule = {};
  recs.forEach((r) => { byRule[r.ruleId] = r; });
  assert.equal(byRule.R1.severity, 'critical');
  assert.equal(byRule.R1.status, 'open');
  assert.equal(byRule.R13.severity, 'critical');

  assert.ok(await s.meta.get('lastRulesRunISO'), 'lastRulesRunISO set');

  const runEvent = events.find((e) => e.type === 'run');
  assert.ok(runEvent, 'rules:run emitted');
  assert.equal(runEvent.p.created, 2);
  assert.equal(runEvent.p.criticals, 2);
  const newEvent = events.find((e) => e.type === 'new');
  assert.ok(newEvent, 'recs:new emitted');
  assert.equal(newEvent.p.count, 2);

  assert.equal((await s.psvs.get('PSV-1')).status, 'overdue');
  assert.equal((await s.psvs.get('PSV-2')).status, 'ok');
  assert.equal((await s.lineAssets.get('LA-1')).integritySeverity, 'severe');
});
