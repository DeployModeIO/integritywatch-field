/* IntegrityWatch Field — admin reset demo semantics (onResetDemo fix).
   Verifica la secuencia: datos extra (importados/duplicados/creados) + clear(DEMO_RESET_STORES) + seed.demo => solo filas del seed.
   La vista admin.js no es instanciable en Node sin DOM; se testea la semántica exacta que ejecuta onResetDemo. */
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

const DEMO_RESET_STORES = [
  'monitoringPoints', 'readings', 'coupons', 'psvs', 'pipelineSystems',
  'lineAssets', 'lineInspections', 'iliAnomalies', 'apmAssets', 'apmEvents',
  'recommendations'
];

const NOW = '2026-09-15T00:00:00.000Z';

function freshStore() {
  return storeApi.create(dbMemory.create());
}

test('reset demo: clear + seed elimina filas extra y deja solo las del seed', async () => {
  const s = freshStore();

  await seed.demo(s, { nowISO: NOW });

  await s.readings.save({ id: 'extra-r-001', mpId: 'mp-extra', crMpy: 99 });
  await s.readings.save({ id: 'extra-r-002', mpId: 'mp-extra', crMpy: 88 });
  await s.monitoringPoints.save({ id: 'mp-extra', code: 'EXTRA-01', lineId: 'L-EXTRA' });
  await s.apmAssets.save({ id: 'APM-EXTRA-01', code: 'EXTRA', sector: 'upstream', category: 'pump' });
  await s.psvs.save({ id: 'PSV-EXTRA', tag: 'EXTRA', nextTestDate: '2027-01-01' });
  await s.coupons.save({ id: 'CP-EXTRA', mpId: 'mp-extra', exposedHours: 10 });
  await s.lineAssets.save({ id: 'L-EXTRA', pipelineId: 'P-EXTRA', code: 'LX' });
  await s.lineInspections.save({ id: 'LI-EXTRA', lineId: 'L-EXTRA', date: '2026-01-01' });
  await s.iliAnomalies.save({ id: 'ILI-EXTRA', inspectionId: 'LI-EXTRA' });
  await s.pipelineSystems.save({ id: 'P-EXTRA', code: 'PEX' });
  await s.apmEvents.save({ id: 'EVT-EXTRA', assetId: 'APM-EXTRA-01', type: 'failure' });
  await s.recommendations.save({ id: 'REC-EXTRA', assetId: 'APM-EXTRA-01', text: 'extra' });

  const readsBeforeReset = await s.readings.list();
  assert.ok(readsBeforeReset.length > 120, 'seed + extra debe superar 120 lecturas');

  const clears = DEMO_RESET_STORES.map((name) => s[name].clear());
  await Promise.all(clears);

  const res = await seed.demo(s, { nowISO: NOW });

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

  const ids = async (store) => (await s[store].list()).map((r) => r.id);

  assert.equal((await ids('readings')).includes('extra-r-001'), false);
  assert.equal((await ids('readings')).includes('extra-r-002'), false);
  assert.equal((await ids('monitoringPoints')).includes('mp-extra'), false);
  assert.equal((await ids('apmAssets')).includes('APM-EXTRA-01'), false);
  assert.equal((await ids('psvs')).includes('PSV-EXTRA'), false);
  assert.equal((await ids('coupons')).includes('CP-EXTRA'), false);
  assert.equal((await ids('lineAssets')).includes('L-EXTRA'), false);
  assert.equal((await ids('lineInspections')).includes('LI-EXTRA'), false);
  assert.equal((await ids('iliAnomalies')).includes('ILI-EXTRA'), false);
  assert.equal((await ids('pipelineSystems')).includes('P-EXTRA'), false);
  assert.equal((await ids('apmEvents')).includes('EVT-EXTRA'), false);
  assert.equal((await ids('recommendations')).includes('REC-EXTRA'), false);
});

test('reset demo: sin extra (solo seed) produce el mismo resultado idempotente', async () => {
  const s = freshStore();

  await seed.demo(s, { nowISO: NOW });
  const clears1 = DEMO_RESET_STORES.map((name) => s[name].clear());
  await Promise.all(clears1);
  const res1 = await seed.demo(s, { nowISO: NOW });

  const clears2 = DEMO_RESET_STORES.map((name) => s[name].clear());
  await Promise.all(clears2);
  const res2 = await seed.demo(s, { nowISO: NOW });

  assert.deepEqual(res1.counts, res2.counts);
});
