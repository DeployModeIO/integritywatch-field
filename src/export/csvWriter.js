/* IntegrityWatch Field — export.csvWriter
    Escritor CSV espejo inverso del lector src/ingest/csv.js: cuoteo mínimo
    RFC-4180, BOM opcional y descarga en navegador. Sin DOM ni dependencias.

    Decisiones documentadas:
    - Separator decimal SIEMPRE punto (String() de JS), sin localizar nunca.
      Motivo: el default es delimiter ';' + BOM, que ambos Excel (es-ES, donde
      la coma es decimal, y en-US) abren bien; si el llamador pide delimiter
      ',' y abre el archivo en Excel es-ES, "1.5" puede leerse como texto o
      fecha — es límite conocido y preferimos salida determinista/round-trip
      (IW.ingest.csv.parse la relee tal cual) antes que formatos por locale.
    - BOM default true: sin él, Excel clásico interpreta CP1252 y tacha los
      acentos; IW.ingest.csv.parse NO quita el BOM (lo hace formats.js), así
      que el round-trip simétrico lo retira el consumidor si lo necesita.
    - Cuoteo MÍNIMO: solo se entrecomilla si el campo contiene el delimitador,
      comillas o \r/\n; las comillas internas se duplican (""). Un campo con
      ',' con delimiter ';' queda SIN comillas.
    - null/undefined → campo vacío; Date → toISOString(); NaN/Infinity viajan
      como el texto de String(); filas cortas NO se rellenan (se emiten tal
      cual, espejo de la tolerancia del lector).
    - Cada fila termina en lineEnd, incluida la última (csv.parse tolera el
      salto final sin inventar una fila vacía). */
(function (root, factory) {
  'use strict';
  var api = factory(root);
  root.IW = root.IW || {};
  root.IW.export = root.IW.export || {};
  root.IW.export.csvWriter = api;
  if (typeof module === 'object' && module.exports) { module.exports = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  var BOM = '\uFEFF';
  var DEFAULT_DELIM = ';';
  var DEFAULT_LINE_END = '\r\n';

  // Cell → string per the documented rules above.
  function formatCell(v) {
    if (v === null || v === undefined) { return ''; }
    if (v instanceof Date) { return isNaN(v.getTime()) ? '' : v.toISOString(); }
    return String(v); // numbers keep JS '.' decimal; booleans/strings pass through
  }

  // RFC-4180 minimal quoting: wrap only when the field carries the delimiter,
  // a double quote, or a CR/LF; embedded quotes are doubled.
  function quoteField(s, delim) {
    if (s.indexOf(delim) !== -1 || s.indexOf('"') !== -1 ||
        s.indexOf('\r') !== -1 || s.indexOf('\n') !== -1) {
      return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
  }

  // headers: array of cell values; rows: array of cell arrays. Returns the
  // whole CSV text (BOM prefix unless opts.bom === false).
  function toText(headers, rows, opts) {
    opts = opts || {};
    var delim = opts.delimiter === undefined ? DEFAULT_DELIM : String(opts.delimiter);
    var lineEnd = opts.lineEnd === undefined ? DEFAULT_LINE_END : String(opts.lineEnd);
    var bom = opts.bom === undefined ? true : !!opts.bom;

    var lines = [];
    function emitRow(cells) {
      lines.push((cells || []).map(function (v) {
        return quoteField(formatCell(v), delim);
      }).join(delim));
    }
    if (headers && headers.length) { emitRow(headers); }
    (rows || []).forEach(emitRow);

    if (!lines.length) { return bom ? BOM : ''; }
    var text = lines.join(lineEnd) + lineEnd;
    return bom ? BOM + text : text;
  }

  // Browser-only convenience: Blob + object URL + <a download> click.
  // Guarded so requiring this module under Node never touches document/Blob.
  // Returns true when the download was triggered, false when there is no DOM.
  function downloadText(filename, text, mime) {
    if (typeof document === 'undefined' || !document.createElement) { return false; }
    if (typeof Blob === 'undefined' || typeof URL === 'undefined' ||
        typeof URL.createObjectURL !== 'function') { return false; }
    var blob = new Blob([text], { type: mime || 'text/csv;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = String(filename || 'export.csv');
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 0);
    return true;
  }

  return {
    toText: toText,
    downloadText: downloadText,
    formatCell: formatCell
  };
});
