/* IntegrityWatch Field — T-06 Fitness-for-Service report model tests
    GOLDEN seed: números exactos (doubles IEEE) de la inspección del seed con
    el PEOR espesor — INSP-N16-004 (ut, severa; anomalías ILI-N16-002 42 % y
    ILI-N16-004 58 % sobre la pared nominal 9.53 mm del SYS-NORTE-16).
    Toda la matemática proviene de calc/ffs.assessLineSystem +
    calc/ffs.screenPit + calc/pipelineAssessment.assessAnomalies (mismo flujo
    que views/pipelines.js); los literales se fijaron tras corrida real.
    Cubre: errores tipados (sin inspectionId, id inexistente), caso monitorizar
    (INSP-N16-002) y sin anomalías (INSP-N16-005), pureza (snapshot de los 4
    stores), claves de traducción existentes en es.js, registro T-06
    needs:['inspectionId'] idempotente y buildReport end-to-end por el renderer. */
'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');

const shim = require('./helpers/dom-shim');
require('../src/calc/units.js');
require('../src/calc/ffs.js');
require('../src/calc/pipelineAssessment.js');
require('../src/data/materials.js');
require('../src/data/standards.js');
const dbMemory = require('../src/core/dbMemory.js');
const storeApi = require('../src/core/store.js');
const seed = require('../src/data/seed.js');
require('../src/reports/model.js');
require('../src/reports/registry.js');
require('../src/reports/renderer.js');
const modelT06 = require('../src/reports/model-t06.js');
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

// ---- valores golden (fijados tras corrida real sobre el seed demo) ---------
// SYS-NORTE-16: dnIn 16 -> D = 16*25.4 = 406.4 mm; t = 9.53; Ri = D/2 − t.
// api5l-x52 no trae smysMpa en el catálogo -> S = 414 (default X52, igual que
// el faceplate FFS); E = 0.85; CA = 1.5 (supuestos L1 documentados en ffs.js).
//   tReq   = P·Ri/(S·E−0.6P) + CA = 6·193.67/348.3 + 1.5  = 4.836261843238588
//   MAWP   = S·E·(t−CA)/(Ri+0.6(t−CA))                   = 14.236412276812702
//   ILI-002: depth 42 % -> pitDepth 4.0026 ≤ 9.53−tReq=4.6937 -> pass
//   ILI-004: depth 58 % -> pitDepth 5.5274 > 4.6937           -> fail
//   pAllow B31G: 5.918618030457341 y 4.187978782839058 (< 6 MPa -> exceeds).
const GOLDEN_KPIS = [4.836261843238588, 4.0026, 14.236412276812702, 58, null];

const GOLDEN_DESIGN_ROWS = [
  { param: 'pipelines.wallThickness (mm)', design: 9.53, assessed: 4.0026 },
  { param: 'pipelines.opPressure (MPa)', design: 6, assessed: 14.236412276812702 },
  { param: 'Ri (mm)', design: 193.67, assessed: 193.67 },
  { param: 'S (MPa)', design: 414, assessed: 414 },
  { param: 'E', design: 0.85, assessed: 0.85 },
  { param: 'ffs.corrosionAllowance (mm)', design: 1.5, assessed: 1.5 }
];

const GOLDEN_PROFILE_ROWS = [
  { stationKm: 24.5, type: 'metalLoss', depthPct: 42, tLocal: 5.5274, l1: 'pass', pAllow: 5.918618030457341, b31g: 'exceeds' },
  { stationKm: 85.1, type: 'metalLoss', depthPct: 58, tLocal: 4.0026, l1: 'fail', pAllow: 4.187978782839058, b31g: 'exceeds' }
];

const GOLDEN_ACCEPTANCE = [
  { textKey: 'reports.t06WallPass', status: 'ok' },
  { textKey: 'reports.t06PitFail', status: 'crit' },
  { textKey: 'reports.t06B31gFail', status: 'crit' },
  { textKey: 'reports.t06EngineerReview', status: 'warn' }
];

test('T-06 golden sobre la inspeccion con peor espesor (INSP-N16-004): numeros exactos', async () => {
  const repos = await seededRepos();
  const m = await modelT06.buildT06Model({ repos, t, now: BUILD_NOW, inspectionId: 'INSP-N16-004' });

  assert.equal(m.id, 'T-06');
  assert.equal(m.meta.titleKey, 'reports.t06Title');
  assert.equal(m.meta.subtitle, 'LA-N16-003 · Norte 16" Crude');
  assert.equal(m.meta.generatedAtISO, new Date(BUILD_NOW).toISOString());
  assert.deepEqual(m.sections.map((s) => s.type), ['cover', 'kpiRow', 'table', 'table', 'list', 'text', 'standards']);

  const cover = m.sections[0];
  assert.equal(cover.titleKey, 'reports.t06Title');
  assert.equal(cover.meta.generatedAtISO, new Date(BUILD_NOW).toISOString());

  const kpis = m.sections[1];
  assert.equal(kpis.titleKey, 'reports.kpis');
  assert.deepEqual(kpis.items.map((k) => k.value), GOLDEN_KPIS);
  assert.deepEqual(kpis.items.map((k) => k.labelKey), [
    'ffs.tRequired', 'reports.t06TMeasuredMin', 'ffs.mawpAssessed', 'reports.t06WallLossPct', 'corrosion.remainingLife'
  ]);

  const design = m.sections[2];
  assert.deepEqual(design.columns.map((c) => c.key), ['param', 'design', 'assessed']);
  assert.deepEqual(design.rows, GOLDEN_DESIGN_ROWS);
  assert.equal(design.noteKey, 'reports.t06RulNote');

  const profile = m.sections[3];
  assert.deepEqual(profile.columns.map((c) => c.key), ['stationKm', 'type', 'depthPct', 'tLocal', 'l1', 'pAllow', 'b31g']);
  assert.deepEqual(profile.rows, GOLDEN_PROFILE_ROWS);

  assert.deepEqual(m.sections[4].items, GOLDEN_ACCEPTANCE);

  assert.equal(m.sections[5].type, 'text');
  assert.equal(m.sections[5].titleKey, 'reports.t06DecisionTitle');
  assert.equal(m.sections[5].bodyKey, 'reports.t06DecisionRepair');
  assert.equal(m.sections[5].noteKey, 'reports.t06DecisionNote');

  assert.deepEqual(m.sections[6].items, [
    { id: 'API 579-1/ASME FFS-1', title: 'Fitness-For-Service' },
    { id: 'ASME B31G', title: 'Determining the Remaining Strength of Corroded Sections in Pipelines' }
  ]);
  assert.deepEqual(m.disclaimer, { type: 'disclaimer', labelKey: 'reports.disclaimer' });
});

test('T-06 caso monitorizar: INSP-N16-002 pasa todos los tamizajes L1/B31G', async () => {
  const repos = await seededRepos();
  const m = await modelT06.buildT06Model({ repos, t, now: BUILD_NOW, inspectionId: 'INSP-N16-002' });
  assert.deepEqual(m.sections[1].items.map((k) => k.value), [4.836261843238588, 7.147499999999999, 14.236412276812702, 25, null]);
  assert.deepEqual(m.sections[3].rows, [
    { stationKm: 13.7, type: 'crack', depthPct: 25, tLocal: 7.147499999999999, l1: 'pass', pAllow: 7.144409734547659, b31g: 'ok' }
  ]);
  assert.deepEqual(m.sections[4].items, [
    { textKey: 'reports.t06WallPass', status: 'ok' },
    { textKey: 'reports.t06PitPass', status: 'ok' },
    { textKey: 'reports.t06B31gPass', status: 'ok' }
  ]);
  assert.equal(m.sections[5].bodyKey, 'reports.t06DecisionMonitor');
  assert.deepEqual(m.sections[6].items.map((s) => s.id), ['API 579-1/ASME FFS-1', 'ASME B31G']);
});

test('T-06 inspeccion sin anomalias (INSP-N16-005): perfil vacio, monitorizar, solo API 579', async () => {
  const repos = await seededRepos();
  const m = await modelT06.buildT06Model({ repos, t, now: BUILD_NOW, inspectionId: 'INSP-N16-005' });
  assert.equal(m.meta.subtitle, 'LA-N16-008 · Norte 16" Crude');
  assert.deepEqual(m.sections[1].items.map((k) => k.value), [4.836261843238588, 9.53, 14.236412276812702, 0, null]);
  assert.deepEqual(m.sections[3].rows, []);
  assert.equal(m.sections[3].emptyKey, 'reports.noData');
  assert.deepEqual(m.sections[4].items, [{ textKey: 'reports.t06WallPass', status: 'ok' }]);
  assert.equal(m.sections[5].bodyKey, 'reports.t06DecisionMonitor');
  assert.deepEqual(m.sections[6].items.map((s) => s.id), ['API 579-1/ASME FFS-1']);
});

// ---- casos de error tipados ---------------------------------------------------

test('T-06 sin inspectionId: rechazo tipado E_MISSING_INPUT (ausente, vacio y null)', async () => {
  const repos = await seededRepos();
  for (const opts of [{ repos, t }, { repos, t, inspectionId: '' }, { repos, t, inspectionId: null }]) {
    const err = await modelT06.buildT06Model(opts).then(
      () => { throw new Error('expected rejection'); },
      (e) => e
    );
    assert.equal(err.code, 'E_MISSING_INPUT');
    assert.match(err.message, /^E_MISSING_INPUT: inspectionId is required/);
  }
});

test('T-06 inspectionId inexistente: rechazo tipado E_NOT_FOUND', async () => {
  const repos = await seededRepos();
  const err = await modelT06.buildT06Model({ repos, t, now: BUILD_NOW, inspectionId: 'INSP-NOEXISTE' }).then(
    () => { throw new Error('expected rejection'); },
    (e) => e
  );
  assert.equal(err.code, 'E_NOT_FOUND');
  assert.match(err.message, /line inspection not found: INSP-NOEXISTE/);
});

// ---- pureza: no mutacion --------------------------------------------------------

test('T-06 modelo puro: los 4 stores del seed salen intactos (snapshot)', async () => {
  const repos = await seededRepos();
  const names = ['lineInspections', 'pipelineSystems', 'lineAssets', 'iliAnomalies'];
  const beforeSnap = {};
  for (const n of names) { beforeSnap[n] = JSON.stringify(await repos[n].list()); }
  await modelT06.buildT06Model({ repos, t, now: BUILD_NOW, inspectionId: 'INSP-N16-004' });
  for (const n of names) {
    assert.equal(JSON.stringify(await repos[n].list()), beforeSnap[n], n + ' sin mutaciones');
  }
});

// ---- claves de traduccion ---------------------------------------------------------

function collectKeys(node, acc) {
  if (node === null || typeof node !== 'object') { return acc; }
  if (Array.isArray(node)) { node.forEach((n) => collectKeys(n, acc)); return acc; }
  for (const key of ['titleKey', 'labelKey', 'textKey', 'bodyKey', 'emptyKey', 'noteKey', 'unit', 'generatedKey']) {
    if (typeof node[key] === 'string') { acc.add(node[key]); }
  }
  for (const k of Object.keys(node)) { collectKeys(node[k], acc); }
  return acc;
}

function resolveKey(obj, dotted) {
  return dotted.split('.').reduce((cur, part) => (cur && typeof cur === 'object' ? cur[part] : undefined), obj);
}

test('todas las claves usadas por el modelo T-06 existen en es.js (y NEW_LOCALE_KEYS es exacta)', async () => {
  const repos = await seededRepos();
  const m = await modelT06.buildT06Model({ repos, t, now: BUILD_NOW, inspectionId: 'INSP-N16-004' });
  const keys = collectKeys(m, new Set());
  keys.add('reports.t06Title');
  keys.add('reports.pageFooter');
  assert.ok(keys.size >= 25, 'expected the full key set, got ' + keys.size);
  for (const key of keys) {
    assert.ok(typeof resolveKey(es, key) === 'string', 'es.js missing key "' + key + '"');
  }
  assert.deepEqual(modelT06.NEW_LOCALE_KEYS.slice().sort(), [
    'reports.t06Acceptance',
    'reports.t06Assessed',
    'reports.t06B31g',
    'reports.t06B31gFail',
    'reports.t06B31gPass',
    'reports.t06DecisionMonitor',
    'reports.t06DecisionNote',
    'reports.t06DecisionRepair',
    'reports.t06DecisionReplace',
    'reports.t06DecisionReview',
    'reports.t06DecisionTitle',
    'reports.t06Design',
    'reports.t06DesignVsMeasured',
    'reports.t06EngineerReview',
    'reports.t06Param',
    'reports.t06PitFail',
    'reports.t06PitPass',
    'reports.t06Profile',
    'reports.t06RulNote',
    'reports.t06ScreenL1',
    'reports.t06TLocal',
    'reports.t06TMeasuredMin',
    'reports.t06Title',
    'reports.t06WallFail',
    'reports.t06WallLossPct',
    'reports.t06WallPass',
    'units.MPa',
    'units.mm'
  ]);
  for (const key of modelT06.NEW_LOCALE_KEYS) {
    assert.ok(typeof resolveKey(es, key) === 'string', 'es.js no tiene la clave nueva "' + key + '"');
  }
});

// ---- registro -------------------------------------------------------------------------

test('T-06 queda registrado en el registry con needs [inspectionId] y sin duplicados', async () => {
  const entry = registry.get('T-06');
  assert.ok(entry, 'T-06 presente');
  assert.equal(entry.titleKey, 'reports.t06Title');
  assert.deepEqual(entry.needs, ['inspectionId']);
  const repos = await seededRepos();
  await modelT06.buildT06Model({ repos, t, now: BUILD_NOW, inspectionId: 'INSP-N16-004' });
  await modelT06.buildT06Model({ repos, t, now: BUILD_NOW, inspectionId: 'INSP-N16-004' });
  const t06 = registry.list().filter((x) => x.id === 'T-06');
  assert.equal(t06.length, 1, 'registerSelf idempotente no duplica');
  assert.throws(() => registry.register({ id: 'T-06', titleKey: 'x', needs: [], buildModel: () => Promise.resolve({}) }),
    /duplicate report template: T-06/);
});

// ---- helpers de render (misma forma que report-t03.test.js) ---------------------------

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

test('buildReport end-to-end renderiza el modelo T-06 (INSP-N16-004)', async () => {
  const repos = await seededRepos();
  const doc = await registry.build('T-06', { repos, t, now: BUILD_NOW, inspectionId: 'INSP-N16-004' });
  const root = outline(doc);

  assert.equal(root.tag, 'div');
  assert.ok(hasClass(root, 'print-root') && hasClass(root, 'report') && hasClass(root, 'report-T-06'));

  const header = (root.children || []).find((c) => c.tag === 'header' && hasClass(c, 'report-cover'));
  const h1 = (header.children || []).find((c) => c.tag === 'h1');
  assert.equal(h1 && h1.text, 'reports.t06Title');
  const sub = (header.children || []).find((c) => c.tag === 'p' && hasClass(c, 'report-cover-subtitle'));
  assert.equal(sub.text, 'LA-N16-003 · Norte 16" Crude');

  const sections = (root.children || []).filter((c) => c.tag === 'section' && hasClass(c, 'report-section'));
  assert.deepEqual(sections.map((s) => (s.children || [])[0].text), [
    'reports.kpis',
    'reports.t06DesignVsMeasured',
    'reports.t06Profile',
    'reports.t06Acceptance',
    'reports.t06DecisionTitle',
    'reports.standardsApplied'
  ]);

  // KPIs con fmtNum sin i18n cargado: String(number) a precision completa;
  // RUL nulo muestra '—' con su unidad.
  const kpiTexts = findAll(root, (n) => n.tag === 'div' && hasClass(n, 'report-kpi'))
    .map((kpi) => kpi.children[1].text);
  assert.deepEqual(kpiTexts, [
    '4.836261843238588 units.mm',
    '4.0026 units.mm',
    '14.236412276812702 units.MPa',
    '58 units.pct',
    '— common.months'
  ]);

  const tables = findAll(root, (n) => n.tag === 'div' && hasClass(n, 'report-table'));
  const bodies = tables.map((tbl) => tbl.children.find((c) => c.tag === 'table').children.find((c) => c.tag === 'tbody'));
  assert.equal((bodies[0].children || []).filter((c) => c.tag === 'tr').length, 6, 'diseno vs evaluado: 6 filas');
  assert.equal((bodies[1].children || []).filter((c) => c.tag === 'tr').length, 2, 'perfil: 2 anomalias');
  assert.equal((bodies[2].children || []).filter((c) => c.tag === 'tr').length, 2, 'estandar: API 579 + B31G');

  const lis = findAll(root, (n) => n.tag === 'ul' && hasClass(n, 'report-list'))[0];
  assert.deepEqual((lis.children || []).map((li) => li.text), [
    'reports.t06WallPass',
    'reports.t06PitFail',
    'reports.t06B31gFail',
    'reports.t06EngineerReview'
  ]);

  const decision = findAll(root, (n) => n.tag === 'p' && hasClass(n, 'report-text'))[0];
  assert.equal(decision.text, 'reports.t06DecisionRepair');

  assert.equal(findAll(root, (n) => n.tag === 'div' && hasClass(n, 'report-disclaimer')).length, 1);
  assert.ok(findAll(root, (n) => n.tag === 'footer' && hasClass(n, 'report-footer')).length === 1);
  assert.equal(findAll(root, (n) => n.tag === 'p' && hasClass(n, 'report-cover-generated') && n.text.indexOf('reports.generatedAt') === 0).length, 1,
    'linea generado-a a partir de opts.now');
});

test('buildReport propaga el error tipado cuando falta inspectionId', async () => {
  const repos = await seededRepos();
  const err = await registry.build('T-06', { repos, t, now: BUILD_NOW }).then(
    () => { throw new Error('expected rejection'); },
    (e) => e
  );
  assert.equal(err.code, 'E_MISSING_INPUT');
});
