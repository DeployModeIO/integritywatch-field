/* Tests de IW.ingest.mapping: motor puro columna->campo. Cubre reglas de
   confianza (exact/alias/fuzzy/none), empates ambiguos, overrides manuales,
   validacion (required/duplicates/unknown), propuestas por muestra, plan de
   columnas con unidades, y determinismo/no-mutacion de schemas. Los headers
   ES/EN salen del fixture real lecturas-basicas.xlsx via IW.ingest.xlsx. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const U = require('../src/ingest/units.js');
const S = require('../src/ingest/schemas.js');
const XLSX = require('../src/ingest/xlsx.js');
const M = require('../src/ingest/mapping.js');

const FIX = (name) => fs.readFileSync(path.join(__dirname, 'fixtures', name));

const ES_HEADERS = ['Punto de Monitoreo', 'Fecha', 'Valor (mpy)', 'Temperatura (°C)', 'Presión (bar)'];
const EN_HEADERS = ['MP Code', 'Measurement Date', 'Rate', 'Temp'];

function fieldOf(assignments, header) {
  const a = assignments.find((x) => x.header === header);
  return a && a.field;
}
function confidenceOf(assignments, header) {
  const a = assignments.find((x) => x.header === header);
  return a && a.confidence;
}

test('fixture lecturas-basicas.xlsx: cabeceras reales coinciden con las esperadas', async () => {
  const res = await XLSX.read(FIX('lecturas-basicas.xlsx'));
  assert.deepEqual(M.headerOfRow(res.rows[0]), ES_HEADERS);
  const assignments = M.autoMap('readings', M.headerOfRow(res.rows[0]));
  // readings NO tiene columnas de temperatura/presion (son contexto del punto):
  // las 3 columnas propias de lecturas mapean EXACTAS.
  assert.equal(fieldOf(assignments, 'Punto de Monitoreo'), 'mpId');
  assert.equal(confidenceOf(assignments, 'Punto de Monitoreo'), 'exact');
  assert.equal(fieldOf(assignments, 'Fecha'), 'date');
  assert.equal(fieldOf(assignments, 'Valor (mpy)'), 'crMpy');
  assert.equal(confidenceOf(assignments, 'Valor (mpy)'), 'exact');
  assert.match(assignments[2].reason, /unidad/);
  assert.equal(fieldOf(assignments, 'Temperatura (°C)'), null);
  assert.equal(fieldOf(assignments, 'Presión (bar)'), null);
  // Y en su store natural (monitoringPoints) esas dos SÍ son exactas tras
  // retirar la pista de unidad: entre los dos stores hay >=4 exactas.
  const mp = M.autoMap('monitoringPoints', ES_HEADERS);
  assert.equal(fieldOf(mp, 'Temperatura (°C)'), 'process.tempC');
  assert.equal(confidenceOf(mp, 'Temperatura (°C)'), 'exact');
  assert.equal(fieldOf(mp, 'Presión (bar)'), 'process.totalPressureKpa');
  assert.equal(confidenceOf(mp, 'Presión (bar)'), 'exact');
  assert.equal(fieldOf(mp, 'Punto de Monitoreo'), 'code');
  assert.equal(confidenceOf(mp, 'Punto de Monitoreo'), 'alias');
  const exactTotal = assignments.concat(mp).filter((a) => a.confidence === 'exact').length;
  assert.equal(exactTotal, 5);
  assert.ok(exactTotal >= 4);
  // lectura/validacion del plan sobre el store real del fixture
  const plan = M.toColumnPlan(assignments);
  assert.deepEqual(plan, [
    { col: 0, field: 'mpId', unitFrom: null },
    { col: 1, field: 'date', unitFrom: null },
    { col: 2, field: 'crMpy', unitFrom: 'mpy' }
  ]);
  const v = M.validateMapping('readings', assignments);
  assert.equal(v.ok, true);
  assert.deepEqual(v.missingRequired, []);
  assert.deepEqual(v.duplicates, []);
});

test('fixture activos-2000.xlsx: 3 exactas, code fuzzy y pressure fuera de store', async () => {
  const res = await XLSX.read(FIX('activos-2000.xlsx'));
  const headers = M.headerOfRow(res.rows[0]);
  assert.deepEqual(headers, ['assetCode', 'name', 'sector', 'criticality', 'design_pressure_bar']);
  const assignments = M.autoMap('apmAssets', headers);
  const counts = { exact: 0, alias: 0, fuzzy: 0, none: 0 };
  assignments.forEach((a) => { counts[a.confidence]++; });
  assert.equal(counts.exact, 3);
  assert.equal(counts.fuzzy, 1);
  assert.equal(counts.none, 1);
  assert.equal(fieldOf(assignments, 'assetCode'), 'code');
  assert.equal(fieldOf(assignments, 'design_pressure_bar'), null);
  const v = M.validateMapping('apmAssets', assignments);
  assert.equal(v.ok, true, JSON.stringify(v));
});

test('headers EN: MP Code/Measurement Date/Rate razonables, no todo none', () => {
  const assignments = M.autoMap('readings', EN_HEADERS);
  const noneCount = assignments.filter((a) => a.confidence === 'none').length;
  assert.ok(noneCount < EN_HEADERS.length, 'no 5 none');
  assert.ok(noneCount <= 1);
  assert.equal(fieldOf(assignments, 'MP Code'), 'mpId');
  assert.equal(confidenceOf(assignments, 'MP Code'), 'fuzzy');
  assert.equal(fieldOf(assignments, 'Rate'), 'crMpy');
  assert.equal(confidenceOf(assignments, 'Rate'), 'exact');
  // 'Measurement Date' cae alias a crMpy (mide el alias 'measurement'), lo
  // cual choca con 'Rate': duplicates -> la muestra corrige a date.
  assert.equal(fieldOf(assignments, 'Measurement Date'), 'crMpy');
  assert.equal(confidenceOf(assignments, 'Measurement Date'), 'alias');
  const v = M.validateMapping('readings', assignments);
  assert.equal(v.ok, false);
  assert.ok(v.duplicates.some((d) => d.field === 'crMpy' && d.headers.includes('Measurement Date') && d.headers.includes('Rate')));
  assert.deepEqual(v.missingRequired, ['date']);
  const rows = [
    ['PM-CR-001', '2026-01-05', 2.31, 65],
    ['PM-CR-002', '2026-02-11', 1.9, 66.5],
    ['PM-CR-001', '2026-04-06', 2.55, 64]
  ];
  const props = M.suggestFromSample('readings', EN_HEADERS, rows);
  assert.deepEqual(props.map((p) => [p.header, p.field, p.confidence]), [['Measurement Date', 'date', 'sample']]);
  const fixed = M.applyOverrides(assignments, { 'Measurement Date': 'date' });
  assert.equal(M.validateMapping('readings', fixed).ok, true);
});

test('header sin sentido -> none; dos headers al mismo campo -> duplicates', () => {
  const assignments = M.autoMap('readings', ['no_existe_nada_que_ver']);
  assert.equal(assignments.length, 1);
  assert.equal(assignments[0].field, null);
  assert.equal(assignments[0].confidence, 'none');
  assert.equal(assignments[0].headerCanonical, 'no_existe_nada_que_ver');
  const dupes = M.autoMap('readings', ['Fecha', 'date', 'Punto de Monitoreo', 'Valor']);
  const v = M.validateMapping('readings', dupes);
  assert.equal(v.ok, false);
  assert.deepEqual(v.duplicates, [{ field: 'date', headers: ['Fecha', 'date'] }]);
});

test('empate al mismo nivel -> ambiguous con field:null (que decida el humano)', () => {
  const a = M.autoMap('psvs', ['Pressure']);
  assert.equal(a[0].field, null);
  assert.equal(a[0].confidence, 'fuzzy');
  assert.equal(a[0].reason, 'ambiguous');
  assert.ok(a[0].candidates.includes('setPressurePsig'));
  assert.ok(a[0].candidates.includes('backPressurePsig'));
});

test('applyOverrides: fuerza code en Tag de placa, confianza manual, sin mutar, y validate ok', () => {
  const headers = ['Tag de placa', 'Sector', 'Material', 'Sensor'];
  const before = M.autoMap('monitoringPoints', headers);
  assert.equal(fieldOf(before, 'Tag de placa'), 'code');
  assert.ok(confidenceOf(before, 'Tag de placa') !== 'manual');
  const after = M.applyOverrides(before, { 'Tag de placa': 'code' });
  assert.notEqual(after, before);
  assert.equal(after[0].field, 'code');
  assert.equal(after[0].confidence, 'manual');
  assert.equal(before[0].confidence, 'fuzzy', 'la lista original no se muto');
  const v = M.validateMapping('monitoringPoints', after);
  assert.equal(v.ok, true, JSON.stringify(v));
  // forzar null saca el required; forzar un campo inexistente lo marca unknown
  const nulled = M.applyOverrides(before, { 'Sector': null });
  const v2 = M.validateMapping('monitoringPoints', nulled);
  assert.equal(v2.ok, false);
  assert.deepEqual(v2.missingRequired, ['sector']);
  const bogus = M.applyOverrides(before, { 'Tag de placa': 'campo_fantasma' });
  const v3 = M.validateMapping('monitoringPoints', bogus);
  assert.deepEqual(v3.unknown, ['campo_fantasma']);
  assert.equal(v3.ok, false);
});

test('toColumnPlan: indices tras reordenar y unitFrom desde (psi)/(°C)', () => {
  const headers = ['Fecha', 'design pressure (psi)', 'Tag de placa', 'Temperatura (°C)'];
  const assignments = M.autoMap('psvs', headers);
  // 'Fecha' empatada entre lastTestDate/nextTestDate queda sin campo: el
  // plan la omite y el humano decide.
  assert.equal(assignments[0].field, null);
  assert.equal(assignments[0].reason, 'ambiguous');
  assert.equal(fieldOf(assignments, 'design pressure (psi)'), 'setPressurePsig');
  assert.equal(fieldOf(assignments, 'Temperatura (°C)'), 'operatingTempF');
  let plan = M.toColumnPlan(assignments);
  assert.deepEqual(plan.map((p) => p.col), [1, 2, 3]);
  assert.equal(plan[0].unitFrom, 'psi');
  assert.equal(plan[0].field, 'setPressurePsig');
  assert.equal(plan[1].field, 'tag');
  assert.equal(plan[1].unitFrom, null);
  assert.deepEqual(plan[2], { col: 3, field: 'operatingTempF', unitFrom: 'c' });
  // el usuario reordena la tabla: el plan sigue los indices nuevos
  const reordered = [assignments[2], assignments[1], assignments[3]];
  const plan2 = M.toColumnPlan(reordered);
  assert.deepEqual(plan2.map((p) => p.col), [0, 1, 2]);
  assert.deepEqual(plan2.map((p) => p.field), ['tag', 'setPressurePsig', 'operatingTempF']);
  assert.equal(plan2[1].unitFrom, 'psi');
  // pista de temperatura en un store que la admite
  const mpPlan = M.toColumnPlan(M.autoMap('monitoringPoints', ['Temperatura (°C)']));
  assert.deepEqual(mpPlan, [{ col: 0, field: 'process.tempC', unitFrom: 'c' }]);
});

test('suggestFromSample: Critica/Alta/Baja/Media bajo "importancia" propone criticality', () => {
  const headers = ['code', 'importancia'];
  const rows = [
    ['ACT-1', 'Crítica'],
    ['ACT-2', 'Alta'],
    ['ACT-3', 'Baja'],
    ['ACT-4', 'Media']
  ];
  assert.equal(fieldOf(M.autoMap('apmAssets', headers), 'importancia'), null);
  const props = M.suggestFromSample('apmAssets', headers, rows);
  assert.equal(props.length, 1);
  assert.deepEqual(props[0].header, 'importancia');
  assert.equal(props[0].field, 'criticality');
  assert.equal(props[0].confidence, 'sample');
  assert.match(props[0].reason, /enum/);
  // y 'A','B','C' crudos tambien proponen criticality
  const props2 = M.suggestFromSample('apmAssets', headers, [['ACT-1', 'A'], ['ACT-2', 'B'], ['ACT-3', 'C']]);
  assert.equal(props2[0].field, 'criticality');
  // columna numericamente dentro de rango estacion -> stationKm en lineAssets
  const p3 = M.suggestFromSample('lineAssets', ['ref', 'pos'], [['R1', 12], ['R2', 450], ['R3', 900]]);
  assert.deepEqual(p3.map((p) => p.field), ['stationKm']);
  // no se proponen cosas para columnas ya resueltas exact
  const p4 = M.suggestFromSample('apmAssets', ['code'], [['ACT-1'], ['ACT-2'], ['ACT-3']]);
  assert.deepEqual(p4, []);
});

test('headerOfRow, normalizeHeader y UNIT_HINT_RE exportados', () => {
  assert.deepEqual(M.headerOfRow(['  Punto ', 42, null]), ['Punto', '42', '']);
  assert.deepEqual(M.headerOfRow({ MP: 1, Fecha: 2 }), ['MP', 'Fecha']);
  assert.deepEqual(M.headerOfRow(null), []);
  assert.equal(M.normalizeHeader('Presión (Bar)'), 'presion_bar');
  assert.equal(M.normalizeHeader('  Hola Mundo  '), 'hola_mundo');
  assert.ok(M.UNIT_HINT_RE instanceof RegExp);
  const re = new RegExp(M.UNIT_HINT_RE.source, 'g');
  const m = re.exec('Design Pressure (psi)');
  assert.equal(m[1], 'psi');
});

test('store desconocido falla ruidoso', () => {
  assert.throws(() => M.autoMap('no_existe', ['a']), /store desconocido/);
  assert.throws(() => M.validateMapping('no_existe', []), /store desconocido/);
});

test('determinismo y cero mutacion de schemas', () => {
  const snapshot = JSON.stringify(S.SCHEMAS);
  const h1 = ES_HEADERS.concat(EN_HEADERS, ['no_existe_nada_que_ver', 'Pressure', 'importancia']);
  const rows = [['ACT', 'Crítica'], ['ACT2', 'Alta'], ['ACT3', 'Baja']];
  const ops = [
    () => M.autoMap('readings', h1),
    () => M.autoMap('monitoringPoints', h1),
    () => M.suggestFromSample('apmAssets', h1, rows),
    () => M.toColumnPlan(M.autoMap('psvs', h1)),
    () => M.validateMapping('readings', M.autoMap('readings', h1))
  ];
  for (let round = 0; round < 2; round++) {
    ops.forEach((op, k) => {
      const first = JSON.stringify(op());
      const again = JSON.stringify(op());
      assert.equal(again, first, 'misma entrada -> misma salida (op ' + k + ')');
    });
  }
  // applyOverrides tampoco muta: se verifico arriba; ademas no toca schemas
  M.applyOverrides(M.autoMap('readings', ES_HEADERS), { 'Fecha': 'note' });
  assert.equal(JSON.stringify(S.SCHEMAS), snapshot, 'autoMap/overrides no mutan schemas');
  assert.equal(globalThis.IW.ingest.mapping, M, 'UMD root.IW.ingest.mapping');
});
