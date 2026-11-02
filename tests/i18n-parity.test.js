/* IntegrityWatch Field — i18n parity estricta (T3)
   Paridad de 7 locales, ausencia de claves crudas en el codigo fuente y
   ausencia de frases en ingles dentro del locale es.
   Anchors: TESTS.md §13 (locale parity), CONTRACTS.md §4.11 (IW.i18n.t). */
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const LOCALE_CODES = ['ar', 'en', 'es', 'fr', 'pt', 'ru', 'zh'];
const locales = {};
for (const code of LOCALE_CODES) {
  locales[code] = require('../src/i18n/locales/' + code + '.js');
}

// Aplana una tabla de locale a claves punteadas, ignorando la subrama __meta
// (incluidas sus hojas anidadas si las tuviera).
function flatLeaves(table) {
  const out = new Map();
  (function walk(node, prefix) {
    for (const key of Object.keys(node)) {
      if (key === '__meta') { continue; }
      const p = prefix ? prefix + '.' + key : key;
      const val = node[key];
      if (val !== null && typeof val === 'object') {
        walk(val, p);
      } else {
        out.set(p, val);
      }
    }
  })(table, '');
  return out;
}

// Diferencia de conjuntos de hojas: faltantes en b y sobrantes en b, ordenados.
function diffKeys(a, b) {
  const missing = [];
  const extra = [];
  for (const key of a.keys()) {
    if (!b.has(key)) { missing.push(key); }
  }
  for (const key of b.keys()) {
    if (!a.has(key)) { extra.push(key); }
  }
  missing.sort();
  extra.sort();
  return { missing, extra };
}

const FLAT = {};
for (const code of LOCALE_CODES) {
  FLAT[code] = flatLeaves(locales[code]);
}

// ---- Test 2: paridad estricta de los 7 locales -----------------------------

test('T3.a paridad estricta: los 7 locales tienen hojas identicas', () => {
  const ref = FLAT.en;
  assert.ok(ref.size > 330, 'en deberia tener >330 hojas, tiene ' + ref.size);
  const problemas = [];
  for (const code of LOCALE_CODES) {
    const { missing, extra } = diffKeys(ref, FLAT[code]);
    if (missing.length || extra.length) {
      problemas.push(
        code + ': faltan ' + JSON.stringify(missing) +
        ' | sobran ' + JSON.stringify(extra)
      );
    }
  }
  assert.deepEqual(problemas, [], 'desviaciones de paridad:\n' + problemas.join('\n'));
});

// ---- Test 4: sensibilidad del mecanismo (meta-test, solo en memoria) --------

test('T3.b diffKeys es vacio consigo mismo y detecta exactamente una hoja borrada', () => {
  assert.deepEqual(diffKeys(FLAT.es, FLAT.es), { missing: [], extra: [] });

  // Copia en memoria de la tabla es sin tocar disco.
  const copia = structuredClone(locales.es);
  const hojas = flatLeaves(copia);
  const primera = hojas.keys().next().value;
  assert.ok(primera, 'la tabla es debe tener al menos una hoja');

  // Borra la primera hoja del original de la copia (traversia por partes).
  const partes = primera.split('.');
  let cur = copia;
  for (let i = 0; i < partes.length - 1; i++) { cur = cur[partes[i]]; }
  delete cur[partes[partes.length - 1]];

  // Referencia = es completo; copia = le falta 'primera' => missing exactamente esa.
  const dif = diffKeys(FLAT.es, flatLeaves(copia));
  assert.deepEqual(dif.missing, [primera], 'diffKeys debe detectar exactamente la hoja borrada');
  assert.deepEqual(dif.extra, [], 'diffKeys no debe inventar sobrantes');
});

// ---- Test 3: sin claves crudas en el codigo ---------------------------------

const RE_POS_RAW = /\b(?:IW\.i18n\.)?\bt\(\s*(['"])([^'"]+)\1(?=\s*[,)])/g;

function collectLiteralKeys() {
  const byKey = new Map();
  const root = path.join(__dirname, '..', 'src');
  (function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) { walk(full); continue; }
      if (!entry.name.endsWith('.js')) { continue; }
      const rel = path.relative(path.join(__dirname, '..'), full).split(path.sep).join('/');
      if (rel.startsWith('src/i18n/locales/') || rel === 'src/i18n/i18n.js') { continue; }
      const src = fs.readFileSync(full, 'utf8');
      RE_POS_RAW.lastIndex = 0;
      let m;
      while ((m = RE_POS_RAW.exec(src)) !== null) {
        const key = m[2];
        if (key.indexOf('.') === -1) { continue; }
        if (/\s/.test(key)) { continue; }
        if (!byKey.has(key)) { byKey.set(key, new Set()); }
        byKey.get(key).add(rel);
      }
    }
  })(root);
  return byKey;
}

test('T3.c toda clave literal de t()/IW.i18n.t() existe en es y en en', () => {
  const byKey = collectLiteralKeys();
  assert.ok(byKey.size > 100, 'se esperaban >100 claves literales, hay ' + byKey.size);
  const fallas = [];
  for (const [key, files] of byKey) {
    const faltaEs = !FLAT.es.has(key);
    const faltaEn = !FLAT.en.has(key);
    if (faltaEs || faltaEn) {
      const donde = Array.from(files).sort().join(', ');
      fallas.push(key + ' (falta en' + (faltaEs ? ' es' : '') + (faltaEn ? ' y en en' : '') + ') -> ' + donde);
    }
  }
  assert.deepEqual(fallas, [], 'claves crudas sin traduccion:\n' + fallas.join('\n'));
});

// ---- Test 5: locale es sin frases en ingles ---------------------------------

const EN_STOPWORDS = [
  'the', 'and', 'with', 'from', 'this', 'that', 'your', 'please', 'click',
  'enter', 'delete', 'cancel', 'save', 'edit', 'new', 'value', 'report',
  'status', 'name', 'date', 'total', 'search', 'filter', 'export', 'import',
  'all', 'none', 'yes', 'no'
];
const STOP_SET = new Set(EN_STOPWORDS);

// Excepciones justificadas: DELETE es literal exigido por la UI de confirmacion.
const ES_WHITELIST = new Set(['admin.typeDelete']);

test('T3.d es no contiene frases en ingles (2+ stopwords consecutivos)', () => {
  const fallas = [];
  for (const [key, val] of FLAT.es) {
    if (typeof val !== 'string') { continue; }
    if (ES_WHITELIST.has(key)) { continue; }
    const words = val.toLowerCase().match(/[a-z]+/g);
    if (!words) { continue; }
    for (let i = 0; i + 1 < words.length; i++) {
      if (STOP_SET.has(words[i]) && STOP_SET.has(words[i + 1])) {
        fallas.push(key + ': "' + words[i] + ' ' + words[i + 1] + '" en ' + JSON.stringify(val));
        break;
      }
    }
  }
  assert.deepEqual(fallas, [], 'frases en ingles en locale es:\n' + fallas.join('\n'));
});
