/* IntegrityWatch Field — exif
   Minimal JPEG EXIF parser: DateTimeOriginal, GPS, Make/Model. */
(function (root, factory) {
  'use strict';
  var api = factory(root);
  root.IW = root.IW || {};
  root.IW.calc = root.IW.calc || {};
  root.IW.calc.exif = api;
  if (typeof module === 'object' && module.exports) { module.exports = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  var TYPE_BYTE = 1;
  var TYPE_ASCII = 2;
  var TYPE_SHORT = 3;
  var TYPE_LONG = 4;
  var TYPE_RATIONAL = 5;
  var TYPE_UNDEFINED = 7;

  var TYPE_SIZES = {};
  TYPE_SIZES[TYPE_BYTE] = 1;
  TYPE_SIZES[TYPE_ASCII] = 1;
  TYPE_SIZES[TYPE_SHORT] = 2;
  TYPE_SIZES[TYPE_LONG] = 4;
  TYPE_SIZES[TYPE_RATIONAL] = 8;
  TYPE_SIZES[TYPE_UNDEFINED] = 1;

  // TIFF tag constants
  var TAG_MAKE = 0x010F;
  var TAG_MODEL = 0x0110;
  var TAG_EXIF_IFD = 0x8769;
  var TAG_GPS_IFD = 0x8825;
  var TAG_DTO = 0x9003;
  var TAG_GPS_LAT_REF = 1;
  var TAG_GPS_LAT = 2;
  var TAG_GPS_LON_REF = 3;
  var TAG_GPS_LON = 4;
  var TAG_GPS_ALT_REF = 5;
  var TAG_GPS_ALT = 6;

  function parseExif(bytes) {
    if (!(bytes instanceof Uint8Array)) {
      try { bytes = new Uint8Array(bytes); } catch (e) { return nullResult(); }
    }
    try {
      var tiff = findTiff(bytes);
      if (!tiff) { return nullResult(); }
      return parseTiff(tiff);
    } catch (_) {
      return nullResult();
    }
  }

  function nullResult() {
    return { capturedAt: null, gps: null, make: null, model: null };
  }

  function findTiff(bytes) {
    var len = bytes.length;
    // Scan for APP1 marker (FF E1) with "Exif\0\0"
    for (var i = 0; i < len - 9; i++) {
      if (bytes[i] !== 0xFF || bytes[i + 1] !== 0xE1) { continue; }
      var exifId = '';
      for (var j = 0; j < 6; j++) {
        exifId += String.fromCharCode(bytes[i + 4 + j]);
      }
      if (exifId !== 'Exif\x00\x00') { continue; }
      // TIFF starts at byte 10 after APP1 marker (skip FF E1 + 2-byte size + "Exif\0\0")
      var tiffStart = i + 10;
      return { bytes: bytes, start: tiffStart };
    }
    return null;
  }

  function parseTiff(tiff) {
    var bytes = tiff.bytes;
    var base = tiff.start;

    if (base + 8 > bytes.length) { return nullResult(); }

    var le;
    if (bytes[base] === 0x49 && bytes[base + 1] === 0x49) { le = true; }
    else if (bytes[base] === 0x4D && bytes[base + 1] === 0x4D) { le = false; }
    else { return nullResult(); }

    var magic = readU16(bytes, base + 2, le);
    if (magic !== 0x002A) { return nullResult(); }

    var ifd0Off = readU32(bytes, base + 4, le) + base;
    var ifd0 = parseIFD(bytes, ifd0Off, le, base);

    var result = nullResult();

    // Make / Model from IFD0
    if (ifd0[TAG_MAKE] !== undefined) { result.make = ifd0[TAG_MAKE]; }
    if (ifd0[TAG_MODEL] !== undefined) { result.model = ifd0[TAG_MODEL]; }

    // DateTimeOriginal from ExifIFD
    if (ifd0[TAG_EXIF_IFD] !== undefined) {
      var exifOff = ifd0[TAG_EXIF_IFD] + base;
      var exifIFD = parseIFD(bytes, exifOff, le, base);
      if (exifIFD[TAG_DTO] !== undefined) {
        result.capturedAt = exifDateToIso(exifIFD[TAG_DTO]);
      }
    }

    // GPS
    if (ifd0[TAG_GPS_IFD] !== undefined) {
      var gpsOff = ifd0[TAG_GPS_IFD] + base;
      var gpsIFD = parseIFD(bytes, gpsOff, le, base);
      var lat = parseGpsCoord(bytes, gpsIFD, TAG_GPS_LAT, TAG_GPS_LAT_REF, le, base);
      var lon = parseGpsCoord(bytes, gpsIFD, TAG_GPS_LON, TAG_GPS_LON_REF, le, base);
      var alt = parseGpsAlt(bytes, gpsIFD, TAG_GPS_ALT, TAG_GPS_ALT_REF, le, base);
      if (lat !== null && lon !== null) {
        result.gps = { lat: lat, lon: lon, alt: alt !== null ? alt : 0 };
      }
    }

    return result;
  }

  function parseIFD(bytes, off, le, base) {
    var map = {};
    if (off + 2 > bytes.length) { return map; }
    var count = readU16(bytes, off, le);
    off += 2;
    for (var i = 0; i < count; i++) {
      if (off + 12 > bytes.length) { break; }
      var tag = readU16(bytes, off, le);
      var type = readU16(bytes, off + 2, le);
      var num = readU32(bytes, off + 4, le);
      var typeSize = TYPE_SIZES[type] || 1;
      var totalBytes = num * typeSize;

      var val;
      if (totalBytes <= 4) {
        // Inline value
        val = readValue(bytes, off + 8, type, num, le, base);
      } else {
        // Offset to external data
        var dataOff = readU32(bytes, off + 8, le) + base;
        if (dataOff + totalBytes <= bytes.length) {
          val = readValue(bytes, dataOff, type, num, le, base);
        }
      }
      if (val !== undefined) { map[tag] = val; }
      off += 12;
    }
    return map;
  }

  function readValue(bytes, off, type, count, le, base) {
    if (type === TYPE_ASCII) {
      var s = '';
      for (var i = 0; i < count - 1; i++) {
        if (off + i >= bytes.length) { break; }
        var c = bytes[off + i];
        if (c === 0) { break; }
        s += String.fromCharCode(c);
      }
      return s;
    }
    if (type === TYPE_BYTE) {
      return bytes[off];
    }
    if (type === TYPE_SHORT) {
      return readU16(bytes, off, le);
    }
    if (type === TYPE_LONG) {
      return readU32(bytes, off, le);
    }
    if (type === TYPE_RATIONAL) {
      if (count >= 3) {
        // GPS coordinate: degrees, minutes, seconds
        var deg = readRational(bytes, off, le);
        var min = readRational(bytes, off + 8, le);
        var sec = readRational(bytes, off + 16, le);
        return deg + min / 60 + sec / 3600;
      }
      return readRational(bytes, off, le);
    }
    return undefined;
  }

  function readRational(bytes, off, le) {
    var num = readU32(bytes, off, le);
    var den = readU32(bytes, off + 4, le);
    if (den === 0) { return 0; }
    return num / den;
  }

  function readU16(bytes, off, le) {
    if (le) { return bytes[off] | (bytes[off + 1] << 8); }
    return (bytes[off] << 8) | bytes[off + 1];
  }

  function readU32(bytes, off, le) {
    if (le) {
      return (bytes[off]) | (bytes[off + 1] << 8) | (bytes[off + 2] << 16) | (bytes[off + 3] << 24);
    }
    return (bytes[off] << 24) | (bytes[off + 1] << 16) | (bytes[off + 2] << 8) | bytes[off + 3];
  }

  function exifDateToIso(exifDate) {
    if (!exifDate || typeof exifDate !== 'string') { return null; }
    var m = /^(\d{4}):(\d{2}):(\d{2})\s+(\d{2}):(\d{2}):(\d{2})$/.exec(exifDate);
    if (!m) { return null; }
    return m[1] + '-' + m[2] + '-' + m[3] + 'T' + m[4] + ':' + m[5] + ':' + m[6] + '.000Z';
  }

  function parseGpsCoord(bytes, gpsIFD, tagCoord, tagRef, le, base) {
    var coord = gpsIFD[tagCoord];
    if (coord === undefined || typeof coord !== 'number') { return null; }
    var ref = gpsIFD[tagRef];
    if (ref !== 'N' && ref !== 'S' && ref !== 'E' && ref !== 'W') {
      // Try reading ref from offset if it wasn't inline
      // (already handled in parseIFD, but just in case)
      return null;
    }
    if (ref === 'S' || ref === 'W') { coord = -coord; }
    return coord;
  }

  function parseGpsAlt(bytes, gpsIFD, tagAlt, tagAltRef, le, base) {
    var alt = gpsIFD[tagAlt];
    if (alt === undefined || typeof alt !== 'number') { return null; }
    var altRef = gpsIFD[tagAltRef];
    // 0 = above sea level, 1 = below
    if (altRef === 1) { alt = -alt; }
    return alt;
  }

  return { parseExif: parseExif };
});