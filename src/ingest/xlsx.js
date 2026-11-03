/* IntegrityWatch Field — xlsx
   Lector XLSX desde cero, sin dependencias: unzip mínimo (central directory),
   hojas por nombre/índice, sharedStrings (simple y rich text), detección de
   fechas por numFmt de estilo y parseo de hoja en bloques cooperativos.
   API asíncrona sin DOM; errores tipados con código (.code). */
(function (root, factory) {
  'use strict';
  var api = factory(root);
  root.IW = root.IW || {};
  root.IW.ingest = root.IW.ingest || {};
  root.IW.ingest.xlsx = api;
  if (typeof module === 'object' && module.exports) { module.exports = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  // Codigos de error tipados: siempre viajan en err.code.
  var CODE_BAD_ZIP = 'XLSX_BAD_ZIP';
  var CODE_NO_SHEET = 'XLSX_NO_SHEET';
  var CODE_CANCELED = 'XLSX_CANCELED';
  var CODE_UNSUPPORTED = 'XLSX_UNSUPPORTED_COMPRESSION';

  var MAX_WARNINGS = 200;          // tope de warnings; luego se marca truncamiento
  var MAX_SHEET_BYTES = 25 * 1024 * 1024; // 25 MB de XML de hoja sin cortar: avisar y seguir
  var MAX_COLUMNS = 16384;         // limite real de columnas por hoja (A..XFD)
  var EPOCH_1900 = Date.UTC(1899, 11, 30); // sistema 1900 de Excel (serie 0 = 1899-12-30)
  var EPOCH_1904 = Date.UTC(1904, 0, 1);   // sistema 1904 (workbookPr date1904="1")
  var DAY_MS = 86400000;

  // numFmtId predefinidos que representan FECHA (spec: 14-22 y 45-47).
  var BUILTIN_DATE = {};
  [14, 15, 16, 17, 18, 19, 20, 21, 22, 45, 46, 47].forEach(function (id) { BUILTIN_DATE[id] = true; });
  // Subconjunto que ademas muestra HORA (h:mm, hh:mm:ss, mm:ss.0, [h]:mm:ss...).
  var BUILTIN_TIME = {};
  [18, 19, 20, 21, 22, 45, 46, 47].forEach(function (id) { BUILTIN_TIME[id] = true; });

  function iwError(code, message) {
    var e = new Error(message);
    e.code = code;
    return e;
  }

  function pad2(n) { return (n < 10 ? '0' : '') + n; }

  // ---------------------------------------------------------------------
  // Utilidades XML (mismo enfoque que witsmlLite: sin DOMParser)
  // ---------------------------------------------------------------------

  // Decodifica las cinco entidades predefinidas de XML y las referencias
  // numericas &#NN; / &#xNN;. &amp; se decodifica al final para que
  // "&amp;lt;" quede como el texto literal "&lt;".
  function decodeEntities(s) {
    return String(s)
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&#(\d+);/g, function (m, d) { return String.fromCharCode(parseInt(d, 10)); })
      .replace(/&#x([0-9a-fA-F]+);/g, function (m, h) { return String.fromCharCode(parseInt(h, 16)); })
      .replace(/&amp;/g, '&');
  }

  // Lee atributos (comilla simple o doble, cualquier orden) del cuerpo de un tag de apertura.
  function parseAttrs(body) {
    var out = {};
    var re = /([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
    var m;
    while ((m = re.exec(body)) !== null) {
      out[m[1]] = decodeEntities(m[2] !== undefined ? m[2] : m[3]);
    }
    return out;
  }

  // Encuentra el '>' que cierra el tag de apertura, respetando comillas
  // (un '>' dentro de un valor de atributo no cierra el tag).
  function findTagEnd(xml, from) {
    var q = null;
    for (var i = from; i < xml.length; i++) {
      var ch = xml.charAt(i);
      if (q !== null) { if (ch === q) { q = null; } }
      else if (ch === '"' || ch === "'") { q = ch; }
      else if (ch === '>') { return i; }
    }
    return -1;
  }

  function isNameBoundary(ch) {
    return ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r' || ch === '>' || ch === '/';
  }

  // Recorre las ocurrencias de <name ...>...</name> (o auto-cerrados) entre
  // start y end. cb(atributosDelTagApertura, cuerpoInterior, esAutoCerrado).
  // La frontera de nombre evita que <sheetPr> coincida al buscar <sheet>.
  function iterTags(xml, name, start, end, cb) {
    var open = '<' + name;
    var close = '</' + name;
    var pos = start || 0;
    end = end === undefined ? xml.length : end;
    while (pos < end) {
      var i = xml.indexOf(open, pos);
      if (i < 0 || i >= end) { break; }
      if (!isNameBoundary(xml.charAt(i + open.length))) { pos = i + 1; continue; }
      var gt = findTagEnd(xml, i + open.length);
      if (gt < 0) { break; }
      var selfClose = xml.charAt(gt - 1) === '/';
      var attrs = xml.slice(i + open.length, selfClose ? gt - 1 : gt);
      if (selfClose) {
        cb(attrs, '', true);
        pos = gt + 1;
        continue;
      }
      var cIdx = xml.indexOf(close, gt + 1);
      if (cIdx < 0) { cb(attrs, xml.slice(gt + 1, end), false); break; }
      cb(attrs, xml.slice(gt + 1, cIdx), false);
      pos = cIdx + close.length + 1;
    }
  }

  // Texto interior de la PRIMERA ocurrencia de <name>, o null si no existe.
  // Auto-cerrado (<v/>) devuelve cadena vacía.
  function tagInner(xml, name) {
    var found = null;
    iterTags(xml, name, 0, xml.length, function (attrs, body, self) {
      if (found === null) { found = self ? '' : body; }
    });
    return found;
  }

  // Concatena el texto de todos los <t> dentro de un fragmento (soporta
  // rich text <r><t>...</t></r> partido y <t xml:space="preserve">).
  // Se excluye <rPh> (fonetica japonesa) para no duplicar texto.
  function collectTexts(seg) {
    var clean = seg.replace(/<rPh\b[\s\S]*?<\/rPh>/g, '').replace(/<rPh\b[^>]*\/>/g, '');
    var out = '';
    var re = /<t((?:[^>"']|"[^"]*"|'[^']*')*)>([\s\S]*?)<\/t>/g;
    var m;
    while ((m = re.exec(clean)) !== null) { out += decodeEntities(m[2]); }
    return out;
  }

  // ---------------------------------------------------------------------
  // Unzip mínimo: central directory primero (es robusto ante data
  // descriptors: si el flag bit 3 está activo, los tamaños reales viven
  // SOLO en el central directory, nunca en el header local).
  // ---------------------------------------------------------------------

  function toU8(bytes) {
    if (bytes instanceof Uint8Array) { return bytes; }
    if (bytes instanceof ArrayBuffer) { return new Uint8Array(bytes); }
    if (typeof SharedArrayBuffer !== 'undefined' && bytes instanceof SharedArrayBuffer) { return new Uint8Array(bytes); }
    throw iwError(CODE_BAD_ZIP, 'entrada debe ser ArrayBuffer o Uint8Array');
  }

  function utf8Decode(u8) {
    return new TextDecoder('utf-8').decode(u8);
  }

  // Infla deflate-raw con la API de streams nativa (Node >= 18, Chrome/Android modernos).
  function inflateRaw(bytes) {
    return new Promise(function (resolve, reject) {
      if (typeof DecompressionStream !== 'function') {
        reject(iwError(CODE_UNSUPPORTED, 'este entorno no expone DecompressionStream (deflate-raw)'));
        return;
      }
      var ds;
      var chunks = [];
      var total = 0;
      try {
        ds = new DecompressionStream('deflate-raw');
      } catch (e) {
        reject(iwError(CODE_UNSUPPORTED, 'DecompressionStream deflate-raw no disponible'));
        return;
      }
      var w = ds.writable.getWriter();
      var r = ds.readable.getReader();
      w.write(bytes).then(function () { return w.close(); }, function () {
        reject(iwError(CODE_BAD_ZIP, 'datos deflate corruptos'));
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
          reject(iwError(CODE_BAD_ZIP, 'datos deflate corruptos (stream finalizo con error)'));
        });
      }
      pull();
    });
  }

  // Lee el End Of Central Directory y recorre TODAS las entradas del central
  // directory, devolviendo un mapa nombre -> entrada (sin prototipo, a prueba
  // de nombres maliciosos como "__proto__").
  function readCentralDirectory(u8) {
    try {
      var n = u8.length;
      if (n < 22) { throw new Error('muy corto'); }
      var dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
      var eocd = -1;
      var lo = Math.max(0, n - 65558); // 22 + maximo comentario de zip
      for (var i = n - 22; i >= lo; i--) {
        if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
      }
      if (eocd < 0) { throw new Error('sin EOCD'); }
      var total = dv.getUint16(eocd + 10, true);
      var off = dv.getUint32(eocd + 16, true);
      if (off + 46 > n) { throw new Error('offset de central directory fuera del archivo'); }
      var map = Object.create(null);
      var p = off;
      for (var k = 0; k < total; k++) {
        if (p + 46 > n || dv.getUint32(p, true) !== 0x02014b50) { throw new Error('central directory inconsistente en la entrada ' + k); }
        var method = dv.getUint16(p + 10, true);
        var csize = dv.getUint32(p + 20, true);
        var usize = dv.getUint32(p + 24, true);
        var nameLen = dv.getUint16(p + 28, true);
        var extraLen = dv.getUint16(p + 30, true);
        var commentLen = dv.getUint16(p + 32, true);
        var localOff = dv.getUint32(p + 42, true);
        var name = utf8Decode(u8.subarray(p + 46, p + 46 + nameLen));
        if (name.charAt(name.length - 1) !== '/') { // ignora entradas de directorio
          map[name] = { name: name, method: method, csize: csize, usize: usize, localOff: localOff };
        }
        p += 46 + nameLen + extraLen + commentLen;
      }
      return map;
    } catch (e) {
      if (e && e.code) { throw e; }
      throw iwError(CODE_BAD_ZIP, 'el archivo no es un zip valido o esta truncado: ' + e.message);
    }
  }

  // Extrae los bytes descomprimidos de una entrada usando SIEMPRE los
  // tamanos del central directory (resiste el flag bit 3 / data descriptor).
  function entryBytes(u8, entry) {
    if (entry.method !== 0 && entry.method !== 8) {
      return Promise.reject(iwError(CODE_UNSUPPORTED,
        'metodo de compresion ' + entry.method + ' no soportado en "' + entry.name + '" (solo stored=0 y deflate=8)'));
    }
    var dv;
    try {
      dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
      var l = entry.localOff;
      if (l + 30 > u8.length || dv.getUint32(l, true) !== 0x04034b50) { throw new Error('header local invalido en "' + entry.name + '"'); }
      var nameLen = dv.getUint16(l + 26, true);
      var extraLen = dv.getUint16(l + 28, true);
      var start = l + 30 + nameLen + extraLen;
      var end = start + entry.csize;
      if (end > u8.length) { throw new Error('datos de "' + entry.name + '" fuera del archivo'); }
      var raw = u8.subarray(start, end);
      if (entry.method === 0) { return Promise.resolve(raw); }
    } catch (e) {
      if (e && e.code) { return Promise.reject(e); }
      return Promise.reject(iwError(CODE_BAD_ZIP, e.message));
    }
    return inflateRaw(raw);
  }

  // ---------------------------------------------------------------------
  // Paquete del libro: workbook.xml + rels (rid -> sheetN.xml) + estilos
  // ---------------------------------------------------------------------

  // Rels pueden usar target absoluto ('/xl/worksheets/sheet1.xml', como
  // escribe openpyxl) o relativo a la carpeta del workbook ('worksheets/...').
  function resolveTarget(target) {
    var path = String(target);
    if (path.charAt(0) === '/') { return path.slice(1); }
    var parts = path.split('/');
    var stack = ['xl'];
    for (var i = 0; i < parts.length; i++) {
      var s = parts[i];
      if (s === '' || s === '.') { continue; }
      if (s === '..') { stack.pop(); } else { stack.push(s); }
    }
    return stack.join('/');
  }

  function parseWorkbookXml(xml) {
    var sheets = [];
    iterTags(xml, 'sheet', 0, xml.length, function (attrs) {
      var a = parseAttrs(attrs);
      if (a.name === undefined) { return; }
      sheets.push({ name: a.name, rid: a['r:id'] !== undefined ? a['r:id'] : a.id });
    });
    var date1904 = false;
    iterTags(xml, 'workbookPr', 0, xml.length, function (attrs) {
      var a = parseAttrs(attrs);
      var v = a.date1904;
      if (v === '1' || v === 'true') { date1904 = true; }
    });
    return { sheets: sheets, date1904: date1904 };
  }

  function parseRelsXml(xml) {
    var rels = Object.create(null);
    iterTags(xml, 'Relationship', 0, xml.length, function (attrs) {
      var a = parseAttrs(attrs);
      if (a.Id !== undefined && a.Target !== undefined) { rels[a.Id] = a.Target; }
    });
    return rels;
  }

  // Clasifica un numFmtId como fecha (y si muestra hora), con formatos
  // custom (numFmt) priorizados sobre los predefinidos.
  function classifyNumFmt(idNum, customNumFmts) {
    var code = Object.prototype.hasOwnProperty.call(customNumFmts, idNum) ? customNumFmts[idNum] : undefined;
    if (code !== undefined) {
      // Limpa literales entre comillas, escapes \x y secciones [xxx]
      // (condiciones, colores, duraciones) y busca tokens de fecha/hora.
      var cleaned = String(code)
        .replace(/"[^"]*"/g, '')
        .replace(/\\./g, '')
        .replace(/\[[^\]]*\]/g, '');
      return {
        date: /[ymd]/i.test(cleaned),
        time: /[hs]/i.test(cleaned) || cleaned.indexOf(':') >= 0
      };
    }
    if (BUILTIN_DATE[idNum]) { return { date: true, time: !!BUILTIN_TIME[idNum] }; }
    return { date: false, time: false };
  }

  // styles.xml -> array indexable por atributo s="" de la celda:
  // [{date, time}, ...] segun cellXfs -> numFmtId.
  function parseStylesXml(xml) {
    var custom = Object.create(null);
    iterTags(xml, 'numFmt', 0, xml.length, function (attrs) {
      var a = parseAttrs(attrs);
      if (a.numFmtId !== undefined && a.formatCode !== undefined) {
        var id = Number(a.numFmtId);
        if (isFinite(id)) { custom[id] = a.formatCode; }
      }
    });
    var out = [];
    var d0 = xml.indexOf('<cellXfs');
    if (d0 < 0) { return out; }
    var gt = findTagEnd(xml, d0 + 8);
    if (gt < 0) { return out; }
    var de = xml.indexOf('</cellXfs>', gt);
    var seg = xml.slice(gt + 1, de < 0 ? xml.length : de);
    iterTags(seg, 'xf', 0, seg.length, function (attrs) {
      var a = parseAttrs(attrs);
      var id = a.numFmtId === undefined ? 0 : Number(a.numFmtId);
      if (!isFinite(id)) { id = 0; }
      out.push(classifyNumFmt(id, custom));
    });
    return out;
  }

  // ---------------------------------------------------------------------
  // Conversion de series numericas de Excel a ISO
  // ---------------------------------------------------------------------

  function serialToIso(serial, hasTime, epochMs) {
    var day = Math.floor(serial);
    var frac = serial - day;
    if (hasTime && frac > 0) {
      var secs = Math.round(frac * 86400);
      if (secs >= 86400) { day += 1; secs -= 86400; }
      var d = new Date(epochMs + day * DAY_MS + secs * 1000);
      return isoDay(d) + 'T' + pad2(d.getUTCHours()) + ':' + pad2(d.getUTCMinutes()) + ':' + pad2(d.getUTCSeconds());
    }
    // Sin hora (o sin fraccion): se descartan decimales de hora.
    return isoDay(new Date(epochMs + day * DAY_MS));
  }

  function isoDay(d) {
    var y = d.getUTCFullYear();
    return (y < 1000 ? '0' : '') + y + '-' + pad2(d.getUTCMonth() + 1) + '-' + pad2(d.getUTCDate());
  }

  // ---------------------------------------------------------------------
  // Parseo de hoja (sin DOMParser): filas y celdas por escaner de estado
  // ---------------------------------------------------------------------

  // 'BC7' -> 54; 'A1' -> 0. Sin prefijo o mal formado -> -1.
  function colFromRef(ref) {
    var m = /^([A-Za-z]{1,3})\d+$/.exec(String(ref));
    if (!m) { return -1; }
    var letters = m[1].toUpperCase();
    var idx = 0;
    for (var i = 0; i < letters.length; i++) {
      idx = idx * 26 + (letters.charCodeAt(i) - 64);
    }
    return idx - 1;
  }

  function makeCtx(opts, warnings) {
    var warned = { truncated: false };
    function warn(msg) {
      if (warnings.length < MAX_WARNINGS) { warnings.push(msg); }
      else if (!warned.truncated) { warned.truncated = true; warnings.push('demasiadas advertencias; las siguientes fueron omitidas'); }
    }
    var bs = Number(opts.blockSize);
    if (!isFinite(bs) || !(bs > 0)) { bs = 2000; }
    var mr = opts.maxRows === undefined ? Infinity : Number(opts.maxRows);
    if (!isFinite(mr) && mr !== Infinity) { mr = Infinity; }
    if (!(mr > 0)) { mr = Infinity; }
    return {
      blockSize: bs,
      maxRows: mr,
      onProgress: typeof opts.onProgress === 'function' ? opts.onProgress : null,
      isCanceled: typeof opts.isCanceled === 'function' ? opts.isCanceled : null,
      warn: warn,
      shared: null,
      styles: null,
      epochMs: EPOCH_1900,
      skipped: 0,
      dateCols: Object.create(null),
      rows: []
    };
  }

  // Valor de una celda -> string | number | null. ctx lleva shared, styles,
  // fecha epoch, contadores y la funcion warn().
  function cellValue(attrs, body, colIdx, ctx) {
    var t = attrs.t !== undefined ? attrs.t : 'n';
    if (t === 'inlineStr') {
      var seg = tagInner(body, 'is');
      return collectTexts(seg === null ? body : seg);
    }
    var raw = tagInner(body, 'v');
    if (raw === null) { raw = ''; }
    if (t === 's') {
      var k = Number(raw.trim());
      if (!isFinite(k) || k < 0 || !ctx.shared || k >= ctx.shared.length) {
        ctx.warn('indice de sharedStrings fuera de rango en ' + (attrs.r || ('fila,col ' + colIdx)));
        return null;
      }
      return ctx.shared[k];
    }
    if (t === 'str') { return raw.trim() === '' ? null : decodeEntities(raw); }
    if (t === 'b') { return raw.trim() === '' ? null : (raw.trim() === '1' ? 'TRUE' : 'FALSE'); }
    if (t === 'e') {
      ctx.skipped += 1;
      ctx.warn('celda ' + (attrs.r || ('col ' + colIdx)) + ' con error de Excel "' + decodeEntities(raw.trim()) + '" se omite (null)');
      return null;
    }
    if (t === 'd') { return raw.trim() === '' ? null : decodeEntities(raw); }
    // 'n' explicito o sin atributo t: numerico, con posible formato de fecha.
    var trimmed = raw.trim();
    if (trimmed === '') { return null; }
    var num = Number(trimmed);
    if (!isFinite(num)) {
      ctx.warn('valor numerico ilegible "' + decodeEntities(trimmed) + '" en ' + (attrs.r || ('col ' + colIdx)));
      return decodeEntities(trimmed);
    }
    var sIdx = attrs.s === undefined ? -1 : Number(attrs.s);
    var st = sIdx >= 0 && ctx.styles && ctx.styles[sIdx] ? ctx.styles[sIdx] : null;
    if (st && st.date) {
      ctx.dateCols[colIdx] = true;
      return serialToIso(num, !!st.time, ctx.epochMs);
    }
    return num;
  }

  // Construye la matriz de una fila: arrays densos, vacios como null,
  // columna secuencial cuando falta el atributo r.
  function buildRow(body, ctx) {
    var cells = [];
    var lastCol = -1;
    iterTags(body, 'c', 0, body.length, function (attrsStr, cellBody) {
      var a = parseAttrs(attrsStr);
      var idx = -1;
      if (a.r !== undefined) { idx = colFromRef(a.r); }
      if (idx < 0) { idx = lastCol + 1; }
      lastCol = idx;
      if (idx >= MAX_COLUMNS) {
        ctx.warn('celda ' + (a.r || idx) + ' fuera del rango de columnas; se ignora');
        return;
      }
      var val = cellValue(a, cellBody, idx, ctx);
      while (cells.length < idx) { cells.push(null); }
      cells[idx] = val;
    });
    return cells;
  }

  // Estimacion de filas totales desde <dimension ref="A1:E7"/> (o null).
  function estimateRows(xml) {
    var head = xml.slice(0, 4096);
    var m = /<dimension\b[^>]*ref="([^"]*)"/.exec(head);
    if (!m) { return null; }
    var parts = m[1].split(':');
    var last = /\d+$/.exec(parts[parts.length - 1]);
    if (!last) { return null; }
    var n = Number(last[0]);
    return isFinite(n) && n > 0 ? n : null;
  }

  // Recorre <sheetData> fila a fila; cada blockSize filas cede el loop de
  // eventos (no congela la UI), reporta progreso y consulta cancelacion.
  function processSheet(xml, ctx) {
    var totalEstimate = estimateRows(xml);
    var rows = ctx.rows;

    function emitFinal() {
      if (ctx.onProgress) { ctx.onProgress({ rows: rows.length, totalEstimate: totalEstimate }); }
    }

    // Limite de bloque: cancela (si procede), cede el loop y reporta progreso.
    function runBoundary() {
      return new Promise(function (resolve, reject) {
        setTimeout(function () {
          try {
            if (ctx.isCanceled && ctx.isCanceled()) {
              reject(iwError(CODE_CANCELED, 'lectura cancelada tras ' + rows.length + ' filas'));
              return;
            }
            if (ctx.onProgress) { ctx.onProgress({ rows: rows.length, totalEstimate: totalEstimate }); }
            resolve();
          } catch (e) { reject(e); }
        }, 0);
      });
    }

    var sd0 = xml.indexOf('<sheetData');
    if (sd0 < 0) { emitFinal(); return Promise.resolve(); }
    var sdGt = findTagEnd(xml, sd0 + 10);
    if (sdGt < 0) { emitFinal(); return Promise.resolve(); }
    if (xml.charAt(sdGt - 1) === '/') { emitFinal(); return Promise.resolve(); } // <sheetData/> vacio
    var sdEnd = xml.indexOf('</sheetData>', sdGt);
    var dataEnd = sdEnd < 0 ? xml.length : sdEnd;

    var pos = sdGt + 1;
    var done = false;

    // Escaneo sincrono de hasta blockSize filas.
    function loopStep() {
      var blockCount = 0;
      while (pos < dataEnd && rows.length < ctx.maxRows && blockCount < ctx.blockSize) {
        var i = xml.indexOf('<row', pos);
        if (i < 0 || i >= dataEnd) { done = true; break; }
        if (!isNameBoundary(xml.charAt(i + 4))) { pos = i + 1; continue; }
        var rGt = findTagEnd(xml, i + 4);
        if (rGt < 0) { done = true; break; }
        if (xml.charAt(rGt - 1) === '/') { pos = rGt + 1; continue; } // <row .../> vacia
        var cIdx = xml.indexOf('</row', rGt + 1);
        if (cIdx < 0) { done = true; break; }
        var k = xml.indexOf('>', cIdx); // fin del tag de cierre '</row>'
        var cells = buildRow(xml.slice(rGt + 1, cIdx), ctx);
        pos = k >= 0 ? k + 1 : dataEnd;
        if (cells.length === 0) { continue; } // fila sin celdas: no se emite
        rows.push(cells);
        blockCount++;
      }
      if (rows.length >= ctx.maxRows && pos < dataEnd) {
        ctx.warn('se alcanzo maxRows=' + ctx.maxRows + '; el resto de la hoja no se leyó');
        done = true;
      }
      if (pos >= dataEnd) { done = true; }
    }

    function step() {
      loopStep();
      if (done) { emitFinal(); return Promise.resolve(); }
      return runBoundary().then(step);
    }
    return step();
  }

  // ---------------------------------------------------------------------
  // Carga del paquete y API publica
  // ---------------------------------------------------------------------

  function getPartBytes(map, u8, name) {
    var e = map[name];
    if (!e) { return Promise.resolve(null); }
    return entryBytes(u8, e);
  }

  async function loadBook(u8) {
    var map = readCentralDirectory(u8);
    var wbBytes = await getPartBytes(map, u8, 'xl/workbook.xml');
    if (wbBytes === null) { throw iwError(CODE_NO_SHEET, 'no existe xl/workbook.xml: no es un libro XLSX'); }
    var book = parseWorkbookXml(utf8Decode(wbBytes));
    if (book.sheets.length === 0) { throw iwError(CODE_NO_SHEET, 'el libro no declara ninguna hoja'); }
    var relBytes = await getPartBytes(map, u8, 'xl/_rels/workbook.xml.rels');
    var rels = relBytes === null ? Object.create(null) : parseRelsXml(utf8Decode(relBytes));
    return {
      map: map,
      sheets: book.sheets,
      rels: rels,
      epochMs: book.date1904 ? EPOCH_1904 : EPOCH_1900
    };
  }

  function pickSheet(book, sel) {
    var sheets = book.sheets;
    if (sel === undefined || sel === null) { return sheets[0]; }
    if (typeof sel === 'number') {
      if (!isFinite(sel) || sel < 0 || sel >= sheets.length || Math.floor(sel) !== sel) { return null; }
      return sheets[sel];
    }
    for (var i = 0; i < sheets.length; i++) {
      if (sheets[i].name === String(sel)) { return sheets[i]; }
    }
    return null;
  }

  function sheetTargetName(book, sheet) {
    if (sheet.rid === undefined || sheet.rid === null) { return null; }
    var target = book.rels[sheet.rid];
    if (target === undefined) { return null; }
    return resolveTarget(target);
  }

  // Acepta ArrayBuffer | Uint8Array | SharedArrayBuffer. Nunca usa DOMParser.
  async function read(bytes, opts) {
    opts = opts || {};
    var u8 = toU8(bytes);
    var book = await loadBook(u8);
    var sheet = pickSheet(book, opts.sheet);
    if (!sheet) {
      throw iwError(CODE_NO_SHEET, 'hoja no encontrada: ' + (typeof opts.sheet === 'number' ? 'indice ' + opts.sheet : '"' + opts.sheet + '"'));
    }
    var warnings = [];
    var ctx = makeCtx(opts, warnings);
    ctx.epochMs = book.epochMs;

    var targetName = sheetTargetName(book, sheet);
    if (!targetName || !book.map[targetName]) {
      throw iwError(CODE_NO_SHEET, 'la hoja "' + sheet.name + '" apunta a una parte inexistente del zip (' + targetName + ')');
    }

    var sheetBytes = await entryBytes(u8, book.map[targetName]);
    if (sheetBytes.length > MAX_SHEET_BYTES) {
      ctx.warn('el XML de la hoja supera 25 MB (' + Math.round(sheetBytes.length / 1048576) + ' MB); puede ser lento o agotar memoria');
    }
    var xml = utf8Decode(sheetBytes);

    var ssBytes = await getPartBytes(book.map, u8, 'xl/sharedStrings.xml');
    ctx.shared = [];
    if (ssBytes !== null) {
      var ssXml = utf8Decode(ssBytes);
      iterTags(ssXml, 'si', 0, ssXml.length, function (attrs, body, self) {
        ctx.shared.push(self ? '' : collectTexts(body));
      });
    }
    var stBytes = await getPartBytes(book.map, u8, 'xl/styles.xml');
    ctx.styles = stBytes === null ? [] : parseStylesXml(utf8Decode(stBytes));

    await processSheet(xml, ctx);

    var dateColumns = Object.keys(ctx.dateCols).map(Number).sort(function (a, b) { return a - b; });
    return {
      name: sheet.name,
      rows: ctx.rows,
      dateColumns: dateColumns,
      stats: { rows: ctx.rows.length, skipped: ctx.skipped },
      warnings: warnings
    };
  }

  async function listSheets(bytes) {
    var book = await loadBook(toU8(bytes));
    return book.sheets.map(function (s, i) { return { name: s.name, index: i }; });
  }

  return {
    CANCELED: CODE_CANCELED,
    BAD_ZIP: CODE_BAD_ZIP,
    NO_SHEET: CODE_NO_SHEET,
    UNSUPPORTED_COMPRESSION: CODE_UNSUPPORTED,
    listSheets: listSheets,
    read: read
  };
});
