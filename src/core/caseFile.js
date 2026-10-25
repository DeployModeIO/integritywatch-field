/* IntegrityWatch Field — caseFile
   Portable .iwf expedition format (F3a M9): canonical JSON envelope
   with FNV-1a 32-bit checksum for tamper detection. */
(function (root, factory) {
  'use strict';
  var api = factory(root);
  root.IW = root.IW || {};
  root.IW.core = root.IW.core || {};
  root.IW.core.caseFile = api;
  if (typeof module === 'object' && module.exports) { module.exports = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  var FNV_OFFSET = 0x811c9dc5;
  var FNV_PRIME = 0x01000193;

  // Recursive canonical JSON stringifier: keys sorted lexicographically.
  function canonicalStringify(obj) {
    if (obj === null || typeof obj !== 'object') {
      return JSON.stringify(obj);
    }
    if (Array.isArray(obj)) {
      var parts = [];
      for (var i = 0; i < obj.length; i++) { parts.push(canonicalStringify(obj[i])); }
      return '[' + parts.join(',') + ']';
    }
    var keys = Object.keys(obj).sort();
    var pairs = [];
    for (var k = 0; k < keys.length; k++) {
      pairs.push(JSON.stringify(keys[k]) + ':' + canonicalStringify(obj[keys[k]]));
    }
    return '{' + pairs.join(',') + '}';
  }

  // FNV-1a 32-bit hash, returns lower 32 bits as 8-char hex.
  function fnv1a(str) {
    if (typeof str !== 'string') { str = String(str == null ? '' : str); }
    var hash = FNV_OFFSET >>> 0;
    for (var i = 0; i < str.length; i++) {
      hash ^= str.charCodeAt(i);
      // 32-bit multiply with overflow
      hash = (hash * FNV_PRIME) >>> 0;
    }
    var hex = hash.toString(16);
    while (hex.length < 8) { hex = '0' + hex; }
    return hex;
  }

  function buildCaseFile(dataMap, meta) {
    meta = meta || {};
    var exportedAt = new Date().toISOString();
    var checksum = fnv1a(canonicalStringify(dataMap));
    var envelope = {
      format: 'iwf',
      version: 1,
      sector: meta.sector || undefined,
      exportedAt: exportedAt,
      app: '1.0.0',
      checksum: checksum,
      data: dataMap
    };
    // Strip undefined properties
    var keys = Object.keys(envelope);
    for (var k = 0; k < keys.length; k++) {
      if (envelope[keys[k]] === undefined) { delete envelope[keys[k]]; }
    }
    return envelope;
  }

  function parseCaseFile(text) {
    if (typeof text !== 'string' || !text.trim()) {
      return { ok: false, error: 'E_BAD_JSON' };
    }

    var obj;
    try {
      obj = JSON.parse(text);
    } catch (e) {
      return { ok: false, error: 'E_BAD_JSON' };
    }

    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
      return { ok: false, error: 'E_BAD_JSON' };
    }

    if (obj.format !== 'iwf') {
      return { ok: false, error: 'E_BAD_FORMAT' };
    }

    if (typeof obj.version !== 'number' || obj.version !== 1) {
      return { ok: false, error: (typeof obj.version === 'number' && obj.version > 1) ? 'E_VERSION' : 'E_BAD_FORMAT' };
    }

    var expectedChecksum = fnv1a(canonicalStringify(obj.data));
    if (obj.checksum !== expectedChecksum) {
      return { ok: false, error: 'E_CHECKSUM' };
    }

    return { ok: true, payload: obj };
  }

  return {
    canonicalStringify: canonicalStringify,
    fnv1a: fnv1a,
    buildCaseFile: buildCaseFile,
    parseCaseFile: parseCaseFile
  };
});