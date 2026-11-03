/* IntegrityWatch Field — T-03 sour service screening report model tests
    GOLDEN seed: exact numbers over the deterministic demo seed (seed.js,
    NOW 2026-09-15) — pH2S of the sour demo point, per-region counts.
    Covers: purity (no-mutation snapshot), i18n keys exist in es.js, T-03 in
    registry (idempotent, duplicate-safe) and buildReport end-to-end through
    the registry + renderer. */
'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');

const shim = require('./helpers/dom-shim');
require('../src/calc/units.js');
require('../src/calc/corrosion.js');
require('../src/data/materials.js');
require('../src/data/standards.js');
const dbMemory = require('../src/core/dbMemory.js');
const storeApi = require('../src/core/store.js');
const seed = require('../src/data/seed.js');
require('../src/reports/model.js');
require('../src/reports/registry.js');
require('../src/reports/renderer.js');
const modelT03 = require('../src/reports/model-t03.js');
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

// ---- golden values (fijados tras corrida real sobre el seed demo) ---------
// pH2S = totalPressureKpa × h2sPpm/1e6 (calc/corrosion.partialPressureH2S).
// Los literales son el double IEEE exacto que produce la división real
// (13.790000000000001 = 6895*(2000/1e6)), no una aproximación decimal.
//   MP-CORR-001  6895 × 2000/1e6 ≈ 13.79  kPa → moderate → X52 (carbonSteel) NO apto
//   MP-CORR-006  4137 ×  500/1e6 ≈  2.07  kPa → moderate → Duplex 2205      apto
//   MP-CORR-003   517 ×    50/1e6 = 0.02585 kPa → low → A106 B              apto
//   CO2-only points (002, 004, 005, 007) screen at pH2S 0 → low → apto.
// MP-CORR-008 has no acid gas → excluded from screening.
const GOLDEN_ROWS = [
  { code: 'MP-CORR-001', h2s: 2000, pTotal: 6895, ph2s: 13.790000000000001, region: 'moderate', material: 'API 5L X52', apto: 'no' },
  { code: 'MP-CORR-006', h2s: 500, pTotal: 4137, ph2s: 2.0685000000000002, region: 'moderate', material: 'Duplex 2205', apto: 'yes' },
  { code: 'MP-CORR-003', h2s: 50, pTotal: 517, ph2s: 0.02585, region: 'low', material: 'ASTM A106 Grade B', apto: 'yes' },
  { code: 'MP-CORR-002', h2s: null, pTotal: 4137, ph2s: 0, region: 'low', material: 'API 5L Grade B', apto: 'yes' },
  { code: 'MP-CORR-004', h2s: null, pTotal: 690, ph2s: 0, region: 'low', material: 'API 5L X60', apto: 'yes' },
  { code: 'MP-CORR-005', h2s: null, pTotal: 200, ph2s: 0, region: 'low', material: '316L Stainless Steel', apto: 'yes' },
  { code: 'MP-CORR-007', h2s: null, pTotal: 150, ph2s: 0, region: 'low', material: 'ASTM A516 Grade 70', apto: 'yes' }
];

test('T-03 golden model over the demo seed: exact pH2S, regions and counts', async () => {
  const repos = await seededRepos();
  const m = await modelT03.buildT03Model({ repos, t, now: BUILD_NOW });

  assert.equal(m.id, 'T-03');
  assert.equal(m.meta.titleKey, 'reports.t03Title');
  assert.equal(m.meta.generatedAtISO, new Date(BUILD_NOW).toISOString());
  assert.deepEqual(m.sections.map((s) => s.type), ['cover', 'kpiRow', 'table', 'list', 'standards']);

  const kpis = m.sections[1].items;
  assert.deepEqual(kpis.map((k) => k.value), [7, 2, 1], 'screened / severe region / insufficient material');

  const table = m.sections[2];
  assert.deepEqual(table.rows, GOLDEN_ROWS);
  assert.deepEqual(table.columns.map((c) => c.key), ['code', 'h2s', 'pTotal', 'ph2s', 'region', 'material', 'apto']);
  assert.equal(table.noteKey, 'corrosion.screeningNote');

  assert.deepEqual(m.sections[3].items, [
    { textKey: 'reports.t03ActionUpgrade' },
    { textKey: 'reports.t03ActionEnvironment' }
  ]);

  assert.deepEqual(m.sections[4].items, [{
    id: 'MR0175/ISO 15156-2',
    title: 'Petroleum and natural gas industries — Materials for use in H2S-containing environments'
  }]);
  assert.deepEqual(m.disclaimer, { type: 'disclaimer', labelKey: 'reports.disclaimer' });
});

test('T-03 actions list is empty when every point is apt', async () => {
  const apt = [{ id: 'A', code: 'A', material: 'duplex-2205', process: { h2sPpm: 1000, totalPressureKpa: 1000 } }];
  const repos = { monitoringPoints: { list: async () => apt } };
  const m = await modelT03.buildT03Model({ repos, t, now: BUILD_NOW });
  assert.equal(m.sections[1].items[2].value, 0);
  assert.deepEqual(m.sections[3].items, []);
});

test('T-03 model is pure: seeded points are not mutated (snapshot)', async () => {
  const repos = await seededRepos();
  const beforeList = await repos.monitoringPoints.list();
  const snapshot = JSON.stringify(beforeList);
  await modelT03.buildT03Model({ repos, t, now: BUILD_NOW });
  const afterList = await repos.monitoringPoints.list();
  assert.equal(JSON.stringify(afterList), snapshot, 'input points untouched');
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

test('every translation key used by the T-03 model exists in es.js', async () => {
  const repos = await seededRepos();
  const m = await modelT03.buildT03Model({ repos, t, now: BUILD_NOW });
  const keys = collectKeys(m, new Set());
  keys.add('reports.t03Title');
  assert.ok(keys.size >= 15, 'expected the full key set, got ' + keys.size);
  for (const key of keys) {
    assert.ok(typeof resolveKey(es, key) === 'string', 'es.js missing key "' + key + '"');
  }
});

test('T-03 is registered in the report registry exactly once', async () => {
  const entry = registry.get('T-03');
  assert.ok(entry, 'T-03 present');
  assert.equal(entry.titleKey, 'reports.t03Title');
  assert.deepEqual(entry.needs, []);
  const repos = await seededRepos();
  await modelT03.buildT03Model({ repos, t, now: BUILD_NOW });
  await modelT03.buildT03Model({ repos, t, now: BUILD_NOW });
  const t03 = registry.list().filter((x) => x.id === 'T-03');
  assert.equal(t03.length, 1, 'idempotent registerSelf does not duplicate');
  assert.throws(() => registry.register({ id: 'T-03', titleKey: 'x', needs: [], buildModel: () => Promise.resolve({}) }),
    /duplicate report template: T-03/);
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

test('buildReport end-to-end renders the T-03 model', async () => {
  const repos = await seededRepos();
  const doc = await registry.build('T-03', { repos, t, now: BUILD_NOW });
  const root = outline(doc);

  assert.equal(root.tag, 'div');
  assert.ok(hasClass(root, 'print-root') && hasClass(root, 'report') && hasClass(root, 'report-T-03'));

  const header = (root.children || []).find((c) => c.tag === 'header' && hasClass(c, 'report-cover'));
  const h1 = header ? (header.children || []).find((c) => c.tag === 'h1') : null;
  assert.equal(h1 && h1.text, 'reports.t03Title');

  const sections = (root.children || []).filter((c) => c.tag === 'section' && hasClass(c, 'report-section'));
  assert.deepEqual(sections.map((s) => (s.children || [])[0].text), [
    'reports.kpis',
    'corrosion.sourScreening',
    'reports.t03Actions',
    'reports.standardsApplied'
  ]);

  const table = findAll(root, (n) => n.tag === 'div' && hasClass(n, 'report-table'))[0];
  const tbody = table.children.find((c) => c.tag === 'table').children.find((c) => c.tag === 'tbody');
  assert.equal((tbody.children || []).filter((c) => c.tag === 'tr').length, 7);

  const lis = findAll(root, (n) => n.tag === 'ul' && hasClass(n, 'report-list'))[0];
  assert.equal((lis.children || []).filter((c) => c.tag === 'li').length, 2);

  assert.equal(findAll(root, (n) => n.tag === 'div' && hasClass(n, 'report-disclaimer')).length, 1);
  assert.ok(findAll(root, (n) => n.tag === 'footer' && hasClass(n, 'report-footer')).length === 1);
  assert.equal(findAll(root, (n) => n.tag === 'p' && hasClass(n, 'report-cover-generated') && n.text.indexOf('reports.generatedAt') === 0).length, 1,
    'deterministic generated-at line rendered from opts.now');
});
