/* IntegrityWatch Field — T-07 PSV fleet report model tests
     GOLDEN seed: exact margins, days and statuses over the deterministic demo
     seed (seed.js, SEED_NOW 2026-09-15, BUILD_NOW 2026-08-20) — literals
     frozen from a real run; the recalculated margins match the seed-cached
     calc values bit-for-bit. Covers: purity (no-mutation snapshot), i18n keys
     exist in es.js, T-07 in registry (idempotent, duplicate-safe), synthetic
     negative-margin/systemId-filter/fallback paths and buildReport end-to-end
     through the registry + renderer. */
'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');

const shim = require('./helpers/dom-shim');
require('../src/calc/units.js');
require('../src/calc/psv.js');
require('../src/data/fluids.js');
require('../src/data/standards.js');
const dbMemory = require('../src/core/dbMemory.js');
const storeApi = require('../src/core/store.js');
const seed = require('../src/data/seed.js');
require('../src/reports/model.js');
require('../src/reports/registry.js');
require('../src/reports/renderer.js');
const modelT07 = require('../src/reports/model-t07.js');
const registry = require('../src/reports/registry.js');
const es = require('../src/i18n/locales/es.js');

const t = (key) => key;
const SEED_NOW = '2026-09-15T00:00:00.000Z';
const BUILD_NOW = '2026-08-20T00:00:00.000Z';

before(() => shim.install());
after(() => shim.uninstall());

function seededRepos() {
  const store = storeApi.create(dbMemory.create());
  return seed.demo(store, { nowISO: SEED_NOW }).then(() => store);
}

// ---- golden values (fijados tras corrida real sobre el seed demo) ----------
// Estado DERIVADO (no cacheado): store solo recalcula p.status al guardar, así
// que el modelo lo deriva de nextTestDate frente a BUILD_NOW (días calendario
// UTC): 'overdue' >30 días de atraso, 'due' 1–30, 'ok' futuro o mismo día.
// Márgenes: calc.realCapacity sobre el orificio instalado frente al área
// requerida recalculada con calc (coinciden bit a bit con sizing.marginPct
// del seed, evidencia de la ruta espejo). Orden por urgencia: días asc.
const GOLDEN_ROWS = [
  { tag: 'PSV-520-003', fluid: 'Crude oil', setPressure: 100, margin: 14.068018292146611, days: -34, orificeInstalled: 'J', orificeRequired: 'J', capReal: 342.20405487643984, capReq: 300, status: 'overdue' },
  { tag: 'PSV-520-005', fluid: 'Methane', setPressure: 130, margin: 28.045091221159414, days: -14, orificeInstalled: 'L', orificeRequired: 'L', capReal: 25609.018244231884, capReq: 20000, status: 'due' },
  { tag: 'PSV-520-002', fluid: 'Natural gas', setPressure: 100, margin: 13.361111259133862, days: 1, orificeInstalled: 'N', orificeRequired: 'N', capReal: 34008.33337774016, capReq: 30000, status: 'ok' },
  { tag: 'PSV-520-004', fluid: 'Methane', setPressure: 120, margin: 5.909269787518556, days: 11, orificeInstalled: 'K', orificeRequired: 'K', capReal: 15886.390468127784, capReq: 15000, status: 'ok' },
  { tag: 'PSV-520-001', fluid: 'Methane', setPressure: 150, margin: 30.51433534572816, days: 16, orificeInstalled: 'P', orificeRequired: 'P', capReal: 65257.16767286408, capReq: 50000, status: 'ok' }
];

const GOLDEN_PLAN = [
  { textKey: 'reports.t07ActionSchedule', status: 'critical' },
  { text: 'PSV-520-003 · 2026-07-17T00:00:00.000Z', status: 'critical' },
  { text: 'PSV-520-005 · 2026-08-06T00:00:00.000Z', status: 'warning' },
  { text: 'PSV-520-002 · 2026-08-21T00:00:00.000Z', status: 'info' },
  { text: 'PSV-520-004 · 2026-08-31T00:00:00.000Z', status: 'info' },
  { text: 'PSV-520-001 · 2026-09-05T00:00:00.000Z', status: 'info' }
];

test('T-07 golden model over the demo seed: exact margins, days, urgency order', async () => {
  const repos = await seededRepos();
  const m = await modelT07.buildT07Model({ repos, t, now: BUILD_NOW });

  assert.equal(m.id, 'T-07');
  assert.equal(m.meta.titleKey, 'reports.t07Title');
  assert.equal(m.meta.generatedAtISO, new Date(BUILD_NOW).toISOString());
  assert.equal(m.sections.length, 5);
  assert.equal(m.sections[0].type, 'cover');
  assert.equal(m.sections[0].subtitle, undefined, 'no subtitle without systemId filter');
  assert.deepEqual(m.sections.map((s) => s.type), ['cover', 'kpiRow', 'table', 'list', 'standards']);

  const kpis = m.sections[1].items;
  assert.deepEqual(kpis.map((k) => k.value), [5, 2, 0, 3], 'flota / vencidas / margen<0 / próximas 90d');
  assert.deepEqual(kpis.map((k) => k.labelKey), [
    'reports.t07KpiFleet', 'reports.t07KpiOverdue', 'reports.t07KpiNegMargin', 'reports.t07KpiSoon90'
  ]);

  const table = m.sections[2];
  assert.deepEqual(table.rows, GOLDEN_ROWS);
  assert.deepEqual(table.columns.map((c) => c.key), [
    'tag', 'fluid', 'setPressure', 'margin', 'days',
    'orificeInstalled', 'orificeRequired', 'capReal', 'capReq', 'status'
  ]);
  assert.equal(table.emptyKey, 'reports.noData');
  assert.equal(table.noteKey, 'reports.t07Note');

  assert.deepEqual(m.sections[3].items, GOLDEN_PLAN);

  assert.deepEqual(m.sections[4].items, [
    { id: 'API 520 Pt I', title: 'Sizing, Selection, and Installation of Pressure-relieving Devices — Part I' },
    { id: 'API 526', title: 'Flanged Steel Pressure-relief Valves' },
    { id: 'API 576', title: 'Inspection Systems for Pressure-relieving Equipment' }
  ]);
  assert.deepEqual(m.disclaimer, { type: 'disclaimer', labelKey: 'reports.disclaimer' });
});

test('T-07 status is re-derived, not trusted from the cached field', async () => {
  const repos = await seededRepos();
  // Con BUILD_NOW lejano todo queda vencida y la acción del plan persiste.
  const m = await modelT07.buildT07Model({ repos, t, now: '2026-12-31T00:00:00.000Z' });
  assert.deepEqual(m.sections[1].items.map((k) => k.value), [5, 5, 0, 0]);
  assert.ok(m.sections[2].rows.every((r) => r.status === 'overdue'));
});

test('T-07 synthetic: negative margin, cached-area fallback, systemId filter, missing date', async () => {
  const neg = {
    id: 'PSV-NEG', tag: 'PSV-NEG', systemId: 'SYS-A', fluidId: 'methane',
    setPressurePsig: 150, Wlbh: 1000, certifiedCapacity: 0.110, orificeLetter: 'D',
    // sin k/temperatura: las entradas crudas están incompletas → fallback a
    // sizing.AreqIn2 (cacheado por calc) en lugar de recálculo
    sizing: { AreqIn2: 1.0 },
    nextTestDate: '2026-09-01T00:00:00.000Z'
  };
  const other = { id: 'PSV-B', tag: 'PSV-B', systemId: 'SYS-B', nextTestDate: '2026-08-25T00:00:00.000Z' };
  const loose = { id: 'PSV-L', tag: 'PSV-L' }; // sin systemId ni fecha
  const repos = { psvs: { list: async () => [neg, other, loose] } };

  const filtered = await modelT07.buildT07Model({ repos, t, now: BUILD_NOW, systemId: 'SYS-A' });
  assert.equal(filtered.sections[0].subtitle, 'SYS-A');
  assert.deepEqual(filtered.sections[1].items.map((k) => k.value), [1, 0, 1, 1], '1 flota / 0 vencidas / 1 margen<0 / 1 próxima 90d');
  assert.deepEqual(filtered.sections[2].rows, [{
    tag: 'PSV-NEG', fluid: 'methane', setPressure: 150, margin: -89, days: 12,
    orificeInstalled: 'D', orificeRequired: 'J', capReal: 110, capReq: 1000, status: 'ok'
  }], 'fluid cae al fluidId crudo: el catálogo expone nameKey, no name (la capa visual traduce fluids.*)');
  // sin vencidas, el plan solo lleva las fichas con fecha
  assert.deepEqual(filtered.sections[3].items, [{ text: 'PSV-NEG · 2026-09-01T00:00:00.000Z', status: 'info' }]);

  const all = await modelT07.buildT07Model({ repos, t, now: BUILD_NOW });
  assert.equal(all.sections[1].items[0].value, 3, 'sin filtro entra la flota completa');
  // PSV-L: sin fecha → days/status null y fuera del plan; sin datos de sizing → nulls
  const lRow = all.sections[2].rows.find((r) => r.tag === 'PSV-L');
  assert.deepEqual([lRow.days, lRow.status, lRow.margin, lRow.orificeRequired], [null, null, null, null]);
  assert.equal(all.sections[3].items.length, 2, 'PSV-L sin fecha no aparece en el plan');
  assert.equal(all.sections[1].items[1].value, 0, 'days null no cuenta como vencida');
});

test('T-07 model is pure: seeded PSVs are not mutated (snapshot)', async () => {
  const repos = await seededRepos();
  const beforeList = await repos.psvs.list();
  const snapshot = JSON.stringify(beforeList);
  await modelT07.buildT07Model({ repos, t, now: BUILD_NOW });
  const afterList = await repos.psvs.list();
  assert.equal(JSON.stringify(afterList), snapshot, 'input PSVs untouched');
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

test('every translation key used by the T-07 model exists in es.js', async () => {
  const repos = await seededRepos();
  const m = await modelT07.buildT07Model({ repos, t, now: BUILD_NOW });
  const keys = collectKeys(m, new Set());
  keys.add('reports.t07Title');
  assert.ok(keys.size >= 20, 'expected the full key set, got ' + keys.size);
  for (const key of keys) {
    assert.ok(typeof resolveKey(es, key) === 'string', 'es.js missing key "' + key + '"');
  }
});

test('T-07 is registered in the report registry exactly once', async () => {
  const entry = registry.get('T-07');
  assert.ok(entry, 'T-07 present');
  assert.equal(entry.titleKey, 'reports.t07Title');
  assert.deepEqual(entry.needs, []);
  const repos = await seededRepos();
  await modelT07.buildT07Model({ repos, t, now: BUILD_NOW });
  await modelT07.buildT07Model({ repos, t, now: BUILD_NOW });
  const t07 = registry.list().filter((x) => x.id === 'T-07');
  assert.equal(t07.length, 1, 'idempotent registerSelf does not duplicate');
  assert.throws(() => registry.register({ id: 'T-07', titleKey: 'x', needs: [], buildModel: () => Promise.resolve({}) }),
    /duplicate report template: T-07/);
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

test('buildReport end-to-end renders the T-07 model', async () => {
  const repos = await seededRepos();
  const doc = await registry.build('T-07', { repos, t, now: BUILD_NOW });
  const root = outline(doc);

  assert.equal(root.tag, 'div');
  assert.ok(hasClass(root, 'print-root') && hasClass(root, 'report') && hasClass(root, 'report-T-07'));

  const header = (root.children || []).find((c) => c.tag === 'header' && hasClass(c, 'report-cover'));
  const h1 = header ? (header.children || []).find((c) => c.tag === 'h1') : null;
  assert.equal(h1 && h1.text, 'reports.t07Title');

  const sections = (root.children || []).filter((c) => c.tag === 'section' && hasClass(c, 'report-section'));
  assert.deepEqual(sections.map((s) => (s.children || [])[0].text), [
    'reports.kpis',
    'reports.t07Fleet',
    'reports.t07Plan',
    'reports.standardsApplied'
  ]);

  const table = findAll(root, (n) => n.tag === 'div' && hasClass(n, 'report-table'))[0];
  const tbody = table.children.find((c) => c.tag === 'table').children.find((c) => c.tag === 'tbody');
  assert.equal((tbody.children || []).filter((c) => c.tag === 'tr').length, 5);

  const lis = findAll(root, (n) => n.tag === 'ul' && hasClass(n, 'report-list'))[0];
  assert.equal((lis.children || []).filter((c) => c.tag === 'li').length, 6, 'action + 5 plan lines');

  assert.equal(findAll(root, (n) => n.tag === 'div' && hasClass(n, 'report-disclaimer')).length, 1);
  assert.ok(findAll(root, (n) => n.tag === 'footer' && hasClass(n, 'report-footer')).length === 1);
  assert.equal(findAll(root, (n) => n.tag === 'p' && hasClass(n, 'report-cover-generated') && n.text.indexOf('reports.generatedAt') === 0).length, 1,
    'deterministic generated-at line rendered from opts.now');
});
