/* IntegrityWatch Field — exportador ZIP (P3-a): round-trip, determinismo y
   validación CRC contra valores conocidos. Node 24, sin dependencias. */
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const zip = require('../src/export/zip.js');

// PRNG determinista (mulberry32) para datos pseudoaleatorios reproducibles.
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

const enc = new TextEncoder();

const FILES = [
  { name: 'informes/resumen.txt', data: 'ñ é ¿Cómo está? Acentos UTF-8 completos: á é í ó ú ñ ¿ ¡ € 表' },
  { name: 'datos.bin', data: randomBytes(65536, 12345) },
  { name: 'vacio.txt', data: new Uint8Array(0) }
];

async function checkRoundTrip(method) {
  const packed = await zip.pack(FILES, { method: method });
  assert.ok(packed instanceof Uint8Array, 'pack debe devolver Uint8Array');
  const out = await zip.unpack(packed);
  // Nombres exactos y orden determinista (sorted default true).
  assert.deepStrictEqual(out.map(function (e) { return e.name; }),
    ['datos.bin', 'informes/resumen.txt', 'vacio.txt']);
  assert.strictEqual(out.length, 3);
  for (let i = 0; i < out.length; i++) {
    const want = out[i].name === 'datos.bin' ? FILES[1].data
      : out[i].name === 'informes/resumen.txt' ? enc.encode(FILES[0].data)
      : new Uint8Array(0);
    assert.deepStrictEqual(out[i].data, want, 'bytes idénticos en ' + out[i].name);
  }
  return packed;
}

test('round-trip deflate: 3 archivos (UTF-8, binario, vacío) byte a byte', async function () {
  await checkRoundTrip('deflate');
});

test('round-trip store forzado: mismos resultados sin comprimir', async function () {
  const packed = await checkRoundTrip('store');
  // Con store el tamaño del zip debe ser >= el de los datos (cabeceras).
  const total = enc.encode(FILES[0].data).length + FILES[1].data.length;
  assert.ok(packed.length >= total, 'store conserva los datos sin comprimir');
});

test('round-trip de string: string→UTF-8 via TextEncoder documentado', async function () {
  const packed = await zip.pack([{ name: 't.txt', data: 'café ñ' }]);
  const out = await zip.unpack(packed);
  assert.deepStrictEqual(out[0].data, enc.encode('café ñ'));
});

test('determinismo: pack dos veces con el mismo opts.date produce bytes IDÉNTICOS', async function () {
  const opts = { date: new Date(Date.UTC(2026, 6, 4, 12, 34, 56)) };
  const a = await zip.pack(FILES, opts);
  const b = await zip.pack(FILES, opts);
  assert.deepStrictEqual(a, b, 'zip byte a byte reproducible (manifests SHA-256)');
  // Con default (epoch fijo) también determinista.
  const c = await zip.pack(FILES);
  const d = await zip.pack(FILES);
  assert.deepStrictEqual(c, d);
  // Con fecha distinta cambian solo los campos DOS date/time: tamaños iguales.
  const e = await zip.pack(FILES, { date: new Date(Date.UTC(2025, 0, 1)) });
  assert.strictEqual(e.length, a.length);
});

test('crc32: checksum estándar del algoritmo IEEE ("123456789" → 0xCBF43926)', function () {
  assert.strictEqual(zip.crc32(enc.encode('123456789')), 0xcbf43926);
  assert.strictEqual(zip.crc32(new Uint8Array(0)), 0);
});

test('unpack de basura: ZIP_BAD_ZIP tipado, sin throw de sistema', async function () {
  const basura = enc.encode('esto no es un zip, es texto suelto');
  await assert.rejects(function () { return zip.unpack(basura); },
    { code: 'ZIP_BAD_ZIP' });
  await assert.rejects(function () { return zip.unpack(new Uint8Array(3)); },
    { code: 'ZIP_BAD_ZIP' });
  // Un EOCD válido que apunta a un central directory corrupto.
  const truncado = new Uint8Array(64);
  new DataView(truncado.buffer).setUint32(42, 0x06054b50, true);
  await assert.rejects(function () { return zip.unpack(truncado); },
    { code: 'ZIP_BAD_ZIP' });
});

test('nombres con carpeta preservados (xl/workbook.xml)', async function () {
  const packed = await zip.pack([{ name: 'xl/workbook.xml', data: '<workbook/>' }], { method: 'store' });
  const out = await zip.unpack(packed);
  assert.strictEqual(out[0].name, 'xl/workbook.xml');
  assert.deepStrictEqual(out[0].data, enc.encode('<workbook/>'));
  assert.strictEqual(out[0].method, 0);
});

test('archivo grande sintético 2 MB: datos aleatorios no comprimen → fallback store por entrada', async function () {
  const raw = randomBytes(2 * 1024 * 1024, 777);
  const packed = await zip.pack([{ name: 'big.bin', data: raw }], { method: 'deflate' });
  // Deflate sobre ruido NO reduce (crece ~0.04%): el escritor degrada a store
  // por entrada. Por eso el zip queda en ~raw + cabeceras, holgura de 64 KB.
  assert.ok(packed.length < raw.length + 65536, 'ratio razonable: sin hinchado artificial');
  const out = await zip.unpack(packed);
  assert.deepStrictEqual(out[0].data, raw, 'round-trip estable a 2 MB');
  assert.strictEqual(out[0].method, 0, 'fallback automático a store documentado');
});

test('archivo grande COMPRESIBLE sí se deflata (ratio < 0.1)', async function () {
  const raw = new Uint8Array(1024 * 1024); // ceros: altamente compresible
  const packed = await zip.pack([{ name: 'zeros.bin', data: raw }], { method: 'deflate' });
  const out = await zip.unpack(packed);
  assert.strictEqual(out[0].method, 8, 'deflate aplicado a datos que sí comprimen');
  assert.ok(packed.length < raw.length * 0.1, 'ratio de compresión esperado');
  assert.deepStrictEqual(out[0].data, raw);
});

test('zip vacío: 0 entradas round-tripa', async function () {
  const packed = await zip.pack([]);
  const out = await zip.unpack(packed);
  assert.deepStrictEqual(out, []);
});
