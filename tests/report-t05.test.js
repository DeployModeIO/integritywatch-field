/* IntegrityWatch Field — T-05 MIC (microbiologically influenced corrosion) report model tests
    GOLDEN seed: exact numbers of the real run over the deterministic demo seed
    (seed.js, NOW 2026-09-15). The seed carries NO advanced.mic data, so the
    golden sweep evaluates 0 points and the "datos ausentes" text section is
    what the report shows (never invents factors absent from the data model).
    A second synthetic corpus pins the real per-point evaluate numbers.
    Covers: purity (no-mutation snapshot), i18n keys exist in es.js, T-05 in
    registry (idempotent, duplicate-safe) and buildReport end-to-end through
    the registry + renderer. */
'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');

const shim = require('./helpers/dom-shim');
require('../src/calc/mic.js');
require('../src/data/standards.js');
const dbMemory = require('../src/core/dbMemory.js');
const storeApi = require('../src/core/store.js');
const seed = require('../src/data/seed.js');
require('../src/reports/model.js');
require('../src/reports/registry.js');
require('../src/reports/renderer.js');
const modelT05 = require('../src/reports/model-t05.js');
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

// ---- golden seed run -------------------------------------------------------
// El seed demo no define advanced.mic en NINGÚN punto: la barrera de datos
// MIC disponibles evalúa 0 puntos, riesgo alto 0, tabla vacía, muestreo vacío,
// y la recomendación es completar el tamizaje. Números exactos de corrida real.
test('T-05 golden model over the demo seed: zero evaluated points, exact shape', async () => {
  const repos = await seededRepos();
  const m = await modelT05.buildT05Model({ repos, t, now: BUILD_NOW });

  assert.equal(m.id, 'T-05');
  assert.equal(m.meta.titleKey, 'reports.t05Title');
  assert.equal(m.meta.generatedAtISO, new Date(BUILD_NOW).toISOString());
  assert.deepEqual(m.sections.map((s) => s.type),
    ['cover', 'kpiRow', 'table', 'list', 'text', 'list', 'standards']);

  const kpis = m.sections[1].items;
  assert.deepEqual(kpis.map((k) => k.value), [0, 0], 'evaluated points / high MIC risk');
  assert.deepEqual(kpis.map((k) => k.labelKey), ['reports.t05KpiEvaluated', 'reports.t05KpiHigh']);

  const table = m.sections[2];
  assert.equal(table.titleKey, 'mic.title');
  assert.equal(table.emptyKey, 'reports.noData');
  assert.deepEqual(table.rows, []);
  assert.deepEqual(table.columns.map((c) => c.key), ['code', 'temperatureC', 'drivers', 'score', 'risk']);
  assert.equal(table.noteKey, 'reports.t05Note');

  assert.deepEqual(m.sections[3].items, [], 'no sampling recommendations without evaluated risk');
  assert.deepEqual(m.sections[4], {
    type: 'text',
    titleKey: 'reports.t05DataGaps',
    bodyKey: 'reports.t05DataGapsBody'
  });
  assert.deepEqual(m.sections[5].items, [{ textKey: 'reports.t05RunScreening' }]);

  assert.deepEqual(m.sections[6].items, [],
    'NACE TM0194 / API 571 are not entries in IW.data.standards: catalog stays empty, nothing invented');
  assert.deepEqual(m.disclaimer, { type: 'disclaimer', labelKey: 'reports.disclaimer' });
});

// ---- synthetic corpus: real evaluate numbers -------------------------------
// assess score weights (calc/mic.js): stagnant +3, temperature 20–50 °C +3,
// sulfate +2, deposits +2, nearNeutralPh +2, sulfideSigns +3, historyMic +3,
// highCounts +3; cap 15; <6 low, 6–10 moderate, >10 high. freeWater gates all.
function micRepos() {
  const points = [
    { id: 'MP-MIC-001', code: 'MP-MIC-001', process: {}, advanced: { mic: { inputs: {
      freeWater: true, stagnant: true, temperatureC: 25, sulfate: true, deposits: true,
      nearNeutralPh: true, sulfideSigns: true, historyMic: true, highCounts: true } } } },
    { id: 'MP-MIC-002', code: 'MP-MIC-002', process: {}, advanced: { mic: { result: { inputs: {
      freeWater: true, stagnant: true, temperatureC: 40 } } } } },
    { id: 'MP-MIC-003', code: 'MP-MIC-003', process: {}, advanced: { mic: { inputs: {
      freeWater: true, sulfate: true, deposits: true, temperatureC: 30 } } } },
    { id: 'MP-MIC-004', code: 'MP-MIC-004', process: {}, advanced: { mic: { inputs: {
      freeWater: true, deposits: true } } } },
    { id: 'MP-MIC-005', code: 'MP-MIC-005', process: {} },
    { id: 'MP-MIC-006', code: 'MP-MIC-006', process: {}, advanced: { mic: { inputs: {} } } }
  ];
  return { monitoringPoints: { list: async () => points } };
}

const GOLDEN_ALL_DRIVERS = [
  'mic.driver.stagnant', 'mic.driver.temperature', 'mic.driver.sulfate', 'mic.driver.deposits',
  'mic.driver.nearNeutralPh', 'mic.driver.sulfideSigns', 'mic.driver.historyMic', 'mic.driver.highCounts'
].join(' · ');

test('T-05 evaluates every point with MIC inputs: priority high first, exact scores (seed-independent run)', async () => {
  const m = await modelT05.buildT05Model({ repos: micRepos(), t, now: BUILD_NOW });

  // MP-MIC-005 (no advanced.mic) and MP-MIC-006 (inputs {}) are skipped.
  const kpis = m.sections[1].items;
  assert.deepEqual(kpis.map((k) => k.value), [4, 1], '4 evaluated, 1 high');

  // Orden: riesgo alto > moderado > bajo; desempate por score desc y luego code asc.
  // (Las bandas de riesgo no se solapan, así que el desempate por score es lo
  // que discrimina: 003 score 7 antes que 002 score 6, ambos moderate.)
  assert.deepEqual(m.sections[2].rows, [
    { code: 'MP-MIC-001', temperatureC: 25, drivers: GOLDEN_ALL_DRIVERS, score: 15, risk: 'high' },
    { code: 'MP-MIC-003', temperatureC: 30, drivers: 'mic.driver.temperature · mic.driver.sulfate · mic.driver.deposits', score: 7, risk: 'moderate' },
    { code: 'MP-MIC-002', temperatureC: 40, drivers: 'mic.driver.stagnant · mic.driver.temperature', score: 6, risk: 'moderate' },
    { code: 'MP-MIC-004', temperatureC: null, drivers: 'mic.driver.deposits', score: 2, risk: 'low' }
  ]);

  assert.deepEqual(m.sections[3].items, [
    { textKey: 'reports.t05SampleCounts' },
    { textKey: 'reports.t05SampleBiofilm' }
  ]);

  assert.deepEqual(m.sections[5].items, [
    { textKey: 'reports.t05BioShock' },
    { textKey: 'reports.t05BioRetest' }
  ]);
});

test('T-05 moderate without high yields monitoring recommendation', async () => {
  const repos = { monitoringPoints: { list: async () => ([
    { code: 'M1', advanced: { mic: { inputs: { freeWater: true, stagnant: true, temperatureC: 40 } } } }
  ]) } };
  const m = await modelT05.buildT05Model({ repos, t, now: BUILD_NOW });
  assert.equal(m.sections[1].items[1].value, 0);
  assert.deepEqual(m.sections[5].items, [{ textKey: 'reports.t05BioMonitor' }]);
});

// ---- purity ----------------------------------------------------------------

test('T-05 model is pure: seeded points are not mutated (snapshot)', async () => {
  const repos = await seededRepos();
  const beforeList = await repos.monitoringPoints.list();
  const snapshot = JSON.stringify(beforeList);
  await modelT05.buildT05Model({ repos, t, now: BUILD_NOW });
  const afterList = await repos.monitoringPoints.list();
  assert.equal(JSON.stringify(afterList), snapshot, 'input points untouched');
});

test('T-05 model is pure over synthetic MIC inputs too (snapshot)', async () => {
  const repos = micRepos();
  const snapshot = JSON.stringify(repos.monitoringPoints.list());
  await modelT05.buildT05Model({ repos, t, now: BUILD_NOW });
  await modelT05.buildT05Model({ repos, t, now: BUILD_NOW });
  assert.equal(JSON.stringify(repos.monitoringPoints.list()), snapshot, 'inputs and results untouched');
});

// ---- i18n keys ---------------------------------------------------------------

function collectKeys(node, acc) {
  if (node === null || typeof node !== 'object') { return acc; }
  if (Array.isArray(node)) { node.forEach((n) => collectKeys(n, acc)); return acc; }
  for (const key of ['titleKey', 'labelKey', 'textKey', 'emptyKey', 'noteKey', 'bodyKey']) {
    if (typeof node[key] === 'string') { acc.add(node[key]); }
  }
  for (const k of Object.keys(node)) { collectKeys(node[k], acc); }
  return acc;
}

function resolveKey(obj, dotted) {
  return dotted.split('.').reduce((cur, part) => (cur && typeof cur === 'object' ? cur[part] : undefined), obj);
}

test('every translation key used by the T-05 model exists in es.js', async () => {
  const repos = await seededRepos();
  const keys = collectKeys(await modelT05.buildT05Model({ repos, t, now: BUILD_NOW }), new Set());
  const synth = collectKeys(await modelT05.buildT05Model({ repos: micRepos(), t, now: BUILD_NOW }), new Set());
  for (const k of synth) { keys.add(k); }
  keys.add('reports.t05Title');
  assert.ok(keys.size >= 16, 'expected the full key set, got ' + keys.size);
  for (const key of keys) {
    assert.ok(typeof resolveKey(es, key) === 'string', 'es.js missing key "' + key + '"');
  }
});

// ---- registry ---------------------------------------------------------------

test('T-05 is registered in the report registry exactly once', async () => {
  const entry = registry.get('T-05');
  assert.ok(entry, 'T-05 present');
  assert.equal(entry.titleKey, 'reports.t05Title');
  assert.deepEqual(entry.needs, []);
  const repos = await seededRepos();
  await modelT05.buildT05Model({ repos, t, now: BUILD_NOW });
  await modelT05.buildT05Model({ repos, t, now: BUILD_NOW });
  const t05 = registry.list().filter((x) => x.id === 'T-05');
  assert.equal(t05.length, 1, 'idempotent registerSelf does not duplicate');
  assert.throws(() => registry.register({ id: 'T-05', titleKey: 'x', needs: [], buildModel: () => Promise.resolve({}) }),
    /duplicate report template: T-05/);
});

// ---- render helpers (same shape as reports-characterization.test.js) ------
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

test('buildReport end-to-end renders the T-05 model (seed: empty table + data-gaps text)', async () => {
  const repos = await seededRepos();
  const doc = await registry.build('T-05', { repos, t, now: BUILD_NOW });
  const root = outline(doc);

  assert.equal(root.tag, 'div');
  assert.ok(hasClass(root, 'print-root') && hasClass(root, 'report') && hasClass(root, 'report-T-05'));

  const header = (root.children || []).find((c) => c.tag === 'header' && hasClass(c, 'report-cover'));
  const h1 = header ? (header.children || []).find((c) => c.tag === 'h1') : null;
  assert.equal(h1 && h1.text, 'reports.t05Title');

  const sections = (root.children || []).filter((c) => c.tag === 'section' && hasClass(c, 'report-section'));
  assert.deepEqual(sections.map((s) => (s.children || [])[0].text), [
    'reports.kpis',
    'mic.title',
    'reports.t05Sampling',
    'reports.t05DataGaps',
    'reports.t05Treatment',
    'reports.standardsApplied'
  ]);

  const table = findAll(root, (n) => n.tag === 'div' && hasClass(n, 'report-table'))[0];
  const tbody = table.children.find((c) => c.tag === 'table').children.find((c) => c.tag === 'tbody');
  const emptyCell = findAll(tbody, (n) => n.tag === 'td' && hasClass(n, 'empty-state'))[0];
  assert.equal(emptyCell.text, 'reports.noData', 'seed has no MIC-evaluated points');

  const textParas = findAll(root, (n) => n.tag === 'p' && hasClass(n, 'report-text'));
  assert.equal(textParas.length, 1);
  assert.equal(textParas[0].text, 'reports.t05DataGapsBody');

  const lists = findAll(root, (n) => n.tag === 'ul' && hasClass(n, 'report-list'));
  assert.equal(lists.length, 2, 'sampling + treatment lists');
  assert.equal((lists[0].children || []).filter((c) => c.tag === 'li').length, 0);
  assert.equal((lists[1].children || []).filter((c) => c.tag === 'li').length, 1);

  assert.equal(findAll(root, (n) => n.tag === 'div' && hasClass(n, 'report-disclaimer')).length, 1);
  assert.ok(findAll(root, (n) => n.tag === 'footer' && hasClass(n, 'report-footer')).length === 1);
  assert.equal(findAll(root, (n) => n.tag === 'p' && hasClass(n, 'report-cover-generated') && n.text.indexOf('reports.generatedAt') === 0).length, 1,
    'deterministic generated-at line rendered from opts.now');
});

test('buildReport end-to-end renders evaluated rows for the synthetic corpus', async () => {
  const doc = await registry.build('T-05', { repos: micRepos(), t, now: BUILD_NOW });
  const root = outline(doc);
  const table = findAll(root, (n) => n.tag === 'div' && hasClass(n, 'report-table'))[0];
  const tbody = table.children.find((c) => c.tag === 'table').children.find((c) => c.tag === 'tbody');
  assert.equal((tbody.children || []).filter((c) => c.tag === 'tr').length, 4);
  const firstRow = tbody.children[0].children.map((td) => td.text);
  assert.deepEqual(firstRow, ['MP-MIC-001', '25', GOLDEN_ALL_DRIVERS, '15', 'high']);
});
