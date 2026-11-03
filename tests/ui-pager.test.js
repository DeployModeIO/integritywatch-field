/* IntegrityWatch Field — paginacion (ui.paginate / ui.pager)
   Cobertura: paginate puro (clampeo, tamano, from/to) y pager renderizado
   con el shim de DOM de helpers, parchado con addEventListener y
   template.content minimos (el shim base no los trae; los glifos SVG de
   icons.js los necesitan, y sin parche el pager cae al respaldo textual).
   Los aria-label salen de claves i18n EXISTENTES (common.back/common.next),
   por eso se fija el locale es antes de renderizar. */
'use strict';

const { test, after } = require('node:test');
const assert = require('node:assert/strict');

require('../src/core/bus.js');
require('../src/i18n/locales/en.js');
require('../src/i18n/locales/es.js');
require('../src/i18n/i18n.js');
require('../src/components/icons.js');
const ui = require('../src/components/ui.js');
const dom = require('./helpers/dom-shim.js');

const i18n = require('../src/i18n/i18n.js');
i18n.setLocale('es');

dom.install();
// Parche del shim (mismo patron que los smoke de vistas): ui.el() pide
// addEventListener para opts.on y icons.svgNode pide template.content.
const elProto = Object.getPrototypeOf(globalThis.document.createElement('div'));
if (typeof elProto.addEventListener !== 'function') {
  elProto.addEventListener = function (type, fn) {
    this._handlers = this._handlers || {};
    this._handlers[type] = fn;
  };
}
const origCreate = globalThis.document.createElement;
globalThis.document.createElement = function (tag) {
  const node = origCreate.call(this, tag);
  if (String(tag).toLowerCase() === 'template') {
    node.content = { firstElementChild: origCreate.call(this, 'svg') };
  }
  return node;
};

after(() => { dom.uninstall(); });

function fire(node, type, evt) {
  const h = node._handlers && node._handlers[type];
  assert.ok(h, 'handler ' + type + ' registrado');
  h(evt || { preventDefault: function () {} });
}

function findByTag(node, tag, out) {
  out = out || [];
  const kids = Array.isArray(node.children) ? node.children : [];
  for (const c of kids) {
    if (c.tagName === tag) { out.push(c); }
    findByTag(c, tag, out);
  }
  return out;
}

const LIST12 = [];
for (let i = 1; i <= 12; i++) { LIST12.push(i); }

// ---- paginate: puro y tolerante ----------------------------------------------

test('paginate pagina normal: items, from, to, pages y total coherentes', () => {
  const r = ui.paginate(LIST12, 1, 5);
  assert.deepEqual(r.items, [1, 2, 3, 4, 5]);
  assert.equal(r.page, 1);
  assert.equal(r.pages, 3);
  assert.equal(r.total, 12);
  assert.equal(r.from, 1);
  assert.equal(r.to, 5);
  // ultima pagina parcial
  const r3 = ui.paginate(LIST12, 3, 5);
  assert.deepEqual(r3.items, [11, 12]);
  assert.equal(r3.from, 11);
  assert.equal(r3.to, 12);
});

test('paginate clampea pagina fuera de rango (arriba, abajo, basura)', () => {
  assert.equal(ui.paginate(LIST12, 99, 5).page, 3);
  assert.equal(ui.paginate(LIST12, 0, 5).page, 1);
  assert.equal(ui.paginate(LIST12, -7, 5).page, 1);
  assert.equal(ui.paginate(LIST12, NaN, 5).page, 1);
  assert.equal(ui.paginate(LIST12, 'abc', 5).page, 1);
  assert.equal(ui.paginate(LIST12, 2.7, 5).page, 2); // floor
});

test('paginate con lista null/undefined no lanza y devuelve vacio coherente', () => {
  for (const l of [null, undefined, 'no-array', {}]) {
    const r = ui.paginate(l, 4, 10);
    assert.deepEqual(r.items, []);
    assert.equal(r.page, 1);
    assert.equal(r.pages, 1);
    assert.equal(r.total, 0);
    assert.equal(r.from, 0);
    assert.equal(r.to, 0);
  }
});

test('paginate tamano: default 50, minimo 5, maximo 500', () => {
  const big = [];
  for (let i = 0; i < 100; i++) { big.push(i); }
  assert.equal(ui.paginate(big, 1).items.length, 50); // default
  assert.equal(ui.paginate(big, 1, undefined).items.length, 50);
  assert.equal(ui.paginate(big, 1, 'basura').items.length, 50);
  assert.equal(ui.paginate(big, 1, 1).items.length, 5); // clampeado a 5
  assert.equal(ui.paginate(big, 1, 9999).items.length, 100); // clampeado a 500
  assert.equal(ui.paginate(big, 1, 9999).pages, 1);
});

test('paginate no muta la lista original y corta el trozo exacto', () => {
  const src = [1, 2, 3, 4, 5, 6, 7];
  const r = ui.paginate(src, 2, 5);
  assert.deepEqual(r.items, [6, 7]);
  assert.equal(r.from, 6);
  assert.equal(r.to, 7);
  assert.deepEqual(src, [1, 2, 3, 4, 5, 6, 7]);
  // size 3 no es valido: se clampea al minimo 5 (y la pagina 2 arranca en 6)
  assert.deepEqual(ui.paginate(src, 2, 3).items, [6, 7]);
});

// ---- pager: render de la barra -------------------------------------------------

test('pager estructura base: nav.pager con boton‹, info y boton› y aria-labels existentes', () => {
  const nav = ui.pager({ total: 12, page: 1, size: 5, onGoto: function () {} });
  assert.equal(nav.tagName, 'NAV');
  assert.ok(nav.classList.contains('pager'), 'clase CSS existente .pager');
  const kids = nav.children;
  assert.equal(kids.length, 3, 'sin select cuando total <= 5*size');
  assert.equal(kids[0].tagName, 'BUTTON');
  assert.equal(kids[1].tagName, 'SPAN');
  assert.equal(kids[2].tagName, 'BUTTON');
  assert.equal(kids[0].getAttribute('aria-label'), 'Atrás', 'clave existente common.back');
  assert.equal(kids[2].getAttribute('aria-label'), 'Siguiente', 'clave existente common.next');
  assert.equal(kids[1].className, 'pager-info');
  assert.equal(kids[1].textContent, '1–5 de 12');
  assert.equal(kids[0].disabled, true, '‹ disabled en primera pagina');
  assert.equal(kids[2].disabled, false);
  // icons.js trae chevron-left/right: en navegador el boton lleva el SVG
  assert.equal(findByTag(kids[0], 'SVG').length, 1, 'chevron-left renderizado');
});

test('pager: ‹/› invocan onGoto con la pagina correcta y no llaman en los extremos', () => {
  const gone = [];
  const nav = ui.pager({ total: 12, page: 2, size: 5, onGoto: function (p) { gone.push(p); } });
  fire(nav.children[0], 'click');
  fire(nav.children[2], 'click');
  assert.deepEqual(gone, [1, 3]);
  // extremos: pagina 1 no emite atras; ultima pagina no emite adelante
  gone.length = 0;
  const first = ui.pager({ total: 12, page: 1, size: 5, onGoto: function (p) { gone.push(p); } });
  fire(first.children[0], 'click');
  assert.deepEqual(gone, []);
  const last = ui.pager({ total: 12, page: 3, size: 5, onGoto: function (p) { gone.push(p); } });
  assert.equal(last.children[1].textContent, '11–12 de 12');
  assert.equal(last.children[2].disabled, true);
  fire(last.children[2], 'click');
  assert.deepEqual(gone, []);
});

test('pager: pagina fuera de rango se clampea y labelFn personalizado manda', () => {
  const nav = ui.pager({ total: 12, page: 99, size: 5, onGoto: function () {} });
  assert.equal(nav.children[1].textContent, '11–12 de 12');
  const nav2 = ui.pager({
    total: 12, page: 2, size: 5, onGoto: function () {},
    labelFn: function (m) { return 'P' + m.page + '/' + m.pages; }
  });
  assert.equal(nav2.children[1].textContent, 'P2/3');
});

test('pager: select solo cuando total > 5*size (250/50 no, 300/50 si)', () => {
  const sin = ui.pager({ total: 250, page: 1, size: 50, onGoto: function () {} });
  assert.equal(findByTag(sin, 'SELECT').length, 0);
  const con = ui.pager({ total: 300, page: 1, size: 50, onGoto: function () {} });
  const sels = findByTag(con, 'SELECT');
  assert.equal(sels.length, 1);
  const sel = sels[0];
  assert.ok(sel.classList.contains('select'), 'clase CSS existente .select');
  assert.equal(sel.getAttribute('aria-label'), 'Ir a página');
  assert.equal(sel.value, '1');
  assert.equal(findByTag(sel, 'OPTION').length, 6, '6 paginas listadas');
});

test('pager: change del select llama onGoto con la pagina elegida (y no con la misma)', () => {
  const gone = [];
  const nav = ui.pager({ total: 300, page: 1, size: 50, onGoto: function (p) { gone.push(p); } });
  const sel = findByTag(nav, 'SELECT')[0];
  sel.value = '4';
  fire(sel, 'change');
  assert.deepEqual(gone, [4]);
  sel.value = '1';
  fire(sel, 'change');
  assert.deepEqual(gone, [4], 'valor igual a la pagina actual no re-navega');
  sel.value = '999';
  fire(sel, 'change');
  assert.deepEqual(gone, [4], 'valor imposible ignorado');
});

test('pager: con >200 paginas el select agrupa (<=200 opciones) y la actual esta incluida', () => {
  // total 2000 / size 5 → 400 paginas; pagina 250 cae en el hueco
  const nav = ui.pager({ total: 2000, page: 250, size: 5, onGoto: function () {} });
  const sel = findByTag(nav, 'SELECT')[0];
  const opts = findByTag(sel, 'OPTION');
  assert.ok(opts.length <= 200, 'maximo 200 opciones, hay ' + opts.length);
  const vals = opts.map(function (o) { return o.getAttribute('value'); });
  assert.ok(vals.indexOf('1') !== -1, 'primera pagina listada');
  assert.ok(vals.indexOf('400') !== -1, 'ultima pagina listada');
  assert.ok(vals.indexOf('250') !== -1, 'pagina actual en el hueco se incluye');
  assert.ok(vals.indexOf('') !== -1, 'hueco … presente');
  assert.equal(sel.value, '250');
  // pagina en la cabecera: sin inclusion extra
  const nav2 = ui.pager({ total: 2000, page: 50, size: 5, onGoto: function () {} });
  const opts2 = findByTag(findByTag(nav2, 'SELECT')[0], 'OPTION');
  assert.equal(opts2.length, opts.length - 1, 'una opcion menos cuando la actual esta en cabecera');
});

test('pager: total 0 muestra 0–0 de 0 con ambos botones disabled y sin select', () => {
  const nav = ui.pager({ total: 0, size: 50 });
  assert.equal(nav.children.length, 3);
  assert.equal(nav.children[1].textContent, '0–0 de 0');
  assert.equal(nav.children[0].disabled, true);
  assert.equal(nav.children[2].disabled, true);
  fire(nav.children[0], 'click'); // onGoto por defecto: no-op, no lanza
  fire(nav.children[2], 'click');
});

test('pager sin set de iconos cae al glifo textual ‹ / › (sin errores)', () => {
  const savedIcons = globalThis.IW.ui.icons;
  globalThis.IW.ui.icons = undefined;
  try {
    const nav = ui.pager({ total: 12, page: 1, size: 5, onGoto: function () {} });
    assert.equal(nav.children[0].textContent, '‹');
    assert.equal(nav.children[2].textContent, '›');
    assert.equal(findByTag(nav, 'SVG').length, 0);
  } finally {
    globalThis.IW.ui.icons = savedIcons;
  }
});

test('pager: tamano basura se normaliza igual que paginate (min 5, default 50)', () => {
  const nav = ui.pager({ total: 100, page: 1, size: 1, onGoto: function () {} });
  assert.equal(nav.children[1].textContent, '1–5 de 100');
  assert.equal(findByTag(nav, 'SELECT').length, 1, '20 paginas: select presente');
  const nav2 = ui.pager({ total: 100, page: 1, onGoto: function () {} });
  assert.equal(nav2.children[1].textContent, '1–50 de 100');
});
