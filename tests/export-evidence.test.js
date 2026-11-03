/* IntegrityWatch Field — export.evidencePack (P3-c3): paquete de evidencia
   ZIP + manifiesto SHA-256. Cubre: vector sha256 conocido (fuente externa:
   Node require('crypto'), no nuestra propia API), build+verify de 3 archivos
   (a.txt con acentos, datos.bin determinista, manifest.json generado), orden
   de entrada estable, tamper de 1 byte reempaquetado a mano → problems con el
   nombre exacto, manifest ausente/presente pero malformado, archivo faltante
   y sobrante, determinismo byte a byte con mismo createdAtISO, nombres
   repetidos → error tipado, markMeta sobre el meta repo REAL (store+dbMemory)
   y sobre un stub. Node 24: globalThis.crypto.subtle verificado disponible
   (Node >= 19 lo expone; no se usa ningún fallback). */
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

// Orden de carga como en navegador: zip.js primero (evidencePack lo usa via
// IW.export.zip al llamar, igual que xlsxWriter).
require('../src/export/zip.js');
const storeApi = require('../src/core/store.js');
const dbMemory = require('../src/core/dbMemory.js');
const ep = require('../src/export/evidencePack.js');
const zip = require('../src/export/zip.js');

const enc = new TextEncoder();
const EPOCH = new Date('2026-01-01T00:00:00.000Z');
const CREATED_AT = '2026-11-03T09:00:00.000Z';

// PRNG determinista (mulberry32), mismo patrón que tests/export-zip.test.js.
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    var t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function randomBytes(len, seed) {
  const rnd = mulberry32(seed);
  const out = new Uint8Array(len);
  for (let i = 0; i < len; i++) { out[i] = (rnd() * 256) | 0; }
  return out;
}

// Dos archivos de entrada; el TERCER archivo del zip es manifest.json,
// generado por build() (espejo del contrato del enunciado).
function testFiles() {
  return [
    { name: 'a.txt', content: 'Informe ñ' },
    { name: 'datos.bin', content: randomBytes(2048, 20261103) }
  ];
}

// Golden fijados con Node require('crypto') (hash externo a la API probada):
const SHA_ABC = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad';
const SHA_INFORME_N = '98faddebc35ff65cfd0bbf3ade54cdcb82be1874c39420b2949b6715bf894e26';

test('preconditions: WebCrypto disponible en este entorno de test (Node >= 19)', function () {
  assert.ok(globalThis.crypto && globalThis.crypto.subtle,
    'falta globalThis.crypto.subtle: se exigiría el fallback documentado');
});

test('sha256Hex: vector conocido "abc" + golden con acentos + string==bytes', async function () {
  assert.strictEqual(await ep.sha256Hex('abc'), SHA_ABC);
  // Cadena con acentos: golden UTF-8 externo y estable entre llamadas/tipos.
  const s = 'Informe ñ';
  assert.strictEqual(await ep.sha256Hex(s), SHA_INFORME_N);
  assert.strictEqual(await ep.sha256Hex(enc.encode(s)), SHA_INFORME_N,
    'string y sus bytes UTF-8 dan el MISMO sha (codificación canónica)');
  assert.strictEqual(await ep.sha256Hex('café ñ ¿Qué?'),
    'b840f95ee166f287e1cdbccdb02ed4cc723d3009c855bf9abb8b967ebbcbb164');
  assert.match(await ep.sha256Hex('abc'), /^[0-9a-f]{64}$/, 'hex minúsculas, 64 dígitos');
});

test('sha256Hex: entrada inválida → EWP_BAD_INPUT tipado', async function () {
  await assert.rejects(() => ep.sha256Hex(42), { code: 'EWP_BAD_INPUT' });
  await assert.rejects(() => ep.sha256Hex(null), { code: 'EWP_BAD_INPUT' });
});

test('build: paquete de 3 archivos (a.txt, datos.bin, manifest.json) → verify ok', async function () {
  const { bytes, manifest } = await ep.build(testFiles(), { createdAtISO: CREATED_AT });
  assert.ok(bytes instanceof Uint8Array);
  // El zip contiene EXACTAMENTE los de entrada en orden + manifest al final
  // (orden de entrada estable: pack con sorted:false).
  const names = (await zip.unpack(bytes)).map(function (e) { return e.name; });
  assert.deepStrictEqual(names, ['a.txt', 'datos.bin', 'manifest.json']);
  // Manifiesto: contrato de claves del enunciado.
  assert.strictEqual(manifest.kind, 'iwf-evidence-pack');
  assert.strictEqual(manifest.version, 1);
  assert.strictEqual(manifest.app, 'IntegrityWatch Field');
  assert.strictEqual(manifest.createdAt, CREATED_AT);
  assert.strictEqual(manifest.count, 2);
  assert.ok(!('reportId' in manifest) && !('generatedBy' in manifest),
    'reportId/generatedBy SOLO viajan si se pasan');
  assert.deepStrictEqual(manifest.files, [
    { name: 'a.txt', bytes: 10, sha256: SHA_INFORME_N }, // 'Informe ñ' = 10 bytes UTF-8
    { name: 'datos.bin', bytes: 2048, sha256: await ep.sha256Hex(testFiles()[1].content) }
  ]);
  // El manifest.json DENTRO del zip es byte a byte el JSON del devuelto.
  const mEntry = (await zip.unpack(bytes))[2];
  assert.strictEqual(new TextDecoder().decode(mEntry.data), JSON.stringify(manifest));
  const v = await ep.verify(bytes);
  assert.deepStrictEqual(v.problems, []);
  assert.strictEqual(v.ok, true);
  assert.deepStrictEqual(v.manifest, manifest);
});

test('build con reportId y user → viajan en el manifiesto', async function () {
  const { manifest } = await ep.build(testFiles(), {
    createdAtISO: CREATED_AT, reportId: 'INSP-N16-004', user: 'inspector A'
  });
  assert.strictEqual(manifest.reportId, 'INSP-N16-004');
  assert.strictEqual(manifest.generatedBy, 'inspector A');
});

test('tamper: 1 byte alterado y reempaquetado a mano → verify ok:false con el nombre exacto', async function () {
  const { bytes, manifest } = await ep.build(testFiles(), { createdAtISO: CREATED_AT });
  const list = await zip.unpack(bytes);
  const victim = list.find(function (e) { return e.name === 'datos.bin'; });
  const original = victim.data[7];
  victim.data[7] = original ^ 0xff; // alteración mínima de un byte
  const tampered = await zip.pack(list, { sorted: false, date: EPOCH });
  const v = await ep.verify(tampered);
  assert.strictEqual(v.ok, false);
  assert.strictEqual(v.problems.length, 1, 'un solo problema: el archivo alterado');
  assert.strictEqual(v.problems[0].name, 'datos.bin');
  assert.strictEqual(v.problems[0].expected, manifest.files[1].sha256);
  assert.strictEqual(v.problems[0].actual, await ep.sha256Hex(victim.data));
});

test('verify: zip sin manifest.json → ok:false con actual "missing"', async function () {
  const suelto = await zip.pack([{ name: 'a.txt', data: 'Informe ñ' }], { date: EPOCH });
  const v = await ep.verify(suelto);
  assert.strictEqual(v.ok, false);
  assert.strictEqual(v.manifest, null);
  assert.strictEqual(v.problems.length, 1);
  assert.strictEqual(v.problems[0].name, 'manifest.json');
  assert.strictEqual(v.problems[0].actual, 'missing');
});

test('verify: manifest.json malformado → ok:false, no revienta', async function () {
  const malo = await zip.pack([{ name: 'manifest.json', data: '{no es json' }], { date: EPOCH });
  const v = await ep.verify(malo);
  assert.strictEqual(v.ok, false);
  assert.strictEqual(v.manifest, null);
  assert.strictEqual(v.problems[0].name, 'manifest.json');
  assert.strictEqual(v.problems[0].actual, 'malformed');
});

test('verify: archivo declarado pero ausente → "missing"; no declarado → "extra"', async function () {
  const { bytes } = await ep.build(testFiles(), { createdAtISO: CREATED_AT });
  const list = await zip.unpack(bytes);
  // Quitar a.txt (sigue declarado en el manifest que viaja intacto).
  const sin = list.filter(function (e) { return e.name !== 'a.txt'; });
  const vMissing = await ep.verify(await zip.pack(sin, { sorted: false, date: EPOCH }));
  assert.strictEqual(vMissing.ok, false);
  assert.deepStrictEqual(vMissing.problems, [
    { name: 'a.txt', expected: SHA_INFORME_N, actual: 'missing' }
  ]);
  // Añadir un archivo que el manifest no declara.
  const con = list.concat([{ name: 'extra.txt', data: enc.encode('sobrante') }]);
  const vExtra = await ep.verify(await zip.pack(con, { sorted: false, date: EPOCH }));
  assert.strictEqual(vExtra.ok, false);
  assert.strictEqual(vExtra.problems.length, 1);
  assert.strictEqual(vExtra.problems[0].name, 'extra.txt');
  assert.strictEqual(vExtra.problems[0].actual, 'extra');
});

test('verify: bytes que no son zip → rejection ZIP_BAD_ZIP (el error viaja tipado)', async function () {
  await assert.rejects(() => ep.verify(enc.encode('esto no es un zip')), { code: 'ZIP_BAD_ZIP' });
});

test('determinismo: mismo input + mismo createdAtISO → bytes IDÉNTICOS', async function () {
  const opts = { createdAtISO: CREATED_AT, reportId: 'R-1', user: 'u' };
  const a = await ep.build(testFiles(), opts);
  const b = await ep.build(testFiles(), opts);
  assert.deepStrictEqual(a.bytes, b.bytes, 'zip byte a byte reproducible');
  assert.deepStrictEqual(a.manifest, b.manifest);
  // Sin opts también determinista (epoch fijo documentado como default).
  const c = await ep.build(testFiles());
  const d = await ep.build(testFiles());
  assert.deepStrictEqual(c.bytes, d.bytes);
  assert.strictEqual(c.manifest.createdAt, '2026-01-01T00:00:00.000Z',
    'default createdAt = epoch fijo documentado (mismo que zip.js)');
  // Otro createdAtISO cambia el manifest → bytes distintos, tamaño igual.
  const e = await ep.build(testFiles(), { createdAtISO: '2026-11-03T09:00:01.000Z' });
  assert.notDeepStrictEqual(e.bytes, c.bytes, 'otro createdAt → otro paquete');
});

test('validación de entrada: nombres repetidos → EWP_DUPLICATE_NAME tipado', async function () {
  await assert.rejects(() => ep.build([
    { name: 'a.txt', content: 'uno' },
    { name: 'a.txt', content: 'otro' }
  ]), { code: 'EWP_DUPLICATE_NAME' });
});

test('validación de entrada: manifest.json reservado, nombres vacíos, content inválido', async function () {
  await assert.rejects(() => ep.build([{ name: 'manifest.json', content: 'x' }]),
    { code: 'EWP_BAD_INPUT' }, 'el manifest lo genera build(): nombre reservado');
  await assert.rejects(() => ep.build([{ name: '', content: 'x' }]),
    { code: 'EWP_BAD_INPUT' });
  await assert.rejects(() => ep.build([{ name: 'a.txt', content: 42 }]),
    { code: 'EWP_BAD_INPUT' });
  await assert.rejects(() => ep.build('no es array'), { code: 'EWP_BAD_INPUT' });
  await assert.rejects(() => ep.build(testFiles(), { createdAtISO: 12345 }),
    { code: 'EWP_BAD_INPUT' });
});

test('build([]): paquete legal de solo-manifiesto verifica ok', async function () {
  const { bytes, manifest } = await ep.build([], { createdAtISO: CREATED_AT });
  const names = (await zip.unpack(bytes)).map(function (e) { return e.name; });
  assert.deepStrictEqual(names, ['manifest.json']);
  assert.strictEqual(manifest.count, 0);
  const v = await ep.verify(bytes);
  assert.strictEqual(v.ok, true);
});

test('markMeta: meta repo REAL (store+dbMemory) → caseFile.lastISO y lastSha', async function () {
  const repos = storeApi.create(dbMemory.create());
  const { bytes, manifest } = await ep.build(testFiles(), { createdAtISO: CREATED_AT });
  const r = await ep.markMeta(repos.meta, { bytes: bytes, manifest: manifest });
  assert.strictEqual(r.iso, CREATED_AT);
  assert.strictEqual(r.sha, await ep.sha256Hex(bytes), 'lastSha = sha256 de los BYTES del zip');
  assert.match(r.sha, /^[0-9a-f]{64}$/);
  // Lengueta exacta del contrato TODO de T-12 (model-t12.js lee lastISO).
  assert.strictEqual(await repos.meta.get('caseFile.lastISO'), CREATED_AT);
  assert.strictEqual(await repos.meta.get('caseFile.lastSha'), r.sha);
});

test('markMeta: stub de meta también sirve; args inválidos → EWP_BAD_INPUT', async function () {
  const bag = {};
  const stub = { set: function (k, v) { bag[k] = v; return Promise.resolve(); } };
  const pack = await ep.build(testFiles(), { createdAtISO: CREATED_AT });
  const r = await ep.markMeta(stub, pack);
  assert.strictEqual(bag['caseFile.lastISO'], CREATED_AT);
  assert.strictEqual(bag['caseFile.lastSha'], r.sha);
  await assert.rejects(() => ep.markMeta({}, pack), { code: 'EWP_BAD_INPUT' });
  await assert.rejects(() => ep.markMeta(stub, { bytes: 'no', manifest: pack.manifest }),
    { code: 'EWP_BAD_INPUT' });
});
