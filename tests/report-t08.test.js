/* IntegrityWatch Field — T-08 risk-based inspection (RBI) report model tests
    GOLDEN seed: exact numbers over the deterministic demo seed (seed.js,
    NOW 2026-09-15). The seed apmAssets DO carry real rbi objects
    ({pof, cof, inspectionBaseMonths: 24} and nextInspectionISO on only 3 of
    the 18 assets — verified in seed.js buildApmAssets), so no augmentation is
    needed here: the goldens are pure seed values at BUILD_NOW.
    Covers: golden KPIs/matrix cells/table rows/plan, sector filter, empty
    case, purity (no-mutation snapshot), i18n keys exist in es.js, T-08 in
    registry (idempotent, duplicate-safe) and buildReport end-to-end through
    the registry + renderer with the 5×5 matrix actually rendered (console.warn
    captured: must be clean, no 'unknown' chart-type warning). */
'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');

const shim = require('./helpers/dom-shim');
require('../src/calc/apm.js');
require('../src/data/standards.js');
const dbMemory = require('../src/core/dbMemory.js');
const storeApi = require('../src/core/store.js');
const seed = require('../src/data/seed.js');
require('../src/reports/model.js');
require('../src/reports/charts.js');
require('../src/reports/registry.js');
require('../src/reports/renderer.js');
const modelT08 = require('../src/reports/model-t08.js');
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

function fakeRepos(assets) {
  return { apmAssets: { list: async () => assets } };
}

// ---- golden values (fijados tras corrida real sobre el seed) ----------------
// 18 activos semilla con rbi {pof, cof, inspectionBaseMonths: 24}; solo 3 con
// rbi.nextInspectionISO: HEX-01 (SEED−45 d = 2026-08-01, atraso 94 d),
// FP-01 (SEED−40 d = 2026-08-06, atraso 89 d), PUMP-201A (SEED−4 d =
// 2026-09-11, atraso 53 d) respecto de BUILD_NOW 2026-11-03T12:00Z.
// score = POF×COF vía apm.rbiRisk; banda: ≤4 low, ≤9 medium, ≤15 high, >15
// veryHigh; intervalo vía inspectionIntervalMonths sobre base 24 (low 24,
// medium 18, high 12, veryHigh 6). Orden tabla: score desc, code asc.
// Confianza por activo = campos RBI presentes (pof, cof, base, próxima fecha)
// sobre 4; media = (15×0.75 + 3×1)/18 = 79.166…% → 79.17.
const GOLDEN_ROWS = [
  { code: 'HEX-01', pof: 5, cof: 4, score: 20, band: 'veryHigh', intervalMonths: 6, nextInspection: '2026-08-01T00:00:00.000Z', daysLate: 94 },
  { code: 'PMP-02', pof: 4, cof: 5, score: 20, band: 'veryHigh', intervalMonths: 6, nextInspection: null, daysLate: null },
  { code: 'ESP-01', pof: 4, cof: 4, score: 16, band: 'veryHigh', intervalMonths: 6, nextInspection: null, daysLate: null },
  { code: 'PLAT-01', pof: 3, cof: 5, score: 15, band: 'high', intervalMonths: 12, nextInspection: null, daysLate: null },
  { code: 'C-501', pof: 3, cof: 4, score: 12, band: 'high', intervalMonths: 12, nextInspection: null, daysLate: null },
  { code: 'FT-201', pof: 4, cof: 3, score: 12, band: 'high', intervalMonths: 12, nextInspection: null, daysLate: null },
  { code: 'PL-16', pof: 3, cof: 4, score: 12, band: 'high', intervalMonths: 12, nextInspection: null, daysLate: null },
  { code: 'PUMP-201A', pof: 3, cof: 4, score: 12, band: 'high', intervalMonths: 12, nextInspection: '2026-09-11T00:00:00.000Z', daysLate: 53 },
  { code: 'FP-01', pof: 2, cof: 5, score: 10, band: 'high', intervalMonths: 12, nextInspection: '2026-08-06T00:00:00.000Z', daysLate: 89 },
  { code: 'FPS-01', pof: 2, cof: 5, score: 10, band: 'high', intervalMonths: 12, nextInspection: null, daysLate: null },
  { code: 'GEN-101', pof: 2, cof: 5, score: 10, band: 'high', intervalMonths: 12, nextInspection: null, daysLate: null },
  { code: 'PPS-01', pof: 3, cof: 3, score: 9, band: 'medium', intervalMonths: 18, nextInspection: null, daysLate: null },
  { code: 'WELL-01', pof: 2, cof: 4, score: 8, band: 'medium', intervalMonths: 18, nextInspection: null, daysLate: null },
  { code: 'GP-01', pof: 2, cof: 3, score: 6, band: 'medium', intervalMonths: 18, nextInspection: null, daysLate: null },
  { code: 'PUMP-305', pof: 2, cof: 3, score: 6, band: 'medium', intervalMonths: 18, nextInspection: null, daysLate: null },
  { code: 'SEP-7', pof: 2, cof: 3, score: 6, band: 'medium', intervalMonths: 18, nextInspection: null, daysLate: null },
  { code: 'TK-101', pof: 2, cof: 3, score: 6, band: 'medium', intervalMonths: 18, nextInspection: null, daysLate: null },
  { code: 'COL-01', pof: 2, cof: 2, score: 4, band: 'low', intervalMonths: 24, nextInspection: null, daysLate: null }
];

// Celdas de la matriz 5×5 (x = POF, y = COF) en el shape exacto de
// IW.reports.charts.matrix: {x, y, ids, count}, ordenadas x asc, y asc, ids asc.
const GOLDEN_CELLS = [
  { x: 2, y: 2, ids: ['COL-01'], count: 1 },
  { x: 2, y: 3, ids: ['GP-01', 'PUMP-305', 'SEP-7', 'TK-101'], count: 4 },
  { x: 2, y: 4, ids: ['WELL-01'], count: 1 },
  { x: 2, y: 5, ids: ['FP-01', 'FPS-01', 'GEN-101'], count: 3 },
  { x: 3, y: 3, ids: ['PPS-01'], count: 1 },
  { x: 3, y: 4, ids: ['C-501', 'PL-16', 'PUMP-201A'], count: 3 },
  { x: 3, y: 5, ids: ['PLAT-01'], count: 1 },
  { x: 4, y: 3, ids: ['FT-201'], count: 1 },
  { x: 4, y: 4, ids: ['ESP-01'], count: 1 },
  { x: 4, y: 5, ids: ['PMP-02'], count: 1 },
  { x: 5, y: 4, ids: ['HEX-01'], count: 1 }
];

const GOLDEN_PLAN = [
  { textKey: 'reports.t08ActionOverdue' },
  { textKey: 'reports.t08ActionVeryHigh' },
  { textKey: 'reports.t08ActionHigh' },
  { textKey: 'reports.t08ActionNoDate' },
  { textKey: 'reports.t08ActionReview' }
];

const GOLDEN_STANDARDS = [
  { id: 'API 580', title: 'Risk-Based Inspection' },
  { id: 'API 581', title: 'Risk-Based Inspection Methodology' },
  { id: 'ISO 55000', title: 'Asset management — Overview, principles and terminology' }
];

// Table rows projected onto the asserted subset (sector and criticality
// columns exist on the rows too; the golden checks the RBI-relevant fields).
function project(rows) {
  return rows.map((r) => ({
    code: r.code, pof: r.pof, cof: r.cof, score: r.score, band: r.band,
    intervalMonths: r.intervalMonths, nextInspection: r.nextInspection, daysLate: r.daysLate
  }));
}

test('T-08 golden model over the seed: exact scores, bands, intervals, lateness, matrix and KPIs', async () => {
  const repos = await seededRepos();
  const m = await modelT08.buildT08Model({ repos, t, now: BUILD_NOW });

  assert.equal(m.id, 'T-08');
  assert.equal(m.meta.titleKey, 'reports.t08Title');
  assert.equal(m.meta.generatedAtISO, new Date(BUILD_NOW).toISOString());
  assert.deepEqual(m.sections.map((s) => s.type), ['cover', 'kpiRow', 'chart', 'table', 'list', 'standards']);

  const kpis = m.sections[1].items;
  assert.deepEqual(kpis.map((k) => k.value), [18, 11, 3, 79.17], 'evaluated / high+veryHigh / overdue / confidence %');
  assert.deepEqual(kpis.map((k) => k.labelKey), ['reports.t08KpiEvaluated', 'reports.t08KpiHighBand', 'reports.t08KpiOverdue', 'reports.t08KpiConfidence']);
  assert.equal(kpis[3].unit, 'units.pct');

  const chart = m.sections[2];
  assert.equal(chart.kind, 'matrix');
  assert.equal(chart.titleKey, 'reports.t08MatrixTitle');
  assert.deepEqual(chart.data.cells, GOLDEN_CELLS);
  assert.deepEqual(chart.axis, { x: 'apm.pof', y: 'apm.cof' });

  const table = m.sections[3];
  assert.equal(table.titleKey, 'apm.rbi');
  assert.equal(table.emptyKey, 'reports.noData');
  assert.equal(table.noteKey, 'reports.t08NoDateNote');
  assert.deepEqual(table.columns.map((c) => c.key), ['code', 'pof', 'cof', 'score', 'band', 'intervalMonths', 'nextInspection', 'daysLate']);
  assert.deepEqual(project(table.rows), GOLDEN_ROWS);

  assert.deepEqual(m.sections[4].items, GOLDEN_PLAN);
  assert.equal(m.sections[4].titleKey, 'reports.t08Plan');

  assert.deepEqual(m.sections[5].items, GOLDEN_STANDARDS);
  assert.deepEqual(m.disclaimer, { type: 'disclaimer', labelKey: 'reports.disclaimer' });
});

test('T-08 sector filter keeps only downstream assets and rescales KPIs/plan', async () => {
  const repos = await seededRepos();
  const m = await modelT08.buildT08Model({ repos, t, now: BUILD_NOW, sector: 'downstream' });
  // downstream: HEX-01 (20 vH, 94 d vencido), PMP-02 (20 vH), FT-201 (12 high),
  // PUMP-305 (6 medium), COL-01 (4 low). Confianza media = 4.0/5 = 80 %.
  assert.deepEqual(m.sections[1].items.map((k) => k.value), [5, 3, 1, 80]);
  assert.deepEqual(m.sections[2].data.cells, [
    { x: 2, y: 2, ids: ['COL-01'], count: 1 },
    { x: 2, y: 3, ids: ['PUMP-305'], count: 1 },
    { x: 4, y: 3, ids: ['FT-201'], count: 1 },
    { x: 4, y: 5, ids: ['PMP-02'], count: 1 },
    { x: 5, y: 4, ids: ['HEX-01'], count: 1 }
  ]);
  assert.deepEqual(m.sections[3].rows.map((r) => r.code), ['HEX-01', 'PMP-02', 'FT-201', 'PUMP-305', 'COL-01']);
  assert.deepEqual(m.sections[4].items, GOLDEN_PLAN);
});

test('T-08 with no assets: zeroed KPIs, empty matrix/table/plan', async () => {
  const m = await modelT08.buildT08Model({ repos: fakeRepos([]), t, now: BUILD_NOW });
  assert.deepEqual(m.sections[1].items.map((k) => k.value), [0, 0, 0, 0]);
  assert.deepEqual(m.sections[2].data.cells, []);
  assert.deepEqual(m.sections[3].rows, []);
  assert.deepEqual(m.sections[4].items, []);
});

test('T-08 skips assets without usable rbi (no pof/cof) without inventing bands', async () => {
  const assets = [
    { id: 'A1', code: 'A-1', sector: 'upstream', rbi: { pof: 3, cof: 3, inspectionBaseMonths: 24 } },
    { id: 'A2', code: 'A-2', sector: 'upstream', rbi: { inspectionBaseMonths: 24 } },
    { id: 'A3', code: 'A-3', sector: 'upstream' }
  ];
  const m = await modelT08.buildT08Model({ repos: fakeRepos(assets), t, now: BUILD_NOW });
  assert.deepEqual(m.sections[1].items.map((k) => k.value), [1, 0, 0, 75]);
  assert.deepEqual(m.sections[3].rows.map((r) => r.code), ['A-1']);
});

test('T-08 model is pure: input assets are not mutated (snapshot)', async () => {
  const repos = await seededRepos();
  const assets = await repos.apmAssets.list();
  const snapshot = JSON.stringify(assets);
  await modelT08.buildT08Model({ repos, t, now: BUILD_NOW });
  const afterList = await repos.apmAssets.list();
  assert.equal(JSON.stringify(afterList), snapshot, 'input assets untouched');
});

// Collect every value of the translation-key properties used by the model.
function collectKeys(node, acc) {
  if (node === null || typeof node !== 'object') { return acc; }
  if (Array.isArray(node)) { node.forEach((n) => collectKeys(n, acc)); return acc; }
  for (const key of ['titleKey', 'labelKey', 'textKey', 'emptyKey', 'noteKey', 'unit']) {
    if (typeof node[key] === 'string') { acc.add(node[key]); }
  }
  // axis keys are translation keys too (renderer translates axis.x/axis.y).
  if (node.axis && typeof node.axis === 'object') {
    for (const a of ['x', 'y']) { if (typeof node.axis[a] === 'string') { acc.add(node.axis[a]); } }
  }
  for (const k of Object.keys(node)) { if (k !== 'axis') { collectKeys(node[k], acc); } }
  return acc;
}

function resolveKey(obj, dotted) {
  return dotted.split('.').reduce((cur, part) => (cur && typeof cur === 'object' ? cur[part] : undefined), obj);
}

test('every translation key used by the T-08 model exists in es.js', async () => {
  const repos = await seededRepos();
  const m = await modelT08.buildT08Model({ repos, t, now: BUILD_NOW });
  const keys = collectKeys(m, new Set());
  keys.add('reports.t08Title');
  assert.ok(keys.size >= 20, 'expected the full key set, got ' + keys.size);
  for (const key of keys) {
    assert.ok(typeof resolveKey(es, key) === 'string', 'es.js missing key "' + key + '"');
  }
});

test('T-08 is registered in the report registry exactly once', async () => {
  const entry = registry.get('T-08');
  assert.ok(entry, 'T-08 present');
  assert.equal(entry.titleKey, 'reports.t08Title');
  assert.deepEqual(entry.needs, []);
  const repos = await seededRepos();
  await modelT08.buildT08Model({ repos, t, now: BUILD_NOW });
  await modelT08.buildT08Model({ repos, t, now: BUILD_NOW });
  const t08 = registry.list().filter((x) => x.id === 'T-08');
  assert.equal(t08.length, 1, 'idempotent registerSelf does not duplicate');
  assert.throws(() => registry.register({ id: 'T-08', titleKey: 'x', needs: [], buildModel: () => Promise.resolve({}) }),
    /duplicate report template: T-08/);
});

// ---- render helpers (same shape as report-t04.test.js) ----------------------
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

test('buildReport end-to-end renders the T-08 model with the 5×5 matrix and zero unknown-type warnings', async () => {
  const repos = await seededRepos();

  const warnings = [];
  const originalWarn = console.warn;
  console.warn = (...args) => { warnings.push(args.map(String).join(' ')); };
  let doc;
  try {
    doc = await registry.build('T-08', { repos, t, now: BUILD_NOW });
  } finally {
    console.warn = originalWarn;
  }
  assert.deepEqual(warnings, [], 'renderer emitted no unknown section/chart-type warning');

  const root = outline(doc);
  assert.equal(root.tag, 'div');
  assert.ok(hasClass(root, 'print-root') && hasClass(root, 'report') && hasClass(root, 'report-T-08'));

  const header = (root.children || []).find((c) => c.tag === 'header' && hasClass(c, 'report-cover'));
  const h1 = header ? (header.children || []).find((c) => c.tag === 'h1') : null;
  assert.equal(h1 && h1.text, 'reports.t08Title');

  const sections = (root.children || []).filter((c) => c.tag === 'section' && hasClass(c, 'report-section'));
  assert.deepEqual(sections.map((s) => (s.children || [])[0].text), [
    'reports.kpis',
    'reports.t08MatrixTitle',
    'apm.rbi',
    'reports.t08Plan',
    'reports.standardsApplied'
  ]);

  // The matrix chart really rendered: <svg class="report-chart report-chart-matrix">
  // with the 25 grid cells of charts.matrix.
  const svgs = findAll(root, (n) => n.tag === 'svg' && hasClass(n, 'report-chart-matrix'));
  assert.equal(svgs.length, 1, 'one matrix svg');
  const rects = (svgs[0].children || []).filter((c) => c.tag === 'rect');
  assert.equal(rects.length, 25, '5×5 grid drawn');
  const figcaption = findAll(root, (n) => n.tag === 'figcaption');
  assert.deepEqual(figcaption.map((f) => f.text), ['reports.t08MatrixTitle']);

  const tables = findAll(root, (n) => n.tag === 'div' && hasClass(n, 'report-table'));
  const assetsTbody = tables[0].children.find((c) => c.tag === 'table').children.find((c) => c.tag === 'tbody');
  assert.equal((assetsTbody.children || []).filter((c) => c.tag === 'tr').length, 18);
  const stdTbody = tables[1].children.find((c) => c.tag === 'table').children.find((c) => c.tag === 'tbody');
  assert.equal((stdTbody.children || []).filter((c) => c.tag === 'tr').length, 3);

  const lis = findAll(root, (n) => n.tag === 'ul' && hasClass(n, 'report-list'))[0];
  assert.equal((lis.children || []).filter((c) => c.tag === 'li').length, 5);

  assert.equal(findAll(root, (n) => n.tag === 'div' && hasClass(n, 'report-disclaimer')).length, 1);
  assert.ok(findAll(root, (n) => n.tag === 'footer' && hasClass(n, 'report-footer')).length === 1);
  assert.equal(findAll(root, (n) => n.tag === 'p' && hasClass(n, 'report-cover-generated') && n.text.indexOf('reports.generatedAt') === 0).length, 1,
    'deterministic generated-at line rendered from opts.now');
});
