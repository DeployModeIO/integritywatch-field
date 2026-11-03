/* IntegrityWatch Field — T-04 corrosion under insulation (CUI) report model tests
    GOLDEN seed: exact numbers over the deterministic demo seed (seed.js,
    NOW 2026-09-15) + a documented CUI augmentation. The base seed carries NO
    cui objects on any monitoring point (verified: seed.js never writes
    mp.cui), so the harness clones the seeded records and attaches real-shape
    `cui` (insulated/jacketType/lastInspISO per SCHEMA.md) and, for two points,
    saved `advanced.cui.inputs` (shape of the panel in views/corrosion.js).
    Same precedent as report-t01.test.js (harness supplies missing fields).
    Covers: golden risk/count rows, sector filter, empty case, purity
    (no-mutation snapshot), i18n keys exist in es.js, T-04 in registry
    (idempotent, duplicate-safe) and buildReport end-to-end through the
    registry + renderer. */
'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');

const shim = require('./helpers/dom-shim');
require('../src/calc/cui583.js');
require('../src/data/standards.js');
const dbMemory = require('../src/core/dbMemory.js');
const storeApi = require('../src/core/store.js');
const seed = require('../src/data/seed.js');
require('../src/reports/model.js');
require('../src/reports/registry.js');
require('../src/reports/renderer.js');
const modelT04 = require('../src/reports/model-t04.js');
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

// ---- CUI augmentation over the seeded points -------------------------------
// Real-shape fields only: mp.cui = {insulated, jacketType?, lastInspISO?}
// (SCHEMA.md) and mp.advanced.cui.inputs = panel inputs (views/corrosion.js).
const CUI_AUGMENT = {
  'MP-CORR-001': { cui: { insulated: true, jacketType: 'Mineral Wool', lastInspISO: '2025-10-01T00:00:00.000Z' } },
  'MP-CORR-002': {
    cui: { insulated: true, jacketType: 'PIR foam', lastInspISO: '2026-09-04T00:00:00.000Z' },
    advanced: { cui: { inputs: { materialClass: 'cs', operatingTempC: 55, insulationType: 'mineral-wool', coatingCondition: 'poor', environment: 'coastal', penetratingFeatures: true } } }
  },
  'MP-CORR-003': {
    cui: { insulated: true, jacketType: 'Closed-cell foam', lastInspISO: '2026-07-26T00:00:00.000Z' },
    advanced: { cui: { inputs: { coatingCondition: 'none' } } }
  },
  'MP-CORR-004': { cui: { insulated: true, jacketType: 'Closed-cell', lastInspISO: '2026-10-14T00:00:00.000Z' } },
  'MP-CORR-005': { cui: { insulated: true, jacketType: 'Mineral Wool' } },
  'MP-CORR-006': { cui: { insulated: false } },
  'MP-CORR-007': {
    cui: { insulated: true, jacketType: 'Calcium Silicate', lastInspISO: '2024-05-01T00:00:00.000Z' },
    advanced: { cui: { inputs: { coatingCondition: 'fair', environment: 'marine', cyclicService: true } } }
  },
  'MP-CORR-008': { cui: { insulated: true, jacketType: 'Mineral Wool' } }
};

function withCui(points) {
  return points.map((p) => {
    const aug = CUI_AUGMENT[p.id];
    if (!aug) { return p; }
    const clone = JSON.parse(JSON.stringify(p));
    if (aug.cui) { clone.cui = JSON.parse(JSON.stringify(aug.cui)); }
    if (aug.advanced) { clone.advanced = JSON.parse(JSON.stringify(aug.advanced)); }
    return clone;
  });
}

function fakeRepos(points) {
  return { monitoringPoints: { list: async () => points } };
}

function cuiRepos() {
  return seededRepos().then((repos) => repos.monitoringPoints.list()).then((pts) => fakeRepos(withCui(pts)));
}

// ---- golden values (fijados tras corrida real sobre el seed + augmentation) -
// Evaluación vía IW.calc.cui583.assess con entradas resueltas por el modelo
// (inputs guardados en advanced.cui por punto; por lo demás los defaults del
// panel: materialClass autodetect, temp = process.tempC ?? 40, jacketType →
// enum, coating 'good', environment 'temperate'). Vencida = sin fecha o
// antigüedad > 730 días respecto de BUILD_NOW.
//   MP-CORR-007 cs 90 °C peak + fair + calcium-silicate + marine + cíclico → 9 critical, 916 d vencida
//   MP-CORR-002 inputs guardados (penetrating, poor, coastal)             → 7 high, 60 d vigente
//   MP-CORR-005 ss 70 °C in-band + mineral-wool                           → 3 moderate, SIN FECHA → vencida
//   MP-CORR-008 cs temp ausente → default 40 in-band + mineral-wool       → 3 moderate, SIN FECHA → vencida
//   MP-CORR-001 cs 60 °C peak + mineral-wool                              → 5 moderate, 398 d vigente
//   MP-CORR-003 cs 40 °C in-band + closed-cell + coating none (guardado)  → 4 moderate, 100 d vigente
//   MP-CORR-004 cs 35 °C in-band + closed-cell                            → 2 low, 20 d vigente
// MP-CORR-006 insulated=false → excluida. Orden: riesgo desc, antigüedad desc
// (sin fecha primero), code asc.
const GOLDEN_ROWS = [
  { code: 'MP-CORR-007', tempC: 90, insulationType: 'calcium-silicate', coatingCondition: 'fair', environment: 'marine', risk: 'critical', lastInsp: '2024-05-01T00:00:00.000Z', days: 916, overdue: true },
  { code: 'MP-CORR-002', tempC: 55, insulationType: 'mineral-wool', coatingCondition: 'poor', environment: 'coastal', risk: 'high', lastInsp: '2026-09-04T00:00:00.000Z', days: 60, overdue: false },
  { code: 'MP-CORR-005', tempC: 70, insulationType: 'mineral-wool', coatingCondition: 'good', environment: 'temperate', risk: 'moderate', lastInsp: null, days: null, overdue: true },
  { code: 'MP-CORR-008', tempC: 40, insulationType: 'mineral-wool', coatingCondition: 'good', environment: 'temperate', risk: 'moderate', lastInsp: null, days: null, overdue: true },
  { code: 'MP-CORR-001', tempC: 60, insulationType: 'mineral-wool', coatingCondition: 'good', environment: 'temperate', risk: 'moderate', lastInsp: '2025-10-01T00:00:00.000Z', days: 398, overdue: false },
  { code: 'MP-CORR-003', tempC: 40, insulationType: 'closed-cell', coatingCondition: 'none', environment: 'temperate', risk: 'moderate', lastInsp: '2026-07-26T00:00:00.000Z', days: 100, overdue: false },
  { code: 'MP-CORR-004', tempC: 35, insulationType: 'closed-cell', coatingCondition: 'good', environment: 'temperate', risk: 'low', lastInsp: '2026-10-14T00:00:00.000Z', days: 20, overdue: false }
];

const GOLDEN_PLAN = [
  { textKey: 'reports.t04ActionOverdue' },
  { textKey: 'cui.method.visual' },
  { textKey: 'cui.method.thermo' },
  { textKey: 'cui.method.pec' },
  { textKey: 'cui.method.rt' },
  { textKey: 'cui.method.gw' },
  { textKey: 'cui.method.utSpot' },
  { textKey: 'cui.method.utProgram' }
];

test('T-04 golden model over the seeded points + CUI augmentation: exact risks, ages and counts', async () => {
  const repos = await cuiRepos();
  const m = await modelT04.buildT04Model({ repos, t, now: BUILD_NOW });

  assert.equal(m.id, 'T-04');
  assert.equal(m.meta.titleKey, 'reports.t04Title');
  assert.equal(m.meta.generatedAtISO, new Date(BUILD_NOW).toISOString());
  assert.deepEqual(m.sections.map((s) => s.type), ['cover', 'kpiRow', 'table', 'list', 'text', 'standards']);

  const kpis = m.sections[1].items;
  assert.deepEqual(kpis.map((k) => k.value), [7, 2, 3], 'insulated / high-risk / overdue');
  assert.deepEqual(kpis.map((k) => k.labelKey), ['reports.t04KpiInsulated', 'reports.t04KpiHighRisk', 'reports.t04KpiOverdue']);

  const table = m.sections[2];
  assert.equal(table.titleKey, 'corrosion.cuiTitle');
  assert.equal(table.emptyKey, 'reports.noData');
  assert.deepEqual(table.columns.map((c) => c.key), ['code', 'tempC', 'insulationType', 'coatingCondition', 'environment', 'risk', 'lastInsp', 'days']);
  assert.deepEqual(table.rows, GOLDEN_ROWS);

  assert.deepEqual(m.sections[3].items, GOLDEN_PLAN, 'overdue-first + full ladder up to critical');

  assert.deepEqual(m.sections[4], { type: 'text', titleKey: 'cui.title', bodyKey: 'reports.t04Scope' });

  assert.deepEqual(m.sections[5].items, [
    { id: 'API RP 583', title: 'Corrosion Under Insulation and Fireproofing' },
    { id: 'API RP 571', title: 'Damage Mechanisms Affecting Fixed Equipment in the Refining Industry' }
  ]);
  assert.deepEqual(m.disclaimer, { type: 'disclaimer', labelKey: 'reports.disclaimer' });
});

test('T-04 sector filter keeps only that sector and caps the method ladder at the max risk', async () => {
  const repos = await cuiRepos();
  const m = await modelT04.buildT04Model({ repos, t, now: BUILD_NOW, sector: 'upstream' });
  // upstream insulated: MP-CORR-001 (moderate) + MP-CORR-002 (high); 006 excluded.
  assert.deepEqual(m.sections[1].items.map((k) => k.value), [2, 1, 0]);
  assert.deepEqual(m.sections[2].rows.map((r) => r.code), ['MP-CORR-002', 'MP-CORR-001']);
  assert.deepEqual(m.sections[3].items, [
    { textKey: 'cui.method.visual' },
    { textKey: 'cui.method.thermo' },
    { textKey: 'cui.method.pec' },
    { textKey: 'cui.method.rt' },
    { textKey: 'cui.method.gw' },
    { textKey: 'cui.method.utSpot' }
  ]);
});

test('T-04 over the raw seed (no CUI points): zeroed KPIs and empty table/plan', async () => {
  const repos = await seededRepos();
  const m = await modelT04.buildT04Model({ repos, t, now: BUILD_NOW });
  assert.deepEqual(m.sections[1].items.map((k) => k.value), [0, 0, 0]);
  assert.deepEqual(m.sections[2].rows, []);
  assert.deepEqual(m.sections[3].items, []);
});

test('T-04 model is pure: input points are not mutated (snapshot)', async () => {
  const repos = await cuiRepos();
  const points = await repos.monitoringPoints.list();
  const snapshot = JSON.stringify(points);
  await modelT04.buildT04Model({ repos, t, now: BUILD_NOW });
  const after = await repos.monitoringPoints.list();
  assert.equal(JSON.stringify(after), snapshot, 'input points untouched');
});

// Collect every value of the translation-key properties used by the model.
function collectKeys(node, acc) {
  if (node === null || typeof node !== 'object') { return acc; }
  if (Array.isArray(node)) { node.forEach((n) => collectKeys(n, acc)); return acc; }
  for (const key of ['titleKey', 'labelKey', 'textKey', 'emptyKey', 'noteKey']) {
    if (typeof node[key] === 'string') { acc.add(node[key]); }
  }
  for (const k of Object.keys(node)) { collectKeys(node[k], acc); }
  return acc;
}

function resolveKey(obj, dotted) {
  return dotted.split('.').reduce((cur, part) => (cur && typeof cur === 'object' ? cur[part] : undefined), obj);
}

test('every translation key used by the T-04 model exists in es.js', async () => {
  const repos = await cuiRepos();
  const m = await modelT04.buildT04Model({ repos, t, now: BUILD_NOW });
  const keys = collectKeys(m, new Set());
  keys.add('reports.t04Title');
  assert.ok(keys.size >= 15, 'expected the full key set, got ' + keys.size);
  for (const key of keys) {
    assert.ok(typeof resolveKey(es, key) === 'string', 'es.js missing key "' + key + '"');
  }
});

test('T-04 is registered in the report registry exactly once', async () => {
  const entry = registry.get('T-04');
  assert.ok(entry, 'T-04 present');
  assert.equal(entry.titleKey, 'reports.t04Title');
  assert.deepEqual(entry.needs, []);
  const repos = await cuiRepos();
  await modelT04.buildT04Model({ repos, t, now: BUILD_NOW });
  await modelT04.buildT04Model({ repos, t, now: BUILD_NOW });
  const t04 = registry.list().filter((x) => x.id === 'T-04');
  assert.equal(t04.length, 1, 'idempotent registerSelf does not duplicate');
  assert.throws(() => registry.register({ id: 'T-04', titleKey: 'x', needs: [], buildModel: () => Promise.resolve({}) }),
    /duplicate report template: T-04/);
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

test('buildReport end-to-end renders the T-04 model', async () => {
  const repos = await cuiRepos();
  const doc = await registry.build('T-04', { repos, t, now: BUILD_NOW });
  const root = outline(doc);

  assert.equal(root.tag, 'div');
  assert.ok(hasClass(root, 'print-root') && hasClass(root, 'report') && hasClass(root, 'report-T-04'));

  const header = (root.children || []).find((c) => c.tag === 'header' && hasClass(c, 'report-cover'));
  const h1 = header ? (header.children || []).find((c) => c.tag === 'h1') : null;
  assert.equal(h1 && h1.text, 'reports.t04Title');

  const sections = (root.children || []).filter((c) => c.tag === 'section' && hasClass(c, 'report-section'));
  assert.deepEqual(sections.map((s) => (s.children || [])[0].text), [
    'reports.kpis',
    'corrosion.cuiTitle',
    'reports.t04Plan',
    'cui.title',
    'reports.standardsApplied'
  ]);

  const tables = findAll(root, (n) => n.tag === 'div' && hasClass(n, 'report-table'));
  const riskTbody = tables[0].children.find((c) => c.tag === 'table').children.find((c) => c.tag === 'tbody');
  assert.equal((riskTbody.children || []).filter((c) => c.tag === 'tr').length, 7);
  const stdTbody = tables[1].children.find((c) => c.tag === 'table').children.find((c) => c.tag === 'tbody');
  assert.equal((stdTbody.children || []).filter((c) => c.tag === 'tr').length, 2);

  const lis = findAll(root, (n) => n.tag === 'ul' && hasClass(n, 'report-list'))[0];
  assert.equal((lis.children || []).filter((c) => c.tag === 'li').length, 8);

  const texts = findAll(root, (n) => n.tag === 'p' && hasClass(n, 'report-text'));
  assert.deepEqual(texts.map((p) => p.text), ['reports.t04Scope']);

  assert.equal(findAll(root, (n) => n.tag === 'div' && hasClass(n, 'report-disclaimer')).length, 1);
  assert.ok(findAll(root, (n) => n.tag === 'footer' && hasClass(n, 'report-footer')).length === 1);
  assert.equal(findAll(root, (n) => n.tag === 'p' && hasClass(n, 'report-cover-generated') && n.text.indexOf('reports.generatedAt') === 0).length, 1,
    'deterministic generated-at line rendered from opts.now');
});
