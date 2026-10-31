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
  var APP_VERSION = '1.1.0';

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

  function cryptoApi() {
    if (typeof globalThis !== 'undefined' && globalThis.crypto && globalThis.crypto.subtle) { return globalThis.crypto; }
    if (typeof crypto !== 'undefined' && crypto.subtle) { return crypto; }
    return null;
  }

  function utf8(str) {
    if (typeof TextEncoder !== 'undefined') { return new TextEncoder().encode(str); }
    var out = [];
    for (var i = 0; i < str.length; i++) {
      var c = str.charCodeAt(i);
      if (c < 0x80) { out.push(c); }
      else if (c < 0x800) { out.push(0xc0 | (c >> 6), 0x80 | (c & 0x3f)); }
      else if (c >= 0xd800 && c <= 0xdbff && i + 1 < str.length) {
        var c2 = str.charCodeAt(i + 1);
        if (c2 >= 0xdc00 && c2 <= 0xdfff) {
          var cp = 0x10000 + ((c - 0xd800) << 10) + (c2 - 0xdc00);
          out.push(0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 0x3f), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f));
          i++;
          continue;
        }
        out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f));
      } else {
        out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f));
      }
    }
    return new Uint8Array(out);
  }

  function bytesToB64(bytes) {
    var arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    if (typeof Buffer !== 'undefined') { return Buffer.from(arr).toString('base64'); }
    var bin = '';
    for (var i = 0; i < arr.length; i++) { bin += String.fromCharCode(arr[i]); }
    return btoa(bin);
  }

  function sha256B64(str) {
    var c = cryptoApi();
    if (!c || !c.subtle) { return Promise.reject(new Error('WebCrypto unavailable')); }
    var bytes = utf8(str);
    return c.subtle.digest('SHA-256', bytes).then(function (hash) {
      return bytesToB64(new Uint8Array(hash));
    });
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

  // V2 envelope: strong SHA-256 checksum (checksumSha256, flagged by
  // checksumAlgo) while retaining the legacy FNV-1a `checksum` field verbatim so
  // legacy readers keep working. `signedBy` records the acting role.
  //
  // Unkeyed checksums are anti-corruption only: they detect accidental edits in
  // transit/storage, not malicious tampering — an attacker who can modify the
  // file can recompute the hash. Authenticity requires a keyed MAC or signature.
  //
  // The strong checksum covers the whole envelope EXCEPT the checksum fields
  // themselves (checksumAlgo / checksum / checksumSha256), so tampering with the
  // metadata (sector, app, signedBy, exportedAt, version) is caught too.
  var CHECKSUM_COVERAGE_FIELDS = ['version', 'sector', 'exportedAt', 'app', 'signedBy', 'data'];

  function coverageObject(obj) {
    var out = {};
    for (var i = 0; i < CHECKSUM_COVERAGE_FIELDS.length; i++) {
      var k = CHECKSUM_COVERAGE_FIELDS[i];
      if (obj[k] !== undefined) { out[k] = obj[k]; }
    }
    return out;
  }

  function buildCaseFileV2(dataMap, meta, actorRole) {
    meta = meta || {};
    var exportedAt = new Date().toISOString();
    var fnv = fnv1a(canonicalStringify(dataMap));
    var envelope = {
      format: 'iwf',
      version: 1,
      sector: meta.sector || undefined,
      exportedAt: exportedAt,
      app: APP_VERSION,
      checksumAlgo: 'SHA-256',
      checksum: fnv,
      signedBy: (actorRole !== undefined && actorRole !== null) ? actorRole : meta.actorRole,
      data: dataMap
    };
    return sha256B64(canonicalStringify(coverageObject(envelope))).then(function (sha) {
      envelope.checksumSha256 = sha;
      var keys = Object.keys(envelope);
      for (var k = 0; k < keys.length; k++) {
        if (envelope[keys[k]] === undefined) { delete envelope[keys[k]]; }
      }
      return envelope;
    });
  }

  // Shared structural decode (JSON.parse + format/version checks).
  function decodeEnvelope(text) {
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

    return { ok: true, obj: obj };
  }

  // Legacy synchronous parser: FNV-1a only. Works for both legacy envelopes and
  // V2 envelopes (which retain the FNV `checksum` field), so old callers that
  // expect a synchronous result keep working unchanged.
  function parseCaseFile(text) {
    var d = decodeEnvelope(text);
    if (!d.ok) { return d; }
    var obj = d.obj;
    if (obj.checksum !== fnv1a(canonicalStringify(obj.data))) {
      return { ok: false, error: 'E_CHECKSUM' };
    }
    return { ok: true, payload: obj };
  }

  // Async parser: verifies the strong SHA-256 checksum whenever the envelope
  // carries `checksumSha256` (regardless of `checksumAlgo`), or when it declares
  // checksumAlgo 'SHA-256' but the checksum field is missing (a downgrade
  // attempt). Otherwise falls back to the legacy data-only FNV-1a check.
  // Always returns a Promise.
  function parseCaseFileAsync(text) {
    return Promise.resolve().then(function () {
      var d = decodeEnvelope(text);
      if (!d.ok) { return d; }
      var obj = d.obj;
      if (typeof obj.checksumSha256 === 'string') {
        return sha256B64(canonicalStringify(coverageObject(obj))).then(function (expected) {
          if (obj.checksumSha256 !== expected) {
            return { ok: false, error: 'E_CHECKSUM_SHA' };
          }
          return { ok: true, payload: obj };
        });
      }
      if (obj.checksumAlgo === 'SHA-256') {
        // Declared strong checksum but the field was stripped: downgrade attack.
        return { ok: false, error: 'E_CHECKSUM_SHA' };
      }
      if (obj.checksum !== fnv1a(canonicalStringify(obj.data))) {
        return { ok: false, error: 'E_CHECKSUM' };
      }
      return { ok: true, payload: obj };
    });
  }

  return {
    canonicalStringify: canonicalStringify,
    fnv1a: fnv1a,
    APP_VERSION: APP_VERSION,
    buildCaseFile: buildCaseFile,
    buildCaseFileV2: buildCaseFileV2,
    parseCaseFile: parseCaseFile,
    parseCaseFileAsync: parseCaseFileAsync
  };
});