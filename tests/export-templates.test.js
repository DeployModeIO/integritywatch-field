/* IntegrityWatch Field — export/templates (P3c2)
   Transformadores puros filas→columnas de destino (SAP PM / Maximo / ISO 14224 /
   PHMSA). Fixtures = seed REAL sobre dbMemory (mismo patrón que tests/seed.test.js,
   NOW fijo 2026-09-15 → fechas golden reproducibles). Golden fijados de corrida
   real contra las fórmulas de src/calc (pipelineAssessment pAllow idénticas a los
   golden T-06/T-10: 5.918618030457341 / 4.187978782839058 / 7.144409734547659). */
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

require('../src/calc/units.js');
require('../src/calc/psv.js');
const dbMemory = require('../src/core/dbMemory.js');
const storeApi = require('../src/core/store.js');
const seed = require('../src/data/seed.js');
const pa = require('../src/calc/pipelineAssessment.js');
const templates = require('../src/export/templates.js');

const NOW = '2026-09-15T00:00:00.000Z';

async function seeded() {
  const s = storeApi.create(dbMemory.create());
  await seed.demo(s, { nowISO: NOW });
  return {
    apmAssets: await s.apmAssets.list(),
    apmEvents: await s.apmEvents.list(),
    psvs: await s.psvs.list(),
    pipelineSystems: await s.pipelineSystems.list(),
    lineInspections: await s.lineInspections.list(),
    iliAnomalies: await s.iliAnomalies.list()
  };
}

function assetsById(assets) {
  const m = {};
  assets.forEach((a) => { m[a.id] = a; });
  return m;
}

// B31G precomputado POR EL LLAMADOR (así lo pide la spec): parámetros espejo
// del panel ILI / T-06 / T-10: Su 414 (X52), D = dnIn*25.4, t = 9.53, DF 0.72, op 6.
function assessFixtures(data) {
  const results = pa.assessAnomalies([], data.iliAnomalies, {
    Su: 414, D: 16 * 25.4, t: 9.53, designFactor: 0.72, opPressure: 6
  });
  const map = {};
  results.forEach((r) => { map[r.id] = r; });
  return map;
}

function colOf(sheet, header) {
  const i = sheet.headers.indexOf(header);
  assert.ok(i !== -1, 'header no encontrado: ' + header);
  return i;
}

// ---------------------------------------------------------------------------
// 1) sapPm.equipment — 18 activos del seed → 18 filas, 15 columnas exactas
// ---------------------------------------------------------------------------

const SAP_EQ_HEADERS = ['EQUNR', 'TXT', 'TYP', 'STLZ', 'INSP', 'NDISC', 'OBJE',
  'CRIT', 'POF', 'COF', 'RSK', 'INTVL', 'FMOD', 'FCON', 'ORIG'];

test('sapPm.equipment: seed 18 → 18 filas con las 15 columnas exactas', async () => {
  const d = await seeded();
  const t = templates.sapPm.equipment(d.apmAssets);
  assert.equal(t.sheetName, 'equipos_sap_pm');
  assert.deepEqual(t.headers, SAP_EQ_HEADERS);
  assert.equal(t.rows.length, 18);
  t.rows.forEach((r) => assert.equal(r.length, 15));

  // Fila 1 = APM-UP-001 (well, pof2*cof4=8 → 'medium'; sin proxima inspeccion → '').
  assert.deepEqual(t.rows[0],
    ['WELL-01', 'Well Norte 1', 'well', 'upstream', 'medium', '', 'running',
      'B', 2, 4, 8, 24, '', '', 'IW-FIELD']);
  // APM-DN-001: pof5*cof4=20 → 'veryHigh', NDISC = NOW-45d, base 24 meses.
  const iDn001 = t.rows.findIndex((r) => r[0] === 'HEX-01');
  assert.equal(t.rows[iDn001][4], 'veryHigh');
  assert.equal(t.rows[iDn001][5], '2026-08-01T00:00:00.000Z');
  // APM-MD-105: pof3*cof4=12 → 'high'.
  const i105 = t.rows.findIndex((r) => r[0] === 'PUMP-201A');
  assert.equal(t.rows[i105][4], 'high');
});

// ---------------------------------------------------------------------------
// 2) maximo.asset — convención Maximo: ASSETNUM/ASSETNAME/CLASSNAME/LOCATION...
// ---------------------------------------------------------------------------

const MAX_ASSET_HEADERS = ['ASSETNUM', 'ASSETNAME', 'CLASSNAME', 'LOCATION',
  'OPERATINGSTATUS', 'CRITICALITY', 'PLANNEDSTART', 'PROBABILITY', 'IMPACT',
  'RISK', 'FAILUREMODE', 'NOTES'];

test('maximo.asset: 18 filas, columnas exactas y PLANNEDSTART = rbi.nextInspectionISO', async () => {
  const d = await seeded();
  const t = templates.maximo.asset(d.apmAssets);
  assert.equal(t.sheetName, 'activos_maximo');
  assert.deepEqual(t.headers, MAX_ASSET_HEADERS);
  assert.equal(t.rows.length, 18);
  assert.deepEqual(t.rows[0],
    ['WELL-01', 'Well Norte 1', 'well', 'upstream', 'running', 'B', '',
      2, 4, 8, '', '']);
  const iDn001 = t.rows.findIndex((r) => r[0] === 'HEX-01');
  assert.equal(t.rows[iDn001][6], '2026-08-01T00:00:00.000Z');
});

// ---------------------------------------------------------------------------
// 3) psv.sapPm / psv.maximo — TAG, presión de set, próxima prueba
// ---------------------------------------------------------------------------

test('psv.sapPm: 5 filas; EQUNR=tag, SETP=setPressurePsig, NDISC=nextTestDate', async () => {
  const d = await seeded();
  const t = templates.psv.sapPm(d.psvs);
  assert.equal(t.sheetName, 'psv_sap_pm');
  assert.deepEqual(t.headers, ['EQUNR', 'TXT', 'TYP', 'FLUID', 'SETP', 'OPTMP',
    'BACKP', 'ORIF', 'NDISC', 'LASTD', 'INSPD']);
  assert.equal(t.rows.length, 5);
  // PSV-520-001: nextTestDate = NOW-10d; inspLast/inspNext del seed (NOW-400 / NOW-35).
  assert.equal(t.rows[0][0], 'PSV-520-001');
  assert.equal(t.rows[0][1], 'Compressor K-101 discharge');
  assert.equal(t.rows[0][2], 'conventional');
  assert.equal(t.rows[0][4], 150);
  assert.equal(t.rows[0][8], '2026-09-05T00:00:00.000Z');
  assert.equal(t.rows[0][9], '2025-09-15T00:00:00.000Z');
  assert.equal(t.rows[0][10], '2026-08-11T00:00:00.000Z');
  // PSV sin inspecciones API576 → INSPD '' (campos que EXISTEN, nunca inventar).
  assert.equal(t.rows[1][10], '');
});

test('psv.maximo: ASSETNUM=tag, STATUS=psv.status (field real del store), PLANNEDSTART=nextTestDate', async () => {
  const d = await seeded();
  const t = templates.psv.maximo(d.psvs);
  assert.equal(t.sheetName, 'psv_maximo');
  assert.deepEqual(t.headers, ['ASSETNUM', 'ASSETNAME', 'CLASSNAME', 'FLUID',
    'SETPRESSURE', 'ORIFICE', 'STATUS', 'PLANNEDSTART', 'LASTTEST', 'INSPNEXT',
    'INSPRESULT']);
  assert.equal(t.rows.length, 5);
  const p0 = d.psvs.find((p) => p.id === 'PSV-520-001');
  assert.equal(t.rows[0][6], p0.status); // passthrough del status YA calculado por store
  assert.equal(t.rows[0][7], '2026-09-05T00:00:00.000Z');
});

// ---------------------------------------------------------------------------
// 4) iso14224.events — tabla ISO 14224 con los campos que EXISTEN
// ---------------------------------------------------------------------------

const ISO_HEADERS = ['NUM_EVENTO', 'FECHA_HORA_CAT1', 'NIVEL1_SISTEMA',
  'NIVEL2_SUBSISTEMA', 'NIVEL3_ELEMENTO', 'NIVEL4_SUBELEMENTO', 'EQUIPO',
  'DESCRIPCION', 'FECHA_FIN', 'ACTIVIDAD_CAT', 'DURACION_PARADA_H',
  'MODO_FALLA', 'MECANISMO', 'CONSECUENCIA', 'ORDEN_TRABAJO',
  'METODO_DETECCION', 'CAUSA'];

test('iso14224.events: 24 eventos del seed → 24 filas de 17 columnas', async () => {
  const d = await seeded();
  const t = templates.iso14224.events(d.apmEvents, assetsById(d.apmAssets));
  assert.equal(t.sheetName, 'eventos_iso14224');
  assert.deepEqual(t.headers, ISO_HEADERS);
  assert.equal(t.rows.length, 24);
  t.rows.forEach((r) => assert.equal(r.length, 17));
  assert.match(t.note, /niveles 3-6 simplificados/);

  // EV-001 (mantenimiento WELL-01, 8 h): sin iso14224 en el activo → modo = type,
  // niveles 3/4 y consecuencia '—' (NO inventado); sin end/OT → '—'.
  assert.deepEqual(t.rows[0],
    ['EV-001', '2026-05-18T00:00:00.000Z', 'upstream', 'well', '—', '—',
      'WELL-01', '—', '—', 'maintenance', 8, 'maintenance', '—', '—', '—', '—', '—']);

  // EV-019 trae description + workOrderRef reales → columnas 8 y 15 con valores.
  const ev19 = t.rows.find((r) => r[0] === 'EV-019');
  assert.equal(ev19[7], 'Mechanical seal failure on pump P-201A');
  assert.equal(ev19[14], 'OT-2026-612');
  assert.equal(ev19[10], 8);

  // METODO_DETECCION/CAUSA: verificado en schemas.js y seed.js — los eventos NO
  // traen detectionMethod ni cause → SIEMPRE '—' con el seed.
  const cDet = colOf(t, 'METODO_DETECCION');
  const cCaus = colOf(t, 'CAUSA');
  t.rows.forEach((r) => {
    assert.equal(r[cDet], '—');
    assert.equal(r[cCaus], '—');
  });

  // Duración parada mapeada: EV-007 unplannedOutage 200 h.
  const ev7 = t.rows.find((r) => r[0] === 'EV-007');
  assert.equal(ev7[9], 'unplannedOutage');
  assert.equal(ev7[10], 200);
});

test('iso14224.events: iso14224.failureMode del activo manda (nivel3 y modo); categoryMap opcional traduce nivel2', () => {
  const assets = [
    { id: 'A1', code: 'P-1', sector: 'downstream', category: 'pump',
      iso14224: { failureMode: 'wear', failureConsequence: 'costs' } },
    { id: 'A2', code: 'X-2', sector: 'upstream', category: 'well' }
  ];
  const events = [
    { id: 'E1', assetId: 'A1', type: 'failure', start: '2026-01-01T00:00:00.000Z', downtimeH: 4 },
    { id: 'E2', assetId: 'A2', type: 'maintenance', start: '2026-01-02T00:00:00.000Z', downtimeH: 0 },
    { id: 'E3', assetId: 'A-DESCONOCIDO', type: 'inspection', start: '2026-01-03T00:00:00.000Z', downtimeH: 0 }
  ];
  const plain = templates.iso14224.events(events, assetsById(assets));
  assert.deepEqual(plain.rows[0],
    ['E1', '2026-01-01T00:00:00.000Z', 'downstream', 'pump', 'wear', '—',
      'P-1', '—', '—', 'failure', 4, 'wear', '—', 'costs', '—', '—', '—']);
  assert.equal(plain.rows[1][11], 'maintenance'); // sin iso registrado → type del evento
  assert.equal(plain.rows[2][6], 'A-DESCONOCIDO'); // asset desconocido: id en crudo, niveles '—'
  assert.equal(plain.rows[2][2], '—');

  const translated = templates.iso14224.events(events, assetsById(assets), { pump: 'BOMBA CENTRIFUGA' });
  assert.equal(translated.rows[0][3], 'BOMBA CENTRIFUGA');
  assert.equal(translated.rows[1][3], 'well'); // clave ausente en el mapa → id crudo
});

test('iso14224.events: lee e.detectionMethod / e.cause SOLO si viajan en el registro (no existe hoy)', () => {
  const events = [{ id: 'E1', assetId: 'A1', type: 'failure', start: '2026-01-01T00:00:00.000Z',
    downtimeH: 2, detectionMethod: 'rutina_inspeccion', cause: 'sobrevelocidad' }];
  const t = templates.iso14224.events(events, {});
  assert.equal(t.rows[0][15], 'rutina_inspeccion');
  assert.equal(t.rows[0][16], 'sobrevelocidad');
});

// ---------------------------------------------------------------------------
// 5) phmsa.performance — DOS hojas: medidas_desempeno + hallazgos_ili
// ---------------------------------------------------------------------------

const MEDIDAS_HEADERS = ['SISTEMA', 'TRAMO_DESDE_KM', 'TRAMO_HASTA_KM',
  'ANOMALIAS', 'THREAT_TIME_DEPENDENT', 'THREAT_ESTABLE', 'THREAT_TERCEROS',
  'INSPECCIONES', 'EVIDENCIA_CORROSION_EXTERNA', 'MAX_PCT_METAL'];

const HALLAZGOS_HEADERS = ['ID_ABNORMALIDAD', 'SISTEMA', 'KM', 'PCT_METAL',
  'TIPO', 'PRES_ADMISIBLE_B31G', 'SEVERIDAD', 'ACCION'];

test('phmsa.performance: dos hojas con las formas pactadas', async () => {
  const d = await seeded();
  const t = templates.phmsa.performance(d.pipelineSystems, d.lineInspections, d.iliAnomalies);
  assert.ok(Array.isArray(t.sheets), 'performance multi-hoja devuelve sheets[]');
  assert.equal(t.sheets.length, 2);
  assert.equal(t.sheets[0].sheetName, 'medidas_desempeno');
  assert.equal(t.sheets[1].sheetName, 'hallazgos_ili');
  assert.deepEqual(t.sheets[0].headers, MEDIDAS_HEADERS);
  assert.deepEqual(t.sheets[1].headers, HALLAZGOS_HEADERS);
});

test('phmsa medidas_desempeno: 12 buckets de 10 km sobre SYS-NORTE-16 con golden del seed', async () => {
  const d = await seeded();
  const t = templates.phmsa.performance(d.pipelineSystems, d.lineInspections, d.iliAnomalies);
  const m = t.sheets[0];
  assert.equal(m.rows.length, 12); // sistema 0..120 km → 12 tramos
  const S = 'Norte 16" Crude';
  const expected = [
    [S, 0, 10, 0, 0, 0, 0, 0, 0, ''],
    [S, 10, 20, 1, 1, 0, 0, 1, 1, 25],   // crack@13.7 timeDep + INSP externalCorrosion[10,14]
    [S, 20, 30, 1, 1, 0, 0, 1, 0, 42],   // metalLoss@24.5 + INSP ut[22,26]
    [S, 30, 40, 0, 0, 0, 0, 1, 0, ''],   // INSP visual[38,42] (método, no amenaza)
    [S, 40, 50, 1, 0, 1, 0, 1, 0, 12],   // dent@40.8 estable + visual cruza el km 40
    [S, 50, 60, 0, 0, 0, 0, 0, 0, ''],
    [S, 60, 70, 0, 0, 0, 0, 0, 0, ''],
    [S, 70, 80, 0, 0, 0, 0, 1, 0, ''],   // INSP visual[70,74]
    [S, 80, 90, 1, 1, 0, 0, 0, 0, 58],   // metalLoss@85.1
    [S, 90, 100, 1, 1, 0, 0, 0, 0, 8],   // metalLoss@92.3
    [S, 100, 110, 1, 1, 0, 0, 1, 0, 18], // metalLoss@106.2 + INSP ild[100,120]
    [S, 110, 120, 0, 0, 0, 0, 1, 0, '']  // INSP ild cruza hasta km 120
  ];
  assert.deepEqual(m.rows, expected);
  // THREAT_TERCEROS es 0 por contrato (ningún type del modelo representa daño
  // de terceros — mapeo documentado igual que T-10).
  const cTerc = colOf(m, 'THREAT_TERCEROS');
  m.rows.forEach((r) => assert.equal(r[cTerc], 0));
});

test('phmsa hallazgos_ili: sin assessment la columna B31G va VACÍA con nota; severidad heredada de la inspección', async () => {
  const d = await seeded();
  const t = templates.phmsa.performance(d.pipelineSystems, d.lineInspections, d.iliAnomalies);
  const h = t.sheets[1];
  assert.equal(h.rows.length, 6);
  assert.match(h.note, /prohibido recalcular B31G/i);
  const cB31 = colOf(h, 'PRES_ADMISIBLE_B31G');
  const cAcc = colOf(h, 'ACCION');
  h.rows.forEach((r) => { assert.equal(r[cB31], ''); assert.equal(r[cAcc], ''); });

  // Orden por km ascendente (id estable en empates): 13.7, 24.5, 40.8, 85.1, 92.3, 106.2
  assert.deepEqual(h.rows.map((r) => r[0]),
    ['ILI-N16-005', 'ILI-N16-002', 'ILI-N16-003', 'ILI-N16-004', 'ILI-N16-006', 'ILI-N16-001']);
  // Severidad HEREDADA via inspectionId → lineInspections.severity (shape real).
  const cSev = colOf(h, 'SEVERIDAD');
  assert.deepEqual(h.rows.map((r) => r[cSev]),
    ['low', 'severe', 'high', 'severe', 'moderate', 'moderate']);
  assert.deepEqual(h.rows[0].slice(1, 5), ['SYS-NORTE-16', 13.7, 25, 'crack']);
});

test('phmsa hallazgos_ili: assessmentByAnomalyId precomputado pasa a la columna B31G SIN recalcular', async () => {
  const d = await seeded();
  const map = assessFixtures(d);
  const t = templates.phmsa.performance(d.pipelineSystems, d.lineInspections, d.iliAnomalies,
    { assessmentByAnomalyId: map });
  const h = t.sheets[1];
  const cB31 = colOf(h, 'PRES_ADMISIBLE_B31G');
  const cAcc = colOf(h, 'ACCION');
  const byId = {};
  h.rows.forEach((r) => { byId[r[0]] = r; });
  // pAllow idénticos bit a bit a los golden T-06/T-10 (reutilización, no deriva).
  assert.equal(byId['ILI-N16-002'][cB31], 5.918618030457341);
  assert.equal(byId['ILI-N16-004'][cB31], 4.187978782839058);
  assert.equal(byId['ILI-N16-005'][cB31], 7.144409734547659);
  assert.equal(byId['ILI-N16-002'][cAcc], 'reparar');   // exceeds true (5.918 < op 6)
  assert.equal(byId['ILI-N16-004'][cAcc], 'reparar');   // exceeds true
  assert.equal(byId['ILI-N16-005'][cAcc], 'monitorear'); // exceeds false
});

test('phmsa medidas: anomalía justo en stationToKm cae en el último bucket (borde clampeado)', () => {
  const systems = [{ id: 'S', name: 'S', stationFromKm: 0, stationToKm: 120 }];
  const anomalies = [{ id: 'X1', systemId: 'S', stationKm: 120, depthPct: 30, type: 'metalLoss' }];
  const t = templates.phmsa.performance(systems, [], anomalies);
  const last = t.sheets[0].rows[t.sheets[0].rows.length - 1];
  assert.deepEqual(last, ['S', 110, 120, 1, 1, 0, 0, 0, 0, 30]);
});

// ---------------------------------------------------------------------------
// 6) bordes: null/undefined/vacíos sin crash + determinismo
// ---------------------------------------------------------------------------

test('todos los transformadores toleran null/undefined/[] → filas vacías, cabeceras intactas', () => {
  const fns = [
    () => templates.sapPm.equipment(null),
    () => templates.sapPm.equipment(undefined),
    () => templates.sapPm.equipment([]),
    () => templates.maximo.asset(null),
    () => templates.psv.sapPm(undefined),
    () => templates.psv.maximo([]),
    () => templates.iso14224.events(null, null, null),
    () => templates.iso14224.events([], {}),
    () => templates.phmsa.performance(null, null, null),
    () => templates.phmsa.performance([], [], [], { assessmentByAnomalyId: null })
  ];
  fns.forEach((f) => {
    const out = f();
    if (Array.isArray(out.sheets)) {
      out.sheets.forEach((s) => {
        assert.ok(s.sheetName && Array.isArray(s.headers) && s.headers.length > 0);
        assert.deepEqual(s.rows, []);
      });
    } else {
      assert.ok(out.sheetName && Array.isArray(out.headers) && out.headers.length > 0);
      assert.deepEqual(out.rows, []);
    }
  });
  // events sin assetsById sigue emitiendo filas con '—' donde no hay dato.
  const partial = templates.iso14224.events(
    [{ id: 'E1', assetId: 'A1', type: 'failure', start: '2026-01-01T00:00:00.000Z', downtimeH: 1 }],
    undefined);
  assert.equal(partial.rows[0][6], 'A1');
});

test('determinismo: la misma entrada produce el mismo JSON.stringify (dos pasadas)', async () => {
  const d = await seeded();
  const map = assessFixtures(d);
  const once = {
    sap: templates.sapPm.equipment(d.apmAssets),
    max: templates.maximo.asset(d.apmAssets),
    psvSap: templates.psv.sapPm(d.psvs),
    psvMax: templates.psv.maximo(d.psvs),
    iso: templates.iso14224.events(d.apmEvents, assetsById(d.apmAssets)),
    phm: templates.phmsa.performance(d.pipelineSystems, d.lineInspections, d.iliAnomalies,
      { assessmentByAnomalyId: map })
  };
  const twice = {
    sap: templates.sapPm.equipment(d.apmAssets),
    max: templates.maximo.asset(d.apmAssets),
    psvSap: templates.psv.sapPm(d.psvs),
    psvMax: templates.psv.maximo(d.psvs),
    iso: templates.iso14224.events(d.apmEvents, assetsById(d.apmAssets)),
    phm: templates.phmsa.performance(d.pipelineSystems, d.lineInspections, d.iliAnomalies,
      { assessmentByAnomalyId: map })
  };
  for (const k of Object.keys(once)) {
    assert.equal(JSON.stringify(once[k]), JSON.stringify(twice[k]), 'no determinista: ' + k);
  }
});

test('pureza: los transformadores no mutan los registros de entrada', async () => {
  const d = await seeded();
  const snapshot = JSON.stringify(d);
  templates.sapPm.equipment(d.apmAssets);
  templates.maximo.asset(d.apmAssets);
  templates.psv.sapPm(d.psvs);
  templates.psv.maximo(d.psvs);
  templates.iso14224.events(d.apmEvents, assetsById(d.apmAssets));
  templates.phmsa.performance(d.pipelineSystems, d.lineInspections, d.iliAnomalies,
    { assessmentByAnomalyId: assessFixtures(d) });
  assert.equal(JSON.stringify(d), snapshot);
});
