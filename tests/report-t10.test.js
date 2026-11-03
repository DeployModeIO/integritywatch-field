/* IntegrityWatch Field — T-10 ducto por amenazas (ASME B31.8S) report tests
    GOLDEN del sistema del seed (SYS-NORTE-16): numeros EXACTOS de corrida real
    (ver %TEMP%\kilo\iw-t10-golden.cjs en su momento). Toda la matematica de
    presion admisible proviene de calc/pipelineAssessment.assessAnomalies con el
    mismo flujo y parametros que views/pipelines.js renderIliPanel (Su 414 —
    api5l-x52 sin smysMpa en el catalogo —, D = 16*25.4, t = 9.53, designFactor
    0.72, opPressure 6); los pAllow 5.918618030457341 / 4.187978782839058 /
    7.144409734547659 coinciden bit a bit con el golden de T-06 para las mismas
    anomalias, lo que confirma la reutilizacion sin deriva.
    Cubre: golden completo (kpiRow, amenazas, hallazgos, plan, MOC/QC, datos
    ausentes, normas), filtro por periodo (cotas both-side, precedente T-09),
    sistema sin datos (filas vacias, B31G no aplicado, sin status), errores
    tipados (systemId ausente/vacio/null; id inexistente), pureza (snapshot de
    los 4 stores), claves existentes en es.js + NEW_LOCALE_KEYS exacta,
    registro T-10 needs:['systemId'] idempotente y buildReport end-to-end por
    el renderer SIN console.warn (todos los tipos de seccion soportados). */
'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');

const shim = require('./helpers/dom-shim');
require('../src/calc/units.js');
require('../src/calc/pipelineAssessment.js');
require('../src/data/materials.js');
require('../src/data/standards.js');
const dbMemory = require('../src/core/dbMemory.js');
const storeApi = require('../src/core/store.js');
const seed = require('../src/data/seed.js');
require('../src/reports/model.js');
require('../src/reports/registry.js');
require('../src/reports/renderer.js');
const modelT10 = require('../src/reports/model-t10.js');
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
// Tramo por lineAssets: stationKm min 0 (LA-N16-001) / max 120 (LA-N16-012).
// Cobertura sin periodo = union de los 5 tramos de inspeccion: [10,14]+
// [22,26]+[38,42]+[70,74]+[100,120] = 36 km exactos (sin traslapes).
// Severidades (todas las inspecciones): severe 1 (004), high 1 (003),
// moderate 1 (001); low 2 fuera de los tres KPIs pedidos.
const GOLDEN_KPIS = [36, 1, 1, 1, 6, 4.187978782839058, null];

// Buckets honestos desde los types reales: metalLoss+crack -> timeDependent
// (5 anomalias: ILI-001/002/004/005/006), dent -> stable (ILI-003), random 0.
// Evidencia: ild+externalCorrosion+ut = 3 inspecciones tiempo-dependiente;
// visual (003/005) no es amenaza -> no cuenta.
const GOLDEN_THREATS = [
  { category: 'timeDependent', anomalies: 5, inspections: 3, maxDepthPct: 58 },
  { category: 'stable', anomalies: 1, inspections: 0, maxDepthPct: 12 },
  { category: 'random', anomalies: 0, inspections: 0, maxDepthPct: null }
];

// Hallazgos por km (orden stationKm asc), severidad heredada de la inspeccion
// vinculada, pAllow/exceeds por pipelineAssessment (Su 414, D 406.4, t 9.53).
const GOLDEN_FINDINGS = [
  { stationKm: 13.7, type: 'crack', severity: 'low', depthPct: 25, pAllow: 7.144409734547659, b31g: 'ok' },
  { stationKm: 24.5, type: 'metalLoss', severity: 'severe', depthPct: 42, pAllow: 5.918618030457341, b31g: 'exceeds' },
  { stationKm: 40.8, type: 'dent', severity: 'high', depthPct: 12, pAllow: 7.643528411143699, b31g: 'ok' },
  { stationKm: 85.1, type: 'metalLoss', severity: 'severe', depthPct: 58, pAllow: 4.187978782839058, b31g: 'exceeds' },
  { stationKm: 92.3, type: 'metalLoss', severity: 'moderate', depthPct: 8, pAllow: 7.812865379984927, b31g: 'ok' },
  { stationKm: 106.2, type: 'metalLoss', severity: 'moderate', depthPct: 18, pAllow: 7.635756636960476, b31g: 'ok' }
];

const GOLDEN_PLAN = [
  { textKey: 'reports.t10ActionRepair', status: 'crit' },
  { textKey: 'reports.t10ActionCrackAssess', status: 'crit' },
  { textKey: 'reports.t10ActionDentAssess', status: 'warn' },
  { textKey: 'reports.t10ActionCover', status: 'warn' },
  { textKey: 'reports.t10ActionReassess' }
];

const GOLDEN_STANDARDS = [
  { id: 'ASME B31.8S', title: 'Managing Integrity for Gas Transmission and Distribution Piping Systems' },
  { id: 'API 1160', title: 'Managing Integrity Systems for Hazardous Liquid Pipeline Systems' },
  { id: 'ASME B31G', title: 'Determining the Remaining Strength of Corroded Sections in Pipelines' }
];

// ---- golden seed -----------------------------------------------------------------

test('T-10 golden sobre SYS-NORTE-16 del seed: numeros exactos de corrida real', async () => {
  const repos = await seededRepos();
  const m = await modelT10.buildT10Model({ repos, t, now: BUILD_NOW, systemId: 'SYS-NORTE-16' });

  assert.equal(m.id, 'T-10');
  assert.equal(m.meta.titleKey, 'reports.t10Title');
  assert.equal(m.meta.subtitle, 'Norte Operator S.A. · Norte 16" Crude · km 0–120');
  assert.equal(m.meta.generatedAtISO, new Date(BUILD_NOW).toISOString());
  assert.equal(m.meta.footer.textKey, 'reports.pageFooter');
  assert.deepEqual(m.sections.map((s) => s.type),
    ['cover', 'kpiRow', 'table', 'table', 'list', 'text', 'text', 'standards']);

  const cover = m.sections[0];
  assert.equal(cover.titleKey, 'reports.t10Title');
  assert.equal(cover.meta.generatedAtISO, new Date(BUILD_NOW).toISOString());
  assert.equal(cover.meta.period, undefined);

  const kpis = m.sections[1];
  assert.equal(kpis.titleKey, 'reports.kpis');
  assert.deepEqual(kpis.items.map((k) => k.labelKey), [
    'reports.t10KpiCoveredKm', 'reports.t10KpiSevCrit', 'reports.t10KpiSevAlta',
    'reports.t10KpiSevMedia', 'pipelines.opPressure', 'reports.t10KpiMinPAllow',
    'corrosion.remainingLife'
  ]);
  assert.deepEqual(kpis.items.map((k) => k.value), GOLDEN_KPIS);
  assert.deepEqual(kpis.items.map((k) => k.status || null),
    [null, null, null, null, null, 'crit', null]);

  const threats = m.sections[2];
  assert.equal(threats.titleKey, 'reports.t10Threats');
  assert.deepEqual(threats.columns.map((c) => c.key), ['category', 'anomalies', 'inspections', 'maxDepthPct']);
  assert.deepEqual(threats.rows, GOLDEN_THREATS);
  assert.equal(threats.noteKey, 'reports.t10ThreatNote');

  const findings = m.sections[3];
  assert.equal(findings.titleKey, 'reports.t10Findings');
  assert.deepEqual(findings.columns.map((c) => c.key),
    ['stationKm', 'type', 'severity', 'depthPct', 'pAllow', 'b31g']);
  assert.deepEqual(findings.rows, GOLDEN_FINDINGS);
  assert.equal(findings.noteKey, 'reports.t10RulNote');

  assert.deepEqual(m.sections[4].items, GOLDEN_PLAN);
  assert.equal(m.sections[4].titleKey, 'reports.t10Plan');

  assert.equal(m.sections[5].type, 'text');
  assert.equal(m.sections[5].titleKey, 'reports.t10MocQc');
  assert.equal(m.sections[5].bodyKey, 'reports.t10MocBody');
  assert.equal(m.sections[5].noteKey, 'reports.t10QcNote');
  assert.equal(m.sections[6].titleKey, 'reports.t10DataGaps');
  assert.equal(m.sections[6].bodyKey, 'reports.t10DataGapsBody');

  assert.deepEqual(m.sections[7].items, GOLDEN_STANDARDS);
  assert.deepEqual(m.disclaimer, { type: 'disclaimer', labelKey: 'reports.disclaimer' });
});

test('T-10 periodo acotado por ambos lados: cobertura y severidades del ventana', async () => {
  const repos = await seededRepos();
  const period = { fromISO: '2026-08-01T00:00:00.000Z', toISO: '2026-08-31T23:59:59.999Z' };
  const m = await modelT10.buildT10Model({ repos, t, now: BUILD_NOW, systemId: 'SYS-NORTE-16', period });
  // En ventana: INSP-003 (2026-08-01, high, 38-42), INSP-004 (08-16, severe,
  // 22-26), INSP-005 (08-31, low, 70-74) -> cubiertos 12 km exactos; crit 1,
  // alta 1, media 0. Evidencia timeDependent: solo la ut INSP-004 -> 1.
  assert.deepEqual(m.sections[0].meta.period, period);
  assert.deepEqual(m.sections[1].items.map((k) => k.value), [12, 1, 1, 0, 6, 4.187978782839058, null]);
  assert.deepEqual(m.sections[2].rows.map((r) => r.inspections), [1, 0, 0]);
  // El estado (anomalias/hallazgos) NO se filtra por periodo: sigue completo.
  assert.deepEqual(m.sections[2].rows.map((r) => r.anomalies), [5, 1, 0]);
  assert.equal(m.sections[3].rows.length, 6);
});

test('T-10 sistema sin datos: tablas vacias, B31G no aplicado, sin norma B31G', async () => {
  const repos = await seededRepos();
  await repos.pipelineSystems.save(
    { id: 'SYS-VACIO', name: 'Vacio', operator: 'Op', dnIn: null, wallThicknessMm: null, material: null },
    SEED_NOW
  );
  const m = await modelT10.buildT10Model({ repos, t, now: BUILD_NOW, systemId: 'SYS-VACIO' });
  assert.equal(m.meta.subtitle, 'Op · Vacio');
  assert.deepEqual(m.sections[1].items.map((k) => k.value), [0, 0, 0, 0, null, null, null]);
  assert.equal(m.sections[1].items[5].status, undefined);
  assert.deepEqual(m.sections[2].rows, [
    { category: 'timeDependent', anomalies: 0, inspections: 0, maxDepthPct: null },
    { category: 'stable', anomalies: 0, inspections: 0, maxDepthPct: null },
    { category: 'random', anomalies: 0, inspections: 0, maxDepthPct: null }
  ]);
  assert.deepEqual(m.sections[3].rows, []);
  assert.equal(m.sections[3].emptyKey, 'reports.noData');
  assert.deepEqual(m.sections[4].items, [{ textKey: 'reports.t10ActionReassess' }]);
  assert.deepEqual(m.sections[7].items.map((s) => s.id), ['ASME B31.8S', 'API 1160']);
});

// ---- casos de error tipados ---------------------------------------------------

test('T-10 sin systemId: rechazo tipado E_MISSING_INPUT (ausente, vacio y null)', async () => {
  const repos = await seededRepos();
  for (const opts of [{ repos, t }, { repos, t, systemId: '' }, { repos, t, systemId: null }]) {
    const err = await modelT10.buildT10Model(opts).then(
      () => { throw new Error('expected rejection'); },
      (e) => e
    );
    assert.equal(err.code, 'E_MISSING_INPUT');
    assert.match(err.message, /^E_MISSING_INPUT: systemId is required/);
  }
});

test('T-10 systemId inexistente: rechazo tipado E_NOT_FOUND', async () => {
  const repos = await seededRepos();
  const err = await modelT10.buildT10Model({ repos, t, now: BUILD_NOW, systemId: 'SYS-NOEXISTE' }).then(
    () => { throw new Error('expected rejection'); },
    (e) => e
  );
  assert.equal(err.code, 'E_NOT_FOUND');
  assert.match(err.message, /pipeline system not found: SYS-NOEXISTE/);
});

// ---- pureza: no mutacion --------------------------------------------------------

test('T-10 modelo puro: los 4 stores del seed salen intactos (snapshot)', async () => {
  const repos = await seededRepos();
  const names = ['pipelineSystems', 'lineAssets', 'lineInspections', 'iliAnomalies'];
  const beforeSnap = {};
  for (const n of names) { beforeSnap[n] = JSON.stringify(await repos[n].list()); }
  await modelT10.buildT10Model({ repos, t, now: BUILD_NOW, systemId: 'SYS-NORTE-16' });
  await modelT10.buildT10Model({
    repos, t, now: BUILD_NOW, systemId: 'SYS-NORTE-16',
    period: { fromISO: '2026-08-01T00:00:00.000Z', toISO: '2026-08-31T23:59:59.999Z' }
  });
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

test('todas las claves usadas por el modelo T-10 existen en es.js (y NEW_LOCALE_KEYS es exacta)', async () => {
  const repos = await seededRepos();
  const m = await modelT10.buildT10Model({ repos, t, now: BUILD_NOW, systemId: 'SYS-NORTE-16' });
  const keys = collectKeys(m, new Set());
  keys.add('reports.t10Title');
  keys.add('reports.pageFooter');
  assert.ok(keys.size >= 25, 'expected the full key set, got ' + keys.size);
  for (const key of keys) {
    assert.ok(typeof resolveKey(es, key) === 'string', 'es.js missing key "' + key + '"');
  }
  assert.deepEqual(modelT10.NEW_LOCALE_KEYS.slice().sort(), [
    'reports.t10ActionCover',
    'reports.t10ActionCrackAssess',
    'reports.t10ActionDentAssess',
    'reports.t10ActionReassess',
    'reports.t10ActionRepair',
    'reports.t10Anomalies',
    'reports.t10B31g',
    'reports.t10Category',
    'reports.t10DataGaps',
    'reports.t10DataGapsBody',
    'reports.t10Evidence',
    'reports.t10Findings',
    'reports.t10KpiCoveredKm',
    'reports.t10KpiMinPAllow',
    'reports.t10KpiSevAlta',
    'reports.t10KpiSevCrit',
    'reports.t10KpiSevMedia',
    'reports.t10MaxDepth',
    'reports.t10MocBody',
    'reports.t10MocQc',
    'reports.t10Plan',
    'reports.t10QcNote',
    'reports.t10RulNote',
    'reports.t10Severity',
    'reports.t10ThreatNote',
    'reports.t10Threats',
    'reports.t10Title'
  ]);
  for (const key of modelT10.NEW_LOCALE_KEYS) {
    assert.ok(typeof resolveKey(es, key) === 'string', 'es.js no tiene la clave nueva "' + key + '"');
  }
});

// ---- registro -------------------------------------------------------------------------

test('T-10 queda registrado en el registry con needs [systemId] y sin duplicados', async () => {
  const entry = registry.get('T-10');
  assert.ok(entry, 'T-10 presente');
  assert.equal(entry.titleKey, 'reports.t10Title');
  assert.deepEqual(entry.needs, ['systemId']);
  const repos = await seededRepos();
  await modelT10.buildT10Model({ repos, t, now: BUILD_NOW, systemId: 'SYS-NORTE-16' });
  await modelT10.buildT10Model({ repos, t, now: BUILD_NOW, systemId: 'SYS-NORTE-16' });
  const t10 = registry.list().filter((x) => x.id === 'T-10');
  assert.equal(t10.length, 1, 'registerSelf idempotente no duplica');
  assert.throws(() => registry.register({ id: 'T-10', titleKey: 'x', needs: [], buildModel: () => Promise.resolve({}) }),
    /duplicate report template: T-10/);
});

// ---- helpers de render (misma forma que report-t06.test.js) ---------------------------

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

test('buildReport end-to-end renderiza el modelo T-10 sin avisos del renderer', async () => {
  const repos = await seededRepos();
  const warnings = [];
  const realWarn = console.warn;
  console.warn = (...args) => warnings.push(args.join(' '));
  let doc;
  try {
    doc = await registry.build('T-10', { repos, t, now: BUILD_NOW, systemId: 'SYS-NORTE-16' });
  } finally {
    console.warn = realWarn;
  }
  assert.deepEqual(warnings, [], 'cero unknown section types');
  const root = outline(doc);

  assert.equal(root.tag, 'div');
  assert.ok(hasClass(root, 'print-root') && hasClass(root, 'report') && hasClass(root, 'report-T-10'));

  const header = (root.children || []).find((c) => c.tag === 'header' && hasClass(c, 'report-cover'));
  const h1 = (header.children || []).find((c) => c.tag === 'h1');
  assert.equal(h1 && h1.text, 'reports.t10Title');
  const sub = (header.children || []).find((c) => c.tag === 'p' && hasClass(c, 'report-cover-subtitle'));
  assert.equal(sub.text, 'Norte Operator S.A. · Norte 16" Crude · km 0–120');

  const sections = (root.children || []).filter((c) => c.tag === 'section' && hasClass(c, 'report-section'));
  assert.deepEqual(sections.map((s) => (s.children || [])[0].text), [
    'reports.kpis',
    'reports.t10Threats',
    'reports.t10Findings',
    'reports.t10Plan',
    'reports.t10MocQc',
    'reports.t10DataGaps',
    'reports.standardsApplied'
  ]);

  // KPIs con fmtNum sin i18n cargado: String(number) a precision completa;
  // RUL nulo muestra '—' con su unidad.
  const kpiTexts = findAll(root, (n) => n.tag === 'div' && hasClass(n, 'report-kpi'))
    .map((kpi) => kpi.children[1].text);
  assert.deepEqual(kpiTexts, [
    '36 units.km',
    '1',
    '1',
    '1',
    '6 units.MPa',
    '4.187978782839058 units.MPa',
    '— common.months'
  ]);

  const tables = findAll(root, (n) => n.tag === 'div' && hasClass(n, 'report-table'));
  const bodies = tables.map((tbl) => tbl.children.find((c) => c.tag === 'table').children.find((c) => c.tag === 'tbody'));
  assert.equal((bodies[0].children || []).filter((c) => c.tag === 'tr').length, 3, 'amenazas: 3 categorias');
  assert.equal((bodies[1].children || []).filter((c) => c.tag === 'tr').length, 6, 'hallazgos: 6 anomalías');
  assert.equal((bodies[2].children || []).filter((c) => c.tag === 'tr').length, 3, 'normas: B31.8S + 1160 + B31G');

  // Notas de tabla via tfoot (noteKey).
  const notes = findAll(root, (n) => n.tag === 'td' && hasClass(n, 'report-note')).map((n) => n.text);
  assert.deepEqual(notes, ['reports.t10ThreatNote', 'reports.t10RulNote']);

  const lis = findAll(root, (n) => n.tag === 'ul' && hasClass(n, 'report-list'))[0];
  assert.deepEqual((lis.children || []).map((li) => li.text), [
    'reports.t10ActionRepair',
    'reports.t10ActionCrackAssess',
    'reports.t10ActionDentAssess',
    'reports.t10ActionCover',
    'reports.t10ActionReassess'
  ]);

  const texts = findAll(root, (n) => n.tag === 'p' && hasClass(n, 'report-text')).map((p) => p.text);
  assert.deepEqual(texts, ['reports.t10MocBody', 'reports.t10DataGapsBody']);
  const qcNote = findAll(root, (n) => n.tag === 'p' && hasClass(n, 'report-text-note')).map((p) => p.text);
  assert.deepEqual(qcNote, ['reports.t10QcNote']);

  assert.equal(findAll(root, (n) => n.tag === 'div' && hasClass(n, 'report-disclaimer')).length, 1);
  assert.ok(findAll(root, (n) => n.tag === 'footer' && hasClass(n, 'report-footer')).length === 1);
  assert.equal(findAll(root, (n) => n.tag === 'p' && hasClass(n, 'report-cover-generated') && n.text.indexOf('reports.generatedAt') === 0).length, 1,
    'linea generado-a a partir de opts.now');
});

test('buildReport propaga el error tipado cuando falta systemId', async () => {
  const repos = await seededRepos();
  const err = await registry.build('T-10', { repos, t, now: BUILD_NOW }).then(
    () => { throw new Error('expected rejection'); },
    (e) => e
  );
  assert.equal(err.code, 'E_MISSING_INPUT');
});
