/* IntegrityWatch Field — monitoring point id contract
   A point created through the UI must persist id === code (SCHEMA.md convention),
   so CSV-imported readings (keyed by mpId = code) join to points by mp.id in the
   dashboard aggregation. Anchors the bug fixed on 2026-10-30. */
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

require('../src/calc/corrosion.js');
const corrosion = require('../src/views/corrosion.js');
const csv = require('../src/ingest/csv.js');

const NOW_ISO = '2026-10-15T00:00:00Z';

const FORM_VALUES = {
  code: 'MP-PL774',
  name: 'Punto PL774',
  sector: 'midstream',
  systemId: 'SYS-NORTE-16',
  line: 'L-16',
  material: 'api5l-x52',
  sensorType: 'erProbe',
  tNom: '',
  tMin: '',
  h2sPpm: '',
  co2Ppm: '',
  totalPressureKpa: '',
  tempC: '',
  bswPct: '',
  velocityMs: '',
  inhibitorTargetPpm: '',
  inhibitorResidualPpm: '',
  cpEnabled: false,
  cpPotential: '',
  cpPolarization: '',
  cuiInsulated: false,
  cuiJacketType: '',
  cuiLastInsp: '',
  stationKm: '',
  location: '',
  notes: ''
};

test('new point assembled from form values persists id === code', () => {
  const rec = corrosion.assembleMp(null, FORM_VALUES);
  assert.equal(rec.id, 'MP-PL774');
  assert.equal(rec.code, 'MP-PL774');
  assert.equal(rec.id, rec.code);
});

test('existing point keeps its id when edited (no id regression)', () => {
  const existing = { id: 'MP-KEEP-001', code: 'MP-KEEP-001', sector: 'upstream' };
  const rec = corrosion.assembleMp(existing, Object.assign({}, FORM_VALUES, { code: 'MP-KEEP-002' }));
  assert.equal(rec.id, 'MP-KEEP-001');
  assert.equal(rec.code, 'MP-KEEP-002');
});

test('CSV row for a point code resolves to that point id (dashboard join)', () => {
  const point = corrosion.assembleMp(null, FORM_VALUES);
  const res = csv.validateRows({
    rows: [{ mpCode: 'MP-PL774', date: '2026-10-15', crMpy: '3.5' }],
    existingPointIds: [point.id],
    nowISO: NOW_ISO
  });
  assert.equal(res.invalid.length, 0);
  assert.equal(res.valid.length, 1);
  const records = csv.toRecords(res.valid);
  assert.equal(records.readings.length, 1);
  assert.equal(records.readings[0].mpId, point.id);
  assert.equal(records.readings[0].mpId, 'MP-PL774');
});
