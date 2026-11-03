/* IntegrityWatch Field — ingest/formats
   Capa "archivo -> filas": la UI y commit.js consumen TODOS los formatos
   (csv, tsv, xlsx, json, jsonl, xml generico, witsml) con una unica interfaz,
   sin conocer formatos. Reutiliza las primitivas existentes y no reimplementa
   parsers: chunked (csv/tsv/jsonl por bloques), xlsx (hojas + sharedStrings),
   witsmlLite (lecturas) y escaneos tolerantes propios para xml/json/jsonl
   (sin DOMParser, sin dependencias).

   Contract de `source`: la interfaz minima de chunked
     { name?: string, size: number(bytes), slice(start,end) ->
         string | Uint8Array | ArrayBuffer | Blob | Promise-de-algo-de-eso }
   Un File/Blob del navegador cumple este contract NATIVAMENTE (slice()
   devuelve Blob y la fuente misma trae arrayBuffer()/text()): las ramas de
   texto (csv/tsv/jsonl via chunked; json/xml/witsml via sliceToText) ya
   convertian las tajadas Blob; la rama de bytes (xlsx) normaliza la fuente
   via arrayBuffer() en readWholeBytes, asi que FILE/BLOB ESTAN SOPORTADOS
   en TODOS los formatos sin adaptadores en la UI.

   readRows es ASYNC porque debe FIJAR meta.headers antes de entregar las
   filas: csv consume cabecera + primer dato como sonda; jsonl abre una
   ventana inicial de 50 lineas para cerrar el union de headers; xlsx/json/
   xml leen lo suyo primero. Cancelacion (isCanceled) y progreso (onProgress
   con {rows, bytesDone?}) se propagan a todos los formatos; los codigos
   CANCELED de origen (CHUNKED_/XLSX_) viajan tal cual. Errores propios
   tipados FORMATS_* en .code; JSON_TOO_LARGE con .hint (spec).
   Sin console, sin DOM, sin estado global (todo en closures). */
(function (root, factory) {
  'use strict';
  if (typeof require === 'function') {
    // Node: cargar hermanos primero (en el navegador manda el orden de
    // scripts de index.html). Protegido: nunca falla el arranque del modulo.
    try { require('./csv.js'); } catch (e) { /* ignore */ }
    try { require('./chunked.js'); } catch (e) { /* ignore */ }
    try { require('./xlsx.js'); } catch (e) { /* ignore */ }
    try { require('./witsmlLite.js'); } catch (e) { /* ignore */ }
  }
  var api = factory(root);
  root.IW = root.IW || {};
  root.IW.ingest = root.IW.ingest || {};
  root.IW.ingest.formats = api;
  if (typeof module === 'object' && module.exports) { module.exports = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  // Codigos de error tipados: siempre viajan en err.code (convencion xlsx).
  var CODE_BAD_SOURCE = 'FORMATS_BAD_SOURCE';
  var CODE_UNSUPPORTED = 'FORMATS_UNSUPPORTED_FORMAT';
  var CODE_BAD_JSON = 'FORMATS_BAD_JSON';
  var CODE_TOO_LARGE = 'JSON_TOO_LARGE';

  var FORMATS = ['csv', 'tsv', 'xlsx', 'json', 'jsonl', 'xml', 'witsml'];

  var JSON_MAX_BYTES = 10 * 1024 * 1024; // JSON se parsea TEXTO completo solo hasta 10 MB
  var JSON_PROBE_BYTES = 8192;           // ventana de contenido para detectFormat
  var MAX_JSON_COLS = 200;               // tope de columnas por union de claves
  var JSONL_HEADER_WINDOW = 50;          // lineas que aun pueden ampliar headers
  var DEFAULT_BLOCK_SIZE = 2000;         // cesion del loop cada N filas (igual que chunked)
  var DEFAULT_SLICE_BYTES = 4194304;     // 4 MiB de tajada interna (invisible para la UI)

  // Headers fijos del dominio readings para WITSML (mapean limpiamente via
  // mapping.js: code->mpId, fecha->date, valor->crMpy, unidad->pista, source).
  var READINGS_HEADERS = ['code', 'fecha', 'valor', 'unidad', 'source'];

  function C() { return root.IW.ingest.chunked; }
  function X() { return root.IW.ingest.xlsx; }
  function W() { return root.IW.ingest.witsmlLite; }

  function iwError(code, message, extra) {
    var e = new Error(message);
    e.code = code;
    if (extra) {
      Object.keys(extra).forEach(function (k) { e[k] = extra[k]; });
    }
    return e;
  }

  function yieldLoop() {
    return new Promise(function (resolve) { setTimeout(resolve, 0); });
  }

  function toBlock(v) {
    var n = Number(v);
    return isFinite(n) && n >= 1 ? Math.floor(n) : DEFAULT_BLOCK_SIZE;
  }

  function toSliceBytes(v) {
    var n = Number(v);
    return isFinite(n) && n >= 1 ? Math.floor(n) : DEFAULT_SLICE_BYTES;
  }

  // maxRows normalizado: undefined / <=0 / NaN -> Infinity (sin limite).
  function toMaxRows(v) {
    if (v === undefined || v === null) { return Infinity; }
    var n = Number(v);
    if (n === Infinity) { return Infinity; }
    if (!isFinite(n) || n < 1) { return Infinity; }
    return Math.floor(n);
  }

  function rowsOf(arr, maxRows) {
    var out = [];
    for (var i = 0; i < arr.length && i < maxRows; i++) { out.push(arr[i]); }
    return out;
  }

  function checkCanceled(isCanceled, where) {
    if (isCanceled && isCanceled()) {
      throw iwError(C().CANCELED, 'lectura cancelada: ' + where);
    }
  }

  function requireSource(source) {
    if (!source || typeof source.slice !== 'function') {
      throw iwError(CODE_BAD_SOURCE, 'source debe cumplir la interfaz minima {name?, size, slice(start,end)}');
    }
  }

  // -----------------------------------------------------------------------
  // Lectura "de una pieza" (json / xml / witsml / bytes de xlsx). Acepta los
  // mismos tipos de tajada que chunked: string, Promise, Uint8Array/
  // ArrayBuffer, Blob (arrayBuffer() y text() de respaldo).
  // -----------------------------------------------------------------------

  async function readWholeText(source, isCanceled) {
    checkCanceled(isCanceled, 'inicio');
    var size = isFinite(source.size) && source.size >= 0 ? source.size : null;
    var raw;
    if (size === null) {
      // tamano desconocido: leer hasta tajada vacia
      var parts = [];
      var pos = 0;
      var dec = new TextDecoder('utf-8');
      for (;;) {
        var t = await readOneSlice(source, pos, pos + DEFAULT_SLICE_BYTES);
        pos += DEFAULT_SLICE_BYTES;
        if (t === null) { break; }
        if (t === '') { break; }
        parts.push(t);
        checkCanceled(isCanceled, 'durante la lectura');
      }
      raw = parts.join('');
      return stripBom(raw);
    }
    if (size === 0) { return ''; }
    raw = await readOneSlice(source, 0, size);
    checkCanceled(isCanceled, 'tras la lectura');
    var text = await sliceToText(raw);
    return stripBom(text);
  }

   async function readWholeBytes(source, isCanceled) {
    checkCanceled(isCanceled, 'inicio');
    // File/Blob del navegador: la fuente misma trae arrayBuffer() propio y su
    // slice() devuelve Blob (no bytes crudos), lo que rompia xlsx con
    // FORMATS_BAD_SOURCE. Se normaliza la fuente: si expose arrayBuffer() se
    // toman sus bytes directos; si no, la tajada de slice() se convierte igual
    // que en sliceToText (Blob -> await .arrayBuffer()).
    if (typeof source.arrayBuffer === 'function') {
      var fab = await source.arrayBuffer();
      checkCanceled(isCanceled, 'tras la lectura');
      return fab instanceof Uint8Array ? fab : new Uint8Array(fab);
    }
    var size = isFinite(source.size) && source.size >= 0 ? source.size : null;
    if (size === null) {
      throw iwError(CODE_BAD_SOURCE, 'xlsx requiere source.size numerico en bytes');
    }
    if (size === 0) { return new Uint8Array(0); }
    var raw = await readOneSlice(source, 0, size);
    checkCanceled(isCanceled, 'tras la lectura');
    if (raw instanceof Uint8Array) { return raw; }
    if (raw instanceof ArrayBuffer) { return new Uint8Array(raw); }
    if (typeof SharedArrayBuffer !== 'undefined' && raw instanceof SharedArrayBuffer) { return new Uint8Array(raw); }
    if (raw && typeof raw.arrayBuffer === 'function') { // Blob: tajada del navegador
      var bab = await raw.arrayBuffer();
      return bab instanceof Uint8Array ? bab : new Uint8Array(bab);
    }
    throw iwError(CODE_BAD_SOURCE,
      'xlsx necesita BYTES: source.slice(0,size) debe devolver Uint8Array/ArrayBuffer/Blob (la interfaz File del navegador lo hace nativamente), no string');
  }

  function readOneSlice(source, start, end) {
    var p = source.slice(start, end);
    return p && typeof p.then === 'function' ? p : Promise.resolve(p);
  }

  async function sliceToText(res) {
    if (typeof res === 'string') { return res; }
    if (res && typeof res.arrayBuffer === 'function') {
      var ab = await res.arrayBuffer();
      return new TextDecoder('utf-8').decode(new Uint8Array(ab));
    }
    if (res && typeof res.text === 'function') { return await res.text(); }
    if (res instanceof ArrayBuffer) { res = new Uint8Array(res); }
    if (typeof SharedArrayBuffer !== 'undefined' && res instanceof SharedArrayBuffer) { res = new Uint8Array(res); }
    if (res instanceof Uint8Array) { return new TextDecoder('utf-8').decode(res); }
    throw iwError(CODE_BAD_SOURCE, 'source.slice devolvio algo no interpretable');
  }

  function stripBom(s) {
    return s.charCodeAt(0) === 0xFEFF ? s.slice(1) : s;
  }

  // -----------------------------------------------------------------------
  // Utilidades XML tolerantes (mismo espiritu que witsmlLite/xlsx: sin DOM)
  // -----------------------------------------------------------------------

  // Decodifica las cinco entidades predefinidas, las referencias numericas y
  // las entidades de nombre Latin-1 mas frecuentes en datos del campo
  // (acentos espanoles: &aacute; &ntilde; ...). &amp; al final para que
  // "&amp;lt;" quede literal.
  var NAMED_ENTITIES = {
    nbsp: ' ', shy: '\u00ad',
    amp: '&', lt: '<', gt: '>', quot: '"', apos: "'",
    euro: '\u20ac',
    copy: '\u00a9', reg: '\u00ae', trade: '\u2122',
    deg: '\u00b0', middot: '\u00b7', sect: '\u00a7', para: '\u00b6',
    times: '\u00d7', divide: '\u00f7',
    ldquo: '\u201c', rdquo: '\u201d', lsquo: '\u2018', rsquo: '\u2019',
    ndash: '\u2013', mdash: '\u2014', hellip: '\u2026', bull: '\u2022', dagger: '\u2020',
    AElig: '\u00c6', aelig: '\u00e6',
    Agrave: '\u00c0', Aacute: '\u00c1', Acirc: '\u00c2', Atilde: '\u00c3', Auml: '\u00c4', Aring: '\u00c5',
    Egrave: '\u00c8', Eacute: '\u00c9', Ecirc: '\u00ca', Euml: '\u00cb',
    Igrave: '\u00cc', Iacute: '\u00cd', Icirc: '\u00ce', Iuml: '\u00cf',
    Ntilde: '\u00d1',
    Ograve: '\u00d2', Oacute: '\u00d3', Ocirc: '\u00d4', Otilde: '\u00d5', Ouml: '\u00d6',
    Ugrave: '\u00d9', Uacute: '\u00da', Ucirc: '\u00db', Uuml: '\u00dc',
    Yacute: '\u00dd',
    agrave: '\u00e0', aacute: '\u00e1', acirc: '\u00e2', atilde: '\u00e3', auml: '\u00e4', aring: '\u00e5',
    egrave: '\u00e8', eacute: '\u00e9', ecirc: '\u00ea', euml: '\u00eb',
    igrave: '\u00ec', iacute: '\u00ed', icirc: '\u00ee', iuml: '\u00ef',
    ntilde: '\u00f1',
    ograve: '\u00f2', oacute: '\u00f3', ocirc: '\u00f4', otilde: '\u00f5', ouml: '\u00f6',
    ugrave: '\u00f9', uacute: '\u00fa', ucirc: '\u00fb', uuml: '\u00fc',
    yacute: '\u00fd', yuml: '\u00ff',
    ccedil: '\u00e7', Ccedil: '\u00c7'
  };

  function decodeEntities(s) {
    return String(s)
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&#(\d+);/g, function (m, d) { return String.fromCharCode(parseInt(d, 10)); })
      .replace(/&#x([0-9a-fA-F]+);/g, function (m, h) { return String.fromCharCode(parseInt(h, 16)); })
      .replace(/&([A-Za-z][A-Za-z0-9]{1,14});/g, function (m, n) {
        return Object.prototype.hasOwnProperty.call(NAMED_ENTITIES, n) ? NAMED_ENTITIES[n] : m;
      })
      .replace(/&amp;/g, '&');
  }

  function escapeRegExp(s) {
    return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  // Nombre LOCAL de un tag: sin prefijo de namespace ('witsml:well' -> 'well').
  function localName(name) {
    var i = String(name).lastIndexOf(':');
    return i >= 0 ? String(name).slice(i + 1) : String(name);
  }

  // Encuentra el '>' que cierra el tag, respetando comillas (igual que xlsx).
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
  // start y end; cb(atributos, cuerpoInterior, esAutoCerrado) devuelve false
  // para detenerse. Copiado en espitu y forma del iterTags de xlsx.js.
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
        if (cb(attrs, '', true) === false) { return; }
        pos = gt + 1;
        continue;
      }
      var cIdx = xml.indexOf(close, gt + 1);
      if (cIdx < 0) { cb(attrs, xml.slice(gt + 1, end), false); break; }
      if (cb(attrs, xml.slice(gt + 1, cIdx), false) === false) { return; }
      pos = cIdx + close.length + 1;
    }
  }

  // Declaraion XML, comentarios y DOCTYPE fuera: no deben confundirse con
  // elementos (mismo criterio que clean() de witsmlLite).
  function cleanXml(xml) {
    return String(xml == null ? '' : xml)
      .replace(/<\?xml[\s\S]*?\?>/gi, '')
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/<!DOCTYPE[\s\S]*?>/gi, '');
  }

  // Hijos DIRECTOS de un fragmento: [{name, inner}] (inner sin el tag de
  // cierre). Auto-cerrados -> inner ''. Cierre desparejado tolerado: el
  // fragmento que no cierra toma hasta el final del texto.
  function childrenOf(xml) {
    var out = [];
    var i = 0;
    var n = xml.length;
    while (i < n) {
      var lt = xml.indexOf('<', i);
      if (lt < 0) { break; }
      if (xml.startsWith('<?', lt)) { i = xml.indexOf('?>', lt); i = i < 0 ? n : i + 2; continue; }
      if (xml.startsWith('<!--', lt)) { i = xml.indexOf('-->', lt); i = i < 0 ? n : i + 3; continue; }
      if (xml.startsWith('<![CDATA[', lt)) { i = xml.indexOf(']]>', lt); i = i < 0 ? n : i + 3; continue; }
      if (xml.startsWith('<!', lt)) { i = xml.indexOf('>', lt); i = i < 0 ? n : i + 1; continue; }
      if (xml.charAt(lt + 1) === '/') {
        // cierre hueso a este nivel: tolerar y saltarlo
        i = xml.indexOf('>', lt); i = i < 0 ? n : i + 1; continue;
      }
      var gt = findTagEnd(xml, lt + 1);
      if (gt < 0) { break; }
      var head = xml.slice(lt + 1, gt - (xml.charAt(gt - 1) === '/' ? 1 : 0));
      var m = /^([^\s/>]+)/.exec(head);
      if (!m) { i = gt + 1; continue; }
      var name = localName(m[1]);
      if (xml.charAt(gt - 1) === '/') {
        out.push({ name: name, inner: '' });
        i = gt + 1;
        continue;
      }
      var close = matchClose(xml, gt + 1, name);
      out.push({ name: name, inner: xml.slice(gt + 1, close.innerEnd) });
      i = close.after;
    }
    return out;
  }

  // Encuentra el cierre </name> que empareja con la apertura ya leida,
  // contando anidamiento de CUALQUIER tag (los tags vacios <x></x> aportan
  // depth 0 porque apertura y cierre se cuentan juntos).
  function matchClose(xml, from, name) {
    var depth = 0;
    var i = from;
    var n = xml.length;
    while (i < n) {
      var lt = xml.indexOf('<', i);
      if (lt < 0) { break; }
      if (xml.startsWith('<?', lt) || xml.startsWith('<!--', lt) || xml.startsWith('<![CDATA[', lt)) {
        var stopTok = xml.startsWith('<?', lt) ? '?>' : (xml.startsWith('<!--', lt) ? '-->' : ']]>');
        i = xml.indexOf(stopTok, lt);
        i = i < 0 ? n : i + stopTok.length;
        continue;
      }
      if (xml.startsWith('<!', lt)) { i = xml.indexOf('>', lt); i = i < 0 ? n : i + 1; continue; }
      var gt = findTagEnd(xml, lt + 1);
      if (gt < 0) { break; }
      if (xml.charAt(lt + 1) === '/') {
        var cm = /^\/\s*([^\s/>]+)/.exec(xml.slice(lt + 1, gt));
        var cname = cm ? localName(cm[1]) : '';
        if (depth === 0) {
          if (cname === name) { return { innerEnd: lt, after: gt + 1 }; }
          // cierre de OTRO nombre a este nivel: documento mal formado; ser
          // tolerante y cerrar aqui el elemento actual.
          return { innerEnd: lt, after: gt + 1 };
        }
        depth -= 1;
        i = gt + 1;
        continue;
      }
      if (xml.charAt(gt - 1) !== '/') { depth += 1; }
      i = gt + 1;
    }
    return { innerEnd: n, after: n };
  }

  // Texto de un valor: CDATA al crudo, comentarios fuera, tags fuera,
  // entidades decodificadas, recortado. Vacio (<x/> y <x></x>) -> ''.
  function xmlText(inner) {
    var s = String(inner == null ? '' : inner)
      .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, function (m, t) { return t; })
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/<[^>]*>/g, '');
    return decodeEntities(s).trim();
  }

  // -----------------------------------------------------------------------
  // Valores JSON/JSONL estables
  // -----------------------------------------------------------------------

  // Escalar viaja tal cual; null/undefined -> null; objeto/array anidado ->
  // JSON.stringify ESTABLE (claves ordenadas recursivamente, listas en orden).
  function stableStringify(value) {
    return JSON.stringify(sortRec(value));
  }

  function sortRec(v) {
    if (Array.isArray(v)) { return v.map(sortRec); }
    if (v && typeof v === 'object') {
      var out = {};
      Object.keys(v).sort().forEach(function (k) { out[k] = sortRec(v[k]); });
      return out;
    }
    return v === undefined ? null : v;
  }

  function normalizeValue(v) {
    if (v === undefined || v === null) { return null; }
    var t = typeof v;
    if (t === 'string' || t === 'number' || t === 'boolean') { return v; }
    return stableStringify(v);
  }

  function addHeader(headers, set, key, capWarn) {
    var k = String(key);
    if (Object.prototype.hasOwnProperty.call(set, k)) { return true; }
    if (headers.length >= MAX_JSON_COLS) { capWarn.seen = true; return false; }
    set[k] = true;
    headers.push(k);
    return true;
  }

  // -----------------------------------------------------------------------
  // 1) detectFormat
  // -----------------------------------------------------------------------
  // Por extension: .csv->csv, .tsv->tsv, .txt->csv (autodetecta delimitador),
  // .xlsx/.xlsm->xlsx, .json->json, .ndjson/.jsonl->jsonl, .xml->por contenido:
  // si la raiz o el namespace contienen 'WITSML' (case-insensitive) -> witsml,
  // si no -> xml. nameOrExt admite nombre con extension ('a.csv'), extension
  // suelta ('.csv' o 'csv') o nada (usa fileLike.name). Extension
  // irreconocible: inspecciona las primeras 8 KB (empieza con '<' -> xml/
  // witsml por contenido) y si no, devuelve null.
  // Devuelve Promise<string|null>.
  async function detectFormat(fileLike, nameOrExt) {
    requireSource(fileLike);
    var token = String(nameOrExt || (fileLike && fileLike.name) || '').trim().toLowerCase();
    var ext = token;
    var dot = token.lastIndexOf('.');
    if (dot >= 0) { ext = token.slice(dot + 1); }
    if (ext === 'csv') { return 'csv'; }
    if (ext === 'tsv') { return 'tsv'; }
    if (ext === 'txt') { return 'csv'; }
    if (ext === 'xlsx' || ext === 'xlsm') { return 'xlsx'; }
    if (ext === 'json') { return 'json'; }
    if (ext === 'jsonl' || ext === 'ndjson') { return 'jsonl'; }
    if (ext === 'xml') { return probeXml(fileLike); }
    // sin extension util: mirar el contenido
    var snippet = await probeSnippet(fileLike);
    if (/^\s*</.test(snippet)) { return probeXml(fileLike, snippet); }
    return null;
  }

  async function probeSnippet(fileLike) {
    var size = isFinite(fileLike.size) && fileLike.size >= 0 ? fileLike.size : 0;
    if (size === 0) { return ''; }
    var raw = await readOneSlice(fileLike, 0, Math.min(size, JSON_PROBE_BYTES));
    try {
      return await sliceToText(raw);
    } catch (e) {
      return '';
    }
  }

  // Raiz o namespace con 'WITSML' -> witsml; si no, xml.
  async function probeXml(fileLike, preRead) {
    var snippet = preRead !== undefined ? preRead : await probeSnippet(fileLike);
    return /witsml/i.test(snippet) ? 'witsml' : 'xml';
  }

  // -----------------------------------------------------------------------
  // 2) readRows: archivo -> { meta, rows }
  // -----------------------------------------------------------------------
  // opts: {format, sheet, delimiter, quote, sliceBytes, blockSize, maxRows,
  //        onProgress({rows, bytesDone?}), isCanceled()}
  // meta: {format, headers, sheets?, sheetName?, targetStore?, warnings}
  // rows: AsyncIterable<{row:[...], lineNo|rowNo}> (fila null en lineas
  //       JSONL ilegibles, con su warning asociado).
  async function readRows(source, opts) {
    opts = opts || {};
    requireSource(source);
    var isCanceled = typeof opts.isCanceled === 'function' ? opts.isCanceled : null;
    var onProgress = typeof opts.onProgress === 'function' ? opts.onProgress : null;
    var maxRows = toMaxRows(opts.maxRows);
    var format = opts.format || await detectFormat(source, source.name);
    if (FORMATS.indexOf(format) === -1) {
      throw iwError(CODE_UNSUPPORTED, 'formato no soportado: ' + JSON.stringify(format) + ' (esperado: ' + FORMATS.join('/') + ')');
    }
    switch (format) {
      case 'csv':
      case 'tsv': return readCsvRows(source, format, opts, maxRows, isCanceled, onProgress);
      case 'xlsx': return readXlsxRows(source, opts, maxRows, isCanceled, onProgress);
      case 'json': return readJsonRows(source, opts, maxRows, isCanceled, onProgress);
      case 'jsonl': return readJsonlRows(source, opts, maxRows, isCanceled, onProgress);
      case 'xml': return readXmlRows(source, opts, maxRows, isCanceled, onProgress);
      default: return readWitsmlRows(source, opts, maxRows, isCanceled, onProgress);
    }
  }

  // ---- csv / tsv: chunked.parseCsvIncremental (primera fila = headers) ----
  async function readCsvRows(source, format, opts, maxRows, isCanceled, onProgress) {
    var delimiter = opts.delimiter || (format === 'tsv' ? '\t' : undefined);
    var lines = C().readLines(source, {
      sliceBytes: toSliceBytes(opts.sliceBytes),
      isCanceled: isCanceled
    });
    var parser = C().parseCsvIncremental(lines, {
      delimiter: delimiter,
      quote: opts.quote,
      blockSize: toBlock(opts.blockSize),
      isCanceled: isCanceled,
      onProgress: onProgress
    });
    var it = parser[Symbol.asyncIterator]();
    // sonda: el primer next consume la fila de cabecera y fija parser.headers
    var cur = await it.next();
    var headers = parser.headers || [];
    var meta = { format: format, headers: headers, warnings: parser.warnings };
    var gen = (async function* () {
      var emitted = 0;
      while (!cur.done) {
        yield cur.value;
        emitted += 1;
        if (emitted >= maxRows) {
          if (typeof it.return === 'function') { try { await it.return(); } catch (e) { /* cierre tolerado */ } }
          break;
        }
        cur = await it.next();
      }
    })();
    return { meta: meta, rows: gen };
  }

  // ---- xlsx: IW.ingest.xlsx.read (hojas, selection, SHEET_DEFAULT) --------
  async function readXlsxRows(source, opts, maxRows, isCanceled, onProgress) {
    var bytes = await readWholeBytes(source, isCanceled);
    var sheets = await X().listSheets(bytes);
    var names = sheets.map(function (s) { return s.name; });
    var warnings = [];
    var sel = opts.sheet === '' || opts.sheet === undefined || opts.sheet === null ? null : opts.sheet;
    if (sel === null && names.length > 1) {
      var others = names.slice(1);
      warnings.push('SHEET_DEFAULT: se uso la primera hoja "' + names[0] + '"; quedan ' + others.length + ' sin leer: ' +
        others.map(function (s) { return '"' + s + '"'; }).join(', ') + ' (pasar sheet:"Nombre" para elegir)');
    }
    var xopts = {
      sheet: sel === null ? undefined : sel,
      blockSize: toBlock(opts.blockSize),
      onProgress: onProgress,
      isCanceled: isCanceled
    };
    if (isFinite(maxRows)) { xopts.maxRows = maxRows + 1; } // xlsx cuenta la fila 1 (cabecera)
    var r = await X().read(bytes, xopts);
    warnings = warnings.concat(r.warnings);
    var dataRows = r.rows.slice(1);
    var meta = {
      format: 'xlsx',
      headers: r.rows.length ? r.rows[0].slice() : [],
      sheets: names,
      sheetName: r.name,
      warnings: warnings
    };
    var gen = (async function* () {
      var emitted = 0;
      for (var i = 0; i < dataRows.length && emitted < maxRows; i++) {
        yield { row: dataRows[i], rowNo: i + 2 }; // fila 2..n de la hoja
        emitted += 1;
      }
      if (onProgress) { onProgress({ rows: emitted }); }
    })();
    return { meta: meta, rows: gen };
  }

  // ---- json: array de objetos (texto completo SOLO hasta 10 MB) -----------
  async function readJsonRows(source, opts, maxRows, isCanceled, onProgress) {
    var size = isFinite(source.size) && source.size >= 0 ? source.size : null;
    if (size !== null && size > JSON_MAX_BYTES) {
      throw iwError(CODE_TOO_LARGE, 'JSON de ' + size + ' bytes supera el limite de ' + JSON_MAX_BYTES + ' bytes para parseo en memoria', { hint: 'usa JSONL' });
    }
    var text = await readWholeText(source, isCanceled);
    var byteLen = size !== null ? size : new TextEncoder().encode(text).length;
    if (byteLen > JSON_MAX_BYTES) {
      throw iwError(CODE_TOO_LARGE, 'JSON de ' + byteLen + ' bytes supera el limite de ' + JSON_MAX_BYTES + ' bytes para parseo en memoria', { hint: 'usa JSONL' });
    }
    var warnings = [];
    var data;
    try {
      data = JSON.parse(text);
    } catch (e) {
      throw iwError(CODE_BAD_JSON, 'json invalido: ' + (e && e.message ? e.message : e), { hint: 'usa JSONL si el archivo se corto a mitad' });
    }
    var arr = null;
    if (Array.isArray(data)) {
      arr = data;
    } else if (data && typeof data === 'object' && !Array.isArray(data)) {
      arr = [data];
      warnings.push('JSON_RAIZ_OBJETO: el documento es un objeto unico; se tomo como una fila');
    }
    if (arr === null) {
      throw iwError(CODE_BAD_JSON, 'json debe ser un array de objetos (o un objeto unico)');
    }
    var headers = [];
    var set = {};
    var capWarn = { seen: false };
    arr.forEach(function (obj, i) {
      if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) {
        throw iwError(CODE_BAD_JSON, 'elemento ' + i + ' del array no es un objeto (se esperaba array de objetos)');
      }
      Object.keys(obj).forEach(function (k) { addHeader(headers, set, k, capWarn); });
    });
    if (capWarn.seen) { warnings.push('JSON_MAX_COLS: se alcanzo el maximo de ' + MAX_JSON_COLS + ' columnas; las claves adicionales fueron descartadas'); }
    var records = rowsOf(arr.slice(0, maxRows).map(function (obj, i) {
      return { row: headers.map(function (h) { return normalizeValue(obj[h]); }), rowNo: i + 1 };
    }), maxRows);
    if (isCanceled && isCanceled()) { throw iwError(C().CANCELED, 'lectura cancelada tras parsear el JSON'); }
    var meta = { format: 'json', headers: headers, warnings: warnings };
    var gen = (async function* () {
      for (var i = 0; i < records.length; i++) { yield records[i]; }
      if (onProgress) { onProgress({ rows: records.length }); }
    })();
    return { meta: meta, rows: gen };
  }

  // ---- jsonl: chunked.readLines + JSON.parse por linea --------------------
  // Ventana inicial de 50 lineas para cerrar headers; claves nuevas despues
  // -> warning + descarte. Linea ilegable -> {row:null, lineNo} + warning.
  async function readJsonlRows(source, opts, maxRows, isCanceled, onProgress) {
    var warnings = [];
    var headers = [];
    var set = {};
    var capWarn = { seen: false };
    var blockSize = toBlock(opts.blockSize);
    var lines = C().readLines(source, {
      sliceBytes: toSliceBytes(opts.sliceBytes),
      isCanceled: isCanceled
    });
    var it = lines[Symbol.asyncIterator]();

    // primera pasada (hasta JSONL_HEADER_WINDOW lineas crudas): fija headers
    var buffered = [];
    var lineNo = 0;
    var eof = false;
    while (lineNo < JSONL_HEADER_WINDOW) {
      var step = await it.next();
      if (step.done) { eof = true; break; }
      lineNo += 1;
      var rawLine = String(step.value);
      if (rawLine.trim() === '') { continue; }
      var entry = parseJsonlLine(rawLine, lineNo, warnings);
      if (entry.obj !== null) {
        Object.keys(entry.obj).forEach(function (k) { addHeader(headers, set, k, capWarn); });
      }
      buffered.push({ lineNo: lineNo, obj: entry.obj });
    }
    if (capWarn.seen) { warnings.push('JSONL_MAX_COLS: se alcanzo el maximo de ' + MAX_JSON_COLS + ' columnas; las claves adicionales fueron descartadas'); }

    var meta = { format: 'jsonl', headers: headers, warnings: warnings };
    var gen = (async function* () {
      var pending = buffered.slice();
      var emitted = 0;
      var sinceYield = 0;
      while (emitted < maxRows) {
        var rec = null;
        if (pending.length > 0) { rec = pending.shift(); }
        else {
          if (eof) { break; }
          for (;;) {
            var s = await it.next();
            if (s.done) { eof = true; break; }
            lineNo += 1;
            var rl = String(s.value);
            if (rl.trim() === '') { continue; }
            var e = parseJsonlLine(rl, lineNo, warnings);
            var obj = e.obj;
            if (obj !== null) {
              Object.keys(obj).forEach(function (k) {
                if (!Object.prototype.hasOwnProperty.call(set, k)) {
                  warnings.push('linea ' + lineNo + ': clave nueva "' + k + '" fuera de la ventana de las primeras ' + JSONL_HEADER_WINDOW + ' lineas; se descarto su valor');
                  delete obj[k];
                }
              });
            }
            pending.push({ lineNo: lineNo, obj: obj });
            break;
          }
          continue;
        }
        var row = rec.obj === null ? null : headers.map(function (h) { return normalizeValue(rec.obj[h]); });
        yield { row: row, lineNo: rec.lineNo };
        emitted += 1;
        sinceYield += 1;
        if (sinceYield >= blockSize) {
          sinceYield = 0;
          checkCanceled(isCanceled, 'jsonl tras ' + emitted + ' filas');
          var b = typeof lines.bytesState === 'function' ? lines.bytesState() : { bytesDone: null, bytesTotal: null };
          if (onProgress) { onProgress({ rows: emitted, bytesDone: b.bytesDone, bytesTotal: b.bytesTotal }); }
          await yieldLoop();
        }
      }
      var bf = typeof lines.bytesState === 'function' ? lines.bytesState() : { bytesDone: null, bytesTotal: null };
      if (onProgress) { onProgress({ rows: emitted, bytesDone: bf.bytesDone, bytesTotal: bf.bytesTotal }); }
    })();
    return { meta: meta, rows: gen };
  }

  function parseJsonlLine(raw, lineNo, warnings) {
    try {
      var v = JSON.parse(raw);
      if (v && typeof v === 'object' && !Array.isArray(v)) { return { obj: v }; }
      warnings.push('linea ' + lineNo + ': no es un objeto JSON; se emitio fila null');
    } catch (e) {
      warnings.push('linea ' + lineNo + ': json invalido (' + (e && e.message ? e.message : String(e)) + '); se emitio fila null');
    }
    return { obj: null };
  }

  // ---- xml generico: escaner tolerante sin DOMParser ----------------------
  // Raiz -> elemento hijo REPETIDO (nombre mas frecuente bajo la raiz,
  // empate: primero en aparecer) -> cada hijo = fila; sus hijos = columnas
  // (nombre local -> header en orden de aparicion, texto interno -> valor;
  // atributos ignorados; entidades decodificadas; <x/> y <x></x> -> '').
  async function readXmlRows(source, opts, maxRows, isCanceled, onProgress) {
    var text = await readWholeText(source, isCanceled);
    var warnings = [];
    var src = cleanXml(text);
    var recs = [];
    var headers = [];
    var set = {};
    var capWarn = { seen: false };
    var m = /<([^\s/>]+)/.exec(src);
    if (m) {
      // iterTags busca el nombre CRUDO (con su prefijo si lo trae); para los
      // mensajes se usa el nombre local.
      var rootRaw = m[1];
      var rootName = localName(rootRaw);
      var rootInner = null;
      iterTags(src, rootRaw, 0, src.length, function (attrs, body, self) {
        rootInner = self ? '' : body;
        return false; // solo la primera raiz
      });
      if (rootInner !== null) {
        var items = childrenOf(rootInner);
        var counts = {};
        var order = [];
        items.forEach(function (ch) {
          if (!Object.prototype.hasOwnProperty.call(counts, ch.name)) { counts[ch.name] = 0; order.push(ch.name); }
          counts[ch.name] += 1;
        });
        if (order.length > 0) {
          var best = order[0];
          order.forEach(function (nm) { if (counts[nm] > counts[best]) { best = nm; } });
          if (order.length > 1) {
            warnings.push('XML_AMBIGUO: se tomo "' + best + '" como elemento de fila (' +
              order.map(function (nm) { return nm + '=' + counts[nm]; }).join(', ') + ')');
          }
          var rowItems = items.filter(function (ch) { return ch.name === best; });
          if (items.length !== rowItems.length) {
            warnings.push('XML_IGNORADOS: ' + (items.length - rowItems.length) + ' hijo(s) con otro nombre fueron ignorados');
          }
          recs = rowItems.map(function (ch) { return ch; });
          // headers: union de nombres de columna en orden de aparicion
          recs.forEach(function (ch) {
            childrenOf(ch.inner).forEach(function (col) {
              addHeader(headers, set, col.name, capWarn);
            });
          });
          if (capWarn.seen) { warnings.push('XML_MAX_COLS: se alcanzo el maximo de ' + MAX_JSON_COLS + ' columnas; las siguientes fueron descartadas'); }
          recs = recs.map(function (ch, i) {
            var cols = childrenOf(ch.inner);
            var byName = {};
            cols.forEach(function (col) { byName[col.name] = col.inner; }); // ultimo gana
            var row = headers.map(function (h) {
              return Object.prototype.hasOwnProperty.call(byName, h) ? xmlText(byName[h]) : '';
            });
            return { row: row, rowNo: i + 1 };
          });
        } else {
          warnings.push('XML_VACIO: la raiz "' + rootName + '" no tiene hijos; 0 filas');
        }
      } else {
        warnings.push('XML_SIN_RAIZ: no se encontro elemento raiz; 0 filas');
      }
    } else {
      warnings.push('XML_SIN_RAIZ: documento vacio o sin elementos; 0 filas');
    }
    checkCanceled(isCanceled, 'xml tras el escaneo');
    var meta = { format: 'xml', headers: headers, warnings: warnings };
    var limited = rowsOf(recs, maxRows);
    var gen = (async function* () {
      for (var i = 0; i < limited.length; i++) { yield limited[i]; }
      if (onProgress) { onProgress({ rows: limited.length }); }
    })();
    return { meta: meta, rows: gen };
  }

  // ---- witsml: witsmlLite como hoy, SOLO lecturas -------------------------
  // canales con mpCode x puntos con valor -> filas con headers fijos del
  // dominio readings (code, fecha, valor, unidad, source); meta.targetStore
  // = 'readings' para que commit.js enfile directo sin mapeo.
  async function readWitsmlRows(source, opts, maxRows, isCanceled, onProgress) {
    checkCanceled(isCanceled, 'inicio witsml');
    var text = await readWholeText(source, isCanceled);
    var p = W().parse(text);
    var warnings = p.errors.map(function (e) { return e.code + ': ' + (e.detail || ''); });
    var recs = [];
    p.channels.forEach(function (ch) {
      if (!ch.mpCode) { return; }
      ch.points.forEach(function (pt) {
        if (pt.value === undefined || pt.value === null) { return; }
        recs.push({ row: [ch.mpCode, pt.time, pt.value, ch.unit === undefined || ch.unit === null ? '' : ch.unit, 'import'], rowNo: recs.length + 1 });
      });
    });
    checkCanceled(isCanceled, 'witsml tras el parseo');
    var meta = { format: 'witsml', headers: READINGS_HEADERS.slice(), targetStore: 'readings', warnings: warnings };
    var limited = rowsOf(recs, maxRows);
    var gen = (async function* () {
      for (var i = 0; i < limited.length; i++) { yield limited[i]; }
      if (onProgress) { onProgress({ rows: limited.length }); }
    })();
    return { meta: meta, rows: gen };
  }

  // -----------------------------------------------------------------------
  // 4) readAllRows: helper de preview/tests (meta + array completo)
  // -----------------------------------------------------------------------
  async function readAllRows(source, opts) {
    var out = await readRows(source, opts);
    var rows = [];
    for await (var rec of out.rows) { rows.push(rec); }
    return { meta: out.meta, rows: rows };
  }

  // -----------------------------------------------------------------------
  // API publica
  // -----------------------------------------------------------------------
  return {
    BAD_SOURCE: CODE_BAD_SOURCE,
    UNSUPPORTED_FORMAT: CODE_UNSUPPORTED,
    BAD_JSON: CODE_BAD_JSON,
    JSON_TOO_LARGE: CODE_TOO_LARGE,
    FORMATS: FORMATS,
    READINGS_HEADERS: READINGS_HEADERS,
    JSON_MAX_BYTES: JSON_MAX_BYTES,
    detectFormat: detectFormat,
    readRows: readRows,
    readAllRows: readAllRows
  };
});
