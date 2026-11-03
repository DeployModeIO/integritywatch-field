/* IntegrityWatch Field — T-11 trimestral ejecutivo (IOGP) report model tests
   GOLDEN: deterministic demo seed (seed.js, NOW 2026-09-15) plus six
   engine-shaped recommendation fixtures, evaluated over the SAME period
   fixture as reports-characterization.test.js ({2026-01-01 → 2026-03-31}).
   The seed alone has no Q1-2026 recs/inspections/quality marks, so the
   honest-null KPIs and Tier 1/2/4 zeros are part of the golden; the recs
   fixtures make Tier 3 and the 12-month trend discriminating. Synthetic
   repos then exercise the Tier 1/2 mapping, the plan/quality probes and the
   trend-omission rule. Covers: purity (no-mutation snapshot over all five
   consumed stores), i18n keys exist in es.js, T-11 registered idempotently
   and COEXISTING with 'quarterly', and buildReport end-to-end through the
   real renderer. */
'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');

const shim = require('./helpers/dom-shim');
require('../src/calc/units.js');
require('../src/calc/corrosion.js');
require('../src/calc/apm.js');
require('../src/data/standards.js');
const dbMemory = require('../src/core/dbMemory.js');
const storeApi = require('../src/core/store.js');
const seed = require('../src/data/seed.js');
require('../src/reports/model.js');
require('../src/reports/charts.js');
require('../src/reports/registry.js');
require('../src/reports/renderer.js');
const modelT11 = require('../src/reports/model-t11.js');
const registry = require('../src/reports/registry.js');
const es = require('../src/i18n/locales/es.js');

const t = (key) => key;
const SEED_NOW = '2026-09-15T00:00:00.000Z';
const BUILD_NOW = '2026-11-03T12:00:00.000Z';
// Mismo fixture de periodo que tests/reports-characterization.test.js.
const PERIOD = { fromISO: '2026-01-01', toISO: '2026-03-31' };

before(() => shim.install());
after(() => shim.uninstall());

function listRepo(items) { return { list: async () => items }; }

// Recomendaciones con la forma exacta de engine.reconcile (fingerprint real
// ruleId:entityStore:entityId). Diseñadas para discriminar el mapeo de tiers:
//  - R1/R9/R13 abiertas dentro del periodo -> Tier 3 = 3
//  - R15 abierta en periodo -> excluida (fuera de R1–R14 del blueprint)
//  - R2 resuelta en periodo -> excluida (status no abierto)
//  - R3 abierta en junio -> excluida (fuera del periodo)
const GOLDEN_RECS = [
  { id: 'R1:monitoringPoints:MP-CORR-001', ruleId: 'R1', fingerprint: 'R1:monitoringPoints:MP-CORR-001', severity: 'critical', entityStore: 'monitoringPoints', entityId: 'MP-CORR-001', messageKey: 'rules.msg.R1', params: { code: 'MP-CORR-001', cr: 12.4 }, status: 'open', createdAt: '2026-02-10T00:00:00.000Z', lastTriggeredAt: '2026-02-10T00:00:00.000Z', triggerCount: 1, entityLabel: 'MP-CORR-001' },
  { id: 'R9:apmAssets:APM-DN-001', ruleId: 'R9', fingerprint: 'R9:apmAssets:APM-DN-001', severity: 'warning', entityStore: 'apmAssets', entityId: 'APM-DN-001', messageKey: 'rules.msg.R9', params: { name: 'HEX-01', days: 45 }, status: 'open', createdAt: '2026-01-20T00:00:00.000Z', lastTriggeredAt: '2026-01-20T00:00:00.000Z', triggerCount: 1, entityLabel: 'HEX-01' },
  { id: 'R13:psvs:PSV-520-003', ruleId: 'R13', fingerprint: 'R13:psvs:PSV-520-003', severity: 'critical', entityStore: 'psvs', entityId: 'PSV-520-003', messageKey: 'rules.msg.R13', params: { tag: 'PSV-520-003', days: 60 }, status: 'open', createdAt: '2026-03-05T00:00:00.000Z', lastTriggeredAt: '2026-03-05T00:00:00.000Z', triggerCount: 1, entityLabel: 'PSV-520-003' },
  { id: 'R15:monitoringPoints:MP-CORR-002', ruleId: 'R15', fingerprint: 'R15:monitoringPoints:MP-CORR-002', severity: 'high', entityStore: 'monitoringPoints', entityId: 'MP-CORR-002', messageKey: 'rules.msg.R15', params: { code: 'MP-CORR-002' }, status: 'open', createdAt: '2026-02-15T00:00:00.000Z', lastTriggeredAt: '2026-02-15T00:00:00.000Z', triggerCount: 1, entityLabel: 'MP-CORR-002' },
  { id: 'R2:monitoringPoints:MP-CORR-002', ruleId: 'R2', fingerprint: 'R2:monitoringPoints:MP-CORR-002', severity: 'warning', entityStore: 'monitoringPoints', entityId: 'MP-CORR-002', messageKey: 'rules.msg.R2', params: { code: 'MP-CORR-002' }, status: 'resolved', createdAt: '2026-02-20T00:00:00.000Z', lastTriggeredAt: '2026-02-20T00:00:00.000Z', triggerCount: 1, entityLabel: 'MP-CORR-002' },
  { id: 'R3:monitoringPoints:MP-CORR-001', ruleId: 'R3', fingerprint: 'R3:monitoringPoints:MP-CORR-001', severity: 'warning', entityStore: 'monitoringPoints', entityId: 'MP-CORR-001', messageKey: 'rules.msg.R3', params: { code: 'MP-CORR-001', ei: 45 }, status: 'open', createdAt: '2026-06-10T00:00:00.000Z', lastTriggeredAt: '2026-06-10T00:00:00.000Z', triggerCount: 1, entityLabel: 'MP-CORR-001' }
];

async function seededRepos() {
  const store = storeApi.create(dbMemory.create());
  await seed.demo(store, { nowISO: SEED_NOW });
  for (const rec of GOLDEN_RECS) { await store.recommendations.save(rec, rec.lastTriggeredAt); }
  return store;
}

// ---- golden values (fijados tras corrida real sobre seed + fixtures) -------
// Ventana Q1-2026 sobre el seed: NINGUNA lectura/inspección cae en el periodo
// (todas a >= 80 d de 2026-09-15), ningún fallo/parada tampoco. El KPI de
// disponibilidad sí vale: los 18 activos sin override dan 100 % exacto con
// ventana 2136 h y 0 h de parada. CR media, % a tiempo y % datos válidos son
// null honestos (dato ausente), como fija la spec de T-11.
const GOLDEN_KPI_VALUES = [3, null, null, null, 100];
const GOLDEN_TIER_ROWS = [
  { tier: 'Tier 1', count: 0 },
  { tier: 'Tier 2', count: 0 },
  { tier: 'Tier 3', count: 3 },
  { tier: 'Tier 4', count: 0 }
];
// Tendencia: 12 meses UTC terminando en el mes del toISO (2025-04..2026-03).
// Un disparo Tier 3 por mes en enero (R9), febrero (R1) y marzo (R13); R15
// (fuera del conjunto) y R2 (resuelta) no suman; R3 (junio) cae fuera de la
// ventana. Ceros incluidos para que la sparkline ejecute recta.
const GOLDEN_TREND_LABELS = ['2025-04', '2025-05', '2025-06', '2025-07', '2025-08', '2025-09', '2025-10', '2025-11', '2025-12', '2026-01', '2026-02', '2026-03'];
const GOLDEN_TREND_Y = [0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1];
// Top accionables: rank de severía (critical > high > warning > info) y, en
// empate, fingerprint ascendente ('R13:' < 'R1:' porque '3' (0x33) < ':' (0x3a)).
const GOLDEN_RECS_ITEMS = [
  { text: 'R13:psvs:PSV-520-003 · critical' },
  { text: 'R1:monitoringPoints:MP-CORR-001 · critical' },
  { text: 'R9:apmAssets:APM-DN-001 · warning' },
  { textKey: 'reports.t11ActionReview' }
];
const GOLDEN_STANDARDS = [
  { id: 'IOGP 456', title: 'Supplementary guidance to API RP 754: Process Safety Performance Indicators' },
  { id: 'API RP 754', title: 'Process Safety Performance Indicators for the Refining and Petrochemical Industries' }
];

test('T-11 golden over seed + period fixture: tiers, KPIs, trend, recs, standards', async () => {
  const repos = await seededRepos();
  const m = await modelT11.buildT11Model({ repos, t, now: BUILD_NOW, period: PERIOD });

  assert.equal(m.id, 'T-11');
  assert.equal(m.meta.titleKey, 'reports.t11Title');
  assert.equal(m.meta.subtitleKey, 'reports.t11Subtitle');
  assert.deepEqual(m.meta.period, PERIOD);
  assert.equal(m.meta.generatedAtISO, new Date(BUILD_NOW).toISOString());
  assert.deepEqual(m.meta.footer, { textKey: 'reports.pageFooter', generatedKey: 'reports.generatedAt' });

  assert.deepEqual(m.sections.map((s) => s.type),
    ['cover', 'kpiRow', 'table', 'chart', 'list', 'text', 'standards', 'disclaimer']);

  const cover = m.sections[0];
  assert.equal(cover.titleKey, 'reports.t11Title');
  assert.deepEqual(cover.meta.period, { fromISO: '2026-01-01', toISO: '2026-03-31' });
  assert.equal(cover.meta.generatedAtISO, new Date(BUILD_NOW).toISOString());

  const kpis = m.sections[1].items;
  assert.deepEqual(kpis.map((k) => k.value), GOLDEN_KPI_VALUES);
  assert.deepEqual(kpis.map((k) => k.unit), [undefined, 'units.pct', 'units.pct', 'units.mpy', 'units.pct']);
  assert.deepEqual(kpis[0], { labelKey: 'reports.t11KpiTier3', value: 3 });

  const tiers = m.sections[2];
  assert.equal(tiers.titleKey, 'reports.t11TiersTable');
  assert.deepEqual(tiers.rows, GOLDEN_TIER_ROWS);
  assert.equal(tiers.noteKey, 'reports.t11TierNote');

  const chart = m.sections[3];
  assert.equal(chart.kind, 'trend');
  assert.equal(chart.titleKey, 'reports.t11TrendTitle');
  assert.deepEqual(chart.data.map((p) => p.label), GOLDEN_TREND_LABELS);
  assert.deepEqual(chart.data.map((p) => p.y), GOLDEN_TREND_Y);
  assert.deepEqual(chart.data.map((p) => p.x), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  assert.deepEqual(chart.axis, { x: 'reports.t11Month', y: 'reports.t11Count' });

  assert.deepEqual(m.sections[4].items, GOLDEN_RECS_ITEMS);

  assert.deepEqual(m.sections[5], {
    type: 'text',
    titleKey: 'reports.methodology',
    bodyKey: 'reports.t11MethodologyBody',
    noteKey: 'reports.t11MethodologySources',
    noteClass: 'report-methodology-sources'
  });

  assert.deepEqual(m.sections[6].items, GOLDEN_STANDARDS);
  assert.deepEqual(m.sections[7], { type: 'disclaimer', labelKey: 'reports.disclaimer' });

  // Coexistencia exigida por la spec: T-11 NO sustituye a 'quarterly'.
  const ids = registry.list().map((x) => x.id);
  assert.ok(ids.includes('quarterly'), 'quarterly sigue registrado');
  assert.equal(ids.filter((x) => x === 'T-11').length, 1);
});

test('T-11 Tier 1/2/4 mapping and the plan/quality probes over synthetic stores', async () => {
  const events = [
    { id: 'E1', assetId: 'A1', type: 'unplannedOutage', start: '2026-02-01T00:00:00.000Z', downtimeH: 12 },
    { id: 'E2', assetId: 'A2', type: 'failure', start: '2026-02-05T00:00:00.000Z', downtimeH: 4 },
    { id: 'E3', assetId: 'A2', type: 'failure', start: '2026-02-06T00:00:00.000Z', downtimeH: 0 },
    { id: 'E4', assetId: 'A2', type: 'failure', start: '2026-06-01T00:00:00.000Z', downtimeH: 6 },
    { id: 'E5', assetId: 'A1', type: 'maintenance', start: '2026-02-08T00:00:00.000Z', downtimeH: 2 }
  ];
  const recs = [
    { id: 'R1:m:1', ruleId: 'R1', fingerprint: 'R1:m:1', severity: 'critical', status: 'open', createdAt: '2026-02-10T00:00:00.000Z' },
    { id: 'R7:m:2', ruleId: 'R7', fingerprint: 'R7:m:2', severity: 'warning', status: 'open', lastTriggeredAt: '2025-10-15T00:00:00.000Z' },
    { id: 'R3:m:3', ruleId: 'R3', fingerprint: 'R3:m:3', severity: 'warning', status: 'acked', lastTriggeredAt: '2026-02-11T00:00:00.000Z' },
    { id: 'R16:p:4', ruleId: 'R16', fingerprint: 'R16:p:4', severity: 'high', status: 'open', lastTriggeredAt: '2026-02-12T00:00:00.000Z' }
  ];
  const inspections = [
    { id: 'I1', date: '2026-02-10', plannedDateISO: '2026-02-15' },
    { id: 'I2', date: '2026-03-20', plannedDateISO: '2026-03-10' },
    { id: 'I3', date: '2026-01-05' }
  ];
  const readings = [
    { id: 'RV1', date: '2026-02-01', crMpy: 5, quality: { mark: 'medido' } },
    { id: 'RV2', date: '2026-02-02', crMpy: 7, quality: { mark: 'medido' } },
    { id: 'RV3', date: '2026-02-03', crMpy: 3, quality: { mark: 'estimado' } },
    { id: 'RV4', date: '2026-02-04', crMpy: 4 },
    { id: 'RV5', date: '2026-06-01', crMpy: 99, quality: { mark: 'medido' } }
  ];
  const repos = {
    apmEvents: listRepo(events),
    recommendations: listRepo(recs),
    lineInspections: listRepo(inspections),
    readings: listRepo(readings)
  };
  const m = await modelT11.buildT11Model({ repos, t, now: BUILD_NOW, period: PERIOD });

  // Tier 1 = unplannedOutage con consecuencia (12 h). Tier 2 = failure con
  // downtimeH > 0 (E2; E3 con 0 h sin consecuencia NO cuenta; E4 fuera de
  // periodo). Tier 3 = solo abiertas R1–R14 en periodo (R1; R7 fuera de
  // periodo, R3 acuse no abierto, R16 fuera del conjunto). Tier 4 = 3.
  assert.deepEqual(m.sections[2].rows, [
    { tier: 'Tier 1', count: 1 },
    { tier: 'Tier 2', count: 1 },
    { tier: 'Tier 3', count: 1 },
    { tier: 'Tier 4', count: 3 }
  ]);

  const kpis = m.sections[1].items.map((k) => k.value);
  assert.deepEqual(kpis, [1, 50, 2 / 3 * 100, 4.75, null]);
  // % a tiempo: solo I1/I2 con plan (I3 sin plan fuera del denominador), 1/2.
  // % datos válidos: 2 medidos / 3 marcadas; RV4 viaja sin quality y NO entra
  // al denominador; la lectura RV5 (junio) cae fuera del periodo.
  // CR media sobre TODAS las lecturas del periodo con crMpy (4 registros).
  // Disponibilidad: sin apmAssets -> null honesto.

  // R7 (2025-10) cae en el MES 7 de la ventana 2025-04..2026-03; R1 (2026-02) en el 11.
  assert.deepEqual(m.sections[3].data.map((p) => p.y), [0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0]);
  assert.deepEqual(m.sections[4].items, [
    { text: 'R1:m:1 · critical' },
    { textKey: 'reports.t11ActionReview' }
  ]);
});

test('T-11 availability KPI consumes calc.apm the same way as quarterly (overrides + downtime)', async () => {
  const assets = [
    { id: 'A1', availabilityOverridePct: 95 },
    { id: 'A2', availabilityOverridePct: 80 },
    { id: 'A3' }
  ];
  const events = [
    { id: 'E1', assetId: 'A3', type: 'failure', start: '2026-02-01T00:00:00.000Z', downtimeH: 1068 },
    { id: 'E2', assetId: 'A3', type: 'maintenance', start: '2026-02-02T00:00:00.000Z', downtimeH: 60 },
    { id: 'E3', assetId: 'A3', type: 'failure', start: '2026-04-08T00:00:00.000Z', downtimeH: 1068 }
  ];
  const m = await modelT11.buildT11Model({
    repos: { apmAssets: listRepo(assets), apmEvents: listRepo(events) }, t, now: BUILD_NOW, period: PERIOD
  });
  // Ventana Q1 = 2136 h. A3: (2136 − 1068 − 60)/2136·100 = 47.191011235955056…
  // E3 (8-abr) NO fuga al periodo: el borde superior se acota (corrección
  // documentada sobre model-quarterly). Media (95 + 80 + 47.19…) / 3.
  const perAsset = (2136 - 1128) / 2136 * 100;
  assert.equal(m.sections[1].items[4].value, (95 + 80 + perAsset) / 3);
});

test('T-11 omits the trend chart with a note when the window has no Tier 3 at all', async () => {
  const repos = {
    recommendations: listRepo([
      { id: 'R1:m:1', ruleId: 'R1', fingerprint: 'R1:m:1', severity: 'critical', status: 'open', lastTriggeredAt: '2026-02-10T00:00:00.000Z' }
    ])
  };
  const m = await modelT11.buildT11Model({ repos, t, now: BUILD_NOW, period: { fromISO: '2026-02-01', toISO: '2026-02-28' } });
  assert.equal(m.sections[3].type, 'chart');

  const empty = await modelT11.buildT11Model({ repos: {}, t, now: BUILD_NOW, period: PERIOD });
  assert.deepEqual(empty.sections[3], {
    type: 'text', titleKey: 'reports.t11TrendTitle', bodyKey: 'reports.t11TrendNote'
  });
});

test('T-11 model is pure: all five consumed stores are not mutated (snapshot)', async () => {
  const repos = await seededRepos();
  const names = ['readings', 'recommendations', 'apmAssets', 'apmEvents', 'lineInspections'];
  const before2 = JSON.stringify(await Promise.all(names.map((n) => repos[n].list())));
  await modelT11.buildT11Model({ repos, t, now: BUILD_NOW, period: PERIOD });
  const after2 = JSON.stringify(await Promise.all(names.map((n) => repos[n].list())));
  assert.equal(after2, before2, 'input records untouched');
});

// Collect every value of the translation-key properties used by the model.
function collectKeys(node, acc) {
  if (node === null || typeof node !== 'object') { return acc; }
  if (Array.isArray(node)) { node.forEach((n) => collectKeys(n, acc)); return acc; }
  for (const key of ['titleKey', 'labelKey', 'textKey', 'emptyKey', 'noteKey', 'bodyKey', 'unit']) {
    if (typeof node[key] === 'string') { acc.add(node[key]); }
  }
  if (node.axis) {
    if (typeof node.axis.x === 'string') { acc.add(node.axis.x); }
    if (typeof node.axis.y === 'string') { acc.add(node.axis.y); }
  }
  for (const k of Object.keys(node)) { collectKeys(node[k], acc); }
  return acc;
}

function resolveKey(obj, dotted) {
  return dotted.split('.').reduce((cur, part) => (cur && typeof cur === 'object' ? cur[part] : undefined), obj);
}

test('every translation key used by the T-11 model exists in es.js', async () => {
  const repos = await seededRepos();
  const m = await modelT11.buildT11Model({ repos, t, now: BUILD_NOW, period: PERIOD });
  const keys = collectKeys(m, new Set());
  keys.add('reports.t11Title');
  keys.add('reports.t11Subtitle');
  assert.ok(keys.size >= 20, 'expected the full key set, got ' + keys.size);
  for (const key of keys) {
    assert.ok(typeof resolveKey(es, key) === 'string', 'es.js missing key "' + key + '"');
  }
});

test('T-11 is registered in the report registry exactly once', () => {
  const entry = registry.get('T-11');
  assert.ok(entry, 'T-11 present');
  assert.equal(entry.titleKey, 'reports.t11Title');
  assert.deepEqual(entry.needs, ['period']);
  assert.deepEqual(modelT11.TIER3_RULE_IDS, ['R1', 'R2', 'R3', 'R4', 'R5', 'R6', 'R7', 'R8', 'R9', 'R10', 'R11', 'R12', 'R13', 'R14']);
  assert.throws(() => registry.register({ id: 'T-11', titleKey: 'x', needs: [], buildModel: () => Promise.resolve({}) }),
    /duplicate report template: T-11/);
});

// ---- render helpers (same shape as report-t03/t09 tests) --------------------
function outline(el) { return shim.elementToOutline(el); }
function classTokens(node) {
  return (node && typeof node.class === 'string') ? node.class.split(/\s+/).filter(Boolean) : [];
}
function hasClass(node, name) { return classTokens(node).includes(name); }
function findAll(node, predicate) {
  const acc = [];
  (function walk(n) {
    if (!n) { return; }
    if (predicate(n)) { acc.push(n); }
    (n.children || []).forEach(walk);
  })(node);
  return acc;
}

test('buildReport end-to-end renders the T-11 model incl. trend chart and standards', async () => {
  const repos = await seededRepos();
  const doc = await registry.build('T-11', { repos, t, now: BUILD_NOW, period: PERIOD });
  const root = outline(doc);

  assert.equal(root.tag, 'div');
  assert.ok(hasClass(root, 'print-root') && hasClass(root, 'report') && hasClass(root, 'report-T-11'));

  const header = (root.children || []).find((c) => c.tag === 'header' && hasClass(c, 'report-cover'));
  const h1 = header ? (header.children || []).find((c) => c.tag === 'h1') : null;
  assert.equal(h1 && h1.text, 'reports.t11Title');
  assert.ok(findAll(header, (n) => n.tag === 'p' && hasClass(n, 'report-cover-period')).length === 1);

  const sections = (root.children || []).filter((c) => c.tag === 'section' && hasClass(c, 'report-section'));
  assert.deepEqual(sections.map((s) => (s.children || [])[0].text), [
    'reports.kpis',
    'reports.t11TiersTable',
    'reports.t11TrendTitle',
    'reports.t11RecsTitle',
    'reports.methodology',
    'reports.standardsApplied'
  ]);

  const tables = findAll(root, (n) => n.tag === 'div' && hasClass(n, 'report-table'));
  const tierTbody = tables[0].children.find((c) => c.tag === 'table').children.find((c) => c.tag === 'tbody');
  assert.equal((tierTbody.children || []).filter((c) => c.tag === 'tr').length, 4);
  const tfoot = tables[0].children.find((c) => c.tag === 'table').children.find((c) => c.tag === 'tfoot');
  assert.ok(tfoot, 'tier table carries the mapping note');
  const stdTbody = tables[1].children.find((c) => c.tag === 'table').children.find((c) => c.tag === 'tbody');
  assert.equal((stdTbody.children || []).filter((c) => c.tag === 'tr').length, 2);

  const fig = findAll(root, (n) => n.tag === 'figure' && hasClass(n, 'report-chart-wrap'))[0];
  assert.ok(fig, 'trend chart rendered');
  assert.equal(findAll(fig, (n) => n.tag === 'svg').length, 1, 'charts.trend produced the SVG');

  const ul = findAll(root, (n) => n.tag === 'ul' && hasClass(n, 'report-list'))[0];
  assert.equal((ul.children || []).filter((c) => c.tag === 'li').length, 4);

  const bodyP = findAll(root, (n) => n.tag === 'p' && hasClass(n, 'report-text'));
  assert.equal(bodyP.length, 1);
  assert.equal(bodyP[0].text, 'reports.t11MethodologyBody');
  const noteP = findAll(root, (n) => n.tag === 'p' && hasClass(n, 'report-methodology-sources'));
  assert.equal(noteP.length, 1);
  assert.equal(noteP[0].text, 'reports.t11MethodologySources');

  assert.equal(findAll(root, (n) => n.tag === 'div' && hasClass(n, 'report-disclaimer')).length, 1);
  assert.ok(findAll(root, (n) => n.tag === 'footer' && hasClass(n, 'report-footer')).length === 1);
});
