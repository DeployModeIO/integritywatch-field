/* IntegrityWatch Field — rules engine end-to-end over dbMemory (TESTS §11)
   Minimal seed (R1 critical, R13 critical, R12 warning) with real calc modules. */
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

test('sweep end-to-end: R1/R13/R12 created with correct severities using real modules (TESTS §11)', async () => {
  assert.ok(globalThis.IW.calc.corrosion, 'real corrosion module loaded');
  assert.ok(globalThis.IW.calc.apm, 'real apm module loaded');

  const s = storeApi.create(dbMemory.create());
  const now = Date.now();
  const iso = (ms) => new Date(ms).toISOString();

  await s.monitoringPoints.save({ id: 'MP-CORR-001', code: 'MP-CORR-001', name: 'Wellhead 1', sensorType: 'couponGravimetric' });
  await s.readings.save({ id: 'r1', mpId: 'MP-CORR-001', date: iso(now - 6 * HOUR), crMpy: 12, source: 'seed' });
  await s.psvs.save({ id: 'PSV-1', tag: 'PSV-1', nextTestDate: iso(now - 40 * DAY) });
  await s.apmAssets.save({ id: 'A1', code: 'A1', name: 'Pump A', sector: 'upstream', criticality: 'B' });
  await s.apmEvents.save({ id: 'e1', assetId: 'A1', type: 'failure', start: iso(now - 10 * DAY) });
  await s.apmEvents.save({ id: 'e2', assetId: 'A1', type: 'failure', start: iso(now - 20 * DAY) });
  await s.apmEvents.save({ id: 'e3', assetId: 'A1', type: 'failure', start: iso(now - 30 * DAY) });

  const events = [];
  const offRun = bus.on('rules:run', (p) => events.push(p));

  let summary;
  try {
    summary = await engine.sweep(s, undefined, 'local');
  } finally {
    offRun();
  }

  assert.equal(summary.created, 3);
  assert.equal(summary.updated, 0);
  assert.equal(summary.reopened, 0);
  assert.equal(summary.criticals, 2);

  const recs = await s.recommendations.list();
  assert.equal(recs.length, 3);

  const byRule = {};
  recs.forEach((r) => { byRule[r.ruleId] = r; });

  assert.equal(byRule.R1.severity, 'critical');
  assert.equal(byRule.R1.entityStore, 'monitoringPoints');
  assert.equal(byRule.R1.entityId, 'MP-CORR-001');
  assert.equal(byRule.R1.fingerprint, 'R1:monitoringPoints:MP-CORR-001');
  assert.equal(byRule.R1.status, 'open');

  assert.equal(byRule.R13.severity, 'critical');
  assert.equal(byRule.R13.entityStore, 'psvs');
  assert.equal(byRule.R13.entityId, 'PSV-1');
  assert.equal(byRule.R13.params.days, 40);

  assert.equal(byRule.R12.severity, 'warning');
  assert.equal(byRule.R12.entityStore, 'apmAssets');
  assert.equal(byRule.R12.entityId, 'A1');
  assert.equal(byRule.R12.params.count, 3);

  assert.equal(events.length, 1);
  assert.equal(events[0].created, 3);
  assert.equal(events[0].criticals, 2);
});
