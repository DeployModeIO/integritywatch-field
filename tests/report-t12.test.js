/* IntegrityWatch Field — T-12 cierre y handover offline report model tests
   Sintesisa sesiones REALES: importa con IW.ingest.commit.run sobre los repos
   sembrados (dbMemory) y revierte una sesión con commit.rollback, de modo que
   el modelo consume el formato exacto que commit.js persiste en importLog y
   agrupa importSessions. Cubre: seed sin sesiones (KPIs 0 honestos), golden
   counts exactos por sesión, ventana por periodo, cola de sincronización y
   integridad del expediente leídas de meta, no-mutación, claves en es.js,
   registro T-12 idempotente y buildReport end-to-end con el renderer real. */
'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');

const shim = require('./helpers/dom-shim');
require('../src/calc/units.js');
require('../src/calc/corrosion.js');
require('../src/calc/apm.js');
require('../src/calc/cui583.js');
require('../src/core/bus.js');
require('../src/data/standards.js');
const dbMemory = require('../src/core/dbMemory.js');
const storeApi = require('../src/core/store.js');
const seed = require('../src/data/seed.js');
require('../src/ingest/schemas.js');
const commit = require('../src/ingest/commit.js');
require('../src/reports/model.js');
require('../src/reports/charts.js');
require('../src/reports/registry.js');
require('../src/reports/renderer.js');
const modelT12 = require('../src/reports/model-t12.js');
const registry = require('../src/reports/registry.js');
const es = require('../src/i18n/locales/es.js');

const t = (key) => key;
const SEED_NOW = '2026-09-15T00:00:00.000Z';
const BUILD_NOW = '2026-11-03T12:00:00.000Z';

before(() => shim.install());
after(() => shim.uninstall());

function newRepos() {
  const adapter = dbMemory.create();
  const repos = storeApi.create(adapter);
  repos.db = adapter;
  return repos;
}

function seededRepos() {
  const repos = newRepos();
  return seed.demo(repos, { nowISO: SEED_NOW }).then(() => repos);
}

// columnPlan readings: mpId + date + crMpy (clave natural mpId|date).
const PLAN = [
  { col: 0, field: 'mpId', unitFrom: null },
  { col: 1, field: 'date', unitFrom: null },
  { col: 2, field: 'crMpy', unitFrom: null }
];

// Mini-importación REAL con el motor commit.js sobre los repos sembrados:
// 2 inserts (fecha lejana, sin colisión) + 1 update de una lectura del seed.
async function runMiniImport(repos, journalId, rows) {
  return commit.run({
    storeName: 'readings',
    columnPlan: PLAN,
    rows: rows,
    repo: repos.readings,
    importLogRepo: repos.importLog,
    metaRepo: repos.meta,
    fingerprint: 'fp-' + journalId,
    journalId: journalId,
    actor: { user: 'tester' }
  });
}

// ---- golden (corrida real fijada) ------------------------------------------
// Seed: importLog vacío → sin sesiones. recommendations 0 (el seed no las
// crea). Cobertura: 5 lineInspections / 12 lineAssets = 41.666666666666664 %.
// Meta sin 'caseFile.lastISO' → integridad null (honesto, el renderer pinta '—').
const SEED_COVERAGE_PCT = 41.66666666666667;

test('T-12 over the demo seed: no sessions, honest zero/absent KPIs', async () => {
  const repos = await seededRepos();
  const m = await modelT12.buildT12Model({ repos, t, now: BUILD_NOW });

  assert.equal(m.id, 'T-12');
  assert.equal(m.meta.titleKey, 'reports.t12Title');
  assert.equal(m.meta.generatedAtISO, new Date(BUILD_NOW).toISOString());
  assert.deepEqual(m.sections.map((s) => s.type), ['cover', 'kpiRow', 'table', 'list', 'text', 'standards']);

  const kpis = m.sections[1].items;
  assert.deepEqual(kpis.map((k) => k.labelKey), [
    'reports.t12KpiRows', 'reports.t12KpiRecs', 'reports.t12KpiCoverage', 'reports.t12KpiIntegrity'
  ]);
  assert.deepEqual(kpis.map((k) => k.value), [0, 0, SEED_COVERAGE_PCT, null]);
  assert.equal(kpis[2].unit, 'units.pct');

  // Sesiones: tabla vacía con emptyKey honesto.
  const table = m.sections[2];
  assert.deepEqual(table.rows, []);
  assert.equal(table.emptyKey, 'reports.noData');
  assert.equal(table.titleKey, 'reports.t12SessionsTitle');

  // Contenido del paquete: checklist fijo de 6 elementos, solo labelKeys.
  assert.deepEqual(m.sections[3].items.map((i) => i.textKey), [
    'reports.t12PkgPdf', 'reports.t12PkgJson', 'reports.t12PkgCsv',
    'reports.t12PkgPhotos', 'reports.t12PkgManifest', 'reports.t12PkgSha256'
  ]);

  // Cola vacía y sin endpoint, con las etiquetas existentes interpuestas vía opts.t.
  assert.equal(m.sections[4].titleKey, 'ingest.queueTitle');
  assert.equal(m.sections[4].body,
    'ingest.queuePending: 0 · ingest.deadCount: 0 · ingest.syncEndpoint: reports.t12EndpointMissing');
  assert.equal(m.sections[4].noteKey, 'ingest.endpointNote');

  assert.deepEqual(m.sections[5].items,
    [{ id: 'ISO 55000', title: 'Asset management — Overview, principles and terminology' }]);
  assert.deepEqual(m.disclaimer, { type: 'disclaimer', labelKey: 'reports.disclaimer' });
});

test('T-12 consumes the real journal shape written by commit.js (mini import + rollback)', async () => {
  const repos = await seededRepos();

  // Update de una lectura sembrada: reutilizo su clave natural EXACTA.
  const readings = await repos.readings.list();
  const target = readings.find((r) => r.mpId === 'MP-CORR-001');
  assert.ok(target && typeof target.crMpy === 'number');

  await runMiniImport(repos, 'J-GOLD-1', [
    { row: ['MP-CORR-008', '2099-01-01T00:00:00.000Z', '1.1'], rowNo: 2 },
    { row: ['MP-CORR-008', '2099-01-02T00:00:00.000Z', '1.2'], rowNo: 3 },
    { row: [target.mpId, target.date, String(target.crMpy + 0.5)], rowNo: 4 }
  ]);

  // Segunda sesión, revertida: deja rolledBack=true y status 'rolled-back'.
  await runMiniImport(repos, 'J-GOLD-2', [
    { row: ['MP-CORR-008', '2099-02-01T00:00:00.000Z', '2.2'], rowNo: 2 }
  ]);
  await commit.rollback({
    journalId: 'J-GOLD-2',
    importLogRepo: repos.importLog,
    repo: repos.readings,
    metaRepo: repos.meta
  });

  // El expediente .iwf aún NO se construye aquí: solo se refleja su meta.
  await repos.meta.set('caseFile.lastISO', '2026-11-03T05:00:00.000Z');

  const m = await modelT12.buildT12Model({ repos, t, now: BUILD_NOW });

  // Suma inserts+updates de TODAS las sesiones (4 = (2+1) + (1+0)).
  assert.equal(m.sections[1].items[0].value, 4);
  assert.equal(m.sections[1].items[3].value, '2026-11-03T05:00:00.000Z');

  const rows = m.sections[2].rows;
  assert.equal(rows.length, 2);
  const byId = {};
  rows.forEach((r) => { byId[r.file] = r; });

  // Shape REAL de importSessions (verificado en commit.js:784-811):
  // {importId, storeName, batches, inserts, updates, rolledBack, startedAt, lastAt, status}
  assert.deepEqual(Object.keys(rows[0]), ['date', 'file', 'entity', 'inserts', 'updates', 'status', 'rolledBack']);
  assert.deepEqual(byId['J-GOLD-1'], {
    date: byId['J-GOLD-1'].date, // ISO real del diario: no fijable, se valida abajo
    file: 'J-GOLD-1',
    entity: 'readings',
    inserts: 2,
    updates: 1,
    status: 'done',
    rolledBack: 'no'
  });
  assert.deepEqual(byId['J-GOLD-2'], {
    date: byId['J-GOLD-2'].date,
    file: 'J-GOLD-2',
    entity: 'readings',
    inserts: 1,
    updates: 0,
    status: 'rolled-back',
    rolledBack: 'yes'
  });
  for (const r of rows) {
    assert.ok(typeof r.date === 'string' && !isNaN(Date.parse(r.date)), 'fecha ISO parseable');
  }
});

test('T-12 period bounds sessions and inspections from both sides', async () => {
  const repos = await seededRepos();
  await runMiniImport(repos, 'J-PER-1', [
    { row: ['MP-CORR-008', '2099-03-01T00:00:00.000Z', '3.3'], rowNo: 2 }
  ]);

  // Julio 2026: del seed solo INSP-N16-002 (60 d antes del 15-sep = 17-jul)
  // cae en [2026-07-01, 2026-08-01): INSP-N16-001 es 27-jun (80 d) y
  // INSP-N16-003 es justo 01-ago (borde EXCLUIDO) → 1/12*100. La sesión
  // (lastAt ≈ hoy real, nov-2026) queda FUERA.
  const m = await modelT12.buildT12Model({
    repos, t, now: BUILD_NOW,
    period: { fromISO: '2026-07-01T00:00:00.000Z', toISO: '2026-08-01T00:00:00.000Z' }
  });
  assert.equal(m.sections[1].items[0].value, 0, 'sessions outside the period must NOT leak');
  assert.equal(m.sections[1].items[2].value, 8.333333333333332);
  assert.deepEqual(m.sections[2].rows, []);
  assert.deepEqual(m.sections[0].meta.period, { fromISO: '2026-07-01T00:00:00.000Z', toISO: '2026-08-01T00:00:00.000Z' });
});

test('T-12 reports sync queue pending/dead counts and a configured endpoint', async () => {
  const repos = await seededRepos();
  const nowISO = new Date().toISOString();
  // Docs de cola con el shape REAL que escribe syncQueue.enqueue.
  await repos.db.put('mutationQueue', { id: 'mq-1', op: { type: 'put', store: 'readings', rec: { id: 'x' } }, createdAt: nowISO, attempts: 0, dead: false });
  await repos.db.put('mutationQueue', { id: 'mq-2', op: { type: 'delete', store: 'coupons', id: 'y' }, createdAt: nowISO, attempts: 1, dead: false });
  await repos.db.put('mutationQueue', { id: 'mq-3', op: { type: 'put', store: 'readings', rec: { id: 'z' } }, createdAt: nowISO, attempts: 5, dead: true, lastError: 'E_INSECURE_ENDPOINT' });
  await repos.meta.set('syncEndpoint', 'https://collectors.example/api/mutations');

  const m = await modelT12.buildT12Model({ repos, t, now: BUILD_NOW });
  assert.equal(m.sections[4].body,
    'ingest.queuePending: 2 · ingest.deadCount: 1 · ingest.syncEndpoint: reports.t12EndpointSet');
});

test('T-12 model is pure: seeded and journal stores are not mutated (snapshot)', async () => {
  const repos = await seededRepos();
  await runMiniImport(repos, 'J-PURE', [
    { row: ['MP-CORR-008', '2099-04-01T00:00:00.000Z', '4.4'], rowNo: 2 }
  ]);
  const snap = async () => JSON.stringify([
    await repos.importLog.list(),
    await repos.readings.list(),
    await repos.lineInspections.list(),
    await repos.recommendations.list()
  ]);
  const beforeSnap = await snap();
  await modelT12.buildT12Model({ repos, t, now: BUILD_NOW });
  await modelT12.buildT12Model({ repos, t, now: BUILD_NOW });
  assert.equal(await snap(), beforeSnap, 'input records untouched across two builds');
});

// Collect every value of the translation-key properties used by the model.
function collectKeys(node, acc) {
  if (node === null || typeof node !== 'object') { return acc; }
  if (Array.isArray(node)) { node.forEach((n) => collectKeys(n, acc)); return acc; }
  for (const key of ['titleKey', 'labelKey', 'textKey', 'emptyKey', 'noteKey', 'bodyKey', 'unit', 'subtitleKey']) {
    if (typeof node[key] === 'string') { acc.add(node[key]); }
  }
  for (const k of Object.keys(node)) { collectKeys(node[k], acc); }
  return acc;
}

function resolveKey(obj, dotted) {
  return dotted.split('.').reduce((cur, part) => (cur && typeof cur === 'object' ? cur[part] : undefined), obj);
}

test('every translation key used by the T-12 model exists in es.js', async () => {
  const repos = await seededRepos();
  await repos.db.put('mutationQueue', { id: 'mq-1', op: { type: 'put', store: 'readings', rec: { id: 'x' } }, createdAt: new Date().toISOString(), attempts: 0, dead: false });
  const m = await modelT12.buildT12Model({ repos, t, now: BUILD_NOW });
  const keys = collectKeys(m, new Set());
  keys.add('reports.t12Title');
  assert.ok(keys.size >= 20, 'expected the full key set, got ' + keys.size);
  for (const key of keys) {
    assert.ok(typeof resolveKey(es, key) === 'string', 'es.js missing key "' + key + '"');
  }
});

test('T-12 is registered in the report registry exactly once', async () => {
  const entry = registry.get('T-12');
  assert.ok(entry, 'T-12 present');
  assert.equal(entry.titleKey, 'reports.t12Title');
  assert.deepEqual(entry.needs, []);
  const repos = await seededRepos();
  await modelT12.buildT12Model({ repos, t, now: BUILD_NOW });
  await modelT12.buildT12Model({ repos, t, now: BUILD_NOW });
  const t12 = registry.list().filter((x) => x.id === 'T-12');
  assert.equal(t12.length, 1, 'idempotent registerSelf does not duplicate');
  assert.throws(() => registry.register({ id: 'T-12', titleKey: 'x', needs: [], buildModel: () => Promise.resolve({}) }),
    /duplicate report template: T-12/);
});

// ---- render helpers (same shape as report-t09.test.js) ----------------------
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

test('buildReport end-to-end renders the T-12 model with the real renderer', async () => {
  const repos = await seededRepos();
  await runMiniImport(repos, 'J-E2E', [
    { row: ['MP-CORR-008', '2099-05-01T00:00:00.000Z', '5.5'], rowNo: 2 }
  ]);
  const doc = await registry.build('T-12', { repos, t, now: BUILD_NOW });
  const root = outline(doc);

  assert.equal(root.tag, 'div');
  assert.ok(hasClass(root, 'print-root') && hasClass(root, 'report') && hasClass(root, 'report-T-12'));

  const header = (root.children || []).find((c) => c.tag === 'header' && hasClass(c, 'report-cover'));
  const h1 = header ? (header.children || []).find((c) => c.tag === 'h1') : null;
  assert.equal(h1 && h1.text, 'reports.t12Title');
  const sub = header ? (header.children || []).find((c) => c.tag === 'p' && hasClass(c, 'report-cover-subtitle')) : null;
  assert.equal(sub && sub.text, 'reports.t12Subtitle');

  const sections = (root.children || []).filter((c) => c.tag === 'section' && hasClass(c, 'report-section'));
  assert.deepEqual(sections.map((s) => (s.children || [])[0].text), [
    'reports.kpis',
    'reports.t12SessionsTitle',
    'reports.t12PackageTitle',
    'ingest.queueTitle',
    'reports.standardsApplied'
  ]);

  const tables = findAll(root, (n) => n.tag === 'div' && hasClass(n, 'report-table'));
  const tbody = tables[0].children.find((c) => c.tag === 'table').children.find((c) => c.tag === 'tbody');
  assert.equal((tbody.children || []).filter((c) => c.tag === 'tr').length, 1, 'the one real session renders');

  const lis = findAll(root, (n) => n.tag === 'ul' && hasClass(n, 'report-list'))[0];
  assert.equal((lis.children || []).filter((c) => c.tag === 'li').length, 6);

  const queueText = findAll(root, (n) => n.tag === 'p' && hasClass(n, 'report-text'))[0];
  assert.equal(queueText.text,
    'ingest.queuePending: 0 · ingest.deadCount: 0 · ingest.syncEndpoint: reports.t12EndpointMissing');

  assert.equal(findAll(root, (n) => n.tag === 'div' && hasClass(n, 'report-disclaimer')).length, 1);
  assert.ok(findAll(root, (n) => n.tag === 'footer' && hasClass(n, 'report-footer')).length === 1);
  assert.equal(findAll(root, (n) => n.tag === 'p' && hasClass(n, 'report-cover-generated') && n.text.indexOf('reports.generatedAt') === 0).length, 1,
    'deterministic generated-at line rendered from opts.now');
});
