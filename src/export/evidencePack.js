/* IntegrityWatch Field — export.evidencePack
   Paquete de evidencia: ZIP (sobre IW.export.zip) + manifest.json con SHA-256
   por archivo. Es la firma del "Empaquetar" de cierre/handover: contracta con
   T-12 (model-t12.js lee meta 'caseFile.lastISO' al pintar integridad).
   API asíncrona sin DOM; errores tipados con código EWP_*. en err.code.

   Decisiones documentadas:
   - sha256Hex usa globalThis.crypto.subtle (WebCrypto). VERIFICADO en Node
     24.18 (subtle está expuesto globalmente desde Node >= 19) y en navegadores
     en contexto seguro. NO se incluye fallback JS puro: ambos objetivos lo
     tienen; si faltara, se rechaza con EWP_NO_CRYPTO (nunca un hash falso).
   - Hex SIEMPRE minúsculas, 64 dígitos.
   - createdAt: opts.createdAtISO o el EPOCH FIJO documentado
     ('2026-01-01T00:00:00.000Z', mismo que zip.js). Preferimos determinismo
     byte a byte (requisito de manifests reproducibles) sobre timestamp real:
     quien necesite la hora de cierre pasa createdAtISO explícitamente. La
     cadena se guarda verbatim; su formato ISO es responsabilidad del llamador
     (T-12 la ecoa tal cual).
   - Orden de archivos ESTABLE: orden de entrada (zip.pack con sorted:false) y
     manifest.json SIEMPRE último. El manifest no se hash a sí mismo: declara
     solo los archivos de entrada; count = número de declarados.
   - Claves del manifest en orden fijo (JSON.stringify respeta orden de
     inserción): kind, version, createdAt, app, [reportId], [generatedBy],
     files[{name,bytes,sha256}], count. reportId/generatedBy solo si vienen.
   - El zip usa method store o deflate según opts.method (default deflate del
     propio zip.js, con su fallback store por entrada) y fecha DOS fija al
     epoch — el timestamp real vive SOLO en el manifest.
   - 'manifest.json' es nombre RESERVADO como entrada: lo genera build().
   - verify: unpack → recomputa SHA-256 de cada archivo contra el manifest.
     problems = [{name, expected, actual}]; actual es 'missing' (declarado y
     ausente), 'extra' (presente y no declarado), 'malformed' (manifest no
     parseable), o el hex/medida real en mismatch. Bytes que no son zip:
     rejection ZIP_BAD_ZIP del propio export.zip (viaja tipado).
   - markMeta(metaRepo, packResult): cumple el contrato TODO que dejó T-12 —
     escribe 'caseFile.lastISO' = manifest.createdAt y 'caseFile.lastSha' =
     sha256Hex de los BYTES del zip (hex, no base64). Solo si el llamador pasa
     un meta repo con set(); nada es opcional ni automático en build(). */
(function (root, factory) {
  'use strict';
  var api = factory(root);
  root.IW = root.IW || {};
  root.IW.export = root.IW.export || {};
  root.IW.export.evidencePack = api;
  if (typeof module === 'object' && module.exports) { module.exports = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  // Codigos de error tipados: siempre viajan en err.code.
  var CODE_BAD_INPUT = 'EWP_BAD_INPUT';           // entrada inválida del llamador
  var CODE_DUP_NAME = 'EWP_DUPLICATE_NAME';       // nombre repetido en files
  var CODE_NO_ZIP = 'EWP_NO_ZIP';                 // export.zip no cargado
  var CODE_NO_CRYPTO = 'EWP_NO_CRYPTO';           // sin WebCrypto subtle

  var MANIFEST_NAME = 'manifest.json';
  var KIND = 'iwf-evidence-pack';
  var VERSION = 1;
  var APP = 'IntegrityWatch Field';
  // Epoch fijo documentado para determinismo (idéntico a DEFAULT_DATE_MS de
  // zip.js): default de manifest.createdAt y fecha DOS del contenedor.
  var DEFAULT_EPOCH_ISO = '2026-01-01T00:00:00.000Z';
  // Claves meta del contrato T-12 (model-t12.js lee la primera).
  var META_KEY_ISO = 'caseFile.lastISO';
  var META_KEY_SHA = 'caseFile.lastSha';

  function ewpError(code, message) {
    var e = new Error(message);
    e.code = code;
    return e;
  }

  function zipApi() {
    var z = root.IW && root.IW.export && root.IW.export.zip;
    if (!z || typeof z.pack !== 'function' || typeof z.unpack !== 'function') {
      throw ewpError(CODE_NO_ZIP, 'IW.export.zip no está cargado: incluye src/export/zip.js antes de evidencePack.js');
    }
    return z;
  }

  function cryptoApi() {
    if (typeof globalThis !== 'undefined' && globalThis.crypto && globalThis.crypto.subtle) { return globalThis.crypto; }
    return null;
  }

  // Normalización canónica: string → UTF-8 (TextEncoder); bytes pasan tal
  // cual; ArrayBuffer se acepta por simetría con zip.js. Todo lo demás, error.
  function contentToBytes(content, what) {
    if (typeof content === 'string') { return new TextEncoder().encode(content); }
    if (content instanceof Uint8Array) { return content; }
    if (content instanceof ArrayBuffer) { return new Uint8Array(content); }
    if (typeof SharedArrayBuffer !== 'undefined' && content instanceof SharedArrayBuffer) { return new Uint8Array(content); }
    throw ewpError(CODE_BAD_INPUT, what + ' debe ser string o Uint8Array');
  }

  function digestHex(u8) {
    var c = cryptoApi();
    if (!c) { return Promise.reject(ewpError(CODE_NO_CRYPTO, 'globalThis.crypto.subtle no disponible: requiere Node >= 19 o navegador en contexto seguro')); }
    return c.subtle.digest('SHA-256', u8).then(function (hash) {
      var b = new Uint8Array(hash);
      var hex = '';
      for (var i = 0; i < b.length; i++) {
        if (b[i] < 16) { hex += '0'; }
        hex += b[i].toString(16);
      }
      return hex;
    });
  }

  // sha256Hex(content) → hex minúsculas. content: string | Uint8Array.
  function sha256Hex(content) {
    var u8;
    try {
      u8 = contentToBytes(content, 'content');
    } catch (e) {
      return Promise.reject(e);
    }
    return digestHex(u8);
  }

  // ---------------------------------------------------------------------
  // build(files, opts) → Promise<{bytes: Uint8Array, manifest: obj}>
  //   files: [{name, content(string|Uint8Array)}] — orden de entrada estable.
  //   opts:  {createdAtISO, reportId, user, method('deflate'|'store')}.
  // ---------------------------------------------------------------------

  function prepare(files, opts) {
    if (!Array.isArray(files)) { throw ewpError(CODE_BAD_INPUT, 'files debe ser un array de {name, content}'); }
    opts = opts || {};
    var createdAt = DEFAULT_EPOCH_ISO;
    if (opts.createdAtISO !== undefined && opts.createdAtISO !== null) {
      if (typeof opts.createdAtISO !== 'string' || opts.createdAtISO === '') {
        throw ewpError(CODE_BAD_INPUT, 'opts.createdAtISO debe ser cadena no vacía (ISO a criterio del llamador)');
      }
      createdAt = opts.createdAtISO;
    }
    var seen = Object.create(null);
    var entries = files.map(function (f, i) {
      if (!f || typeof f.name !== 'string' || f.name === '') {
        throw ewpError(CODE_BAD_INPUT, 'files[' + i + '].name debe ser cadena no vacía');
      }
      if (f.name === MANIFEST_NAME) {
        throw ewpError(CODE_BAD_INPUT, 'files[' + i + ']: "' + MANIFEST_NAME + '" es nombre reservado, el manifest lo genera build()');
      }
      if (seen[f.name]) {
        throw ewpError(CODE_DUP_NAME, 'nombre de archivo repetido: "' + f.name + '"');
      }
      seen[f.name] = true;
      return { name: f.name, data: contentToBytes(f.content, 'content de "' + f.name + '"') };
    });
    return {
      entries: entries,
      createdAt: createdAt,
      reportId: (typeof opts.reportId === 'string' && opts.reportId !== '') ? opts.reportId : undefined,
      generatedBy: (typeof opts.user === 'string' && opts.user !== '') ? opts.user : undefined,
      method: opts.method
    };
  }

  function build(files, opts) {
    var z;
    var prep;
    try {
      z = zipApi();
      prep = prepare(files, opts);
    } catch (e) {
      return Promise.reject(e);
    }
    // Digests en cadena secuencial: el orden de manifest.files es el de
    // entrada, siempre (no depende de qué hash termine antes).
    return prep.entries.reduce(function (chain, entry) {
      return chain.then(function (acc) {
        return digestHex(entry.data).then(function (hex) { acc.push(hex); return acc; });
      });
    }, Promise.resolve([])).then(function (hexes) {
      var manifest = {
        kind: KIND,
        version: VERSION,
        createdAt: prep.createdAt,
        app: APP
      };
      if (prep.reportId !== undefined) { manifest.reportId = prep.reportId; }
      if (prep.generatedBy !== undefined) { manifest.generatedBy = prep.generatedBy; }
      manifest.files = prep.entries.map(function (entry, i) {
        return { name: entry.name, bytes: entry.data.length, sha256: hexes[i] };
      });
      manifest.count = manifest.files.length;
      var zipFiles = prep.entries.concat([{
        name: MANIFEST_NAME,
        data: new TextEncoder().encode(JSON.stringify(manifest))
      }]);
      var packOpts = { sorted: false, date: new Date(DEFAULT_EPOCH_ISO) };
      if (prep.method !== undefined) { packOpts.method = prep.method; }
      return z.pack(zipFiles, packOpts).then(function (bytes) {
        return { bytes: bytes, manifest: manifest };
      });
    });
  }

  // ---------------------------------------------------------------------
  // verify(bytes) → Promise<{ok, manifest, problems}>
  //   problems: [{name, expected, actual}] con actual 'missing' | 'extra' |
  //   'malformed' | 'duplicado en manifest' | valor real (hex o medidas).
  // ---------------------------------------------------------------------

  function verify(bytes) {
    var z;
    try {
      z = zipApi();
    } catch (e) {
      return Promise.reject(e);
    }
    return z.unpack(bytes).then(function (list) {
      var byName = Object.create(null);
      list.forEach(function (en) { byName[en.name] = en.data; });

      var raw = byName[MANIFEST_NAME];
      var badManifest = function (actual, expected) {
        return { ok: false, manifest: null, problems: [{ name: MANIFEST_NAME, expected: expected, actual: actual }] };
      };
      if (!raw) { return badManifest('missing', 'presente en el zip'); }
      var manifest;
      try {
        manifest = JSON.parse(new TextDecoder().decode(raw));
      } catch (e) {
        return badManifest('malformed', 'JSON válido');
      }
      if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
        return badManifest('malformed', 'objeto JSON');
      }

      var problems = [];
      if (manifest.kind !== KIND || manifest.version !== VERSION) {
        problems.push({ name: MANIFEST_NAME, expected: KIND + ' v' + VERSION, actual: String(manifest.kind) + ' v' + String(manifest.version) });
      }
      var declared = Array.isArray(manifest.files) ? manifest.files : [];
      if (!Array.isArray(manifest.files)) {
        problems.push({ name: MANIFEST_NAME, expected: 'files: array', actual: 'files: ' + typeof manifest.files });
      }
      if (manifest.count !== declared.length) {
        problems.push({ name: MANIFEST_NAME, expected: 'count ' + declared.length, actual: 'count ' + String(manifest.count) });
      }

      var seenDup = Object.create(null);
      var chain = Promise.resolve();
      declared.forEach(function (info) {
        chain = chain.then(function () {
          if (!info || typeof info.name !== 'string' || info.name === '') {
            problems.push({ name: MANIFEST_NAME, expected: 'files[] con name válido', actual: 'entrada inválida' });
            return;
          }
          var name = info.name;
          if (seenDup[name]) {
            problems.push({ name: name, expected: 'declarada una vez', actual: 'duplicada en manifest' });
            return;
          }
          seenDup[name] = true;
          if (name === MANIFEST_NAME) {
            // El manifest nunca se declara a sí mismo (no puede hashearse
            // incluyendo su propio hash): declaración = manifiesto forjado.
            problems.push({ name: name, expected: 'no autodeclararse', actual: 'declarada en manifest' });
            return;
          }
          var data = byName[name];
          if (!data) {
            problems.push({ name: name, expected: info.sha256, actual: 'missing' });
            return;
          }
          if (typeof info.bytes === 'number' && data.length !== info.bytes) {
            // Medida distinta ⇒ ya hay tamper; el digest diría lo mismo.
            problems.push({ name: name, expected: info.bytes + ' bytes', actual: data.length + ' bytes' });
            return;
          }
          return digestHex(data).then(function (hex) {
            if (hex !== info.sha256) {
              problems.push({ name: name, expected: info.sha256, actual: hex });
            }
          });
        });
      });
      return chain.then(function () {
        Object.keys(byName).forEach(function (name) {
          if (name === MANIFEST_NAME || seenDup[name]) { return; }
          problems.push({ name: name, expected: null, actual: 'extra' });
        });
        return { ok: problems.length === 0, manifest: manifest, problems: problems };
      });
    });
  }

  // ---------------------------------------------------------------------
  // markMeta(metaRepo, packResult) → Promise<{iso, sha}>
  //   Contrato TODO dejado por T-12: al empaquetar, escribir
  //   'caseFile.lastISO' (lo lee model-t12.js) y 'caseFile.lastSha' (sha256
  //   hex de los bytes del zip). metaRepo: el repo meta de IW.core.store
  //   (set(key, value) → Promise) o cualquier stub con esa forma.
  // ---------------------------------------------------------------------

  function markMeta(metaRepo, packResult) {
    if (!metaRepo || typeof metaRepo.set !== 'function') {
      return Promise.reject(ewpError(CODE_BAD_INPUT, 'metaRepo debe exponer set(key, value) (repo meta de IW.core.store o stub equivalente)'));
    }
    if (!packResult || !(packResult.bytes instanceof Uint8Array) ||
        !packResult.manifest || typeof packResult.manifest.createdAt !== 'string') {
      return Promise.reject(ewpError(CODE_BAD_INPUT, 'packResult debe ser el resultado de build(): {bytes, manifest}'));
    }
    var iso = packResult.manifest.createdAt;
    return digestHex(packResult.bytes).then(function (sha) {
      return metaRepo.set(META_KEY_ISO, iso).then(function () {
        return metaRepo.set(META_KEY_SHA, sha);
      }).then(function () {
        return { iso: iso, sha: sha };
      });
    });
  }

  return {
    BAD_INPUT: CODE_BAD_INPUT,
    DUPLICATE_NAME: CODE_DUP_NAME,
    NO_ZIP: CODE_NO_ZIP,
    NO_CRYPTO: CODE_NO_CRYPTO,
    MANIFEST_NAME: MANIFEST_NAME,
    KIND: KIND,
    VERSION: VERSION,
    APP: APP,
    DEFAULT_EPOCH_ISO: DEFAULT_EPOCH_ISO,
    META_KEY_ISO: META_KEY_ISO,
    META_KEY_SHA: META_KEY_SHA,
    sha256Hex: sha256Hex,
    build: build,
    verify: verify,
    markMeta: markMeta
  };
});
