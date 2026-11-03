/* IntegrityWatch Field — ingest/schemas tests (T-schemas)
   Catalogo de esquemas de import para las 9 entidades importables: aliases
   canonicalizados, fieldFor, draftRecord (validacion/unidades/fechas/quality)
   y naturalKeyOf. Se cruza CONTRA el seed real (src/data/seed.js ejecutado en
   Node) para probar que ningun campo fue inventado. */
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const dbMemory = require('../src/core/dbMemory.js');
const storeApi = require('../src/core/store.js');
const seed = require('../src/data/seed.js');
const U = require('../src/ingest/units.js');
const S = require('../src/ingest/schemas.js');

const NOW = '2026-09-15T00:00:00.000Z';

const ENTITIES = ['monitoringPoints', 'readings', 'coupons', 'psvs', 'pipelineSystems',
  'lineAssets', 'lineInspections', 'apmAssets', 'apmEvents'];

function approx(actual, expected, rel) {
  rel = rel === undefined ? 0.005 : rel;
  assert.ok(
    Math.abs(actual - expected) / Math.abs(expected) < rel,
    actual + ' vs ' + expected + ' (rel tolerance ' + rel + ')'
  );
}

// Recorrido de rutas con puntos ('process.h2sPpm') sobre registros reales.
function getPath(obj, path) {
  var parts = path.split('.');
  var cur = obj;
  for (var i = 0; i < parts.length; i++) {
    if (cur === null || cur === undefined || typeof cur !== 'object') { return undefined; }
    if (!(parts[i] in cur)) { return undefined; }
    cur = cur[parts[i]];
  }
  return cur;
}

function setPathOfKeys(obj, out, prefix) {
  Object.keys(obj).forEach(function (k) {
    var v = obj[k];
    var p = prefix ? prefix + '.' + k : k;
    out.add(p);
    if (v !== null && typeof v === 'object' && !Array.isArray(v)) { setPathOfKeys(v, out, p); }
  });
  return out;
}

// Registros reales del seed por store (una sola carga compartida).
let SEED_RECORDS = null;
async function seedRecords() {
  if (SEED_RECORDS) { return SEED_RECORDS; }
  var repos = storeApi.create(dbMemory.create());
  await seed.demo(repos, { nowISO: NOW });
  var out = {};
  for (var i = 0; i < ENTITIES.length; i++) {
    out[ENTITIES[i]] = await repos[ENTITIES[i]].list();
  }
  SEED_RECORDS = out;
  return out;
}

/* Campos que NO aparecen en el seed porque solo los escriben los formularios
   de las vistas (fuentes de verdad secundarias citadas en el prompt). Cada
   nombre fue copiado literalmente del payload de guardado de la vista:
   - corrosion.js assembleMp (systemId, tNom, tMin, cp.*, cui.*, notes) y el
     payload de readingForm (note).
   - psv.js assemblePsv (notes).
   - pipelines.js openSystemForm/openAssetForm (notes) — systemId/certExpiryISO/
     lastInspectionISO SI existen en el seed.
   - apm.js openAssetForm (iso14224.*, availabilityOverridePct, notes) y
     openEventForm (end).
   Nada fuera de esta lista puede ser inventado: el test los exige en el seed. */
const VIEW_ONLY_FIELDS = {
  monitoringPoints: ['systemId', 'tNom', 'tMin', 'notes', 'cp.enabled',
    'cp.potentialMvCse', 'cp.polarizationMv', 'cui.insulated', 'cui.jacketType', 'cui.lastInspISO'],
  readings: ['note'],
  coupons: [],
  psvs: ['notes'],
  pipelineSystems: ['notes'],
  lineAssets: ['notes'],
  lineInspections: [],
  apmAssets: ['iso14224.failureMode', 'iso14224.failureConsequence', 'availabilityOverridePct', 'notes'],
  apmEvents: ['end']
};

// ------------------------------------------------------------------ modulo
test('modulo: superficie UMD y 9 entidades importables', () => {
  assert.equal(typeof S.entityList, 'function');
  assert.equal(typeof S.fieldFor, 'function');
  assert.equal(typeof S.draftRecord, 'function');
  assert.equal(typeof S.naturalKeyOf, 'function');
  assert.equal(globalThis.IW.ingest.schemas, S, 'UMD root.IW.ingest.schemas');
  ENTITIES.forEach(function (store) {
    assert.ok(S.SCHEMAS[store], 'entidad ausente: ' + store);
  });
  assert.equal(Object.keys(S.SCHEMAS).length, 9, 'catalogo exactamente 9 entidades');
});

test('entityList/NATURAL_KEYS: coherentes con el catalogo', () => {
  var list = S.entityList();
  assert.equal(list.length, 9);
  list.forEach(function (e) {
    assert.ok(e.store && e.labelEs && Array.isArray(e.naturalKey) && e.naturalKey.length >= 1);
    assert.ok(typeof e.fieldCount === 'number' && e.fieldCount > 0);
    assert.equal(e.fieldCount, S.SCHEMAS[e.store].fields.length, 'fieldCount ' + e.store);
    assert.deepEqual(S.NATURAL_KEYS[e.store], e.naturalKey, 'NATURAL_KEYS ' + e.store);
    assert.equal(S.NATURAL_KEYS[e.store], e.naturalKey, 'misma referencia de array');
  });
  // Claves naturales segun el codigo real (documentadas en schemas.js):
  assert.deepEqual(S.NATURAL_KEYS.monitoringPoints, ['code']);
  assert.deepEqual(S.NATURAL_KEYS.readings, ['mpId', 'date']);
  assert.deepEqual(S.NATURAL_KEYS.coupons, ['mpId', 'pairId', 'role']);
  assert.deepEqual(S.NATURAL_KEYS.psvs, ['tag']);
  assert.deepEqual(S.NATURAL_KEYS.pipelineSystems, ['name', 'operator']);
  assert.deepEqual(S.NATURAL_KEYS.lineAssets, ['systemId', 'code']);
  assert.deepEqual(S.NATURAL_KEYS.lineInspections, ['systemId', 'date', 'type']);
  assert.deepEqual(S.NATURAL_KEYS.apmAssets, ['code']);
  assert.deepEqual(S.NATURAL_KEYS.apmEvents, ['assetId', 'start', 'type']);
});

// ------------------------------------------------------------------ aliases
test('aliases: >=2 por campo, todos en forma canonical, sin derivados como destino', () => {
  ENTITIES.forEach(function (store) {
    var seen = {};
    S.SCHEMAS[store].fields.forEach(function (f) {
      assert.ok(f.name && typeof f.required === 'boolean', 'name/required ' + store);
      assert.ok(['string', 'number', 'date', 'bool', 'enum'].indexOf(f.type) !== -1, 'type ' + store + '/' + f.name);
      assert.ok(Array.isArray(f.aliases) && f.aliases.length >= 2, 'aliases >=2 en ' + store + '/' + f.name);
      f.aliases.forEach(function (a) {
        assert.equal(U.canonicalize(a), a,
          'alias NO canonical: ' + store + '/' + f.name + ' -> ' + JSON.stringify(a));
        var key = store + '|' + a;
        assert.ok(!seen[key], 'alias duplicado en ' + store + ': ' + a);
        seen[key] = true;
        if (!f.derived) {
          var got = S.fieldFor(store, a);
          assert.ok(got && got.name === f.name, 'fieldFor no devuelve ' + f.name + ' para alias ' + a + ' en ' + store);
        }
      });
      if (f.enum) {
        assert.ok(f.type === 'enum' || f.type === 'string', 'enum solo en enum/string: ' + store + '/' + f.name);
      }
      if (f.unit) {
        assert.ok(U.UNITS[f.unit], 'dimension desconocida ' + f.unit + ' en ' + store + '/' + f.name);
        assert.ok(f.toUnit, 'unit sin toUnit: ' + store + '/' + f.name);
      }
    });
  });
});

// ------------------------------------------------------------------ fieldFor
test('fieldFor: cabeceras ES/EN reales mapean; basura devuelve null', () => {
  var f = S.fieldFor('readings', 'Punto de Monitoreo');
  assert.ok(f && f.name === 'mpId', 'Punto de Monitoreo -> readings.mpId');
  assert.ok(S.fieldFor('readings', 'mp'), 'mp -> readings');
  assert.ok(S.fieldFor('readings', 'FECHA'), 'FECHA -> date (case-insensitive via canonicalize)');

  var sk = S.fieldFor('lineAssets', 'estación km');
  assert.ok(sk && sk.name === 'stationKm', "'estación km' -> lineAssets.stationKm");
  var sk2 = S.fieldFor('lineAssets', 'Station (km)');
  assert.ok(sk2 && sk2.name === 'stationKm', "'Station (km)' -> lineAssets.stationKm");

  assert.ok(S.fieldFor('monitoringPoints', 'código'), "'código' -> monitoringPoints.code");

  var dp = S.fieldFor('psvs', 'design pressure (psi)');
  assert.ok(dp && dp.name === 'setPressurePsig', 'design pressure (psi) -> psvs.setPressurePsig');
  assert.equal(dp.unit, 'presion');

  assert.equal(S.fieldFor('readings', '%%% ??? ###'), null, 'header vacio-canonical -> null');
  assert.equal(S.fieldFor('readings', '🤡 columna fantasma'), null, 'header basura -> null');
  assert.equal(S.fieldFor('psvs', 'orifice_letter'), null, 'derivado NO es destino de mapeo');
  assert.equal(S.fieldFor('desconocidoStore', 'fecha'), null, 'store desconocido -> null');
});

// ------------------------------------------------------------------ draftRecord
test('draftRecord readings: campos REALES del store, alias ES/EN, unidad mpy', () => {
  var d = S.draftRecord('readings', {
    code: 'PM-CR-001', fecha: '05/01/2026', valor: 2.31, unidad: 'mpy'
  }, { sourceFile: 'lecturas.csv' });
  assert.deepEqual(d.errors, [], 'sin errores: ' + JSON.stringify(d.errors));
  assert.deepEqual(Object.keys(d.record).sort(), ['crMpy', 'date', 'mpId', 'source'],
    'campos reales del store readings');
  assert.equal(d.record.mpId, 'PM-CR-001');
  assert.equal(d.record.date, '2026-01-05', 'parseDate default DD/MM hispana');
  assert.equal(d.record.crMpy, 2.31);
  assert.equal(d.record.source, 'import', 'source es campo REAL del seed (usa los REALES)');
  assert.equal(d.__quality.mark, 'medido');
  assert.equal(d.__quality.sourceFile, 'lecturas.csv');
});

test('draftRecord readings: falta required -> error REQUIRED', () => {
  var d = S.draftRecord('readings', { code: 'PM-CR-001', fecha: '2026-01-05' });
  assert.equal(d.errors.length, 1);
  assert.equal(d.errors[0].field, 'crMpy');
  assert.equal(d.errors[0].code, 'REQUIRED');
});

test('draftRecord: conversion de unidades a la unidad del campo y equivalencia canonica bar', () => {
  // 'Presion (psi)' 145 -> process.totalPressureKpa guarda en kPa (unidad
  // embutida en el campo real: 999.74 kPa) y __quality.conversions registra la
  // equivalencia canonica bar (145 psi = 9.9974 bar) exigida por la spec.
  var d = S.draftRecord('monitoringPoints', {
    codigo: 'PM-1', sector: 'upstream', material: 'api5l-x52',
    sensorType: 'erProbe', 'Presión (psi)': 145
  });
  assert.deepEqual(d.errors, [], 'sin errores: ' + JSON.stringify(d.errors));
  approx(d.record.process.totalPressureKpa, 999.74);
  var conv = d.__quality.conversions.filter(function (c) { return c.field === 'process.totalPressureKpa'; });
  assert.equal(conv.length, 1);
  assert.equal(conv[0].from, 'psi');
  approx(conv[0].canonical.value, 9.997, 0.01);
  assert.equal(conv[0].canonical.unit, 'bar');

  // psig -> basis 'gauge' guardado (psv.setPressurePsig)
  var p = S.draftRecord('psvs', { tag: 'PSV-T1', 'design pressure (psig)': 145 });
  assert.deepEqual(p.errors, [], JSON.stringify(p.errors));
  assert.equal(p.record.setPressurePsig, 145, 'psi->psig numerico identico');
  var pb = p.__quality.conversions.filter(function (c) { return c.field === 'setPressurePsig'; });
  assert.ok(pb.length >= 1 && pb[0].basis === 'gauge', 'basis gauge guardado: ' + JSON.stringify(p.__quality.conversions));

  // unidad inline en la celda gana sobre la cabecera
  var m = S.draftRecord('monitoringPoints', {
    codigo: 'PM-2', sector: 'downstream', material: 'ss-316l', sensorType: 'utInspection',
    'presion_total': '10 bar'
  });
  assert.deepEqual(m.errors, [], JSON.stringify(m.errors));
  approx(m.record.process.totalPressureKpa, 1000);

  // unidad desconocida -> error
  var bad = S.draftRecord('monitoringPoints', {
    codigo: 'PM-3', sector: 'upstream', material: 'a106-b', sensorType: 'erProbe',
    'presion_total': '10 wigameters'
  });
  assert.equal(bad.errors.length, 1);
  assert.equal(bad.errors[0].code, 'UNIT_ERROR');
});

test('draftRecord: fechas Excel/ISO/DD-MM-YYYY y rango numerico', () => {
  var serial = (Date.UTC(2026, 0, 5) - U.EPOCH_1900) / 86400000;
  var a = S.draftRecord('readings', { mp: 'PM-9', fecha: serial, valor: 1.5 });
  assert.deepEqual(a.errors, [], JSON.stringify(a.errors));
  assert.equal(a.record.date, '2026-01-05');

  var b = S.draftRecord('readings', { mp: 'PM-9', fecha: '2026-01-05', valor: 1.5 });
  assert.equal(b.record.date, '2026-01-05');

  var full = S.draftRecord('readings', { mp: 'PM-9', fecha: '2026-01-05T00:00:00.000Z', valor: 1.5 });
  assert.deepEqual(full.errors, [], JSON.stringify(full.errors));

  var inv = S.draftRecord('readings', { mp: 'PM-9', fecha: '31-02-2026', valor: 1.5 });
  assert.equal(inv.errors.length, 1);
  assert.equal(inv.errors[0].code, 'INVALID_DATE');

  var neg = S.draftRecord('readings', { mp: 'PM-9', fecha: '2026-01-05', valor: -3 });
  assert.equal(neg.errors[0].code, 'OUT_OF_RANGE', 'crMpy >= 0');

  var hi = S.draftRecord('readings', { mp: 'PM-9', fecha: '2026-01-05', valor: 5000 });
  assert.equal(hi.errors[0].code, 'OUT_OF_RANGE', 'crMpy <= 1000 (precedente csv.js)');

  var len = S.draftRecord('monitoringPoints', {
    codigo: 'X'.repeat(100), sector: 'upstream', material: 'a106-b', sensorType: 'erProbe'
  });
  assert.equal(len.errors.length, 1);
  assert.equal(len.errors[0].code, 'TOO_LONG');
});

test('draftRecord: enums rechazan valores fuera del catalogo y los listan', () => {
  var d = S.draftRecord('apmAssets', { code: 'A-1', name: 'Bomba', criticality: 'D' });
  assert.equal(d.errors.length, 1);
  assert.equal(d.errors[0].code, 'INVALID_ENUM');
  assert.equal(d.errors[0].field, 'criticality');
  assert.ok(d.errors[0].message.indexOf('A') !== -1 && d.errors[0].message.indexOf('B') !== -1,
    'mensaje lista valores validos: ' + d.errors[0].message);

  var s = S.draftRecord('apmAssets', { code: 'A-1', name: 'Bomba', sector: 'middle' });
  assert.equal(s.errors[0].code, 'INVALID_ENUM');

  var ok = S.draftRecord('apmAssets', { code: 'A-1', name: 'Bomba', sector: 'midstream', criticality: 'B' });
  assert.deepEqual(ok.errors, [], JSON.stringify(ok.errors));
  assert.equal(ok.record.status, 'running', 'default del formulario aplicado');

  var b = S.draftRecord('coupons', { mpId: 'MP-1', role: 'blanco', material: 'api5l-x52', densityGcm3: 7.85, wiMg: 1000, wfMg: 900, areaIn2: 2, days: 30 });
  assert.equal(b.errors[0].code, 'INVALID_ENUM', 'role enum');
});

test('draftRecord psvs: anidamiento fluid.*, defaults y conversion de temperatura', () => {
  var d = S.draftRecord('psvs', {
    tag: 'PSV-X9', 'set_pressure': '150', 'temperature (f)': '140',
    'fluid name': 'Methane', phase: 'gas', m: 16.04, k: 1.31, z: 0.95
  });
  assert.deepEqual(d.errors, [], JSON.stringify(d.errors));
  assert.equal(d.record.valveType, 'conventional', 'default valveType');
  assert.equal(d.record.fluid.name, 'Methane');
  assert.equal(d.record.fluid.phase, 'gas');
  assert.equal(d.record.fluid.M, 16.04);
  approx(d.record.operatingTempF, 140);
});

test('draftRecord: store desconocido y campos derivados ignorados', () => {
  var d = S.draftRecord('noExiste', { a: 1 });
  assert.equal(d.errors[0].code, 'UNKNOWN_STORE');
  var c = S.draftRecord('coupons', {
    mpId: 'MP-1', role: 'blank', material: 'api5l-x52', densityGcm3: 7.85,
    wiMg: 1000, wfMg: 900, areaIn2: 2, days: 30, crMpy: 99
  });
  assert.equal(c.errors.length, 0, JSON.stringify(c.errors));
  assert.ok(!('crMpy' in c.record), 'crMpy derivado no se importa (store lo recalcula)');
});

// ------------------------------------------------------------------ naturalKeyOf
test('naturalKeyOf: estable, alias o campos reales, fechas normalizadas', () => {
  var rec = { mpId: 'PM-CR-001', date: '2026-01-05', crMpy: 2 };
  var k1 = S.naturalKeyOf('readings', rec);
  var k2 = S.naturalKeyOf('readings', rec);
  assert.equal(k1, k2, 'mismo record dos veces -> misma clave');

  // full ISO medianoche UTC == fecha ISO == serie Excel
  var serial = (Date.UTC(2026, 0, 5) - U.EPOCH_1900) / 86400000;
  var dExcel = S.draftRecord('readings', { code: 'PM-CR-001', fecha: serial, valor: 2 });
  var dIso = S.draftRecord('readings', { code: 'PM-CR-001', fecha: '2026-01-05', valor: 2 });
  assert.equal(S.naturalKeyOf('readings', dExcel.record), S.naturalKeyOf('readings', dIso.record),
    'serie Excel vs YYYY-MM-DD -> MISMA clave');
  assert.equal(S.naturalKeyOf('readings', { mpId: 'PM-CR-001', date: '2026-01-05T00:00:00.000Z' }),
    S.naturalKeyOf('readings', dIso.record), 'full ISO medianoche -> misma clave');
  assert.equal(S.naturalKeyOf('readings', { code: 'PM-CR-001', fecha: '05/01/2026' }), k1,
    'naturalKeyOf acepta claves por alias');
  assert.notEqual(S.naturalKeyOf('readings', { mpId: 'PM-CR-001', date: '2026-01-05T06:00:00.000Z' }), k1,
    'medianoche se recorta, hora real no');

  assert.equal(S.naturalKeyOf('psvs', { tag: 'PSV-1' }), 'tag=PSV-1');
  assert.equal(S.naturalKeyOf('monitoringPoints', { codigo: 'MP-7' }), 'code=MP-7');
  var ev = S.naturalKeyOf('apmEvents', { assetId: 'APM-1', start: '2026-02-01', type: 'failure' });
  assert.equal(ev, 'assetId=APM-1|start=2026-02-01|type=failure');
});

// ------------------------------------------------------------------ enums vs seed
test('enums: aceptan los valores EXACTOS que usa el seed', async () => {
  var recs = await seedRecords();
  function checkEnum(store, path, enumName) {
    var field = S.SCHEMAS[store].fields.filter(function (f) { return f.name === path; })[0];
    assert.ok(field, path + ' en ' + store);
    assert.ok(Array.isArray(field.enum), 'enum de ' + store + '/' + path);
    recs[store].forEach(function (r) {
      var v = getPath(r, path);
      if (v === undefined || v === null) { return; }
      assert.ok(field.enum.indexOf(v) !== -1,
        store + '/' + path + ' = ' + JSON.stringify(v) + ' no esta en enum (campo ' + enumName + ')');
    });
  }
  checkEnum('monitoringPoints', 'sector', 'sector');
  checkEnum('monitoringPoints', 'sensorType', 'sensorType');
  checkEnum('readings', 'source', 'source');
  checkEnum('coupons', 'role', 'role');
  checkEnum('coupons', 'status', 'status');
  checkEnum('psvs', 'valveType', 'valveType');
  checkEnum('psvs', 'fluid.phase', 'fluid.phase');
  checkEnum('psvs', 'inspResult', 'inspResult');
  checkEnum('pipelineSystems', 'product', 'product');
  checkEnum('lineAssets', 'type', 'type');
  checkEnum('lineAssets', 'side', 'side');
  checkEnum('lineInspections', 'type', 'type');
  checkEnum('lineInspections', 'severity', 'severity');
  checkEnum('apmAssets', 'sector', 'sector');
  checkEnum('apmAssets', 'category', 'category');
  checkEnum('apmAssets', 'criticality', 'criticality');
  checkEnum('apmAssets', 'status', 'status');
  checkEnum('apmEvents', 'type', 'type');
});

// ------------------------------------------------------------------ anti-invencion
test('no invente campos: todo field existe en registros REALES del seed (>=1 muestra) o es payload documentado de vista', async () => {
  var recs = await seedRecords();
  ENTITIES.forEach(function (store) {
    var union = new Set();
    recs[store].forEach(function (r) { setPathOfKeys(r, union, ''); });
    var viewOnly = new Set(VIEW_ONLY_FIELDS[store] || []);
    S.SCHEMAS[store].fields.forEach(function (f) {
      if (f.derived) { return; } // recalculado por store/calc: se marca, no se importa
      var ok = union.has(f.name) || viewOnly.has(f.name);
      assert.ok(ok, 'campo ' + store + '.' + f.name + ' NO existe en el seed y no esta en la lista documentada de campos de vista');
    });
  });
});

test('el natural key de cada entidad usa campos reales presentes en los registros del seed', async () => {
  var recs = await seedRecords();
  ENTITIES.forEach(function (store) {
    var keys = S.NATURAL_KEYS[store];
    keys.forEach(function (k) {
      var any = recs[store].some(function (r) { return getPath(r, k) !== undefined; });
      assert.ok(any, store + ': campo de naturalKey "' + k + '" ausente en todos los registros del seed');
    });
    // cada clave natural debe existir en ALGUNA muestra y ser estable al deduplicar por par
    // (muestra: dos seed records distintos del mismo store nunca comparten clave si sus
    // campos naturalKey estan presentes en ambos)
    var seen = {};
    var dups = 0;
    recs[store].forEach(function (r) {
      var complete = keys.every(function (k) { return getPath(r, k) !== undefined; });
      if (!complete) { return; }
      var key = S.naturalKeyOf(store, r);
      if (seen[key]) { dups++; }
      seen[key] = true;
    });
    if (store === 'readings' || store === 'monitoringPoints' || store === 'psvs' ||
        store === 'coupons' || store === 'lineAssets' || store === 'apmEvents') {
      assert.equal(dups, 0, store + ': el seed tiene registros con clave natural duplicada');
    }
  });
});

// ------------------------------------------------------------------ quality
test('__quality: dataQuality aparte (no rompe el record) y mark default medido', () => {
  var d = S.draftRecord('coupons', {
    mpId: 'MP-1', pairId: 'P9', role: 'blank', material: 'api5l-x52', densityGcm3: 7.85,
    wiMg: 1000, wfMg: 900, areaIn2: 2, days: 30
  }, { sourceFile: 'cupones.xlsx' });
  assert.deepEqual(d.errors, [], JSON.stringify(d.errors));
  assert.ok(!('__quality' in d.record), '__quality NO va dentro del record (los views no lo conocen)');
  assert.equal(d.__quality.mark, 'medido');
  assert.equal(d.__quality.sourceFile, 'cupones.xlsx');
  // seed no define campo de fuente para coupons: no se inventa raiz 'source'
  assert.ok(!('source' in d.record));
  // readings SI tiene source real
  var r = S.draftRecord('readings', { code: 'PM-1', fecha: '2026-01-05', valor: 1, origen: 'manual' });
  assert.equal(r.record.source, 'manual', 'fuente REAL del registro usada cuando existe');
});

test('entidades sin campo de fuente real: __quality aparte, record limpio', () => {
  var d = S.draftRecord('apmEvents', { assetId: 'APM-1', tipo: 'failure', start: '2026-01-01', downtimeH: 4 });
  assert.deepEqual(d.errors, [], JSON.stringify(d.errors));
  assert.deepEqual(Object.keys(d.record).sort(), ['assetId', 'downtimeH', 'start', 'type']);
});
