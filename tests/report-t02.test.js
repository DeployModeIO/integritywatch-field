/* IntegrityWatch Field — T-02 modelo de informe (blueprint §T-02)
   Golden tests con el seed demo determinista (NOW 2026-09-15). Valores golden
   copiados de corrida real: node -e cargando src/calc/units.js + corrosion.js y
   reproduciendo los pesos del seed (ΔW = target·ρ·A·24·d/534; ρ=7.85, A=2.0,
   d=30; blancos 8.0/10.0 mpy, inhibidos 0.64/3.5 mpy) — ver comentario en el
   test golden. Además: no mutación de repos, pureza/idempotencia, filtros de
   period y sector, registro T-02, claves i18n contra es.js y buildReport e2e. */
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const shim = require('./helpers/dom-shim');

require('../src/calc/units.js');
require('../src/calc/corrosion.js');
require('../src/data/materials.js');
require('../src/data/standards.js');
require('../src/reports/model.js');
require('../src/reports/renderer.js');
require('../src/reports/registry.js');
require('../src/reports/model-t02.js');

const dbMemory = require('../src/core/dbMemory.js');
const storeApi = require('../src/core/store.js');
const seed = require('../src/data/seed.js');
const es = require('../src/i18n/locales/es.js');

const NOW = '2026-09-15T00:00:00.000Z';
const t = (key) => key;

function freshSeededStore() {
  const s = storeApi.create(dbMemory.create());
  return seed.demo(s, { nowISO: NOW }).then(() => s);
}

async function snapshot(repos) {
  return {
    monitoringPoints: JSON.parse(JSON.stringify(await repos.monitoringPoints.list())),
    coupons: JSON.parse(JSON.stringify(await repos.coupons.list()))
  };
}

function sectionByType(model, type) {
  return model.sections.find((s) => s.type === type) || null;
}

function modelTables(model) {
  return model.sections.filter((s) => s.type === 'table');
}

function findKey(node, acc) {
  if (Array.isArray(node)) { node.forEach((n) => findKey(n, acc)); return; }
  if (node && typeof node === 'object') {
    for (const [k, v] of Object.entries(node)) {
      if (typeof v === 'string' && (/Key$/.test(k) || k === 'unit')) {
        acc.push(v);
      } else {
        findKey(v, acc);
      }
    }
  }
  return acc;
}

function resolveEs(key) {
  const parts = String(key).split('.');
  let cur = es;
  for (const p of parts) {
    if (cur === null || cur === undefined) { return undefined; }
    cur = cur[p];
  }
  return typeof cur === 'string' ? cur : undefined;
}

test('golden T-02 con seed demo: EI por par, media y balance exactos', async () => {
  const repos = await freshSeededStore();
  const model = await IW.reports.modelT02.buildT02Model({ repos, now: NOW });

  assert.equal(model.id, 't02');
  assert.deepEqual(
    model.sections.map((s) => s.type),
    ['cover', 'kpiRow', 'table', 'table', 'list', 'standards']
  );
  assert.equal(model.disclaimer.type, 'disclaimer');
  assert.equal(model.meta.generatedAtISO, new Date(NOW).toISOString());

  // Tabla de pares: los 2 pares del seed (P1 y P2).
  const pairs = sectionByType(model, 'table');
  assert.equal(pairs.titleKey, 'reports.eiByPairs');
  assert.equal(pairs.rows.length, 2, 'pares con blank+inhibited en seed');
  const p1 = pairs.rows.find((r) => r.pairId === 'P1');
  const p2 = pairs.rows.find((r) => r.pairId === 'P2');
  assert.ok(p1 && p2);

  // Golden copiados de la corrida real de 2026-11-03 (node --test
  // tests/report-t02.test.js con NOW 2026-09-15): el repos guarda wfMg y el
  // modelo recalcula ΔW = wiMg − wfMg con round-trip binario, de ahí los
  // decimales largos. targetCr semilla: P1 8.0/0.64, P2 10.0/3.5.
  assert.equal(p1.crBlank, 7.9999999999999964);
  assert.equal(p1.crInhibited, 0.6400000000000022);
  assert.equal(p1.deltaWBlank, 169.3483146067415);
  assert.equal(p1.deltaWInhibited, 13.547865168539374);
  assert.equal(p1.ei, 91.99999999999997);
  assert.equal(p1.band, 'excellent');
  assert.equal(p2.crBlank, 10.000000000000002);
  assert.equal(p2.crInhibited, 3.5);
  assert.equal(p2.deltaWBlank, 211.68539325842698);
  assert.equal(p2.deltaWInhibited, 74.08988764044943);
  assert.equal(p2.ei, 65);
  assert.equal(p2.band, 'poor');
  assert.equal(p1.days, 30);
  assert.equal(p2.days, 30);

  // KPIs: EI media (91.99999999999997+65)/2 = 78.49999999999999; residual
  // promedio 24 ppm exacto (solo MP-CORR-001 con objetivo>0); desviación
  // media vs banda 80–150 = 0 (pct 96 está dentro).
  const kpis = sectionByType(model, 'kpiRow');
  assert.equal(kpis.items.length, 3);
  assert.equal(kpis.items[0].labelKey, 'corrosion.inhibitorEfficiency');
  assert.equal(kpis.items[0].value, 78.49999999999999);
  assert.equal(kpis.items[0].unit, 'units.pct');
  assert.equal(kpis.items[0].status, 'acceptable');
  assert.equal(kpis.items[1].labelKey, 'corrosion.inhibitorResidual');
  assert.equal(kpis.items[1].value, 24);
  assert.equal(kpis.items[1].unit, 'units.ppm');
  assert.equal(kpis.items[2].labelKey, 'corrosion.balanceResult');
  assert.equal(kpis.items[2].value, 0);
  assert.equal(kpis.items[2].status, 'info');

  // Residual vs objetivo: inhibitorBalance({25, 24}) → pct 96, banda onTarget.
  const balance = model.sections.filter((s) => s.type === 'table')[1];
  assert.equal(balance.titleKey, 'corrosion.inhibitorBalance');
  assert.equal(balance.rows.length, 1);
  assert.deepEqual(balance.rows[0], { point: 'MP-CORR-001', target: 25, residual: 24, pct: 96, band: 'onTarget' });

  // Recomendaciones: P2 con EI 65 < 70 → solo "revisar dosificación".
  const recs = sectionByType(model, 'list');
  assert.equal(recs.titleKey, 'reports.recsSummary');
  assert.deepEqual(recs.items, [{ textKey: 'reports.t02RecLowEi', status: 'warning' }]);

  // Estándares exigidos por el blueprint.
  const std = sectionByType(model, 'standards');
  assert.deepEqual(std.items.map((i) => i.id), ['ASTM G1', 'ASTM G4', 'NACE/AMPP SP0775']);
});

test('T-02 no muta los repos de entrada', async () => {
  const repos = await freshSeededStore();
  const before = await snapshot(repos);
  await IW.reports.modelT02.buildT02Model({ repos, now: NOW });
  await IW.reports.modelT02.buildT02Model({ repos, now: NOW, sector: 'upstream' });
  const after = await snapshot(repos);
  assert.deepEqual(after, before, 'los repos quedan idénticos tras construir el modelo');
});

test('T-02 es puro e idempotente (rawNum, ISO, sin Intl, sin DOM)', async () => {
  const repos = await freshSeededStore();
  const a = await IW.reports.modelT02.buildT02Model({ repos, now: NOW });
  const b = await IW.reports.modelT02.buildT02Model({ repos, now: NOW });
  assert.deepEqual(a, b, 'dos corridas con el mismo now dan el mismo modelo');

  const json = JSON.stringify(a);
  assert.ok(!/NaN|Infinity|undefined/.test(json));
  assert.equal(a.meta.generatedAtISO, NOW);
  assert.match(a.meta.generatedAtISO, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);

  // Todos los números del modelo son finitos o null (pureza rawNum).
  (function walk(n) {
    if (Array.isArray(n)) { n.forEach(walk); return; }
    if (n && typeof n === 'object') { Object.values(n).forEach(walk); return; }
    if (typeof n === 'number') { assert.ok(isFinite(n)); }
  })(a);

  // opts vacíos: modelo construible sin datos, sin lanzar.
  const empty = await IW.reports.modelT02.buildT02Model({});
  assert.equal(empty.sections.length, 6);
});

test('T-02 filtra cupones por period y sector', async () => {
  const repos = await freshSeededStore();

  // Seed: startDate 2026-06-17, endDate 2026-08-16 (NOW menos 90/30 días).
  const fuera = await IW.reports.modelT02.buildT02Model({
    repos, now: NOW,
    period: { fromISO: '2025-01-01T00:00:00.000Z', toISO: '2026-01-01T00:00:00.000Z' }
  });
  const pairsFuera = sectionByType(fuera, 'table');
  assert.equal(pairsFuera.rows.length, 0, 'sin cupones dentro del period');
  const kpiFuera = sectionByType(fuera, 'kpiRow');
  assert.equal(kpiFuera.items[0].value, null, 'EI media null sin pares');
  assert.equal(kpiFuera.items[2].value, 0, 'el balance de proceso no lo mueve el period');
  assert.deepEqual(sectionByType(fuera, 'list').items, [
    { textKey: 'reports.t02RecOk', status: 'info' }
  ], 'sin pares y residual en banda: solo recomendación de mantenimiento');

  const dentro = await IW.reports.modelT02.buildT02Model({
    repos, now: NOW,
    period: { fromISO: '2026-06-01T00:00:00.000Z', toISO: '2026-09-01T00:00:00.000Z' }
  });
  assert.equal(sectionByType(dentro, 'table').rows.length, 2);

  // Sector: los cupones del seed cuelgan de MP-CORR-001 (upstream).
  const up = await IW.reports.modelT02.buildT02Model({ repos, now: NOW, sector: 'upstream' });
  assert.equal(sectionByType(up, 'table').rows.length, 2);
  assert.equal(sectionByType(up, 'table').columns.length, 8);

  const down = await IW.reports.modelT02.buildT02Model({ repos, now: NOW, sector: 'downstream' });
  assert.equal(sectionByType(down, 'table').rows.length, 0, 'sin pares en downstream');
  const balanceDown = modelTables(down)[1];
  assert.equal(balanceDown.rows.length, 0, 'sin objetivos de inhibidor en downstream');
  assert.deepEqual(sectionByType(down, 'list').items, [], 'sin datos no hay recomendaciones');
  const kpiDown = sectionByType(down, 'kpiRow');
  assert.equal(kpiDown.items[0].value, null);
  assert.equal(kpiDown.items[2].value, null);
});

test('T-02 queda registrado en el registry', () => {
  const ids = IW.reports.registry.list().map((x) => x.id);
  assert.ok(ids.includes('T-02'), 'T-02 presente en registry.list()');
  const entry = IW.reports.registry.get('T-02');
  assert.equal(entry.titleKey, 'reports.t02Title');
  assert.deepEqual(entry.needs, []);
  assert.equal(typeof entry.buildModel, 'function');
});

test('todas las claves i18n del modelo existen en es.js (falla listando nuevas)', async () => {
  const repos = await freshSeededStore();
  const models = [
    await IW.reports.modelT02.buildT02Model({ repos, now: NOW, sector: 'upstream' }),
    // Escenarios sintéticos para ejercitar las recomendaciones under/over/ok
    // que el seed no dispara, y que sus claves queden también auditadas.
    await IW.reports.modelT02.buildT02Model({ repos: synthRepos({
      mps: [mp('MP-S-UNDER', 25, 10), mp('MP-S-OVER', 25, 60)],
      coupons: [couponsUpstream()[0], couponsUpstream()[1]]
    }), now: NOW }),
    await IW.reports.modelT02.buildT02Model({ repos: synthRepos({
      mps: [mp('MP-S-OK', 25, 24)],
      coupons: [couponsUpstream()[0], couponsUpstream()[1]]
    }), now: NOW })
  ];
  const keys = [...new Set(models.reduce((acc, m) => findKey(m, acc), []))];
  assert.ok(keys.length >= 15, 'la muestra de claves no está vacía');
  const missing = keys.filter((k) => resolveEs(k) === undefined);
  assert.deepEqual(missing, [], 'claves i18n NUEVAS que hay que añadir a es.js:\n' + missing.join('\n'));
});

function mp(id, target, residual) {
  return { id: id, code: id, sector: 'upstream', process: { inhibitorTargetPpm: target, inhibitorResidualPpm: residual } };
}

// 4 cupones sintéticos: P-alto EI (90 %) y P-mediocreo EI (50 %), blank 10 mpy.
function couponsUpstream() {
  function coupon(id, pairId, role, mpy) {
    const dens = 7.85, area = 2, hours = 720;
    const dw = mpy * dens * area * hours / 534;
    return { id: id, pairId: pairId, role: role, mpId: 'MP-CORR-001', densityGcm3: dens, wiMg: 1000, wfMg: 1000 - dw, areaIn2: area, days: 30, startDate: '2026-06-17T00:00:00.000Z', endDate: '2026-08-16T00:00:00.000Z' };
  }
  return [
    coupon('SYN-PA-B', 'PA', 'blank', 10),
    coupon('SYN-PA-I', 'PA', 'inhibited', 1),
    coupon('SYN-PB-B', 'PB', 'blank', 10),
    coupon('SYN-PB-I', 'PB', 'inhibited', 5)
  ];
}

function listRepo(items) { return { list: async () => items }; }

function synthRepos({ mps, coupons }) {
  return { monitoringPoints: listRepo(mps), coupons: listRepo(coupons) };
}

test('buildReport end-to-end renderiza T-02', async () => {
  shim.install();
  try {
    const repos = await freshSeededStore();
    const doc = await IW.reports.buildReport('T-02', { repos, t, now: NOW });
    const outline = shim.elementToOutline(doc);
    assert.equal(outline.tag, 'div');
    const classes = String(outline.class).split(/\s+/);
    assert.ok(classes.includes('print-root') && classes.includes('report') && classes.includes('report-t02'));
    const header = outline.children.find((c) => c.tag === 'header');
    const h1 = header && header.children.find((c) => c.tag === 'h1');
    assert.equal(h1.text, 'reports.t02Title');
    const sections = outline.children.filter((c) => c.tag === 'section');
    assert.deepEqual(
      sections.map((s) => s.children[0] && s.children[0].text),
      [
        'reports.kpis',
        'reports.eiByPairs',
        'corrosion.inhibitorBalance',
        'reports.recsSummary',
        'reports.standardsApplied'
      ]
    );
    const disclaimer = outline.children.filter((c) => c.tag === 'div' && /\breport-disclaimer\b/.test(String(c.class)));
    assert.equal(disclaimer.length, 1);
  } finally {
    shim.uninstall();
  }
});
