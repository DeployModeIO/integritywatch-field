/* IntegrityWatch Field — export.xlsxWriter
   Escritor XLSX (OOXML mínimo) desde cero, sin dependencias, sobre
   IW.export.zip. Espejo inverso del lector src/ingest/xlsx.js: el round-trip
   escritor→lector es la prueba dura de validez. API asíncrona sin DOM;
   errores tipados con código XLSXW_*. en err.code.

   Decisiones documentadas:
   - Cadenas como inlineStr (<c t="inlineStr"><is><t xml:space="preserve">…
     </t></is>): no existe xl/sharedStrings.xml ni deduplicación intermedia.
     Excel y openpyxl leen inlineStr sin problema.
   - Date se serializa a su string ISO y viaja como texto: sin formato de
     fecha ni series numéricas de Excel (simpleza; el lector nunca reportará
     dateColumns en libros escritos aquí).
   - Booleanos → celda NUMÉRICA 0/1. El valor literal true/false no sobrevive
     al round-trip por diseño: la celda no guarda el tipo booleano.
   - null/undefined → <c r="REF"/> (celda presente y vacía), incluso al final
     de la fila: así el lector reconstruye el ancho lógico exacto. Las celdas
     nulas FINALES de una fila se conservan; una fila vacía [] se emite con
     una celda A vacía (el lector la devuelve como [null]).
   - Fila 1 en negrita SOLO si boldHeader (default true; global en opts o por
     hoja): styles.xml mínimo con cellXfs de 2 entradas (0 normal, 1 negrita).
   - Límites por hoja: filas <= 1 048 576 (tope real de Excel) y columnas
     <= 16 384 (A..XFD). Opt-out documentado: opts.rowLimit = Infinity produce
     un archivo que Excel NO abrirá; úsalo solo para tests de estrés.
   - Nombres de hoja: se eliminan los caracteres prohibidos por Excel
     []:*?/\ y los de control, se recortan los extremos, y se trunca a 31
     caracteres. Nombre en blanco → "Hoja N" (N = sheetId). Duplicados tras
     sanitizar → XLSXW_BAD_INPUT.
   - Escapes: & < > como entidades XML; los caracteres de control XML-1.0
     inválidos (\x00-\x08, \x0B, \x0C, \x0E-\x1F, \x7F) como _xHHHH_ según
     ECMA-376 22.5; la secuencia literal "_xNNNN_" se protege escribiéndola
      "_x005F_xNNNN_". \t \n \r son legales y viajan literales.
      Verificado con openpyxl 3.1.5: NO re-hidrata _xHHHH_ (lo deja literal,
      igual que nuestro lector leniente); el escape sirve para que el XML
      siga siendo WELL-FORMED (control chars crudos lo romperían en cualquier
      parser estricto) y para no confundir secuencias literales.
   - Determinismo: se delega a zip.pack (sorted=true, epoch DOS fijo);
     mismas entradas → mismos bytes.
   - opts.startId (default 1): sheetIds startId..startId+N-1. ids de hoja
     1..N es el default; al fusionar partes de varios libros generados aquí,
     arranca cada uno donde no colisione. */
(function (root, factory) {
  'use strict';
  var api = factory(root);
  root.IW = root.IW || {};
  root.IW.export = root.IW.export || {};
  root.IW.export.xlsxWriter = api;
  if (typeof module === 'object' && module.exports) { module.exports = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  // Codigos de error tipados: siempre viajan en err.code.
  var CODE_BAD_INPUT = 'XLSXW_BAD_INPUT';
  var CODE_NO_ZIP = 'XLSXW_NO_ZIP';

  var MAX_ROWS = 1048576;      // tope real de filas por hoja (Excel)
  var MAX_COLS = 16384;        // tope real de columnas por hoja (A..XFD)
  var MAX_SHEET_NAME = 31;     // tope de caracteres del nombre de hoja
  var FORBIDDEN_NAME = /[\[\]:*?\/\\]/g; // caracteres que Excel prohíbe
  // Controladores XML-1.0 inválidos + \x7F; NO incluye \t \n \r (legales).
  var ILLEGAL_XML = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g;
  // Secuencia literal que imita un escape OOXML: debe protegerse.
  var ESCAPE_LOOKALIKE = /_x([0-9A-Fa-f]{4})_/g;

  function iwError(code, message) {
    var e = new Error(message);
    e.code = code;
    return e;
  }

  // ---------------------------------------------------------------------
  // Escapes
  // ---------------------------------------------------------------------

  function toHex4(code) {
    return '_x' + code.toString(16).toUpperCase().padStart(4, '0') + '_';
  }

  // Texto -> contenido XML de <t>: primero protege lookalikes _xHHHH_, luego
  // escapa control chars inválidos, y al final las entidades & < >.
  // String.replace con /g NO re-examina el reemplazo, así el "_x005F_"
  // generado no se protege a sí mismo en bucle.
  function escapeText(s) {
    return String(s)
      .replace(ESCAPE_LOOKALIKE, '_x005F_x$1_')
      .replace(ILLEGAL_XML, function (ch) { return toHex4(ch.charCodeAt(0)); })
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  // Atributo XML: además " y ' como entidades.
  function escapeAttr(s) {
    return escapeText(s)
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  // ---------------------------------------------------------------------
  // Referencias de celda
  // ---------------------------------------------------------------------

  // 0 -> 'A', 25 -> 'Z', 26 -> 'AA', 16383 -> 'XFD'.
  function colLetter(idx) {
    var s = '';
    var n = idx + 1;
    while (n > 0) {
      var r = (n - 1) % 26;
      s = String.fromCharCode(65 + r) + s;
      n = Math.floor((n - r - 1) / 26);
    }
    return s;
  }

  // ---------------------------------------------------------------------
  // Normalización y validación de entrada
  // ---------------------------------------------------------------------

  function sanitizeSheetName(name, fallback) {
    var out = String(name)
      .replace(FORBIDDEN_NAME, '')
      .replace(ILLEGAL_XML, '')
      .trim()
      .slice(0, MAX_SHEET_NAME);
    return out === '' ? fallback : out;
  }

  // any -> number | string | null (null = celda vacía). Lanza XLSXW_BAD_INPUT.
  function normalizeCell(v, where) {
    if (v === null || v === undefined) { return null; }
    var t = typeof v;
    if (t === 'number') {
      if (!isFinite(v)) { throw iwError(CODE_BAD_INPUT, where + ': número no finito (' + v + ')'); }
      return v;
    }
    if (t === 'boolean') { return v ? 1 : 0; } // doc: 0/1 numérico
    if (t === 'string') { return v; }
    if (v instanceof Date) {
      if (!isFinite(v.getTime())) { throw iwError(CODE_BAD_INPUT, where + ': Date inválida'); }
      return v.toISOString(); // simpleza: ISO string, sin formato de fecha
    }
    if (t === 'object' && typeof v.toISOString === 'function') {
      return String(v.toISOString()); // objetos tipo Temporal/epoch-date
    }
    throw iwError(CODE_BAD_INPUT, where + ': tipo de celda no soportado (' + t + ')');
  }

  // sheets + opts -> lista interna validada; lanza XLSXW_BAD_INPUT.
  function prepare(sheets, opts) {
    if (!Array.isArray(sheets) || sheets.length === 0) {
      throw iwError(CODE_BAD_INPUT, 'sheets debe ser un array no vacío de {name, rows}');
    }
    var boldDefault = !(opts && opts.boldHeader === false);
    var startId = (opts && opts.startId !== undefined) ? opts.startId : 1;
    if (typeof startId !== 'number' || !isFinite(startId) || Math.floor(startId) !== startId || startId < 1 || startId > MAX_ROWS) {
      throw iwError(CODE_BAD_INPUT, 'opts.startId debe ser entero >= 1 (sheetIds 1..N por defecto)');
    }
    var rowLimit = opts && opts.rowLimit !== undefined ? opts.rowLimit : MAX_ROWS;
    if (rowLimit !== Infinity && !(typeof rowLimit === 'number' && isFinite(rowLimit) && rowLimit >= 1)) {
      throw iwError(CODE_BAD_INPUT, 'opts.rowLimit debe ser un entero >= 1 o Infinity (opt-out)');
    }
    var colLimit = opts && opts.colLimit !== undefined ? opts.colLimit : MAX_COLS;
    if (!(typeof colLimit === 'number' && isFinite(colLimit) && colLimit >= 1)) {
      throw iwError(CODE_BAD_INPUT, 'opts.colLimit debe ser un entero >= 1');
    }
    if (colLimit > MAX_COLS) { colLimit = MAX_COLS; } // Excel no admite más

    var seen = Object.create(null);
    var out = [];
    for (var i = 0; i < sheets.length; i++) {
      var sh = sheets[i];
      var tag = 'sheets[' + i + ']';
      if (!sh || !Array.isArray(sh.rows)) {
        throw iwError(CODE_BAD_INPUT, tag + '.rows debe ser un array de filas');
      }
      if (sh.rows.length > rowLimit) {
        throw iwError(CODE_BAD_INPUT, tag + ': ' + sh.rows.length + ' filas superan el límite ' + rowLimit +
          ' por hoja (tope Excel: ' + MAX_ROWS + '; opt-out: rowLimit: Infinity, no recomendado)');
      }
      var id = startId + i;
      var name = sanitizeSheetName(sh.name === undefined || sh.name === null ? '' : sh.name, 'Hoja ' + id);
      if (seen[name]) {
        throw iwError(CODE_BAD_INPUT, 'nombres de hoja duplicados tras sanitizar: "' + name + '" (' + seen[name] + ' y ' + tag + ')');
      }
      seen[name] = tag;

      var widths = null;
      if (sh.colWidths !== undefined && sh.colWidths !== null) {
        if (!Array.isArray(sh.colWidths)) { throw iwError(CODE_BAD_INPUT, tag + '.colWidths debe ser un array de números'); }
        widths = sh.colWidths.map(function (w, j) {
          if (typeof w !== 'number' || !isFinite(w) || w < 0 || w > 255) {
            throw iwError(CODE_BAD_INPUT, tag + '.colWidths[' + j + '] debe ser número 0..255 (ancho de columna Excel)');
          }
          return w;
        });
      }

      var rows = [];
      var maxCols = 0;
      for (var r = 0; r < sh.rows.length; r++) {
        var src = sh.rows[r];
        if (!Array.isArray(src)) { throw iwError(CODE_BAD_INPUT, tag + '.rows[' + r + '] debe ser un array'); }
        if (src.length > colLimit) {
          throw iwError(CODE_BAD_INPUT, tag + '.rows[' + r + ']: ' + src.length + ' columnas superan el límite ' + colLimit + ' (tope Excel: ' + MAX_COLS + ')');
        }
        var cells = new Array(src.length);
        for (var c = 0; c < src.length; c++) {
          cells[c] = normalizeCell(src[c], tag + '.rows[' + r + '][' + c + ']');
        }
        if (src.length > maxCols) { maxCols = src.length; }
        rows.push(cells);
      }
      out.push({
        id: id,
        name: name,
        rows: rows,
        maxCols: Math.max(maxCols, widths ? widths.length : 0),
        widths: widths,
        boldHeader: sh.boldHeader !== undefined ? !!sh.boldHeader : boldDefault
      });
    }
    return out;
  }

  // ---------------------------------------------------------------------
  // Construcción de partes XML
  // ---------------------------------------------------------------------

  var NS_WS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
  var NS_REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  var XML_DECL = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';

  function cellXml(ref, v, bold) {
    var sAttr = bold ? ' s="1"' : '';
    if (v === null) { return '<c r="' + ref + '"' + sAttr + '/>'; }
    if (typeof v === 'number') {
      // -0 preserva su signo literal (String(-0) sería '0' y perderíamos el
      // round-trip estricto: Number('-0') devuelve -0).
      var num = Object.is(v, -0) ? '-0' : String(v);
      return '<c r="' + ref + '"' + sAttr + '><v>' + num + '</v></c>';
    }
    return '<c r="' + ref + '"' + sAttr + ' t="inlineStr"><is><t xml:space="preserve">' + escapeText(v) + '</t></is></c>';
  }

  // <cols>: fusiona columnas consecutivas con el mismo ancho.
  function colsXml(widths, count) {
    if (!widths || widths.length === 0) { return ''; }
    var n = Math.min(widths.length, count);
    var parts = ['<cols>'];
    var start = 0;
    for (var i = 1; i <= n; i++) {
      if (i === n || widths[i] !== widths[start]) {
        parts.push('<col min="' + (start + 1) + '" max="' + i + '" width="' + widths[start] + '" customWidth="1"/>');
        start = i;
      }
    }
    parts.push('</cols>');
    return parts.join('');
  }

  function sheetXml(sheet) {
    var rows = sheet.rows;
    var dim = rows.length === 0
      ? 'A1:A1'
      : 'A1:' + colLetter(Math.max(sheet.maxCols, 1) - 1) + rows.length;
    var out = [XML_DECL,
      '<worksheet xmlns="' + NS_WS + '">',
      '<dimension ref="' + dim + '"/>'];
    var cols = colsXml(sheet.widths, Math.max(sheet.maxCols, 1));
    if (cols) { out.push(cols); }
    if (rows.length === 0) {
      out.push('<sheetData/>');
    } else {
      out.push('<sheetData>');
      for (var r = 0; r < rows.length; r++) {
        var cells = rows[r];
        var bold = sheet.boldHeader && r === 0;
        out.push('<row r="' + (r + 1) + '">');
        if (cells.length === 0) {
          out.push(cellXml('A' + (r + 1), null, bold)); // doc: [] -> [null]
        } else {
          for (var c = 0; c < cells.length; c++) {
            out.push(cellXml(colLetter(c) + (r + 1), cells[c], bold));
          }
        }
        out.push('</row>');
      }
      out.push('</sheetData>');
    }
    out.push('</worksheet>');
    return out.join('');
  }

  function contentTypesXml(sheetCount) {
    var parts = [XML_DECL,
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">',
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>',
      '<Default Extension="xml" ContentType="application/xml"/>',
      '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>',
      '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'];
    for (var i = 1; i <= sheetCount; i++) {
      parts.push('<Override PartName="/xl/worksheets/sheet' + i + '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>');
    }
    parts.push('</Types>');
    return parts.join('');
  }

  function rootRelsXml() {
    return XML_DECL +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
      '</Relationships>';
  }

  function workbookRelsXml(sheetCount) {
    var parts = [XML_DECL,
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'];
    for (var i = 1; i <= sheetCount; i++) {
      parts.push('<Relationship Id="rId' + i + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' + i + '.xml"/>');
    }
    parts.push('<Relationship Id="rId' + (sheetCount + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>');
    parts.push('</Relationships>');
    return parts.join('');
  }

  function workbookXml(sheets) {
    var parts = [XML_DECL,
      '<workbook xmlns="' + NS_WS + '" xmlns:r="' + NS_REL + '">',
      '<sheets>'];
    for (var i = 0; i < sheets.length; i++) {
      parts.push('<sheet name="' + escapeAttr(sheets[i].name) + '" sheetId="' + sheets[i].id + '" r:id="rId' + (i + 1) + '"/>');
    }
    parts.push('</sheets>');
    parts.push('</workbook>');
    return parts.join('');
  }

  // cellXfs con 2 entradas SIEMPRE (0 normal, 1 negrita): uniformidad y
  // compatibilidad con Excel (fill none + gray125 es la convención mínima).
  function stylesXml() {
    return XML_DECL +
      '<styleSheet xmlns="' + NS_WS + '">' +
      '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>' +
      '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>' +
      '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
      '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
      '<cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs>' +
      '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
      '</styleSheet>';
  }

  // ---------------------------------------------------------------------
  // API pública
  // ---------------------------------------------------------------------

  // build(sheets, opts) -> Promise<Uint8Array>
  //   sheets: [{name, rows: [[...]], colWidths?: [n], boldHeader?: bool}]
  //   opts:   {boldHeader?: bool (default true), startId?: int (default 1),
  //            rowLimit?: int|Infinity (default 1048576), colLimit?: int,
  //            method?: 'deflate'|'store', date?: Date}
  // Tipos fila (doc): number -> c numérica; string/Date -> inlineStr (Date
  // como su ISO string); boolean -> 0/1 numérico; null/undefined -> vacía.
  function build(sheets, opts) {
    var prepared;
    try {
      var zipMod = root.IW && root.IW.export && root.IW.export.zip;
      if (!zipMod || typeof zipMod.pack !== 'function') {
        throw iwError(CODE_NO_ZIP, 'IW.export.zip no está cargado: incluye src/export/zip.js antes de xlsxWriter.js');
      }
      prepared = prepare(sheets, opts || {});
      var files = [];
      files.push({ name: '[Content_Types].xml', data: contentTypesXml(prepared.length) });
      files.push({ name: '_rels/.rels', data: rootRelsXml() });
      files.push({ name: 'xl/workbook.xml', data: workbookXml(prepared) });
      files.push({ name: 'xl/_rels/workbook.xml.rels', data: workbookRelsXml(prepared.length) });
      files.push({ name: 'xl/styles.xml', data: stylesXml() });
      for (var i = 0; i < prepared.length; i++) {
        files.push({ name: 'xl/worksheets/sheet' + (i + 1) + '.xml', data: sheetXml(prepared[i]) });
      }
      var zopts = { method: (opts && opts.method) || 'deflate', sorted: true };
      if (opts && opts.date !== undefined) { zopts.date = opts.date; }
      return zipMod.pack(files, zopts);
    } catch (e) {
      return Promise.reject(e);
    }
  }

  // buildFromTable({headers, rows, name?}, opts): conveniencia mono-hoja.
  function buildFromTable(table, opts) {
    if (!table || !Array.isArray(table.headers) || !Array.isArray(table.rows)) {
      return Promise.reject(iwError(CODE_BAD_INPUT, 'table debe ser {headers: [], rows: [[]], name?}'));
    }
    var name = table.name === undefined || table.name === null ? 'Tabla' : table.name;
    var all = [table.headers.slice()].concat(table.rows);
    return build([{ name: name, rows: all }], opts);
  }

  return {
    BAD_INPUT: CODE_BAD_INPUT,
    NO_ZIP: CODE_NO_ZIP,
    MAX_ROWS: MAX_ROWS,
    MAX_COLS: MAX_COLS,
    build: build,
    buildFromTable: buildFromTable
  };
});
