/* IntegrityWatch Field — T-09 confiabilidad y disponibilidad report model tests
   GOLDEN seed: exact MTBF/MTTR/availability doubles from a real run over the
   deterministic demo seed (seed.js, NOW 2026-09-15, build now fixed at
   2026-11-03T12:00:00Z), all-sector and per-sector, plus a period-bounded
   window. Covers: purity (no-mutation snapshot), ISO-14224 cause mapping and
   trend omission rule, i18n keys exist in es.js, T-09 in registry (idempotent,
   duplicate-safe) and buildReport end-to-end through registry + renderer
   including the trend chart. */
'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');

const shim = require('./helpers/dom-shim');
require('../src/calc/units.js');
require('../src/calc/apm.js');
require('../src/data/standards.js');
const dbMemory = require('../src/core/dbMemory.js');
const storeApi = require('../src/core/store.js');
const seed = require('../src/data/seed.js');
require('../src/reports/model.js');
require('../src/reports/charts.js');
require('../src/reports/registry.js');
require('../src/reports/renderer.js');
const modelT09 = require('../src/reports/model-t09.js');
const registry = require('../src/reports/registry.js');
const es = require('../src/i18n/locales/es.js');

const t = (key) => key;
const SEED_NOW = '2026-09-15T00:00:00.000Z';
const BUILD_NOW = '2026-11-03T12:00:00.000Z';

before(() => shim.install());
after(() => shim.uninstall());

function seededRepos() {
  const store = storeApi.create(dbMemory.create());
  return seed.demo(store, { nowISO: SEED_NOW }).then(() => store);
}

// ---- golden values (fijados tras corrida real sobre el seed demo) ----------
// Ventana por defecto: [BUILD_NOW-90d, BUILD_NOW) = 2160 h, anclada en opts.now
// (igual que computeMetrics en views/apm.js). En el seed, 11 eventos caen en la
// ventana; solo PMP-02 (3 fallos, 26 h parada), PPS-01 (1, 224 h con la parada
// no planificada) y PUMP-201A (1, 8 h) tienen MTBF; ESP-01 y GEN-101 solo
// mantenimiento. Los doubles son el IEEE exacto de la división real, no
// aproximaciones decimales:
//   PMP-02     mtbf = (2160-26)/3 = 711.3333333333334  mttr = 26/3
//   PPS-01     mtbf = (2160-224)/1 = 1936              mttr = 224
//   PUMP-201A  mtbf = (2160-8)/1  = 2152               mttr = 8
const GOLDEN_KPIS = [99.31069958847736, 1599.777777777778, 80.22222222222221, 99.31069958847736, 0.0023148148148148147];
// Media de disponibilidad sobre los 18 activos del seed (15 sin parada = 100).
// failureRate flota = 5 fallos / 2160 h.
const GOLDEN_TOP_ROWS = [
  { code: 'PMP-02', category: 'pump', events: 3, mtbf: 711.3333333333334, mttr: 8.666666666666666, availability: 98.79629629629629 },
  { code: 'PPS-01', category: 'pumpStation', events: 2, mtbf: 1936, mttr: 224, availability: 89.62962962962962 },
  { code: 'PUMP-201A', category: 'centrifugalPump', events: 1, mtbf: 2152, mttr: 8, availability: 99.62962962962963 },
  { code: 'C-501', category: 'compressorStation', events: 0, mtbf: null, mttr: null, availability: 100 }
];
// El seed no registra apmAssets.iso14224.failureMode: la causa de cada evento
// de fallo cae al fallback real del evento, su `type` ('failure'). 5 fallos en
// la ventana -> una única fila Pareto al 100 %.
const GOLDEN_PARETO = [{ cause: 'failure', count: 5, share: 100 }];
// Serie mensual completa (todo el histórico, no la ventana): meses UTC con >=1
// fallo. Mes = horas calendario: 2026-04 (30 d, 2 fallos, 34 h parada) -> 343;
// 2026-09 (30 d, 3 fallos, 40 h) -> 226.66666666666666.
const GOLDEN_TREND = [
  { x: 1, y: 343, label: '2026-04' },
  { x: 2, y: 722, label: '2026-05' },
  { x: 3, y: 704, label: '2026-06' },
  { x: 4, y: 618, label: '2026-07' },
  { x: 5, y: 255, label: '2026-08' },
  { x: 6, y: 226.66666666666666, label: '2026-09' }
];

test('T-09 golden model over the demo seed: KPIs, table, Pareto, trend, actions', async () => {
  const repos = await seededRepos();
  const m = await modelT09.buildT09Model({ repos, t, now: BUILD_NOW });

  assert.equal(m.id, 'T-09');
  assert.equal(m.meta.titleKey, 'reports.t09Title');
  assert.equal(m.meta.generatedAtISO, new Date(BUILD_NOW).toISOString());
  assert.deepEqual(m.sections.map((s) => s.type), ['cover', 'kpiRow', 'table', 'table', 'chart', 'list', 'standards']);

  const kpis = m.sections[1].items;
  assert.deepEqual(kpis.map((k) => k.value), GOLDEN_KPIS);
  assert.deepEqual(kpis.map((k) => k.unit), ['units.pct', 'units.h', 'units.h', 'units.pct', 'units.perH']);

  const assets = m.sections[2];
  assert.equal(assets.rows.length, 18);
  assert.deepEqual(assets.rows.slice(0, 4), GOLDEN_TOP_ROWS);
  assert.deepEqual(assets.columns.map((c) => c.key), ['code', 'category', 'events', 'mtbf', 'mttr', 'availability']);
  assert.equal(assets.noteKey, 'reports.t09AssetsNote');

  assert.deepEqual(m.sections[3].rows, GOLDEN_PARETO);

  const chart = m.sections[4];
  assert.equal(chart.kind, 'trend');
  assert.equal(chart.titleKey, 'reports.t09MtbfTrend');
  assert.deepEqual(chart.data, GOLDEN_TREND);
  assert.deepEqual(chart.axis, { x: 'reports.t09Month', y: 'apm.mtbf' });

  assert.deepEqual(m.sections[5].items, [
    { text: 'PMP-02 · MTBF 711.3 h · ×3' },
    { text: 'PPS-01 · MTBF 1936 h · ×1' },
    { text: 'PUMP-201A · MTBF 2152 h · ×1' },
    { textKey: 'reports.t09ActionReview' }
  ]);

  assert.deepEqual(m.sections[6].items, [
    { id: 'ISO 55000', title: 'Asset management — Overview, principles and terminology' },
    { id: 'ISO 14224', title: 'Petroleum, petrochemical and natural gas industries — Collection and exchange of reliability and maintenance data' }
  ]);
  assert.deepEqual(m.disclaimer, { type: 'disclaimer', labelKey: 'reports.disclaimer' });
});

test('T-09 sector filter recomputes every block over the sector only', async () => {
  const repos = await seededRepos();
  const m = await modelT09.buildT09Model({ repos, t, now: BUILD_NOW, sector: 'downstream' });

  assert.deepEqual(m.sections[1].items.map((k) => k.value),
    [99.75925925925927, 711.3333333333334, 8.666666666666666, 99.75925925925927, 0.001388888888888889]);
  assert.equal(m.sections[2].rows.length, 5);
  assert.deepEqual(m.sections[2].rows.map((r) => r.code), ['PMP-02', 'COL-01', 'FT-201', 'HEX-01', 'PUMP-305']);
  assert.deepEqual(m.sections[3].rows, [{ cause: 'failure', count: 3, share: 100 }]);
});

test('T-09 period option bounds the window from both sides and lands on the cover', async () => {
  const repos = await seededRepos();
  const m = await modelT09.buildT09Model({
    repos, t, now: BUILD_NOW,
    period: { fromISO: '2026-08-01T00:00:00.000Z', toISO: '2026-09-01T00:00:00.000Z' }
  });

  // Agosto 2026: 2 fallos (EV-015, EV-016, ambos PMP-02), 18 h de parada de
  // PMP-02 + 6 h (EV-017) + 4 h... = ventana 744 h; mtbf PMP-02 = (744-18)/2.
  assert.deepEqual(m.sections[1].items.map((k) => k.value),
    [98.25268817204301, 363, 9, 98.25268817204301, 0.002688172043010753]);
  assert.equal(m.sections[3].rows[0].count, 2, 'events after toISO must NOT leak into a past period');
  assert.deepEqual(m.sections[0].meta.period, { fromISO: '2026-08-01T00:00:00.000Z', toISO: '2026-09-01T00:00:00.000Z' });
});

test('T-09 Pareto prefers the ISO 14224 failure mode of the asset when registered', async () => {
  const assets = [
    { id: 'A1', code: 'P-1', category: 'pump', sector: 'downstream', iso14224: { failureMode: 'wear' } },
    { id: 'A2', code: 'P-2', category: 'pump', sector: 'downstream' }
  ];
  const events = [
    { id: 'E1', assetId: 'A1', type: 'failure', start: '2026-10-20T00:00:00.000Z', downtimeH: 4 },
    { id: 'E2', assetId: 'A1', type: 'failure', start: '2026-10-25T00:00:00.000Z', downtimeH: 6 },
    { id: 'E3', assetId: 'A2', type: 'failure', start: '2026-10-26T00:00:00.000Z', downtimeH: 2 }
  ];
  const repos = { apmAssets: { list: async () => assets }, apmEvents: { list: async () => events } };
  const m = await modelT09.buildT09Model({ repos, t, now: '2026-10-31T00:00:00.000Z' });
  assert.deepEqual(m.sections[3].rows, [
    { cause: 'wear', count: 2, share: 66.66666666666666 },
    { cause: 'failure', count: 1, share: 33.33333333333333 }
  ], 'A1 failures group under its ISO mode; A2 falls back to the event type');
});

test('T-09 omits the MTBF trend with a note when fewer than 3 months have failures', async () => {
  const assets = [{ id: 'A1', code: 'A1', category: 'pump', sector: 'downstream' }];
  const events = [
    { id: 'E1', assetId: 'A1', type: 'failure', start: '2026-08-10T00:00:00.000Z', downtimeH: 4 },
    { id: 'E2', assetId: 'A1', type: 'failure', start: '2026-09-10T00:00:00.000Z', downtimeH: 6 }
  ];
  const repos = { apmAssets: { list: async () => assets }, apmEvents: { list: async () => events } };
  const m = await modelT09.buildT09Model({ repos, t, now: '2026-09-20T00:00:00.000Z' });
  assert.deepEqual(m.sections[4], { type: 'text', titleKey: 'reports.t09MtbfTrend', bodyKey: 'reports.t09TrendNote' });
});

test('T-09 model is pure: seeded assets and events are not mutated (snapshot)', async () => {
  const repos = await seededRepos();
  const snapshot = JSON.stringify([
    await repos.apmAssets.list(),
    await repos.apmEvents.list()
  ]);
  await modelT09.buildT09Model({ repos, t, now: BUILD_NOW, sector: 'downstream' });
  const after2 = JSON.stringify([
    await repos.apmAssets.list(),
    await repos.apmEvents.list()
  ]);
  assert.equal(after2, snapshot, 'input records untouched');
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

test('every translation key used by the T-09 model exists in es.js', async () => {
  const repos = await seededRepos();
  const m = await modelT09.buildT09Model({ repos, t, now: BUILD_NOW });
  const keys = collectKeys(m, new Set());
  keys.add('reports.t09Title');
  assert.ok(keys.size >= 20, 'expected the full key set, got ' + keys.size);
  for (const key of keys) {
    assert.ok(typeof resolveKey(es, key) === 'string', 'es.js missing key "' + key + '"');
  }
});

test('T-09 is registered in the report registry exactly once', async () => {
  const entry = registry.get('T-09');
  assert.ok(entry, 'T-09 present');
  assert.equal(entry.titleKey, 'reports.t09Title');
  assert.deepEqual(entry.needs, []);
  const repos = await seededRepos();
  await modelT09.buildT09Model({ repos, t, now: BUILD_NOW });
  await modelT09.buildT09Model({ repos, t, now: BUILD_NOW });
  const t09 = registry.list().filter((x) => x.id === 'T-09');
  assert.equal(t09.length, 1, 'idempotent registerSelf does not duplicate');
  assert.throws(() => registry.register({ id: 'T-09', titleKey: 'x', needs: [], buildModel: () => Promise.resolve({}) }),
    /duplicate report template: T-09/);
});

// ---- render helpers (same shape as report-t03.test.js) ----------------------
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

test('buildReport end-to-end renders the T-09 model incl. the trend chart', async () => {
  const repos = await seededRepos();
  const doc = await registry.build('T-09', { repos, t, now: BUILD_NOW });
  const root = outline(doc);

  assert.equal(root.tag, 'div');
  assert.ok(hasClass(root, 'print-root') && hasClass(root, 'report') && hasClass(root, 'report-T-09'));

  const header = (root.children || []).find((c) => c.tag === 'header' && hasClass(c, 'report-cover'));
  const h1 = header ? (header.children || []).find((c) => c.tag === 'h1') : null;
  assert.equal(h1 && h1.text, 'reports.t09Title');

  const sections = (root.children || []).filter((c) => c.tag === 'section' && hasClass(c, 'report-section'));
  assert.deepEqual(sections.map((s) => (s.children || [])[0].text), [
    'reports.kpis',
    'reports.t09Assets',
    'reports.t09Pareto',
    'reports.t09MtbfTrend',
    'reports.t09Actions',
    'reports.standardsApplied'
  ]);

  const tables = findAll(root, (n) => n.tag === 'div' && hasClass(n, 'report-table'));
  const assetsTbody = tables[0].children.find((c) => c.tag === 'table').children.find((c) => c.tag === 'tbody');
  assert.equal((assetsTbody.children || []).filter((c) => c.tag === 'tr').length, 18);
  const paretoTbody = tables[1].children.find((c) => c.tag === 'table').children.find((c) => c.tag === 'tbody');
  assert.equal((paretoTbody.children || []).filter((c) => c.tag === 'tr').length, 1);

  const fig = findAll(root, (n) => n.tag === 'figure' && hasClass(n, 'report-chart-wrap'))[0];
  assert.ok(fig, 'trend chart rendered');
  assert.ok(findAll(fig, (n) => n.tag === 'svg').length === 1, 'charts.trend produced the SVG');

  const lis = findAll(root, (n) => n.tag === 'ul' && hasClass(n, 'report-list'))[0];
  assert.equal((lis.children || []).filter((c) => c.tag === 'li').length, 4);

  assert.equal(findAll(root, (n) => n.tag === 'div' && hasClass(n, 'report-disclaimer')).length, 1);
  assert.ok(findAll(root, (n) => n.tag === 'footer' && hasClass(n, 'report-footer')).length === 1);
  assert.equal(findAll(root, (n) => n.tag === 'p' && hasClass(n, 'report-cover-generated') && n.text.indexOf('reports.generatedAt') === 0).length, 1,
    'deterministic generated-at line rendered from opts.now');
});
