/* IntegrityWatch Field — QA rules sweep (node:test + assert/strict, CJS)
   End-to-end sweep over the in-memory store using the REAL rules engine.
   DEVIATION-RULES-1: engine.sweep() derives nowISO internally from new Date()
   (it accepts repos, settings, actor only — no injected nowISO), so every
   fixture below is built from dates relative to Date.now() instead of absolute
   ISO literals. */
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

require('../src/calc/corrosion.js');
require('../src/calc/apm.js');
const bus = require('../src/core/bus.js');
const dbMemory = require('../src/core/dbMemory.js');
const storeApi = require('../src/core/store.js');
const engine = require('../src/rules/engine.js');
require('../src/rules/definitions.js');

const HOUR = 3600000;
const DAY = 86400000;
const iso = (ms) => new Date(ms).toISOString();
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const MP = 'MP-CORR-T1';
const FP_R1 = 'R1:monitoringPoints:' + MP;
const FP_R5 = 'R5:monitoringPoints:' + MP;
const FP_R8 = 'R8:monitoringPoints:' + MP;

function freshStore() { return storeApi.create(dbMemory.create()); }

// Minimal fixture: one lprProbe MP that trips R1 (12.4 mpy within 24 h),
// R5 (12 identical 2.0 readings -> stuck) and R8 (moderate H2S partial
// pressure). process carries co2Ppm for coherent input but omits tempC, so the
// De Waard-Milliams model (R7) cannot be computed and stays silent.
async function seedCore(s, now) {
  await s.monitoringPoints.save({
    id: MP, code: MP, name: 'Probe T1', sensorType: 'lprProbe',
    process: { h2sPpm: 2000, co2Ppm: 50000, totalPressureKpa: 6895 }
  });
  const readings = [];
  for (let i = 0; i < 12; i++) {
    readings.push({ id: 'stuck-' + i, mpId: MP, date: iso(now - 5 * DAY), crMpy: 2.0 });
  }
  readings.push({ id: 'r-cr', mpId: MP, date: iso(now - 6 * HOUR), crMpy: 12.4 });
  await s.readings.saveAll(readings);
}

// App-level recommendation cycle (mirrors src/views/recommendations.js).
async function ackRec(s, id, actor, nowISO) {
  const rec = await s.recommendations.get(id);
  const copy = Object.assign({}, rec, { status: 'acked', ackedAt: nowISO, ackedBy: actor });
  copy.history = (rec.history || []).concat([{ action: 'acked', at: nowISO, by: actor }]);
  return s.recommendations.save(copy, nowISO);
}

async function resolveRec(s, id, note, actor, nowISO) {
  const rec = await s.recommendations.get(id);
  const copy = Object.assign({}, rec, {
    status: 'resolved', resolvedAt: nowISO, resolvedBy: actor, resolveNote: note
  });
  copy.history = (rec.history || []).concat([{ action: 'resolved', at: nowISO, by: actor, note: note }]);
  return s.recommendations.save(copy, nowISO);
}

function byRule(recs) {
  const map = {};
  recs.forEach((r) => { map[r.ruleId] = r; });
  return map;
}

test('1) sweep persists open recommendations with history[0].action = created', async () => {
  const s = freshStore();
  await seedCore(s, Date.now());

  const summary = await engine.sweep(s, {}, 'local');
  const recs = await s.recommendations.list();

  assert.equal(summary.created, 3);
  assert.equal(recs.length, 3);
  recs.forEach((r) => {
    assert.equal(r.status, 'open');
    assert.equal(r.history[0].action, 'created');
  });

  const map = byRule(recs);
  assert.equal(map.R1.severity, 'critical');
  assert.equal(map.R5.severity, 'warning');
  assert.equal(map.R5.params.reason, 'stuck');
  assert.equal(map.R8.severity, 'warning');
  assert.equal(map.R8.params.level, 'moderate');
});

test('2) sweep updates meta.lastRulesRunISO', async () => {
  const s = freshStore();
  await seedCore(s, Date.now());
  assert.equal(await s.meta.get('lastRulesRunISO'), undefined);

  const before = Date.now();
  await engine.sweep(s, {}, 'local');
  const stamp = await s.meta.get('lastRulesRunISO');

  assert.equal(typeof stamp, 'string');
  const ms = Date.parse(stamp);
  assert.ok(!Number.isNaN(ms), 'lastRulesRunISO must be a parseable ISO string');
  assert.ok(ms >= before, 'lastRulesRunISO must be at/after the sweep start');
});

test('3) sweep emits rules:run with {created,updated,reopened,criticals}', async () => {
  const s = freshStore();
  await seedCore(s, Date.now());

  const runs = [];
  const off = bus.on('rules:run', (p) => runs.push(p));
  let summary;
  try {
    summary = await engine.sweep(s, {}, 'local');
  } finally {
    off();
  }

  assert.equal(runs.length, 1);
  assert.deepStrictEqual(runs[0], summary);
  assert.equal(runs[0].created, 3);
  assert.equal(runs[0].updated, 0);
  assert.equal(runs[0].reopened, 0);
  assert.equal(runs[0].criticals, 1);
});

test('4) sweep emits recs:new when created > 0', async () => {
  const s = freshStore();
  await seedCore(s, Date.now());

  const news = [];
  const off = bus.on('recs:new', (p) => news.push(p));
  let summary;
  try {
    summary = await engine.sweep(s, {}, 'local');
  } finally {
    off();
  }

  assert.ok(summary.created > 0);
  assert.equal(news.length, 1);
  assert.equal(news[0].count, summary.created);
});

test('5) sweep recalculates psvs.status and raises R13 for overdue tests', async () => {
  const s = freshStore();
  const now = Date.now();
  await s.psvs.save({ id: 'PSV-OD', tag: 'PSV-OD', nextTestDate: iso(now - 40 * DAY) });
  await s.psvs.save({ id: 'PSV-OK', tag: 'PSV-OK', nextTestDate: iso(now + 30 * DAY) });

  await engine.sweep(s, {}, 'local');

  const recs = await s.recommendations.list();
  const r13 = recs.filter((r) => r.ruleId === 'R13');
  assert.equal(r13.length, 1);
  assert.equal(r13[0].entityId, 'PSV-OD');
  assert.equal(r13[0].severity, 'critical');

  assert.equal((await s.psvs.get('PSV-OD')).status, 'overdue');
  assert.equal((await s.psvs.get('PSV-OK')).status, 'ok');
});

test('6) sweep refreshes lineAssets.integritySeverity from lineInspections', async () => {
  const s = freshStore();
  await s.lineAssets.save({ id: 'LA-1', code: 'LA-1', name: 'Line 1' });
  await s.lineAssets.save({ id: 'LA-2', code: 'LA-2', name: 'Line 2' });
  await s.lineInspections.save({ id: 'insp-1', lineAssetId: 'LA-1', severity: 'severe' });

  await engine.sweep(s, {}, 'local');

  assert.equal((await s.lineAssets.get('LA-1')).integritySeverity, 'severe');
  assert.equal((await s.lineAssets.get('LA-2')).integritySeverity, undefined);
});

test('7) a second immediate sweep does not duplicate but bumps triggerCount/lastTriggeredAt', async () => {
  const s = freshStore();
  await seedCore(s, Date.now());

  await engine.sweep(s, {}, 'local');
  const first = await s.recommendations.list();
  assert.equal(first.length, 3);

  await sleep(20);
  const summary2 = await engine.sweep(s, {}, 'local');
  const second = await s.recommendations.list();

  assert.equal(second.length, 3, 'no duplicate recommendations');
  assert.equal(summary2.created, 0);
  assert.equal(summary2.updated, 3);

  const firstById = {};
  first.forEach((r) => { firstById[r.id] = r; });
  second.forEach((r) => {
    assert.equal(r.triggerCount, 2);
    assert.ok(Date.parse(r.lastTriggeredAt) > Date.parse(firstById[r.id].lastTriggeredAt));
    assert.equal(r.history[r.history.length - 1].action, 'triggered');
  });
});

test('8) acknowledge sets status acked and ackedAt', async () => {
  const s = freshStore();
  await seedCore(s, Date.now());
  await engine.sweep(s, {}, 'local');

  const nowISO = new Date().toISOString();
  await ackRec(s, FP_R1, 'tester', nowISO);

  const rec = await s.recommendations.get(FP_R1);
  assert.equal(rec.status, 'acked');
  assert.equal(rec.ackedAt, nowISO);
  assert.equal(rec.ackedBy, 'tester');
  assert.equal(rec.history[rec.history.length - 1].action, 'acked');
});

test('9) resolve with a note sets status resolved and history entry', async () => {
  const s = freshStore();
  await seedCore(s, Date.now());
  await engine.sweep(s, {}, 'local');
  await ackRec(s, FP_R1, 'tester', new Date().toISOString());

  const nowISO = new Date().toISOString();
  await resolveRec(s, FP_R1, 'Inspected and re-coated the probe', 'tester', nowISO);

  const rec = await s.recommendations.get(FP_R1);
  assert.equal(rec.status, 'resolved');
  assert.equal(rec.resolvedAt, nowISO);
  assert.equal(rec.resolveNote, 'Inspected and re-coated the probe');
  assert.ok(rec.history.some((h) => h.action === 'resolved'));
});

test('10) re-sweep with the same persistent condition reopens a resolved rec', async () => {
  const s = freshStore();
  await seedCore(s, Date.now());
  await engine.sweep(s, {}, 'local');
  await ackRec(s, FP_R1, 'tester', new Date().toISOString());
  await resolveRec(s, FP_R1, 'temporary fix', 'tester', new Date().toISOString());
  assert.equal((await s.recommendations.get(FP_R1)).status, 'resolved');

  const summary = await engine.sweep(s, {}, 'local');

  const rec = await s.recommendations.get(FP_R1);
  assert.equal(summary.reopened, 1);
  assert.equal(rec.status, 'open');
  assert.equal(rec.resolvedAt, undefined);
  assert.ok(rec.history.some((h) => h.action === 'reopened'), 'history includes reopened');
});

test('11) settings tune R11 availability threshold and R4 early-warning band', async () => {
  const build = async (now) => {
    const s = freshStore();
    await s.monitoringPoints.save({
      id: 'MP-R4', code: 'MP-R4', name: 'Residual monitor',
      process: { inhibitorTargetPpm: 25, inhibitorResidualPpm: 17.5 } // 70 %
    });
    await s.apmAssets.save({ id: 'APM-1', code: 'APM-1', name: 'Pump A' });
    await s.apmEvents.save({ id: 'ev-1', assetId: 'APM-1', type: 'downtime', start: iso(now - 10 * DAY), downtimeH: 864 });
    return s; // 864 h / 2160 h -> 60 % availability
  };

  // Default settings: R11 warning (60 < 90) and R4 info (70 % inside the 60-80 early band).
  const sDefault = await build(Date.now());
  await engine.sweep(sDefault, {}, 'local');
  const def = byRule(await sDefault.recommendations.list());
  assert.equal(def.R11.severity, 'warning');
  assert.equal(def.R4.severity, 'info');

  // Custom settings: availabilityThresholdPct 50 silences R11; residualBandPct 5
  // removes the early (info) notice — 70 % is no longer inside 75-80, so R4 is a
  // full warning instead.
  const sCustom = await build(Date.now());
  await engine.sweep(sCustom, { availabilityThresholdPct: 50, residualBandPct: 5 }, 'local');
  const cus = byRule(await sCustom.recommendations.list());
  assert.equal(cus.R11, undefined, 'R11 silenced by availabilityThresholdPct 50');
  assert.ok(cus.R4, 'R4 still reported as a warning');
  assert.notEqual(cus.R4.severity, 'info', 'early (info) R4 notice eliminated');
});

test('12) fingerprint is stable across sweeps and messageKey follows rules.msg.R#', async () => {
  const s = freshStore();
  await seedCore(s, Date.now());

  await engine.sweep(s, {}, 'local');
  const run1 = await s.recommendations.list();
  await engine.sweep(s, {}, 'local');
  const run2 = await s.recommendations.list();

  assert.equal(run1.length, 3);
  assert.deepStrictEqual(run1.map((r) => r.fingerprint).sort(), run2.map((r) => r.fingerprint).sort());
  assert.deepStrictEqual(run1.map((r) => r.fingerprint).sort(), [FP_R1, FP_R5, FP_R8].sort());

  run1.forEach((r) => {
    assert.match(r.fingerprint, /^R\d+:[a-zA-Z]+:.+$/);
    assert.equal(r.fingerprint, r.ruleId + ':' + r.entityStore + ':' + r.entityId);
    assert.equal(r.messageKey, 'rules.msg.' + r.ruleId);
  });
});
