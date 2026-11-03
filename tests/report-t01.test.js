/* IntegrityWatch Field — T-01 alerta de integridad (golden)
   Congela el modelo T-01 sobre el seed demo determinista (NOW fijo), el
   registro en la registry y la construcción end-to-end vía renderer real
   (dom-shim), al estilo de reports-characterization.test.js.
   Valores golden T-01 seed 2026-09-15 fijados de una corrida real. */
'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');

const shim = require('./helpers/dom-shim');
require('../src/calc/units.js');
require('../src/calc/corrosion.js');
require('../src/calc/norsok506.js');
require('../src/calc/remainingLife.js');
require('../src/data/standards.js');
const dbMemory = require('../src/core/dbMemory.js');
const storeApi = require('../src/core/store.js');
const seed = require('../src/data/seed.js');
require('../src/reports/model.js');
require('../src/reports/charts.js');
require('../src/reports/renderer.js');
require('../src/reports/registry.js');
const modelT01 = require('../src/reports/model-t01.js');
const registry = require('../src/reports/registry.js');

before(() => shim.install());
after(() => shim.uninstall());

const NOW = '2026-09-15T00:00:00.000Z';
const GOLDEN_MP = 'MP-CORR-001';
const t = (key) => key;

// El seed demo no define espesores: el harness fija T-nom/T-min del punto
// (convención de la vista de corrosión: mp.tNom / mp.tMin en mm) para que
// IW.calc.remainingLife produzca RUL y fecha de breach.
const TNOM_MM = 6.0;
const TMIN_MM = 5.0;

async function seededRepos() {
  const repos = storeApi.create(dbMemory.create());
  await seed.demo(repos, { nowISO: NOW });
  const mp = await repos.monitoringPoints.get(GOLDEN_MP);
  mp.tNom = TNOM_MM;
  mp.tMin = TMIN_MM;
  await repos.monitoringPoints.save(mp, NOW);
  return repos;
}

// Snapshot de las colecciones leídas por T-01 para probar no-mutación.
async function snapshot(repos) {
  const data = {
    monitoringPoints: await repos.monitoringPoints.list(),
    readings: await repos.readings.list(),
    coupons: await repos.coupons.list(),
    psvs: await repos.psvs.list()
  };
  return JSON.stringify(data);
}

function section(model, type) {
  return model.sections.find((s) => s.type === type);
}

// ---- golden del modelo -------------------------------------------------------

test('T-01 golden: modelo sobre el MP de mayor CR del seed demo', async () => {
  const repos = await seededRepos();
  const beforeSnap = await snapshot(repos);

  const model = await modelT01.buildT01Model({ repos, mpId: GOLDEN_MP, now: NOW });

  // No mutó nada en los repos.
  const afterSnap = await snapshot(repos);
  assert.equal(afterSnap, beforeSnap, 'buildT01Model no debe mutar los repos');

  assert.equal(model.id, 'T-01');
  assert.equal(model.meta.titleKey, 'reports.t01Title');
  assert.equal(model.meta.subtitle, GOLDEN_MP);
  assert.equal(model.meta.triggerRuleId, 'R1', 'golden T-01 seed: spike 12.4 mpy en las ultimas 24 h');
  assert.equal(model.sections.length, 8);
  assert.equal(model.disclaimer.type, 'disclaimer');
  assert.equal(model.disclaimer.labelKey, 'reports.disclaimer');

  // cover con disparador (clave existente rules.name.R1).
  const cover = model.sections[0];
  assert.equal(cover.type, 'cover');
  assert.equal(cover.titleKey, 'reports.t01Title');
  assert.equal(cover.subtitleKey, 'rules.name.R1');

  // kpiRow con los 5 KPIs y números exactos.
  const kpis = section(model, 'kpiRow');
  assert.equal(kpis.items.length, 5);
  assert.deepEqual(kpis.items.map((i) => i.labelKey), [
    'reports.cr',
    'reports.t01Delta30',
    'corrosion.modelRatio',
    'corrosion.remainingLife',
    'reports.t01BreachDate'
  ]);
  assert.equal(kpis.items[0].value, 12.4, 'golden T-01 seed 2026-09-15: CR actual (mpy)');
  assert.equal(kpis.items[0].status, 'severe');
  assert.equal(kpis.items[0].unit, 'units.mpy');
  assert.equal(kpis.items[1].value, 2.23203192552213, 'golden T-01 seed: delta avg7d - avg30d (mpy)');
  assert.equal(kpis.items[2].value, 0.03705791267569673, 'golden T-01 seed: ratio avg7d/modelo DWM');
  assert.equal(kpis.items[3].value, 138.87108425197562, 'golden T-01 seed: RUL (meses), tNom=6.0 tMin=5.0 mm');
  assert.equal(kpis.items[3].unit, 'common.months');
  assert.equal(kpis.items[4].value, '2038-04-11T21:19:37.365Z', 'golden T-01 seed: fecha de breach estimada (ISO)');

  // serie con umbral: 31 lecturas del punto, límite SP0775 = 10 mpy en cada fila.
  const tables = model.sections.filter((s) => s.type === 'table');
  const serie = tables[0];
  assert.equal(serie.titleKey, 'corrosion.readings');
  assert.equal(serie.rows.length, 31, 'golden T-01 seed: conteo de filas de la serie de MP-CORR-001');
  assert.ok(serie.rows.every((r) => r.limit === 10), 'columna umbral = 10 mpy');
  assert.deepEqual(
    { date: serie.rows[0].date, cr: serie.rows[0].cr, level: serie.rows[0].level },
    { date: '2026-06-17T00:00:00.000Z', cr: 3.4022075038403274, level: 'moderate' },
    'golden T-01 seed: primera fila de la serie'
  );
  const lastRow = serie.rows[30];
  assert.equal(lastRow.date, '2026-09-14T18:00:00.000Z');
  assert.equal(lastRow.cr, 12.4);
  assert.equal(lastRow.level, 'severe');

  // lista de clasificación SP0775 + contexto (claves existentes).
  const lista = section(model, 'list');
  assert.equal(lista.titleKey, 'corrosion.sp0775Ref');
  assert.deepEqual(lista.items.map((i) => i.textKey), [
    'severity.severe',
    'corrosion.mr0175.moderate',
    'corrosion.dwmNote'
  ]);

  // contexto de proceso (tabla clave-valor): DWM con valor golden.
  const ctx = tables[1];
  assert.equal(ctx.titleKey, 'corrosion.processParams');
  assert.equal(ctx.columns.length, 0, 'tabla clave-valor sin cabeceras');
  const dwmRow = ctx.rows.find((r) => r.label === 'corrosion.dwmTitle');
  assert.equal(dwmRow.value, 161.14343863207816, 'golden T-01 seed: DWM mpy (temp 60 C, pCO2 0.8274 bar)');
  assert.equal(ctx.rows.find((r) => r.label === 'corrosion.h2s').value, 2000);
  assert.equal(ctx.rows.find((r) => r.label === 'corrosion.co2').value, 12000);
  // NORSOK no aplica sin pH/cizalla en el store: sin fila norsok.cr.
  assert.equal(ctx.rows.some((r) => r.label === 'norsok.cr'), false);

  // accion recomendada: umbral superado -> key de accion.
  const textSec = section(model, 'text');
  assert.equal(textSec.titleKey, 'common.actions');
  assert.equal(textSec.bodyKey, 'reports.t01Action', 'golden T-01 seed: CR 12.4 >= umbral 10 -> accion');

  // chart tendencia: mismo shape trend que las plantillas existentes.
  const chart = section(model, 'chart');
  assert.equal(chart.kind, 'trend');
  assert.equal(chart.titleKey, 'corrosion.trend');
  assert.equal(chart.data.length, 31);
  assert.deepEqual(chart.axis, { x: 'common.date', y: 'reports.cr' });
  assert.deepEqual(chart.bands, [{ from: 10, to: 12.4, status: 'crit' }]);

  // standards listos.
  const std = section(model, 'standards');
  assert.equal(std.titleKey, 'reports.standardsApplied');
  assert.ok(std.items.some((i) => i.id === 'NACE/AMPP SP0775'), 'SP0775 presente');
  assert.ok(std.items.length >= 1);

  // Pureza: todos los numeros finitos; toda fecha con aspecto ISO es ISO completa.
  const seen = [];
  (function walk(node, pathStr) {
    if (Array.isArray(node)) { node.forEach((n, i) => walk(n, pathStr + '[' + i + ']')); return; }
    if (node && typeof node === 'object') {
      for (const k of Object.keys(node)) walk(node[k], pathStr + '.' + k);
      return;
    }
    seen.push([pathStr, node]);
  })(model, '');
  for (const [pathStr, v] of seen) {
    if (typeof v === 'number') { assert.ok(isFinite(v), 'no finito en ' + pathStr); }
    if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(v)) {
      assert.match(v, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/, 'fecha ISO pura en ' + pathStr);
    }
  }
  assert.equal(JSON.stringify(model).indexOf('Infinity'), -1);
  assert.equal(JSON.stringify(model).indexOf('NaN'), -1);
});

// ---- registro y construcción end-to-end -------------------------------------

test('T-01 golden: punto calmo sin disparador -> codigos de vigilancia y valores null', async () => {
  const repos = await seededRepos();
  const model = await modelT01.buildT01Model({ repos, mpId: 'MP-CORR-008', now: NOW });

  assert.equal(model.meta.triggerRuleId, null);
  const cover = model.sections[0];
  assert.equal(cover.subtitle, 'MP-CORR-008');
  assert.equal(cover.subtitleKey, undefined);

  const kpis = section(model, 'kpiRow');
  assert.equal(kpis.items[0].status, 'low', 'golden T-01 seed: MP-CORR-008 bajo umbral');
  assert.equal(kpis.items[2].value, null, 'sin modelo DWM aplicable -> ratio null');
  assert.equal(kpis.items[3].value, null, 'sin tNom/tMin -> RUL null (Infinity prohibido)');
  assert.equal(kpis.items[4].value, null, 'breach null cuando no hay RUL');

  assert.equal(section(model, 'text').bodyKey, 'reports.t01ActionWatch');
  assert.deepEqual(section(model, 'chart').bands, []);
  assert.equal(section(model, 'chart').data.length, 8, 'golden T-01 seed: 8 lecturas calmas');
  assert.deepEqual(section(model, 'list').items.map((i) => i.textKey), ['severity.low']);
});

test('T-01 queda registrado en la registry con needs mpId', () => {
  const entry = registry.list().find((e) => e.id === 'T-01');
  assert.ok(entry, 'T-01 presente en registry.list()');
  assert.equal(entry.titleKey, 'reports.t01Title');
  assert.deepEqual(entry.needs, ['mpId']);
});

test('T-01 buildReport end-to-end renderiza via el renderer real', async () => {
  const repos = await seededRepos();
  const doc = await registry.build('T-01', { repos, mpId: GOLDEN_MP, now: NOW, t });
  const outline = shim.elementToOutline(doc);
  assert.equal(outline.tag, 'div');
  assert.ok(outline.class.includes('report-T-01'));

  const sections = (outline.children || []).filter(
    (c) => c.tag === 'section' && (c.class || '').split(/\s+/).includes('report-section')
  );
  assert.equal(sections.length, 7, 'siete secciones DOM (la cover es un header y el disclaimer un div)');
  const coverHeader = (outline.children || []).find(
    (c) => c.tag === 'header' && (c.class || '').includes('report-cover')
  );
  const h1 = coverHeader ? (coverHeader.children || []).find((c) => c.tag === 'h1') : null;
  assert.equal(h1.text, 'reports.t01Title');
  const subP = (coverHeader.children || []).find((c) => c.tag === 'p' && (c.class || '').includes('cover-subtitle'));
  assert.equal(subP.text, 'rules.name.R1', 'el disparador se muestra en la cover');

  const disclaimer = (outline.children || []).find(
    (c) => c.tag === 'div' && (c.class || '').includes('report-disclaimer')
  );
  assert.ok(disclaimer, 'disclaimer renderizado');
});

// ---- i18n: cero claves crudas fuera de las nuevas declaradas -----------------

test('T-01: toda clave usada existe en es.js salvo las nuevas declaradas (lista exacta)', async () => {
  const es = require('../src/i18n/locales/es.js');
  const leaves = new Map();
  (function walk(node, prefix) {
    for (const key of Object.keys(node)) {
      if (key === '__meta') { continue; }
      const p = prefix ? prefix + '.' + key : key;
      const val = node[key];
      if (val !== null && typeof val === 'object') { walk(val, p); } else { leaves.set(p, val); }
    }
  })(es, '');

  const repos = await seededRepos();
  // Se recorren los dos modelos (disparado y calmo) para cubrir ambas ramas
  // de claves: las seis nuevas deben aparecer efectivamente entre las usadas.
  const models = [
    await modelT01.buildT01Model({ repos, mpId: GOLDEN_MP, now: NOW }),
    await modelT01.buildT01Model({ repos, mpId: 'MP-CORR-008', now: NOW })
  ];

  const KEY_PROPS = ['labelKey', 'titleKey', 'subtitleKey', 'bodyKey', 'noteKey', 'emptyKey', 'textKey', 'generatedKey', 'unit', 'label'];
  const KEY_SHAPE = /^[a-z][a-zA-Z0-9_]*(\.[a-zA-Z0-9_]+)+$/;
  const used = new Set();
  function walk(node) {
    if (Array.isArray(node)) { node.forEach(walk); return; }
    if (node && typeof node === 'object') {
      for (const k of Object.keys(node)) {
        if (KEY_PROPS.includes(k) && typeof node[k] === 'string' && KEY_SHAPE.test(node[k])) {
          used.add(node[k]);
        }
        walk(node[k]);
      }
    }
  }
  models.forEach(walk);
  for (const k of modelT01.NEW_LOCALE_KEYS) {
    assert.ok(used.has(k), 'toda clave nueva declarada debe estar realmente en uso: ' + k);
  }

  const missing = [...used].filter((k) => !leaves.has(k)).sort();
  const declared = new Set(modelT01.NEW_LOCALE_KEYS);
  const undeclared = missing.filter((k) => !declared.has(k));
  assert.deepEqual(
    undeclared,
    [],
    'claves crudas usadas fuera de es.js y no declaradas por T-01: ' + JSON.stringify(undeclared)
  );
  // Las claves declaradas pueden llegar a existir en es.js mas adelante (cuando
  // se traduzcan): no es fallo. El contrato es que NINGUNA clave usada quede
  // sin traduccion fuera de esta lista fija de pendientes:
  // La lista de claves nuevas es fija: si crece sin reportarla, falla aqui.
  assert.deepEqual(modelT01.NEW_LOCALE_KEYS.slice().sort(), [
    'reports.t01Action',
    'reports.t01ActionWatch',
    'reports.t01BreachDate',
    'reports.t01Delta30',
    'reports.t01Threshold',
    'reports.t01Title'
  ]);
});
