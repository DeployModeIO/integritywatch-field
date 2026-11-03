/* IntegrityWatch Field — export.zip
   Escritor ZIP (métodos store y deflate-raw) desde cero, sin dependencias,
   espejo inverso del lector de src/ingest/xlsx.js. API asíncrona sin DOM;
   errores tipados con código ZIP_*. en err.code.

   Decisiones documentadas:
   - NO hacemos streaming de escritura: todo se bufferiza en memoria. Los
     archivos de informe del Field son ≪10 MB, así que un par de copias
     intermedias es aceptable y mantiene el formato exacto (CRC y tamaños
     reales van en el header local, sin data descriptor).
   - Determinismo: si opts.date se omite, se usa un epoch FIJO
     (2026-01-01T00:00:00Z) y los campos DOS se derivan de getUTC*(), de modo
     que pack(files, opts) produce bytes idénticos en cualquier máquina y a
     cualquier hora — crítico para manifests SHA-256 reproducibles. Fechas
     anteriores a 1980 (límite del formato DOS) se fijan también al epoch.
   - El bit 11 (UTF-8) de los flags se activa SIEMPRE en headers locales y
     central directory, y los nombres se codifican con TextEncoder (string →
     UTF-8); las rutas usan '/' como separador.
   - Fallback por archivo: si CompressionStream('deflate-raw') falla o si el
     resultado comprimido NO reduce el tamaño (datos aleatorios crecen ~0.04 %
     con deflate), esa entrada se escribe con method 0 (store). */
(function (root, factory) {
  'use strict';
  var api = factory(root);
  root.IW = root.IW || {};
  root.IW.export = root.IW.export || {};
  root.IW.export.zip = api;
  if (typeof module === 'object' && module.exports) { module.exports = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  // Códigos de error tipados: siempre viajan en err.code.
  var CODE_BAD_ZIP = 'ZIP_BAD_ZIP';           // estructura inválida/truncada
  var CODE_BAD_INPUT = 'ZIP_BAD_INPUT';       // entrada inválida del llamador
  var CODE_UNSUPPORTED = 'ZIP_UNSUPPORTED_COMPRESSION'; // método no soportado

  var SIG_LOCAL = 0x04034b50;
  var SIG_CENTRAL = 0x02014b50;
  var SIG_EOCD = 0x06054b50;
  var VERSION_NEEDED = 20;   // 2.0: deflate + UTF-8 flag (sin Zip64)
  var VERSION_MADE_BY = 20;
  var FLAG_UTF8 = 0x0800;    // bit 11: nombres y comentarios en UTF-8
  var METHOD_STORE = 0;
  var METHOD_DEFLATE = 8;
  var LOCAL_HDR = 30;
  var CENTRAL_HDR = 46;
  var EOCD_HDR = 22;
  // Epoch fijo para determinismo byte a byte (ver cabecera del módulo).
  var DEFAULT_DATE_MS = Date.UTC(2026, 0, 1, 0, 0, 0);

  function zipError(code, message) {
    var e = new Error(message);
    e.code = code;
    return e;
  }

  // ---------------------------------------------------------------------
  // CRC-32 (polinomio IEEE 802.3, igual que zlib): tabla propia, sin deps.
  // ---------------------------------------------------------------------

  var CRC_TABLE = (function () {
    var t = new Uint32Array(256);
    for (var n = 0; n < 256; n++) {
      var c = n;
      for (var k = 0; k < 8; k++) {
        c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
      }
      t[n] = c >>> 0;
    }
    return t;
  })();

  // CRC-32 estándar del IEEE: crc32('123456789') === 0xCBF43926.
  function crc32(u8) {
    var c = 0xffffffff;
    for (var i = 0; i < u8.length; i++) {
      c = CRC_TABLE[(c ^ u8[i]) & 0xff] ^ (c >>> 8);
    }
    return (c ^ 0xffffffff) >>> 0;
  }

  // ---------------------------------------------------------------------
  // Conversión de fechas al formato DOS (UTC para determinismo)
  // ---------------------------------------------------------------------

  function dosFields(date) {
    var d = date instanceof Date && isFinite(date.getTime()) ? date : new Date(DEFAULT_DATE_MS);
    var y = d.getUTCFullYear();
    if (y < 1980 || y > 2107) { d = new Date(DEFAULT_DATE_MS); y = 1980; }
    var dosTime = (d.getUTCHours() << 11) | (d.getUTCMinutes() << 5) | (d.getUTCSeconds() >> 1);
    var dosDate = ((y - 1980) << 9) | ((d.getUTCMonth() + 1) << 5) | d.getUTCDate();
    return { time: dosTime & 0xffff, date: dosDate & 0xffff };
  }

  // ---------------------------------------------------------------------
  // Normalización de entrada
  // ---------------------------------------------------------------------

  function toU8(bytes, what) {
    if (bytes instanceof Uint8Array) { return bytes; }
    if (bytes instanceof ArrayBuffer) { return new Uint8Array(bytes); }
    if (typeof SharedArrayBuffer !== 'undefined' && bytes instanceof SharedArrayBuffer) { return new Uint8Array(bytes); }
    throw zipError(CODE_BAD_INPUT, what + ' debe ser Uint8Array o ArrayBuffer');
  }

  // string -> UTF-8 vía TextEncoder; Uint8Array/ArrayBuffer se aceptan tal cual.
  function dataToBytes(data, name) {
    if (typeof data === 'string') { return new TextEncoder().encode(data); }
    return toU8(data, 'data de "' + name + '"');
  }

  // ---------------------------------------------------------------------
  // deflate-raw / inflate-raw sobre las APIs nativas de streams
  // (CompressionStream/DecompressionStream: Chrome/Android modernos y Node >= 18)
  // ---------------------------------------------------------------------

  function pipeThrough(streamName, bytes, failCode, failMsg) {
    return new Promise(function (resolve, reject) {
      // La construccion dentro de try/catch cubre entornos sin la clase:
      // se propaga como ZIP_UNSUPPORTED_COMPRESSION (o ZIP_BAD_ZIP al inflar).
      var cs;
      try {
        cs = streamName === 'deflate-raw'
          ? new CompressionStream('deflate-raw')
          : new DecompressionStream('deflate-raw');
      } catch (e) {
        reject(zipError(CODE_UNSUPPORTED, failMsg + ': no disponible en este entorno'));
        return;
      }
      var chunks = [];
      var total = 0;
      var w = cs.writable.getWriter();
      var r = cs.readable.getReader();
      w.write(bytes).then(function () { return w.close(); }, function () {
        reject(zipError(failCode, failMsg));
      });
      function pull() {
        r.read().then(function (res) {
          if (res.done) {
            var out = new Uint8Array(total);
            var off = 0;
            for (var i = 0; i < chunks.length; i++) { out.set(chunks[i], off); off += chunks[i].length; }
            resolve(out);
          } else {
            chunks.push(res.value);
            total += res.value.length;
            pull();
          }
        }, function () {
          reject(zipError(failCode, failMsg));
        });
      }
      pull();
    });
  }

  function deflateRaw(bytes) {
    return pipeThrough('deflate-raw', bytes, CODE_UNSUPPORTED, 'fallo de CompressionStream deflate-raw');
  }

  function inflateRaw(bytes) {
    return pipeThrough('inflate-raw', bytes, CODE_BAD_ZIP, 'datos deflate corruptos');
  }

  // ---------------------------------------------------------------------
  // pack(files, opts) -> Promise<Uint8Array>
  //   files: [{name, data}] con rutas '/' en UTF-8.
  //   opts:  {method:'deflate'|'store' (default 'deflate'), date: Date
  //           opcional (default epoch fijo 2026-01-01T00:00:00Z),
  //           sorted: bool default true}.
  // ---------------------------------------------------------------------

  function prepareEntries(files, opts) {
    if (!Array.isArray(files)) { throw zipError(CODE_BAD_INPUT, 'files debe ser un array de {name, data}'); }
    var method = (opts && opts.method) || 'deflate';
    if (method !== 'deflate' && method !== 'store') {
      throw zipError(CODE_BAD_INPUT, 'opts.method debe ser "deflate" o "store"');
    }
    var entries = files.map(function (f, i) {
      if (!f || typeof f.name !== 'string' || f.name === '') {
        throw zipError(CODE_BAD_INPUT, 'files[' + i + '].name debe ser cadena no vacía');
      }
      return { name: f.name, nameBytes: new TextEncoder().encode(f.name), data: dataToBytes(f.data, f.name) };
    });
    // sorted por defecto: orden lexicográfico de los nombres UTF-8 → zip
    // reproducible independiente del orden del array de entrada.
    var sorted = !(opts && opts.sorted === false);
    if (sorted) {
      entries.sort(function (a, b) { return a.name < b.name ? -1 : a.name > b.name ? 1 : 0; });
    }
    var dos = dosFields(opts && opts.date);
    return { entries: entries, wantDeflate: method === 'deflate', time: dos.time, date: dos.date };
  }

  // Elige el método definitivo de una entrada: deflate si reduce; store si
  // CompressionStream falla o si comprimir no ahorra bytes (datos aleatorios).
  function encodeEntry(entry, wantDeflate) {
    var raw = entry.data;
    var crc = crc32(raw);
    if (!wantDeflate || raw.length === 0) {
      return Promise.resolve({ entry: entry, crc: crc, method: METHOD_STORE, comp: raw });
    }
    return deflateRaw(raw).then(
      function (comp) {
        // deflate nunca debe agrandar el archivo: fallback store por entrada.
        if (comp.length >= raw.length) {
          return { entry: entry, crc: crc, method: METHOD_STORE, comp: raw };
        }
        return { entry: entry, crc: crc, method: METHOD_DEFLATE, comp: comp };
      },
      function () {
        return { entry: entry, crc: crc, method: METHOD_STORE, comp: raw };
      }
    );
  }

  function pack(files, opts) {
    var prep;
    try {
      prep = prepareEntries(files, opts || {});
    } catch (e) {
      return Promise.reject(e);
    }
    return prep.entries.reduce(function (chain, entry) {
      return chain.then(function (acc) {
        return encodeEntry(entry, prep.wantDeflate).then(function (done) { acc.push(done); return acc; });
      });
    }, Promise.resolve([])).then(function (encoded) {
      // Presupuesto exacto y escritura con offsets calculados, no estimados.
      var localSize = 0;
      var centralSize = 0;
      var i;
      for (i = 0; i < encoded.length; i++) {
        localSize += LOCAL_HDR + encoded[i].entry.nameBytes.length + encoded[i].comp.length;
        centralSize += CENTRAL_HDR + encoded[i].entry.nameBytes.length;
      }
      var out = new Uint8Array(localSize + centralSize + EOCD_HDR);
      var dv = new DataView(out.buffer);
      var pos = 0;
      var offsets = [];
      for (i = 0; i < encoded.length; i++) {
        var e = encoded[i];
        var nameLen = e.entry.nameBytes.length;
        offsets.push(pos);
        dv.setUint32(pos, SIG_LOCAL, true); pos += 4;
        dv.setUint16(pos, VERSION_NEEDED, true); pos += 2;
        dv.setUint16(pos, FLAG_UTF8, true); pos += 2;          // UTF-8 SIEMPRE
        dv.setUint16(pos, e.method, true); pos += 2;
        dv.setUint16(pos, prep.time, true); pos += 2;
        dv.setUint16(pos, prep.date, true); pos += 2;
        dv.setUint32(pos, e.crc, true); pos += 4;
        dv.setUint32(pos, e.comp.length, true); pos += 4;      // tamaño real
        dv.setUint32(pos, e.entry.data.length, true); pos += 4; // tamaño real
        dv.setUint16(pos, nameLen, true); pos += 2;
        dv.setUint16(pos, 0, true); pos += 2;                  // extra: ninguno
        out.set(e.entry.nameBytes, pos); pos += nameLen;
        out.set(e.comp, pos); pos += e.comp.length;
      }
      var cdStart = pos;
      for (i = 0; i < encoded.length; i++) {
        var c = encoded[i];
        var cn = c.entry.nameBytes.length;
        dv.setUint32(pos, SIG_CENTRAL, true); pos += 4;
        dv.setUint16(pos, VERSION_MADE_BY, true); pos += 2;
        dv.setUint16(pos, VERSION_NEEDED, true); pos += 2;
        dv.setUint16(pos, FLAG_UTF8, true); pos += 2;          // UTF-8 SIEMPRE
        dv.setUint16(pos, c.method, true); pos += 2;
        dv.setUint16(pos, prep.time, true); pos += 2;
        dv.setUint16(pos, prep.date, true); pos += 2;
        dv.setUint32(pos, c.crc, true); pos += 4;
        dv.setUint32(pos, c.comp.length, true); pos += 4;
        dv.setUint32(pos, c.entry.data.length, true); pos += 4;
        dv.setUint16(pos, cn, true); pos += 2;
        dv.setUint16(pos, 0, true); pos += 2;                  // extra
        dv.setUint16(pos, 0, true); pos += 2;                  // comentario
        dv.setUint16(pos, 0, true); pos += 2;                  // disco 0
        dv.setUint16(pos, 0, true); pos += 2;                  // atributos internos
        dv.setUint32(pos, 0, true); pos += 4;                  // atributos externos
        dv.setUint32(pos, offsets[i], true); pos += 4;         // offset local exacto
        out.set(c.entry.nameBytes, pos); pos += cn;
      }
      // End Of Central Directory: 22 bytes, sin comentario.
      var cdSize = pos - cdStart;
      dv.setUint32(pos, SIG_EOCD, true); pos += 4;
      dv.setUint16(pos, 0, true); pos += 2;                    // disco actual
      dv.setUint16(pos, 0, true); pos += 2;                    // disco del CD
      dv.setUint16(pos, encoded.length, true); pos += 2;       // entradas en este disco
      dv.setUint16(pos, encoded.length, true); pos += 2;       // entradas totales
      dv.setUint32(pos, cdSize, true); pos += 4;               // tamano del CD
      dv.setUint32(pos, cdStart, true); pos += 4;              // offset del CD
      dv.setUint16(pos, 0, true); pos += 2;                    // comentario: ninguno
      return out;
    });
  }

  // ---------------------------------------------------------------------
  // unpack(bytes) -> Promise<[{name, data:Uint8Array, method}]>
  //   Lee el central directory (fuente de verdad de tamaños y offsets) e
  //   hincha cada entrada: stored directo, deflate-raw vía
  //   DecompressionStream (misma robustez en navegador y Node 24).
  //   Sirve para round-trip y para verificación de evidencia (Pista 3.6).
  // ---------------------------------------------------------------------

  function readCentral(u8, dv) {
    var n = u8.length;
    if (n < EOCD_HDR) { throw zipError(CODE_BAD_ZIP, 'archivo demasiado corto para ser un zip'); }
    var eocd = -1;
    var lo = Math.max(0, n - (EOCD_HDR + 0xffff)); // 22 + comentario máximo
    for (var i = n - EOCD_HDR; i >= lo; i--) {
      if (dv.getUint32(i, true) === SIG_EOCD) { eocd = i; break; }
    }
    if (eocd < 0) { throw zipError(CODE_BAD_ZIP, 'sin EOCD: no es un zip valido o esta truncado'); }
    var total = dv.getUint16(eocd + 10, true);
    var cdSize = dv.getUint32(eocd + 12, true);
    var cdOff = dv.getUint32(eocd + 16, true);
    var eocdComment = dv.getUint16(eocd + 20, true);
    // Coherencia estructural: entre el fin del central directory y el EOCD
    // solo puede haber un comentario de archivo. Rechaza falsos positivos.
    if (cdOff + cdSize > eocd || eocd - cdOff - cdSize !== eocdComment) {
      throw zipError(CODE_BAD_ZIP, 'EOCD incoherente con el central directory');
    }
    if (cdOff > n || (total > 0 && cdOff + CENTRAL_HDR > n)) { throw zipError(CODE_BAD_ZIP, 'offset de central directory fuera del archivo'); }
    var decoder = new TextDecoder('utf-8');
    var entries = [];
    var p = cdOff;
    for (var k = 0; k < total; k++) {
      if (p + CENTRAL_HDR > n || dv.getUint32(p, true) !== SIG_CENTRAL) {
        throw zipError(CODE_BAD_ZIP, 'central directory inconsistente en la entrada ' + k);
      }
      var method = dv.getUint16(p + 10, true);
      var csize = dv.getUint32(p + 20, true);
      var usize = dv.getUint32(p + 24, true);
      var nameLen = dv.getUint16(p + 28, true);
      var extraLen = dv.getUint16(p + 30, true);
      var commentLen = dv.getUint16(p + 32, true);
      var localOff = dv.getUint32(p + 42, true);
      var name = decoder.decode(u8.subarray(p + 46, p + 46 + nameLen));
      entries.push({ name: name, method: method, csize: csize, usize: usize, localOff: localOff });
      p += CENTRAL_HDR + nameLen + extraLen + commentLen;
    }
    return entries;
  }

  function unpack(bytes) {
    var u8;
    var entries;
    try {
      u8 = toU8(bytes, 'bytes del zip');
      entries = readCentral(u8, new DataView(u8.buffer, u8.byteOffset, u8.byteLength));
    } catch (e) {
      return Promise.reject(e);
    }
    var results = [];
    var chain = Promise.resolve();
    entries.forEach(function (en) {
      chain = chain.then(function () {
        if (en.name.charAt(en.name.length - 1) === '/') { return; } // entrada de directorio
        if (en.method !== METHOD_STORE && en.method !== METHOD_DEFLATE) {
          throw zipError(CODE_UNSUPPORTED, 'metodo de compresion ' + en.method + ' no soportado en "' + en.name + '" (solo stored=0 y deflate=8)');
        }
        var dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
        var l = en.localOff;
        if (l + LOCAL_HDR > u8.length || dv.getUint32(l, true) !== SIG_LOCAL) {
          throw zipError(CODE_BAD_ZIP, 'header local invalido en "' + en.name + '"');
        }
        var nameLen = dv.getUint16(l + 26, true);
        var extraLen = dv.getUint16(l + 28, true);
        var start = l + LOCAL_HDR + nameLen + extraLen;
        var end = start + en.csize;
        if (end > u8.length) { throw zipError(CODE_BAD_ZIP, 'datos de "' + en.name + '" fuera del archivo'); }
        var raw = u8.subarray(start, end);
        var work = en.method === METHOD_STORE ? Promise.resolve(raw) : inflateRaw(raw);
        return work.then(function (data) {
          results.push({ name: en.name, data: data, method: en.method });
        });
      });
    });
    return chain.then(function () { return results; });
  }

  return {
    BAD_ZIP: CODE_BAD_ZIP,
    BAD_INPUT: CODE_BAD_INPUT,
    UNSUPPORTED_COMPRESSION: CODE_UNSUPPORTED,
    crc32: crc32,
    pack: pack,
    unpack: unpack
  };
});
