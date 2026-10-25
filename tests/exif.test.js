/* IntegrityWatch Field — EXIF parser tests
   Tests parseExif with hand-crafted minimal JPEG+TIFF structures. */
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const exif = require('../src/calc/exif.js');

// ---- Helpers to build a minimal JPEG with APP1/EXIF/TIFF ----

function writeU16BE(buf, off, v) {
  buf[off] = (v >> 8) & 0xFF;
  buf[off + 1] = v & 0xFF;
}

function writeU32LE(arr, off, v) {
  arr[off] = v & 0xFF;
  arr[off + 1] = (v >> 8) & 0xFF;
  arr[off + 2] = (v >> 16) & 0xFF;
  arr[off + 3] = (v >> 24) & 0xFF;
}

function writeU16LE(arr, off, v) {
  arr[off] = v & 0xFF;
  arr[off + 1] = (v >> 8) & 0xFF;
}

function writeAscii(arr, off, str) {
  for (var i = 0; i < str.length; i++) {
    arr[off + i] = str.charCodeAt(i) & 0xFF;
  }
  arr[off + str.length] = 0;
}

// Writes a TIFF IFD entry: tag(2) type(2) count(4) valOrOff(4) — all LE
function entry(arr, off, tag, type, count, valOrOff) {
  writeU16LE(arr, off, tag);
  writeU16LE(arr, off + 2, type);
  writeU32LE(arr, off + 4, count);
  writeU32LE(arr, off + 8, valOrOff);
}

// Build a minimal JPEG with a hand-crafted TIFF inside APP1.
// Fields: Make="TST", DateTimeOriginal="2026:03:14 09:30:00" (ExifIFD),
// GPS lat=40°30'0"N=40.5, lon=3°0'0"W=-3.0
function buildTestJpeg() {
  // --- plan TIFF layout (all offsets relative to TIFF start = byte 10 of APP1 data) ---
  //
  // Offset 0:  TIFF header (8 bytes): "II" + 0x002A + IFD0_off
  // Offset 8:  IFD0 — 4 entries: Make, Model (both inline), ExifIFD ptr, GPS IFD ptr
  //            IFD0 size = 2 + 4*12 + 4 = 54 bytes
  // Offset 62: ExifIFD — 1 entry: DateTimeOriginal (offset to string)
  //            ExifIFD size = 2 + 1*12 + 4 = 18 bytes
  // Offset 80: DateTimeOriginal string "2026:03:14 09:30:00\0" (20 bytes)
  // Offset 100: GPS IFD — 6 entries: latRef(1), lat(2), lonRef(3), lon(4), altRef(5), alt(6)
  //            GPS IFD size = 2 + 6*12 + 4 = 78 bytes
  // Offset 178: GPS rational data: lat 40/1,30/1,0/1; lon 3/1,0/1,0/1; alt 0/1
  //            = 7 rationals × 8 = 56 bytes
  //
  // TIFF total size (from TIFF start): 234 bytes
  // APP1 data size: "Exif\0\0" (6) + 234 = 240
  // APP1 marker total: FF E1 + size_u16 + data = 2 + 2 + 240 = 244
  // JPEG: FF D8 + APP1 = 2 + 244 = 246 bytes

  var HEADER_SIZE = 8;
  var IFD0_OFF = HEADER_SIZE; // 8
  var EXIF_IFD_OFF = IFD0_OFF + 2 + 4 * 12 + 4; // 8+54=62
  var DTO_STR_OFF = EXIF_IFD_OFF + 2 + 1 * 12 + 4; // 62+18=80
  var GPS_IFD_OFF = DTO_STR_OFF + 20; // 100
  var GPS_DATA_OFF = GPS_IFD_OFF + 2 + 6 * 12 + 4; // 100+78=178
  var TIFF_SIZE = GPS_DATA_OFF + 7 * 8; // 178+56=234

  var app1DataSize = 6 + TIFF_SIZE; // "Exif\0\0" + TIFF
  var jpegSize = 2 + 2 + app1DataSize; // SOI + APP1 marker + APP1 data

  // APP1 data buffer (after "Exif\0\0" = TIFF portion)
  var tiff = new Uint8Array(TIFF_SIZE);

  // --- TIFF header (little-endian) ---
  tiff[0] = 0x49; // 'I'
  tiff[1] = 0x49; // 'I'
  writeU16LE(tiff, 2, 0x002A); // magic
  writeU32LE(tiff, 4, IFD0_OFF); // offset to IFD0

  // --- IFD0 at offset 8: 4 entries ---
  // Entry 0: Make, tag 0x010F, type ASCII=2, count=4, inline "TST\0"
  writeU16LE(tiff, IFD0_OFF, 4); // count
  entry(tiff, IFD0_OFF + 2,
    0x010F, 2, 4, 0); // Make inline -> "TST\0"
  writeAscii(tiff, IFD0_OFF + 2 + 8, 'TST');

  // Entry 1: Model, tag 0x0110, type ASCII=2, count=4, inline "M1\0\0"
  entry(tiff, IFD0_OFF + 2 + 12,
    0x0110, 2, 4, 0);
  writeAscii(tiff, IFD0_OFF + 2 + 12 + 8, 'M1');

  // Entry 2: ExifIFD pointer, tag 0x8769, type LONG=4, count=1 → value=EXIF_IFD_OFF
  entry(tiff, IFD0_OFF + 2 + 24,
    0x8769, 4, 1, EXIF_IFD_OFF);

  // Entry 3: GPS IFD pointer, tag 0x8825, type LONG=4, count=1 → value=GPS_IFD_OFF
  entry(tiff, IFD0_OFF + 2 + 36,
    0x8825, 4, 1, GPS_IFD_OFF);

  // Next IFD offset = 0 (end)
  writeU32LE(tiff, IFD0_OFF + 2 + 4 * 12, 0);

  // --- ExifIFD at EXIF_IFD_OFF (62): 1 entry ---
  writeU16LE(tiff, EXIF_IFD_OFF, 1); // 1 entry
  // DateTimeOriginal, tag 0x9003, type ASCII=2, count=20 → value offset DTO_STR_OFF
  entry(tiff, EXIF_IFD_OFF + 2,
    0x9003, 2, 20, DTO_STR_OFF);
  writeU32LE(tiff, EXIF_IFD_OFF + 2 + 1 * 12, 0); // next IFD = 0

  // --- DateTimeOriginal string at DTO_STR_OFF (80) ---
  writeAscii(tiff, DTO_STR_OFF, '2026:03:14 09:30:00');

  // --- GPS IFD at GPS_IFD_OFF (100): 6 entries ---
  // GPSVersionID? Skip for brevity; the parser may skip unknown tags.
  // Use tags: 1(lat ref), 2(lat), 3(lon ref), 4(lon), 5(alt ref), 6(alt)
  writeU16LE(tiff, GPS_IFD_OFF, 6);

  // Entry 0: GPSLatitudeRef, tag 1, type ASCII=2, count=2 → inline "N\0"
  entry(tiff, GPS_IFD_OFF + 2,
    1, 2, 2, 0);
  writeAscii(tiff, GPS_IFD_OFF + 2 + 8, 'N');

  // Entry 1: GPSLatitude, tag 2, type RATIONAL=5, count=3 → offset GPS_DATA_OFF
  entry(tiff, GPS_IFD_OFF + 2 + 12,
    2, 5, 3, GPS_DATA_OFF);

  // Entry 2: GPSLongitudeRef, tag 3, type ASCII=2, count=2 → inline "W\0"
  entry(tiff, GPS_IFD_OFF + 2 + 24,
    3, 2, 2, 0);
  writeAscii(tiff, GPS_IFD_OFF + 2 + 24 + 8, 'W');

  // Entry 3: GPSLongitude, tag 4, type RATIONAL=5, count=3 → offset GPS_DATA_OFF+24
  entry(tiff, GPS_IFD_OFF + 2 + 36,
    4, 5, 3, GPS_DATA_OFF + 24);

  // Entry 4: GPSAltitudeRef, tag 5, type BYTE=1, count=1 → inline 0
  entry(tiff, GPS_IFD_OFF + 2 + 48,
    5, 1, 1, 0);

  // Entry 5: GPSAltitude, tag 6, type RATIONAL=5, count=1 → offset GPS_DATA_OFF+48
  entry(tiff, GPS_IFD_OFF + 2 + 60,
    6, 5, 1, GPS_DATA_OFF + 48);

  writeU32LE(tiff, GPS_IFD_OFF + 2 + 6 * 12, 0); // next IFD = 0

  // --- GPS rational data at GPS_DATA_OFF (178) ---
  // lat: 40/1, 30/1, 0/1
  writeU32LE(tiff, GPS_DATA_OFF, 40); writeU32LE(tiff, GPS_DATA_OFF + 4, 1);
  writeU32LE(tiff, GPS_DATA_OFF + 8, 30); writeU32LE(tiff, GPS_DATA_OFF + 12, 1);
  writeU32LE(tiff, GPS_DATA_OFF + 16, 0); writeU32LE(tiff, GPS_DATA_OFF + 20, 1);
  // lon: 3/1, 0/1, 0/1
  writeU32LE(tiff, GPS_DATA_OFF + 24, 3); writeU32LE(tiff, GPS_DATA_OFF + 28, 1);
  writeU32LE(tiff, GPS_DATA_OFF + 32, 0); writeU32LE(tiff, GPS_DATA_OFF + 36, 1);
  writeU32LE(tiff, GPS_DATA_OFF + 40, 0); writeU32LE(tiff, GPS_DATA_OFF + 44, 1);
  // alt: 0/1
  writeU32LE(tiff, GPS_DATA_OFF + 48, 0); writeU32LE(tiff, GPS_DATA_OFF + 52, 1);

  // --- Build the full JPEG ---
  var jpeg = new Uint8Array(jpegSize);
  jpeg[0] = 0xFF; jpeg[1] = 0xD8; // SOI
  jpeg[2] = 0xFF; jpeg[3] = 0xE1; // APP1 marker
  writeU16BE(jpeg, 4, app1DataSize); // APP1 size (big-endian)
  // "Exif\0\0"
  var exifStr = 'Exif\0\0';
  for (var ei = 0; ei < 6; ei++) { jpeg[6 + ei] = exifStr.charCodeAt(ei) & 0xFF; }
  // TIFF data
  for (var ti = 0; ti < TIFF_SIZE; ti++) { jpeg[12 + ti] = tiff[ti]; }

  return jpeg;
}

// JPEG without EXIF (just SOI + EOI)
function buildPlainJpeg() {
  var buf = new Uint8Array(4);
  buf[0] = 0xFF; buf[1] = 0xD8;
  buf[2] = 0xFF; buf[3] = 0xD9;
  return buf;
}

// ---- Tests ----

test('parseExif: extracts DateTimeOriginal and GPS from hand-crafted JPEG', () => {
  var jpeg = buildTestJpeg();
  var result = exif.parseExif(jpeg);

  assert.ok(result, 'result is truthy');
  // capturedAt should be the ISO form of "2026:03:14 09:30:00"
  assert.equal(result.capturedAt, '2026-03-14T09:30:00.000Z',
    'DateTimeOriginal → ISO 8601');

  assert.ok(result.gps, 'GPS present');
  // lat = 40 + 30/60 + 0/3600 = 40.5, N = positive
  assert.ok(Math.abs(result.gps.lat - 40.5) < 0.001,
    'GPS latitude ≈ 40.5, got ' + result.gps.lat);
  // lon = 3 + 0/60 + 0/3600 = 3.0, W = negative → -3.0
  assert.ok(Math.abs(result.gps.lon - (-3.0)) < 0.001,
    'GPS longitude ≈ -3.0, got ' + result.gps.lon);
  assert.equal(result.gps.alt, 0, 'GPS altitude = 0');

  assert.equal(result.make, 'TST', 'Make = TST');
  assert.equal(result.model, 'M1', 'Model = M1');
});

test('parseExif: JPEG without APP1 returns nulls, does not throw', () => {
  var jpeg = buildPlainJpeg();
  var result;
  try {
    result = exif.parseExif(jpeg);
  } catch (e) {
    assert.fail('should not throw on plain JPEG: ' + e.message);
  }
  assert.ok(result, 'result is truthy');
  assert.equal(result.capturedAt, null, 'capturedAt is null');
  assert.equal(result.gps, null, 'gps is null');
  assert.equal(result.make, null, 'make is null');
  assert.equal(result.model, null, 'model is null');
});