/* IntegrityWatch Field — chunked
   Primitivas para procesar archivos enormes por BLOQUES INTERNOS ("tajadas"):
   el usuario solo "elige un archivo" y el corte en bloques es invisible.
   Lee lineas sin cargar todo el texto, parsea CSV incrementalmente con las
   MISMAS reglas que csv.js y mapea por lotes tolerante a errores. Cede el
   loop de eventos entre bloques (setTimeout 0) para no congelar la UI.
   Sin dependencias, sin DOM, sin estado global (todo en closures). Errores
   tipados con .code, misma convencion de cancelacion/avance que xlsx.js.

   INTERFACE MINIMA ESPERADA DE `source` (la cumple un File/Blob del navegador
   de forma nativa; en Node el test la construye sobre fs/Buffer):
     {
       size: number                       // tamano total en BYTES
       slice(start, end):                 // sincrono o en Promise:
         | string                         //   tajada YA decodificada UTF-8
         | Uint8Array | ArrayBuffer       //   bytes: se decodifican aqui con
                                          //   TextDecoder en modo stream (un
                                          //   caracter multibyte partido en la
                                          //   frontera de bytes NO se corrompe)
         | Blob                           //   navegador: se usa arrayBuffer()
                                          //   (o text() como respaldo)
     }
   El corte es SIEMPRE en limite de linea: la ultima linea incompleta de cada
   tajada se concatena con la primera de la siguiente; un \r final de tajada
   queda en espera hasta ver si el siguiente byte es \n (CRLF partido exacto);
   el BOM inicial se elimina; y una linea mayor que sliceBytes hace CRECER el
   tajo (se siguen leyendo tajadas hasta cerrar la linea, cediendo el loop
   entre ellas). */
(function (root, factory) {
  'use strict';
  var api = factory(root);
  root.IW = root.IW || {};
  root.IW.ingest = root.IW.ingest || {};
  root.IW.ingest.chunked = api;
  if (typeof module === 'object' && module.exports) { module.exports = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  // Codigos de error tipados: siempre viajan en err.code (convencion xlsx).
  var CODE_CANCELED = 'CHUNKED_CANCELED';
  var CODE_BAD_SOURCE = 'CHUNKED_BAD_SOURCE';

  var MAX_WARNINGS = 200;              // tope de warnings; luego se marca truncamiento
  var DEFAULT_SLICE_BYTES = 4194304;   // 4 MiB por tajada (tamano interno, invisible)
  var DEFAULT_BLOCK_SIZE = 2000;

  function iwError(code, message) {
    var e = new Error(message);
    e.code = code;
    return e;
  }

  // Ceder el loop de eventos: los demas callbacks (UI, timers) corren mientras
  // se procesan las tajadas/bloques.
  function yieldLoop() {
    return new Promise(function (resolve) { setTimeout(resolve, 0); });
  }

  // -----------------------------------------------------------------------
  // Autodeteccion de delimitador
  // -----------------------------------------------------------------------
  // csv.js YA exporta detectDelimiter (IW.ingest.csv.detectDelimiter): se
  // REUTILIZA para que el criterio sea identico. Si el modulo csv no esta
  // cargado (orden de scripts en navegador), se usa la reimplementacion
  // minima de abajo, algoritmicamente IDENTICA a la de csv.js: mayoria de
  // ocurrencias de , ; y TAB sobre las primeras 5 lineas no vacias.
  if (typeof require === 'function' && !(root.IW && root.IW.ingest && root.IW.ingest.csv)) {
    try { require('./csv.js'); } catch (e) { /* ignore */ }
  }
  var csvMod = root.IW && root.IW.ingest ? root.IW.ingest.csv : null;

  function fallbackDetectDelimiter(text) {
    text = String(text || '');
    var lines = text.split(/\r\n|\r|\n/);
    var votes = { ',': 0, ';': 0, '\t': 0 };
    var counted = 0;
    for (var i = 0; i < lines.length && counted < 5; i++) {
      var line = lines[i];
      if (line === '') { continue; }
      votes[','] += (line.match(/,/g) || []).length;
      votes[';'] += (line.match(/;/g) || []).length;
      votes['\t'] += (line.match(/\t/g) || []).length;
      counted++;
    }
    var best = ',';
    var bestCount = -1;
    for (var d in votes) {
      if (votes[d] > bestCount) { best = d; bestCount = votes[d]; }
    }
    return best;
  }

  function detectDelimiter(text) {
    if (csvMod && typeof csvMod.detectDelimiter === 'function') { return csvMod.detectDelimiter(text); }
    return fallbackDetectDelimiter(text);
  }

  // -----------------------------------------------------------------------
  // 1) sliceTextReader / readLines: lector de lineas por tajadas
  // -----------------------------------------------------------------------

  // Lee la tajada [start,end) y la devuelve como string. Acepta string,
  // Promise, Uint8Array/ArrayBuffer (TextDecoder en modo stream para no
  // corromper multibyte partido) y Blob (arrayBuffer() primero, text() de
  // respaldo). `decoder` dura toda la vida de la lectura.
  async function readSliceText(source, start, end, decoder, isLast) {
    var res = source.slice(start, end);
    if (res && typeof res.then === 'function') { res = await res; }
    if (typeof res === 'string') { return res; }
    if (res && typeof res.arrayBuffer === 'function') {
      var ab = await res.arrayBuffer();
      return decoder.decode(new Uint8Array(ab), { stream: !isLast });
    }
    if (res && typeof res.text === 'function') { return await res.text(); }
    if (res instanceof ArrayBuffer) { res = new Uint8Array(res); }
    if (typeof SharedArrayBuffer !== 'undefined' && res instanceof SharedArrayBuffer) { res = new Uint8Array(res); }
    if (res instanceof Uint8Array) { return decoder.decode(res, { stream: !isLast }); }
    throw iwError(CODE_BAD_SOURCE, 'source.slice(' + start + ',' + end + ') devolvio algo no interpretable');
  }

  // Indice de corte tras el ULTIMO terminador completo e inequivoco de s.
  // Un '\r' justo al final de la tajada es ambiguo (podria seguirle un '\n'
  // en la siguiente): NO se consume, queda en la espera. -1 = sin corte
  // (la linea sigue creciendo mas alla del tajo pedido: es el caso
  // "linea > sliceBytes -> crece el tajo hasta cerrar linea").
  function findSafeSplit(s) {
    for (var j = s.length - 1; j >= 0; j--) {
      var ch = s.charAt(j);
      if (ch === '\n') { return j + 1; }
      if (ch === '\r') {
        if (j === s.length - 1) { continue; } // ambiguo: seguir buscando antes
        return s.charAt(j + 1) === '\n' ? j + 2 : j + 1;
      }
    }
    return -1;
  }

  // AsyncGenerator que emite {line, lineNo} (lineNo 1-based, sobre lineas
  // crudas; se emiten tambien las vacias: quien las ignore es el consumidor).
  // Cede el loop entre tajadas, checa cancelacion y reporta onBytes.
  async function* sliceTextReader(source, opts) {
    opts = opts || {};
    if (!source || typeof source.slice !== 'function' || !isFinite(source.size) || source.size < 0) {
      throw iwError(CODE_BAD_SOURCE, 'source debe cumplir {size:number(bytes), slice(start,end)}');
    }
    var sliceBytes = Number(opts.sliceBytes);
    if (!isFinite(sliceBytes) || sliceBytes < 1) { sliceBytes = DEFAULT_SLICE_BYTES; }
    var isCanceled = typeof opts.isCanceled === 'function' ? opts.isCanceled : null;
    var onBytes = typeof opts.onBytes === 'function' ? opts.onBytes : null;

    var decoder = new TextDecoder('utf-8');
    var size = source.size;
    var pos = 0;
    var pending = '';      // texto de la linea en curso, sin terminador cerrado
    var lineNo = 0;
    var atStart = true;    // para quitar el BOM solo del primer caracter

    while (pos < size) {
      if (isCanceled && isCanceled()) {
        throw iwError(CODE_CANCELED, 'lectura cancelada a los ' + pos + ' bytes');
      }
      var end = Math.min(pos + sliceBytes, size);
      var isLast = end === size;
      var text = await readSliceText(source, pos, end, decoder, isLast);
      pos = end;

      if (atStart && text.charCodeAt(0) === 0xFEFF) { text = text.slice(1); }
      atStart = false;

      if (onBytes) { onBytes({ bytesDone: pos, bytesTotal: size }); }

      var s = pending + text;
      pending = '';
      // Nota UTF-16: si la tajada corta un par sustrogado, el high surrogate
      // suelto queda al final de `s`; como findSafeSplit solo corta DETRAS de
      // un terminador (ASCII), la pareja nunca se parte: el suelto pasa a
      // `pending` y se rearma con la siguiente tajada.

      if (isLast) {
        // EOF: emitir todo; si termino en terminador, el token vacio final
        // NO es una linea (mismo criterio que el pushRow condicional de csv.js).
        if (s !== '') {
          var toks = s.split(/\r\n|\n|\r/);
          if (toks.length > 1 && toks[toks.length - 1] === '') { toks.pop(); }
          for (var t = 0; t < toks.length; t++) {
            lineNo++;
            yield { line: toks[t], lineNo: lineNo };
          }
        }
        break;
      }

      var cut = findSafeSplit(s);
      if (cut < 0) {
        pending = s;       // ninguna linea cerrada: el tajo crece
        await yieldLoop(); // se cede el loop igualmente entre tajadas
        continue;
      }
      var complete = s.slice(0, cut);
      pending = s.slice(cut);
      var lines = complete.split(/\r\n|\n|\r/);
      lines.pop();         // complete siempre cierra en terminador: el '' final sobra
      for (var i = 0; i < lines.length; i++) {
        lineNo++;
        yield { line: lines[i], lineNo: lineNo };
      }
      await yieldLoop();
    }
  }

  // API publica pedida: AsyncIterable<string>. Expone ademas bytesState()
  // para que parseCsvIncremental pueda reportar bytesDone/bytesTotal.
  function readLines(source, opts) {
    opts = opts || {};
    var state = {
      bytesDone: 0,
      bytesTotal: source && isFinite(source.size) ? source.size : null
    };
    var gen = (async function* () {
      var reader = sliceTextReader(source, {
        sliceBytes: opts.sliceBytes,
        isCanceled: opts.isCanceled,
        onBytes: function (p) {
          state.bytesDone = p.bytesDone;
          state.bytesTotal = p.bytesTotal;
          if (typeof opts.onBytes === 'function') { opts.onBytes(p); }
        }
      });
      for await (var rec of reader) { yield rec.line; }
    })();
    return {
      [Symbol.asyncIterator]: function () { return gen; },
      bytesState: function () { return { bytesDone: state.bytesDone, bytesTotal: state.bytesTotal }; }
    };
  }

  // -----------------------------------------------------------------------
  // 2) parseCsvIncremental: maquina de estados identica a csv.js, en linea
  // -----------------------------------------------------------------------
  // Reglas heredadas (csv.js l.91-128): campo abre comilla SOLO si esta
  // vacio; "" dentro de comillas = literal; terminadores \r\n, \n, \r fuera
  // de comillas cierran fila; dentro de comillas el salto se conserva como
  // '\n' (unica divergencia documentada: csv.js conserva \r\n crudo dentro
  // de celdas multi-linea; aqui se normaliza a \n). Lineas crudas vacias se
  // saltan (csv.js emitia una fila [''] que validateRows ignoraba igual).
  // Diferencia extra: csv.parse descarta una ULTIMA fila '' tras terminador
  // final; este lector la emite (mas fiel al archivo).
  // Autodetect: se mira la PRIMERA linea no vacia (reutilizando
  // csv.detectDelimiter si esta exportado; si no, identico).
  function parseCsvIncremental(lineIterable, opts) {
    opts = opts || {};
    var quote = opts.quote === undefined ? '"' : String(opts.quote).charAt(0);
    var state = { lines: 0, rows: 0 };
    var warnings = [];
    var warned = { truncated: false };
    var out = { headers: null, stats: state, warnings: warnings };

    function warn(lineNo, message) {
      if (warnings.length < MAX_WARNINGS) { warnings.push('linea ' + lineNo + ': ' + message); }
      else if (!warned.truncated) {
        warned.truncated = true;
        warnings.push('demasiadas advertencias; las siguientes fueron omitidas');
      }
    }

    var gen = (async function* () {
      var delim = opts.delimiter ? String(opts.delimiter) : null;
      var wantHeader = opts.header !== false;
      var isCanceled = typeof opts.isCanceled === 'function' ? opts.isCanceled : null;
      var onProgress = typeof opts.onProgress === 'function' ? opts.onProgress : null;
      var blockSize = Number(opts.blockSize);
      if (!isFinite(blockSize) || blockSize < 1) { blockSize = DEFAULT_BLOCK_SIZE; }
      var getBytes = typeof lineIterable.bytesState === 'function' ? lineIterable.bytesState : null;
      function byteInfo() { return getBytes ? getBytes() : { bytesDone: null, bytesTotal: null }; }

      var field = '';
      var row = [];
      var inQuotes = false;
      var headers = null;
      var headersLen = 0;
      var sinceYield = 0;

      function emitRow(r, lineNo) {
        if (wantHeader && headers === null) {
          headers = r;
          out.headers = r;
          headersLen = r.length;
          return null;
        }
        if (headers !== null && r.length < headersLen) {
          warn(lineNo, 'fila con ' + r.length + ' columnas (esperaba ' + headersLen + '); se relleno con null');
          while (r.length < headersLen) { r.push(null); }
        }
        state.rows += 1;
        sinceYield += 1;
        return { row: r, lineNo: lineNo };
      }

      for await (var line of lineIterable) {
        state.lines += 1;
        var lineNo = state.lines;
        if (isCanceled && isCanceled()) {
          throw iwError(CODE_CANCELED, 'parse cancelado en la linea ' + lineNo + ' (' + state.rows + ' filas)');
        }
        if (!delim && line !== '') { delim = detectDelimiter(line); }

        // linea vacia con estado limpio: se salta (no es fila)
        if (line === '' && !inQuotes && row.length === 0 && field === '') { continue; }

        if (inQuotes) { field += '\n'; } // continuation de celda multi-linea

        var n = line.length;
        for (var i = 0; i < n; i++) {
          var ch = line.charAt(i);
          if (inQuotes) {
            if (ch === quote) {
              if (line.charAt(i + 1) === quote) { field += quote; i += 1; continue; }
              inQuotes = false;
              continue;
            }
            field += ch;
            continue;
          }
          if (ch === quote && field === '') { inQuotes = true; continue; }
          if (ch === delim) { row.push(field); field = ''; continue; }
          field += ch;
        }

        if (inQuotes) { continue; } // el terminador crudo esta DENTRO de la celda

        row.push(field);
        field = '';
        var finished = row;
        row = [];
        if (finished.length === 1 && finished[0] === '') { continue; } // fila vacia
        var rec = emitRow(finished, lineNo);
        if (rec) {
          yield rec;
          if (sinceYield >= blockSize) {
            sinceYield = 0;
            if (isCanceled && isCanceled()) {
              throw iwError(CODE_CANCELED, 'parse cancelado tras ' + state.rows + ' filas');
            }
            if (onProgress) {
              var b = byteInfo();
              onProgress({ lines: state.lines, rows: state.rows, bytesDone: b.bytesDone, bytesTotal: b.bytesTotal });
            }
            await yieldLoop();
          }
        }
      }

      // EOF: csv.js hace pushRow final si field!=='' || row.length>0 (ultima
      // linea sin terminador). Las lineas ya cerradas nunca dejan estado.
      if (field !== '' || row.length > 0) {
        row.push(field);
        field = '';
        var fin = row;
        row = [];
        var rec2 = emitRow(fin, state.lines);
        if (rec2) { yield rec2; }
      }
      if (onProgress) {
        var bf = byteInfo();
        onProgress({ lines: state.lines, rows: state.rows, bytesDone: bf.bytesDone, bytesTotal: bf.bytesTotal });
      }
    })();

    return {
      [Symbol.asyncIterator]: function () { return gen; },
      warnings: warnings,
      stats: state,
      get headers() { return out.headers; }
    };
  }

  // -----------------------------------------------------------------------
  // 3) mapBatches: lotes tolerantes, con cancelacion por flag y cesion entre
  //    lotes. Errores por lote NO abortan: se acumulan {batchIndex,error} y
  //    el resto continua. throwOnFatal=false por defecto.
  // -----------------------------------------------------------------------
  async function mapBatches(iterable, mapper, opts) {
    opts = opts || {};
    if (typeof mapper !== 'function') {
      throw iwError(CODE_BAD_SOURCE, 'mapBatches requiere un mapper funcion');
    }
    var batchSize = Number(opts.batchSize);
    if (!isFinite(batchSize) || batchSize < 1) { batchSize = 5000; }
    var isCanceled = typeof opts.isCanceled === 'function' ? opts.isCanceled : null;
    var onProgress = typeof opts.onProgress === 'function' ? opts.onProgress : null;
    var throwOnFatal = !!opts.throwOnFatal;

    var results = [];
    var errors = [];
    var stats = { processed: 0, errors: errors, canceled: false };
    var current = [];
    var batchIndex = 0;
    var sentinelSeen = false;

    async function runBatch(batch) {
      var firstError = null;
      for (var k = 0; k < batch.length; k++) {
        try {
          var v = await mapper(batch[k]);
          if (v === YieldSignal.CANCELED) { sentinelSeen = true; continue; }
          results.push(v);
          stats.processed += 1;
        } catch (e) {
          if (firstError === null) { firstError = e; }
        }
      }
      if (firstError !== null) {
        errors.push({ batchIndex: batchIndex, error: firstError });
        if (throwOnFatal) { throw firstError; }
      }
      batchIndex += 1;
    }

    // iterator manual para poder parar a mitad sin cerrar la fuente
    var it = typeof iterable[Symbol.asyncIterator] === 'function'
      ? iterable[Symbol.asyncIterator]()
      : iterable[Symbol.iterator]();

    for (;;) {
      if (isCanceled && isCanceled()) { stats.canceled = true; break; }
      var step = await it.next();
      if (step.done) { break; }
      current.push(step.value);
      if (current.length >= batchSize) {
        await runBatch(current);
        current = [];
        if (onProgress) { onProgress({ processed: stats.processed, batches: batchIndex, errors: errors.length }); }
        if (sentinelSeen || (isCanceled && isCanceled())) { stats.canceled = true; break; }
      }
    }
    if (current.length > 0) { await runBatch(current); }
    if (sentinelSeen && !stats.canceled) { stats.canceled = true; }
    if (onProgress) { onProgress({ processed: stats.processed, batches: batchIndex, errors: errors.length }); }
    return { results: results, stats: stats };
  }

  // -----------------------------------------------------------------------
  // 4) runGuarded: helper que ANTEPONE el chequeo de cancelacion a fn().
  //    Cancelado -> rechaza con error tipado (.code = CANCELED) sin ejecutar
  //    fn. Caso contrario devuelve el resultado (espera promesas).
  // -----------------------------------------------------------------------
  async function runGuarded(fn, opts) {
    opts = opts || {};
    if (typeof opts.isCanceled === 'function' && opts.isCanceled()) {
      throw iwError(CODE_CANCELED, 'operacion cancelada antes de ejecutar');
    }
    if (typeof fn !== 'function') {
      throw iwError(CODE_BAD_SOURCE, 'runGuarded requiere una funcion');
    }
    return await fn();
  }

  // -----------------------------------------------------------------------
  // API publica
  // -----------------------------------------------------------------------
  var YieldSignal = { CANCELED: CODE_CANCELED };

  return {
    CANCELED: CODE_CANCELED,
    BAD_SOURCE: CODE_BAD_SOURCE,
    YieldSignal: YieldSignal,
    sliceTextReader: sliceTextReader,
    readLines: readLines,
    parseCsvIncremental: parseCsvIncremental,
    mapBatches: mapBatches,
    runGuarded: runGuarded
  };
});
