/* IntegrityWatch Field — tests del componente scan (seguros en Node puro, sin DOM).
   Cubre: detección de soporte, rechazos SCAN_UNSUPPORTED, normalización de
   códigos QR y lectura EXIF sobre un JPEG sintético con APP1/TIFF artesanal.

   NOTA sobre la API real de src/calc/exif.js (leída antes de escribir el test):
   parseExif solo devuelve {capturedAt, gps, make, model}. La etiqueta
   Orientation (0x0112) SÍ se incluye en el JPEG de prueba —y exif.js la ignora
   sin romper nada— pero IW.components.scan.readPhotoExif normaliza
   orientation/pixelsX/pixelsY/gpsAccuracy a null porque el parser base no los
   expone. El test lo documenta con aserciones explícitas. */
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const scan = require('../src/components/scan.js');

// ---- Helpers para construir el JPEG+EXIF mínimo (igual que tests/exif.test.js) ----

function writeU16BE(arr, off, v) {
  arr[off] = (v >> 8) & 0xFF;
  arr[off + 1] = v & 0xFF;
}

function writeU16LE(arr, off, v) {
  arr[off] = v & 0xFF;
  arr[off + 1] = (v >> 8) & 0xFF;
}

function writeU32LE(arr, off, v) {
  arr[off] = v & 0xFF;
  arr[off + 1] = (v >> 8) & 0xFF;
  arr[off + 2] = (v >> 16) & 0xFF;
  arr[off + 3] = (v >> 24) & 0xFF;
}

function writeAscii(arr, off, str) {
  for (let i = 0; i < str.length; i++) {
    arr[off + i] = str.charCodeAt(i) & 0xFF;
  }
  arr[off + str.length] = 0;
}

// Entrada IFD: tag(2) type(2) count(4) valOrOff(4), todo LE.
function entry(arr, off, tag, type, count, valOrOff) {
  writeU16LE(arr, off, tag);
  writeU16LE(arr, off + 2, type);
  writeU32LE(arr, off + 4, count);
  writeU32LE(arr, off + 8, valOrOff);
}

// JPEG con APP1 → TIFF LE con:
//   IFD0 (5 entradas): Make='TESTCAM' (7 chars → externo), Model='X1' (inline),
//     Orientation=6 (tag 0x0112, SHORT), ExifIFD ptr, GPS IFD ptr
//   ExifIFD: DateTimeOriginal='2026:03:14 09:30:00' (los puntos se convierten
//     a ISO por exifDateToIso de exif.js, que exige 'YYYY:MM:DD HH:MM:SS')
//   GPS IFD: lat 40°30'0"N, lon 3°0'0"W, alt 0
// Plano TIFF:
//   0        header (8)
//   8        IFD0 (2 + 5*12 + 4 = 66)  → termina en 74
//   74       Make string 'TESTCAM\0' (8) → termina en 82
//   82       ExifIFD (2 + 12 + 4 = 18)  → termina en 100
//   100      DTO string '2026-03-14 09:30:00\0' (20) → termina en 120
//   120      GPS IFD (2 + 6*12 + 4 = 78) → termina en 198
//   198      datos racionales GPS (7 * 8 = 56) → TIFF total 254
function buildNameplateJpeg() {
  const MAKE_STR_OFF = 74;
  const EXIF_IFD_OFF = 82;
  const DTO_STR_OFF = 100;
  const GPS_IFD_OFF = 120;
  const GPS_DATA_OFF = 198;
  const TIFF_SIZE = 254;

  const tiff = new Uint8Array(TIFF_SIZE);

  // Header TIFF little-endian
  tiff[0] = 0x49; tiff[1] = 0x49;
  writeU16LE(tiff, 2, 0x002A);
  writeU32LE(tiff, 4, 8); // offset IFD0

  // IFD0: 5 entradas
  writeU16LE(tiff, 8, 5);
  entry(tiff, 10, 0x010F, 2, 8, MAKE_STR_OFF);   // Make → externo
  writeAscii(tiff, MAKE_STR_OFF, 'TESTCAM');
  entry(tiff, 22, 0x0110, 2, 3, 0);              // Model inline 'X1\0'
  writeAscii(tiff, 30, 'X1');
  entry(tiff, 34, 0x0112, 3, 1, 6);              // Orientation = 6 (exif.js la ignora)
  entry(tiff, 46, 0x8769, 4, 1, EXIF_IFD_OFF);   // ExifIFD ptr
  entry(tiff, 58, 0x8825, 4, 1, GPS_IFD_OFF);    // GPS IFD ptr
  writeU32LE(tiff, 70, 0);                       // next IFD = 0

  // ExifIFD: DateTimeOriginal
  writeU16LE(tiff, EXIF_IFD_OFF, 1);
  entry(tiff, EXIF_IFD_OFF + 2, 0x9003, 2, 20, DTO_STR_OFF);
  writeU32LE(tiff, EXIF_IFD_OFF + 14, 0);
  writeAscii(tiff, DTO_STR_OFF, '2026:03:14 09:30:00');

  // GPS IFD: 6 entradas
  writeU16LE(tiff, GPS_IFD_OFF, 6);
  entry(tiff, GPS_IFD_OFF + 2, 1, 2, 2, 0);              // latRef inline 'N\0'
  writeAscii(tiff, GPS_IFD_OFF + 10, 'N');
  entry(tiff, GPS_IFD_OFF + 14, 2, 5, 3, GPS_DATA_OFF);  // lat: 40,30,0
  entry(tiff, GPS_IFD_OFF + 26, 3, 2, 2, 0);             // lonRef inline 'W\0'
  writeAscii(tiff, GPS_IFD_OFF + 34, 'W');
  entry(tiff, GPS_IFD_OFF + 38, 4, 5, 3, GPS_DATA_OFF + 24); // lon: 3,0,0
  entry(tiff, GPS_IFD_OFF + 50, 5, 1, 1, 0);            // altRef = 0 (sobre el nivel)
  entry(tiff, GPS_IFD_OFF + 62, 6, 5, 1, GPS_DATA_OFF + 48); // alt: 0/1
  writeU32LE(tiff, GPS_IFD_OFF + 74, 0);

  // Datos racionales GPS
  writeU32LE(tiff, GPS_DATA_OFF, 40); writeU32LE(tiff, GPS_DATA_OFF + 4, 1);
  writeU32LE(tiff, GPS_DATA_OFF + 8, 30); writeU32LE(tiff, GPS_DATA_OFF + 12, 1);
  writeU32LE(tiff, GPS_DATA_OFF + 16, 0); writeU32LE(tiff, GPS_DATA_OFF + 20, 1);
  writeU32LE(tiff, GPS_DATA_OFF + 24, 3); writeU32LE(tiff, GPS_DATA_OFF + 28, 1);
  writeU32LE(tiff, GPS_DATA_OFF + 32, 0); writeU32LE(tiff, GPS_DATA_OFF + 36, 1);
  writeU32LE(tiff, GPS_DATA_OFF + 40, 0); writeU32LE(tiff, GPS_DATA_OFF + 44, 1);
  writeU32LE(tiff, GPS_DATA_OFF + 48, 0); writeU32LE(tiff, GPS_DATA_OFF + 52, 1);

  // Envolvente JPEG: SOI(2) + APP1 marker(2) + campo size(2) + 'Exif\0\0'(6) + TIFF
  // (el size del segmento APP1 incluye su propio campo de 2 bytes + payload)
  const app1FieldSize = 2 + 6 + TIFF_SIZE;
  const jpeg = new Uint8Array(2 + 2 + 2 + 6 + TIFF_SIZE);
  jpeg[0] = 0xFF; jpeg[1] = 0xD8;
  jpeg[2] = 0xFF; jpeg[3] = 0xE1;
  writeU16BE(jpeg, 4, app1FieldSize);
  const exifId = 'Exif\0\0';
  for (let i = 0; i < 6; i++) { jpeg[6 + i] = exifId.charCodeAt(i) & 0xFF; }
  jpeg.set(tiff, 12);
  return jpeg;
}

// ---- Soporte y rechazos en Node puro (sin window/navigator/DOM) ----

test('isQrSupported: false en Node puro', () => {
  assert.equal(scan.isQrSupported(), false);
});

test('scanNameplate: rechaza SCAN_UNSUPPORTED en Node y trae cancel()', async () => {
  const p = scan.scanNameplate();
  assert.equal(typeof p.cancel, 'function');
  p.cancel(); // no-op en rechazo temprano, no debe lanzar
  await assert.rejects(p, (err) => {
    assert.equal(err.code, 'SCAN_UNSUPPORTED');
    assert.ok(err instanceof Error);
    return true;
  });
});

test('captureGps: rechaza SCAN_UNSUPPORTED en Node', async () => {
  await assert.rejects(scan.captureGps(), (err) => {
    assert.equal(err.code, 'SCAN_UNSUPPORTED');
    return true;
  });
});

// ---- qrTextToValue: normalización de códigos de placa ----

test('qrTextToValue: mayúsculas, sin espacios, sin prefijos TAG:/PLACA:', () => {
  assert.equal(scan.qrTextToValue('tag: psv-101 '), 'PSV-101');
  assert.equal(scan.qrTextToValue(' PLACA:B-202 '), 'B-202');
  assert.equal(scan.qrTextToValue('psv 101'), 'PSV101');
  assert.equal(scan.qrTextToValue('ETIQUETA:  T-7 '), 'T-7');
  assert.equal(scan.qrTextToValue('PLATE : A1 '), 'A1');
  assert.equal(scan.qrTextToValue('B-202'), 'B-202');
  assert.equal(scan.qrTextToValue(''), '');
  assert.equal(scan.qrTextToValue(null), '');
  assert.equal(scan.qrTextToValue(undefined), '');
});

// ---- readPhotoExif sobre JPEG sintético ----

test('readPhotoExif: JPEG con EXIF mínimo → ok:true, cámara TESTCAM, fecha y GPS', async () => {
  const jpeg = buildNameplateJpeg();
  const res = await scan.readPhotoExif(jpeg);

  assert.equal(res.ok, true);
  assert.ok(res.camera.indexOf('TESTCAM') === 0,
    "camera empieza con 'TESTCAM' (Make), got: " + res.camera);
  assert.ok(res.camera.indexOf('X1') !== -1, 'camera incluye el Model');
  assert.equal(res.dateIso, '2026-03-14T09:30:00.000Z');
  assert.ok(Math.abs(res.lat - 40.5) < 0.001, 'lat ≈ 40.5, got ' + res.lat);
  assert.ok(Math.abs(res.lon - (-3.0)) < 0.001, 'lon ≈ -3.0, got ' + res.lon);

  // Campos que src/calc/exif.js NO expone: normalizados a null por contrato.
  // La etiqueta Orientation=6 está en el archivo de prueba pero el parser
  // base la ignora, por eso orientation sale null (documentado en scan.js).
  assert.equal(res.gpsAccuracy, null);
  assert.equal(res.pixelsX, null);
  assert.equal(res.pixelsY, null);
  assert.equal(res.orientation, null);

  assert.deepEqual(res.rawKeys.slice().sort(), ['capturedAt', 'gps', 'make', 'model']);
});

test('readPhotoExif: acepta ArrayBuffer y lo normaliza igual', async () => {
  const jpeg = buildNameplateJpeg();
  const res = await scan.readPhotoExif(jpeg.buffer);
  assert.equal(res.ok, true);
  assert.ok(res.camera.indexOf('TESTCAM') === 0);
});

test('readPhotoExif: bytes basura → ok:false con SCAN_NO_EXIF', async () => {
  const junk = new Uint8Array(64);
  for (let i = 0; i < junk.length; i++) { junk[i] = (i * 37) & 0xFF; }
  const res = await scan.readPhotoExif(junk);
  assert.equal(res.ok, false);
  assert.equal(res.reason, 'SCAN_NO_EXIF');
});

test('readPhotoExif: JPEG sin APP1, vacío y entradas inválidas → SCAN_NO_EXIF', async () => {
  const plain = new Uint8Array([0xFF, 0xD8, 0xFF, 0xD9]);
  const r1 = await scan.readPhotoExif(plain);
  assert.equal(r1.ok, false);
  assert.equal(r1.reason, 'SCAN_NO_EXIF');

  const r2 = await scan.readPhotoExif(new Uint8Array(0));
  assert.equal(r2.ok, false);

  const r3 = await scan.readPhotoExif('no soy bytes');
  assert.equal(r3.ok, false);
  assert.equal(r3.reason, 'SCAN_NO_EXIF');
});
