/* IntegrityWatch Field — QA alarm flicker (node:test + assert/strict, CJS)
   Verifica que el fix del bug ~97 repintados/tick mantiene coalescing estricto:
   un solo evento data:changed por barrido bulk, debounce 250ms en vistas que
   evita repintados en rafaga, y filtro de meta que no vacia el dashboard.

   ANTI-PATTERN CORREGIDO:
   - engine.sweep emitia 1 data:changed por cada rec guardada individualmente
     (hasta N eventos en lugar de 1 bulk).
   - Las vistas se suscribian a data:changed sin debounce, causando repintados
     por cada evento individual.
   - data:changed:meta disparaba reload completo del dashboard aunque solo
     cambiara lastRulesRunISO. */
'use strict';

const { test, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

/* ── Dependencias del motor ────────────────────────────────────────────────── */
require('../src/calc/corrosion.js');
require('../src/calc/apm.js');
const bus = require('../src/core/bus.js');
const dbMemory = require('../src/core/dbMemory.js');
const storeApi = require('../src/core/store.js');

/* ── Dependencias de vistas (cargan vía side-effect IW global) ──────────────── */
require('../src/i18n/locales/en.js');
require('../src/i18n/locales/es.js');
const i18n = require('../src/i18n/i18n.js');
require('../src/components/icons.js');
require('../src/components/ui.js');

/* ── Reglas ─────────────────────────────────────────────────────────────────── */
const engine = require('../src/rules/engine.js');
require('../src/rules/definitions.js');

/* ── DOM shim ──────────────────────────────────────────────────────────────── */
const dom = require('./helpers/dom-shim.js');

/* ── Helpers ────────────────────────────────────────────────────────────────── */
const HOUR = 3600000;
const DAY = 86400000;
const iso = (ms) => new Date(ms).toISOString();
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const MP = 'MP-CORR-T1';
const FP_R1 = 'R1:monitoringPoints:' + MP;

function freshStore() { return storeApi.create(dbMemory.create()); }

/* ── seedCore: misma fixture que qa-rules-sweep.test.js ───────────────────── */
async function seedCore(s, now) {
  await s.monitoringPoints.save({
    id: MP, code: MP, name: 'Probe T1', sensorType: 'lprProbe',
    process: { h2sPpm: 2000, co2Ppm: 50000, totalPressureKpa: 6895 }
  });
  const readings = [];
  for (let i = 0; i < 12; i++) {
    readings.push({ id: 'stuck-' + i, mpId: MP, date: iso(now - 5 * DAY), crMpy: 2.0 });
  }
  readings.push({ id: 'r-cr', mpId: MP, date: iso(now - 6 * HOUR), crMpy: 12.4 });
  await s.readings.saveAll(readings);
}

/* ── seedMinimal: 1 MP + 1 reading para tests de vista ────────────────────── */
async function seedMinimal(s, now) {
  await s.monitoringPoints.save({
    id: 'MP-MIN', code: 'MP-MIN', name: 'Minimal probe', sensorType: 'erProbe',
    process: { h2sPpm: 100, co2Ppm: 10000, totalPressureKpa: 101 }
  });
  await s.readings.save({ id: 'r-min', mpId: 'MP-MIN', date: iso(now - 1 * HOUR), crMpy: 4.2 });
}

/* ── Dom shim + patches ───────────────────────────────────────────────────── */
dom.install();

/* Parche addEventListener: ui.el() pide addEventListener para opts.on */
const elProto = Object.getPrototypeOf(globalThis.document.createElement('div'));
if (typeof elProto.addEventListener !== 'function') {
  elProto.addEventListener = function (type, fn) {
    this._handlers = this._handlers || {};
    this._handlers[type] = fn;
  };
}

/* Parche template.content: icons.svgNode pide template.content.firstElementChild */
const origCreate = globalThis.document.createElement;
globalThis.document.createElement = function (tag) {
  const node = origCreate.call(this, tag);
  if (String(tag).toLowerCase() === 'template') {
    node.content = { firstElementChild: origCreate.call(this, 'svg') };
  }
  return node;
};

/* Parche isConnected: las vistas comprueban container.isConnected antes de
   re-renderizar. En el shim no existe; lo ponemos siempre a true. */
const NodeClass = dom.Node;
if (!Object.prototype.hasOwnProperty.call(NodeClass.prototype, 'isConnected')) {
  Object.defineProperty(NodeClass.prototype, 'isConnected', {
    get: function () { return true; },
    configurable: true
  });
}

/* Parche createDocumentFragment: el dashboard lo usa en build(). */
if (typeof globalThis.document.createDocumentFragment !== 'function') {
  globalThis.document.createDocumentFragment = function () {
    return globalThis.document.createElement('div');
  };
}

/* Parche querySelector/querySelectorAll: dashboard meta handler los necesita */
const ElementClass = globalThis.document.createElement('div').constructor;
if (typeof ElementClass.prototype.querySelector !== 'function') {
  ElementClass.prototype.querySelector = function (sel) {
    function walk(node, f) {
      if (!node || typeof node.className !== 'string') { return null; }
      if (sel.startsWith('.')) {
        var cls = sel.slice(1);
        if (node.className.split(/\s+/).indexOf(cls) !== -1) { return node; }
      }
      var kids = Array.isArray(node.children) ? node.children : [];
      for (var i = 0; i < kids.length; i++) {
        var found = walk(kids[i], f);
        if (found) { return found; }
      }
      return null;
    }
    return walk(this);
  };
}

/* Parche MutationObserver (usado por shell). */
if (typeof globalThis.MutationObserver === 'undefined') {
  globalThis.MutationObserver = function (fn) {
    this._fn = fn;
  };
  globalThis.MutationObserver.prototype.observe = function () {};
  globalThis.MutationObserver.prototype.disconnect = function () {};
}

/* Parche requestAnimationFrame (usado por la animacion countUp en dashboard). */
if (typeof globalThis.requestAnimationFrame === 'undefined') {
  globalThis.requestAnimationFrame = function (fn) { setTimeout(fn, 0); };
}
/* Parche window global: countUp tambien llama window.requestAnimationFrame. */
if (typeof globalThis.window === 'undefined') {
  globalThis.window = globalThis;
}

i18n.setLocale('en');

/* ── Helper: espiar textContent en un nodo concreto (instancia) ───────────── */
function spyTextContentOnNode(node) {
  const origDesc = Object.getOwnPropertyDescriptor(
    Object.getPrototypeOf(node), 'textContent'
  ) || Object.getOwnPropertyDescriptor(
    Object.getPrototypeOf(Object.getPrototypeOf(node)), 'textContent'
  );
  const calls = { clears: 0, sets: 0 };
  Object.defineProperty(node, 'textContent', {
    get: function () { return this._tc !== undefined ? this._tc : ''; },
    set: function (v) {
      calls.sets++;
      this._tc = v;
      if (v === '' || v === null || v === undefined) { calls.clears++; }
      this.childNodes = [];
      if (v !== null && v !== undefined && v !== '') {
        var tn = globalThis.document.createTextNode(String(v));
        tn.parentNode = this;
        this.childNodes.push(tn);
      }
    },
    enumerable: true,
    configurable: true
  });
  return {
    calls: calls,
    restore: function () {
      delete node._tc;
      delete node.textContent;
    }
  };
}

/* ── after cleanup ─────────────────────────────────────────────────────────── */
after(function () {
  try { dom.uninstall(); } catch (e) { /* ignore */ }
});

/* ══════════════════════════════════════════════════════════════════════════════
   T1 — engine.sweep emite 1 solo data:changed:recommendations por tick
   ══════════════════════════════════════════════════════════════════════════════ */
test('T1 engine.sweep emite 1 solo data:changed:recommendations por tick', async function () {
  const s = freshStore();
  await seedCore(s, Date.now());

  /* Primer sweep: 3 recs nuevas → 1 evento bulk */
  let recChanged1 = 0;
  let metaChanged1 = 0;
  const offR1 = bus.on('data:changed:recommendations', function () { recChanged1++; });
  const offM1 = bus.on('data:changed:meta', function () { metaChanged1++; });

  try { await engine.sweep(s, {}, 'local'); }
  finally { offR1(); offM1(); }

  assert.equal(recChanged1, 1,
    'sweep1 con 3 recs nuevas emite 1 solo data:changed:recommendations (bulk)');
  assert.equal(metaChanged1, 1,
    'sweep1 emite 1 data:changed:meta por lastRulesRunISO');

  /* Segundo sweep: 3 recs existentes actualizadas → 1 evento bulk */
  let recChanged2 = 0;
  const offR2 = bus.on('data:changed:recommendations', function () { recChanged2++; });

  try { await engine.sweep(s, {}, 'local'); }
  finally { offR2(); }

  assert.equal(recChanged2, 1,
    'sweep2 con 3 recs actualizadas emite 1 solo data:changed:recommendations (bulk)');
});

/* ══════════════════════════════════════════════════════════════════════════════
   T2 — dashboard coalesce: rafaga de 8 eventos → 4 vaciados como maximo
         (2 ciclos de reload × 2 clears cada uno: loading + contenido)
         ANTES del fix esto eran 16 vaciados (8 reloads × 2 clears).
   ══════════════════════════════════════════════════════════════════════════════ */
test('T2 dashboard coalesce: rafaga de 8 eventos → como maximo 4 vaciados', async function () {
  const s = freshStore();
  await seedMinimal(s, Date.now());
  await s.meta.set('lastRulesRunISO', new Date().toISOString());

  const dashboard = require('../src/views/dashboard.js');
  const container = globalThis.document.createElement('div');

  const spyNav = function () {};
  const ctx = {
    repos: s,
    bus: bus,
    i18n: function (k, p) { return i18n.t(k, p); },
    sector: 'all',
    params: {},
    navigate: spyNav
  };

  /* Espionaje sobre la INSTANCIA del container — no sobre el prototipo —
     para contar SOLO los vaciados del container principal, no de sus hijos. */
  const instSpy = spyTextContentOnNode(container);

  /* Render inicial: loadData → 2 clears (loadingNode + build final). */
  await dashboard.render(container, ctx);
  await new Promise(function (r) { setImmediate(r); });

  /* La carga inicial produce 2 clears. Reseteamos contadores. */
  var initialClears = instSpy.calls.clears;
  assert.ok(initialClears >= 2,
    'carga inicial produce al menos 2 clears (loadingNode + build): ' + initialClears);
  instSpy.calls.clears = 0;
  instSpy.calls.sets = 0;

  /* Rafaga de 8 data:changed:recommendations en el mismo tick.
     El debounce de scheduleReload (250 ms) debe coalescerlas
     en maximo 2 ciclos de reload. */
  for (var i = 0; i < 8; i++) {
    bus.emit('data:changed:recommendations', { store: 'recommendations', type: 'put' });
  }

  await sleep(600);

  var clears = instSpy.calls.clears;
  /* Cada reload hace 2 textContent = '' (loadingNode + build).
     2 ciclos de reload → 4 clears maximo.
     ANTES del fix cada evento disparaba reload directo → 8×2 = 16 clears. */
  assert.ok(clears <= 4,
    'rafaga 8 eventos → ' + clears + ' clears (max 4, fix coalesce) [sin fix serian 16]');

  instSpy.restore();
});

/* ══════════════════════════════════════════════════════════════════════════════
   T3 — meta lastRulesRunISO NO vacia el dashboard (solo actualiza el span)
   ══════════════════════════════════════════════════════════════════════════════ */
test('T3 meta lastRulesRunISO NO vacia el dashboard', async function () {
  const s = freshStore();
  await seedMinimal(s, Date.now());
  await s.meta.set('lastRulesRunISO', new Date().toISOString());

  const dashboard = require('../src/views/dashboard.js');
  const container = globalThis.document.createElement('div');

  const ctx = {
    repos: s,
    bus: bus,
    i18n: function (k, p) { return i18n.t(k, p); },
    sector: 'all',
    params: {},
    navigate: function () {}
  };

  const instSpy = spyTextContentOnNode(container);

  /* Render inicial + esperar estabilizacion. */
  await dashboard.render(container, ctx);
  await new Promise(function (r) { setImmediate(r); });

  /* Resetear contadores tras carga inicial. */
  instSpy.calls.clears = 0;
  instSpy.calls.sets = 0;

  /* Emitir data:changed:meta con key='lastRulesRunISO'.
     El handler del dashboard solo actualiza el texto de .rules-last-run,
     NO llama a scheduleReload → NO vacia el container. */
  bus.emit('data:changed:meta', { store: 'meta', type: 'put', key: 'lastRulesRunISO' });

  await sleep(400);

  assert.equal(instSpy.calls.clears, 0,
    'meta lastRulesRunISO NO vacia el container (solo actualiza span .rules-last-run)');

  instSpy.restore();
});

/* ══════════════════════════════════════════════════════════════════════════════
   T4 — recommendations view coalesce: 5 eventos → maximo 2 re-renders del
        listWrap (clase .recs-list). scheduleLoad usa el mismo patron de
        debounce 250 ms que el dashboard.
   ══════════════════════════════════════════════════════════════════════════════ */
test('T4 recommendations view coalesce: 5 eventos → <= 2 vaciados del listWrap', async function () {
  const s = freshStore();

  /* Guardar 2 recs directamente para que loadData() las encuentre. */
  const nowISO = new Date().toISOString();
  await s.recommendations.save({
    id: 'rec-1', ruleId: 'R1', entityStore: 'monitoringPoints', entityId: 'MP-X',
    status: 'open', severity: 'warning', createdAt: nowISO, updatedAt: nowISO,
    lastTriggeredAt: nowISO, triggerCount: 1, fingerprint: 'R1:monitoringPoints:MP-X',
    messageKey: 'rules.msg.R1', params: {}, history: [{ action: 'created', at: nowISO }]
  });
  await s.recommendations.save({
    id: 'rec-2', ruleId: 'R5', entityStore: 'monitoringPoints', entityId: 'MP-X',
    status: 'open', severity: 'info', createdAt: nowISO, updatedAt: nowISO,
    lastTriggeredAt: nowISO, triggerCount: 1, fingerprint: 'R5:monitoringPoints:MP-X',
    messageKey: 'rules.msg.R5', params: { reason: 'stuck' }, history: [{ action: 'created', at: nowISO }]
  });
  await s.monitoringPoints.save({ id: 'MP-X', code: 'MP-X', name: 'Test MP', sensorType: 'erProbe' });
  await s.meta.set('lastRulesRunISO', nowISO);

  const recsView = require('../src/views/recommendations.js');
  const container = globalThis.document.createElement('div');

  const ctx = {
    repos: s,
    bus: bus,
    i18n: function (k, p) { return i18n.t(k, p); },
    navigate: function () {}
  };

  /* Render la vista. */
  await recsView.render(container, ctx);
  await new Promise(function (r) { setImmediate(r); });

  /* Encontrar el div.recs-list recorriendo children del container. */
  function findRecsList(node) {
    if (node.className && node.className.split(/\s+/).indexOf('recs-list') !== -1) {
      return node;
    }
    var kids = Array.isArray(node.children) ? node.children : [];
    for (var i = 0; i < kids.length; i++) {
      var found = findRecsList(kids[i]);
      if (found) { return found; }
    }
    return null;
  }

  var listWrap = findRecsList(container);
  assert.ok(listWrap, 'div.recs-list encontrado en el arbol del container');

  /* Espiar textContent de ESE nodo (no del prototipo global). */
  var listSpy = spyTextContentOnNode(listWrap);

  /* Emitir 5 data:changed:recommendations en el mismo tick. */
  for (var i = 0; i < 5; i++) {
    bus.emit('data:changed:recommendations', { store: 'recommendations', type: 'put' });
  }

  await sleep(600);

  /* Cada scheduleLoad → loadData → renderList → textContent = '' + rearmado.
     Con debounce 250ms, 5 eventos → maximo 2 ciclos → maximo 2 clears. */
  assert.ok(listSpy.calls.clears <= 2,
    '5 eventos coalescidos → ' + listSpy.calls.clears + ' clears (max 2)');

  listSpy.restore();
});

