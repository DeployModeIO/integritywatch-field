/* IntegrityWatch Field — db schema auditLog store (STATIC test).

   Comprobacion estatica del texto fuente de src/core/db.js. IndexedDB real NO
   existe en Node, por lo que la validacion funcional (open() + upgrade v1/v2 -> v3
   creando 'auditLog') vive en la prueba de navegador / Task de integracion. */
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'src', 'core', 'db.js'), 'utf8');

test('db.js: DB_VERSION sube a 3', () => {
  assert.match(SRC, /var\s+DB_VERSION\s*=\s*3\s*;/, 'DB_VERSION debe valer 3');
  assert.doesNotMatch(SRC, /var\s+DB_VERSION\s*=\s*2\s*;/, 'no debe quedar la version antigua 2');
});

test('db.js: store auditLog con keyPath id e indices at/user/entityStore', () => {
  const audit = /\{\s*name:\s*'auditLog'\s*,\s*keyPath:\s*'id'\s*,\s*indexes:\s*\[([^\]]*)\]\s*\}/.exec(SRC);
  assert.ok(audit, "debe existir la entrada { name: 'auditLog', keyPath: 'id', indexes: [...] }");
  const indexes = audit[1].split(',').map((s) => s.trim().replace(/^'|'$/g, '')).filter(Boolean);
  assert.deepEqual(indexes, ['at', 'user', 'entityStore'], 'indices exactos en orden');
});

test('db.js: auditLog se declara tras mutationQueue en SCHEMA', () => {
  const iMut = SRC.indexOf("name: 'mutationQueue'");
  const iAudit = SRC.indexOf("name: 'auditLog'");
  assert.ok(iMut !== -1, 'mutationQueue presente');
  assert.ok(iAudit !== -1, 'auditLog presente');
  assert.ok(iMut < iAudit, 'auditLog va despues de mutationQueue');
});

test('db.js: onupgradeneeded sigue siendo idempotente (guard por contains())', () => {
  // Recorre SCHEMA y solo crea el store si aun no existe => upgrade desde v1/v2
  // conserva los stores existentes y anade unicamente 'auditLog'.
  assert.match(
    SRC,
    /SCHEMA\.forEach\s*\([\s\S]*?objectStoreNames\.contains\s*\(\s*s\.name\s*\)[\s\S]*?createObjectStore\s*\(\s*s\.name/,
    'el upgrade debe iterar SCHEMA y proteger createObjectStore con objectStoreNames.contains(s.name)'
  );
  assert.match(SRC, /req\.onupgradeneeded\s*=/, 'debe mantener el handler onupgradeneeded');
});

test('db.js: la lista de stores NO se expone como API publica (no se inventa)', () => {
  // El retorno publico actual es la API historica; SCHEMA/STORES queda interna.
  const returns = /return\s*\{([\s\S]*?)\}\s*;\s*\}\s*\)/.exec(SRC);
  assert.ok(returns, 'debe existir el objeto de retorno del modulo');
  assert.doesNotMatch(returns[1], /\bSCHEMA\b|\bstores\b/i, 'SCHEMA no se expone; no inventar API');
});
