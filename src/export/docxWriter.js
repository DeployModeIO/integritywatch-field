/* IntegrityWatch Field — export.docxWriter
   Escritor DOCX (OOXML ECMA-376 parte 1) desde cero sobre IW.export.zip, sin
   dependencias ni DOM. Errores tipados con codigo DOCXW_* en err.code.

   Decisiones documentadas:
   - Determinismo byte a byte (mismo contrato que export.zip): si doc.meta.date
     se omite o no es una fecha ISO valida, se usa el epoch FIJO
     2026-01-01T00:00:00Z; el zip interior se empaqueta con la fecha por defecto
     fija de zip.pack. Dos builds del mismo documento producen los mismos bytes.
   - Escape XML estricto en TODOS los textos: & < > " ' van como entidades;
     los caracteres de control de C0 (0x00-0x08, 0x0B, 0x0C, 0x0E-0x1F) y 0x7F
     se ELIMINAN: no tienen representacion valida en XML 1.0 y Word rechaza el
     archivo si viajan crudos. En los bloques 'p', cada \n (o \r\n) SEPARA un
     parrafo nuevo; en el resto de textos (titulos, celdas, items) los saltos
     se colapsan a un espacio — una celda multi-parrafo por linea \n distorsiona
     el tamano de la tabla.
   - Numeros: se serializan con String(v) SIN formato de localizacion (la pila
     i18n es de UI; el exportador no debe depender del locale de la maquina).
     null/undefined -> cadena vacia en celdas y KPIs (un guapo em-dash '—'
     falsificaria 'dato presente'; el vacio es honesto en Word).
   - Listas: numId 1 = vinetas y numId 2 = decimal, definidas en un
     word/numbering.xml propio (glifos literales '• ' no serian listas reales
     para Word). El paquete lleva 9 partes: las 7 minimas historicamente
     citadas mas word/settings.xml y word/numbering.xml.
   - A4 con margenes estandar de Word (1440 twips = 2.54 cm); ancho util
     9026 twips para repartir opts widths pct de las tablas. */
(function (root, factory) {
  'use strict';
  var api = factory(root);
  root.IW = root.IW || {};
  root.IW.export = root.IW.export || {};
  root.IW.export.docxWriter = api;
  if (typeof module === 'object' && module.exports) { module.exports = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  // El escritor ZIP hermano se carga al requirear este modulo en Node (en el
  // navegador basta el orden de scripts de index.html). Acceso perezoso como
  // en src/ingest/csv.js: la dependencia se resuelve al llamar, no al cargar.
  if (typeof require === 'function' && !(root.IW && root.IW.export && root.IW.export.zip)) {
    try { require('./zip.js'); } catch (e) { /* ignorado: falla al llamar */ }
  }
  function zipApi() { return root.IW && root.IW.export && root.IW.export.zip; }

  var CODE_BAD_INPUT = 'DOCXW_BAD_INPUT';

  var EPOCH_ISO = '2026-01-01T00:00:00Z';
  // A4 en twips: 210x297 mm; margenes Word 25.4 mm; header/footer 12.7 mm.
  var PG_W = 11906;
  var PG_H = 16838;
  var MARGIN = 1440;
  var AVAIL_DXA = PG_W - 2 * MARGIN; // 9026 twips de caja util para tablas
  var HEADER_FILL = 'F2F2F2';        // gris claro fila de encabezado
  var BORDER_COLOR = 'BFBFBF';       // borde simple discreto
  // Colores de encabezado Word "dark blue, quiet" (nada estridente).
  var H_COLORS = { Heading1: '1F3864', Heading2: '2F5496', Heading3: '4472C4' };
  var CHART_PLACEHOLDER = '[gráfico no exportado a Word]';

  function docxError(message) {
    var e = new Error(message);
    e.code = CODE_BAD_INPUT;
    return e;
  }

  // ------------------------------------------------------------------
  // Textos: control chars fuera, escape estricto despues.
  // ------------------------------------------------------------------

  var CTRL_RE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

  function esc(v) {
    var s = (v === null || v === undefined) ? '' : String(v);
    s = s.replace(CTRL_RE, '');
    return s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  // Texto plano de bloque no-'p': saltos de linea colapsados a espacio.
  function line(v) {
    var s = (v === null || v === undefined) ? '' : String(v);
    return s.replace(/\r\n|\r|\n/g, ' ');
  }

  function plain(v) {
    if (v === null || v === undefined) { return ''; }
    if (typeof v === 'number' && !isFinite(v)) { return ''; }
    return line(v);
  }

  // ------------------------------------------------------------------
  // Piezas de OOXML
  // ------------------------------------------------------------------

  var XML_DECL = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
  var NS_W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
  var NS_R = 'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';

  function runXml(text, opts) {
    opts = opts || {};
    var rpr = '';
    if (opts.bold) { rpr += '<w:b/>'; }
    if (opts.italic) { rpr += '<w:i/>'; }
    if (opts.small) { rpr += '<w:sz w:val="16"/><w:szCs w:val="16"/>'; }
    var out = '<w:r>';
    if (rpr) { out += '<w:rPr>' + rpr + '</w:rPr>'; }
    // w:t SIEMPRE (incluso vacio): los lectores normalizan y el test de celda
    // null lo usa como evidencia; xml:space preserva espacios significativos.
    out += '<w:t xml:space="preserve">' + esc(text) + '</w:t>';
    return out + '</w:r>';
  }

  // Un parrafo con un solo run de texto; rPrOpts va al run.
  function para(text, pPr, rPrOpts) {
    return '<w:p>' + (pPr || '') + runXml(plain(text), rPrOpts) + '</w:p>';
  }

  function heading(level, text) {
    return para(text, '<w:pPr><w:pStyle w:val="Heading' + level + '"/></w:pPr>');
  }

  function splitParas(text, pPr, rPrOpts) {
    var s = (text === null || text === undefined) ? '' : String(text);
    var lines = s.split(/\r\n|\r|\n/);
    var out = '';
    for (var i = 0; i < lines.length; i++) { out += para(lines[i], pPr, rPrOpts); }
    return out;
  }

  function pageBreakXml() {
    return '<w:p><w:r><w:br w:type="page"/></w:r></w:p>';
  }

  function listBlock(items, ordered) {
    var pPr = '<w:pPr><w:pStyle w:val="ListParagraph"/><w:numPr><w:ilvl w:val="0"/>' +
      '<w:numId w:val="' + (ordered ? 2 : 1) + '"/></w:numPr></w:pPr>';
    var out = '';
    for (var i = 0; i < items.length; i++) { out += para(items[i], pPr); }
    return out;
  }

  // Bordes simples por tabla (la clase TableGrid replica el mismo dibujo para
  // los lectores que aplican estilos). widths: porcentajes opcionales.
  var TBL_BORDERS = '<w:tblBorders>' +
    ['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map(function (side) {
      return '<w:' + side + ' w:val="single" w:sz="4" w:space="0" w:color="' + BORDER_COLOR + '"/>';
    }).join('') + '</w:tblBorders>';

  function cellDxa(widths, idx) {
    if (!widths || idx >= widths.length) { return null; }
    return Math.round((Number(widths[idx]) || 0) / 100 * AVAIL_DXA);
  }

  // headers=[] omite fila de encabezado (tablas clave-valor del renderer).
  function tableXml(headers, rows, widths) {
    var cols = Math.max(headers.length, rows.reduce(function (m, r) { return Math.max(m, (r || []).length); }, 0));
    if (cols === 0) { cols = 1; }
    var out = '<w:tbl><w:tblPr><w:tblStyle w:val="TableGrid"/>';
    if (widths) {
      var sum = 0;
      for (var w = 0; w < cols; w++) { sum += cellDxa(widths, w) || 0; }
      out += '<w:tblW w:w="' + sum + '" w:type="dxa"/>';
    } else {
      out += '<w:tblW w:w="0" w:type="auto"/>';
    }
    out += TBL_BORDERS;
    if (widths) { out += '<w:tblLayout w:type="fixed"/>'; }
    out += '</w:tblPr><w:tblGrid>';
    for (var g = 0; g < cols; g++) {
      var d = cellDxa(widths, g);
      out += d ? '<w:gridCol w:w="' + d + '"/>' : '<w:gridCol/>';
    }
    out += '</w:tblGrid>';

    function cell(text, isHeader, colIdx) {
      var tcPr = '<w:tcPr>';
      var dxa = cellDxa(widths, colIdx);
      if (dxa) { tcPr += '<w:tcW w:w="' + dxa + '" w:type="dxa"/>'; }
      if (isHeader) { tcPr += '<w:shd w:val="clear" w:color="auto" w:fill="' + HEADER_FILL + '"/>'; }
      tcPr += '</w:tcPr>';
      return '<w:tc>' + tcPr +
        para(text, '<w:pPr><w:spacing w:after="0"/></w:pPr>', isHeader ? { bold: true } : null) +
        '</w:tc>';
    }

    if (headers.length > 0) {
      out += '<w:tr><w:trPr><w:tblHeader/></w:trPr>';
      for (var h = 0; h < cols; h++) { out += cell(h < headers.length ? headers[h] : '', true, h); }
      out += '</w:tr>';
    }
    for (var r = 0; r < rows.length; r++) {
      var row = rows[r] || [];
      out += '<w:tr>';
      for (var c = 0; c < cols; c++) { out += cell(row[c], false, c); }
      out += '</w:tr>';
    }
    return out + '</w:tbl><w:p/>'; // parrafo vacio: Word exige tras cada w:tbl
  }

  // Ficha KPI: tabla compacta 2 columnas; columna 1 = etiqueta en negrita y
  // sombreada (estilo ficha), columna 2 = valor. widths fijas [40, 60].
  function kpiXml(items) {
    var widths = [40, 60];
    var dxa0 = cellDxa(widths, 0);
    var dxa1 = cellDxa(widths, 1);
    function kcell(text, shaded, bold) {
      var tcPr = '<w:tcPr><w:tcW w:w="' + (shaded ? dxa0 : dxa1) + '" w:type="dxa"/>';
      if (shaded) { tcPr += '<w:shd w:val="clear" w:color="auto" w:fill="' + HEADER_FILL + '"/>'; }
      tcPr += '</w:tcPr>';
      return '<w:tc>' + tcPr + para(text, '<w:pPr><w:spacing w:after="0"/></w:pPr>', bold ? { bold: true } : null) + '</w:tc>';
    }
    var out = '<w:tbl><w:tblPr><w:tblStyle w:val="TableGrid"/>' +
      '<w:tblW w:w="' + (dxa0 + dxa1) + '" w:type="dxa"/>' + TBL_BORDERS +
      '<w:tblLayout w:type="fixed"/></w:tblPr>' +
      '<w:tblGrid><w:gridCol w:w="' + dxa0 + '"/><w:gridCol w:w="' + dxa1 + '"/></w:tblGrid>';
    for (var i = 0; i < items.length; i++) {
      var it = items[i] || {};
      var value = (it.value === null || it.value === undefined) ? '' : String(it.value);
      out += '<w:tr>' + kcell(it.label, true, true) + kcell(value, false, false) + '</w:tr>';
    }
    return out + '</w:tbl><w:p/>';
  }

  // ------------------------------------------------------------------
  // Bloques del documento
  // ------------------------------------------------------------------

  function blockXml(block, idx) {
    if (!block || typeof block !== 'object') { throw docxError('blocks[' + idx + '] debe ser un objeto'); }
    switch (block.type) {
      case 'h1': case 'h2': case 'h3':
        return heading(Number(block.type.charAt(1)), block.text);
      case 'p':
        return splitParas(block.text, '', { bold: !!block.bold, italic: !!block.italic, small: !!block.small });
      case 'table': {
        if (!Array.isArray(block.headers)) { throw docxError('blocks[' + idx + '].headers debe ser array'); }
        if (!Array.isArray(block.rows)) { throw docxError('blocks[' + idx + '].rows debe ser array'); }
        if (block.widths !== undefined && block.widths !== null && !Array.isArray(block.widths)) {
          throw docxError('blocks[' + idx + '].widths debe ser array de porcentajes');
        }
        return tableXml(block.headers, block.rows, block.widths || null);
      }
      case 'list': {
        if (!Array.isArray(block.items)) { throw docxError('blocks[' + idx + '].items debe ser array'); }
        return listBlock(block.items, !!block.ordered);
      }
      case 'pagebreak':
        return pageBreakXml();
      case 'kpi': {
        if (!Array.isArray(block.items)) { throw docxError('blocks[' + idx + '].items debe ser array'); }
        return kpiXml(block.items);
      }
      default:
        throw docxError('bloque ' + idx + ' con tipo desconocido "' + String(block.type) + '"');
    }
  }

  // ------------------------------------------------------------------
  // Partes estaticas del paquete
  // ------------------------------------------------------------------

  function contentTypesXml() {
    return XML_DECL +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
      '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>' +
      '<Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/>' +
      '<Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>' +
      '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>' +
      '<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>' +
      '</Types>';
  }

  function rootRelsXml() {
    var R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
    return XML_DECL +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="' + R + '/officeDocument" Target="word/document.xml"/>' +
      '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>' +
      '<Relationship Id="rId3" Type="' + R + '/extended-properties" Target="docProps/app.xml"/>' +
      '</Relationships>';
  }

  function documentRelsXml() {
    var R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
    return XML_DECL +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="' + R + '/styles" Target="styles.xml"/>' +
      '<Relationship Id="rId2" Type="' + R + '/settings" Target="settings.xml"/>' +
      '<Relationship Id="rId3" Type="' + R + '/numbering" Target="numbering.xml"/>' +
      '</Relationships>';
  }

  function stylesXml() {
    function headingStyle(id, sz, before) {
      return '<w:style w:type="paragraph" w:styleId="' + id + '">' +
        '<w:name w:val="' + id.replace('Heading', 'Heading ') + '"/>' +
        '<w:basedOn w:val="Normal"/><w:next w:val="Normal"/>' +
        '<w:pPr><w:keepNext/><w:spacing w:before="' + before + '" w:after="120" w:line="259" w:lineRule="auto"/>' +
        '<w:outlineLvl w:val="' + (Number(id.charAt(7)) - 1) + '"/></w:pPr>' +
        '<w:rPr><w:b/><w:color w:val="' + H_COLORS[id] + '"/><w:sz w:val="' + sz + '"/><w:szCs w:val="' + sz + '"/></w:rPr>' +
        '</w:style>';
    }
    return XML_DECL +
      '<w:styles ' + NS_W + '>' +
      '<w:docDefaults><w:rPrDefault><w:rPr>' +
      '<w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:eastAsia="MS Mincho" w:cs="Tahoma"/>' +
      '<w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr></w:rPrDefault></w:docDefaults>' +
      '<w:style w:type="paragraph" w:default="on" w:styleId="Normal">' +
      '<w:name w:val="Normal"/><w:pPr><w:spacing w:after="120" w:line="259" w:lineRule="auto"/></w:pPr></w:style>' +
      headingStyle('Heading1', '32', '240') +
      headingStyle('Heading2', '28', '200') +
      headingStyle('Heading3', '24', '160') +
      '<w:style w:type="paragraph" w:styleId="ListParagraph">' +
      '<w:name w:val="List Paragraph"/><w:basedOn w:val="Normal"/>' +
      '<w:pPr><w:ind w:left="360" w:hanging="0"/><w:contextualSpacing/></w:pPr></w:style>' +
      '<w:style w:type="table" w:default="on" w:styleId="TableGrid">' +
      '<w:name w:val="Table Grid"/>' +
      '<w:tblPr><w:tblBorders>' +
      ['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map(function (side) {
        return '<w:' + side + ' w:val="single" w:sz="4" w:space="0" w:color="' + BORDER_COLOR + '"/>';
      }).join('') +
      '</w:tblBorders></w:tblPr></w:style>' +
      '</w:styles>';
  }

  function settingsXml() {
    // Ajustes minimos; Word tolera el elemento raiz casi vacio.
    return XML_DECL +
      '<w:settings ' + NS_W + '><w:zoom w:percent="100"/><w:defaultTabStop w:val="720"/></w:settings>';
  }

  function numberingXml() {
    var lvl = function (numFmt, lvlText, ind) {
      return '<w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="' + numFmt + '"/>' +
        '<w:lvlText w:val="' + lvlText + '"/><w:lvlJc w:val="left"/>' +
        '<w:pPr><w:ind w:left="360" w:hanging="360"/></w:pPr></w:lvl>';
    };
    return XML_DECL +
      '<w:numbering ' + NS_W + '>' +
      '<w:abstractNum w:abstractNumId="0"><w:multiLevelType w:val="singleLevel"/>' +
      '<w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val=""/><w:lvlJc w:val="left"/>' +
      '<w:pPr><w:ind w:left="360" w:hanging="360"/></w:pPr>' +
      '<w:rPr><w:rFonts w:ascii="Symbol" w:hAnsi="Symbol" w:hint="default"/></w:rPr></w:lvl></w:abstractNum>' +
      '<w:abstractNum w:abstractNumId="1"><w:multiLevelType w:val="singleLevel"/>' +
      lvl('decimal', '%1.', 360) + '</w:abstractNum>' +
      '<w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>' +
      '<w:num w:numId="2"><w:abstractNumId w:val="1"/></w:num>' +
      '</w:numbering>';
  }

  // Fecha canonical W3CDTF para core.xml: Date o ISO con/naive-offset -> 'Z';
  // cualquier otra cosa cae al epoch fijo (determinismo).
  function normIso(v) {
    if (v === null || v === undefined) { return EPOCH_ISO; }
    if (v instanceof Date) {
      return isFinite(v.getTime()) ? v.toISOString() : EPOCH_ISO;
    }
    if (typeof v === 'string') {
      var m = v.match(/^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}:\d{2})(?::(\d{2}))?(?:\.\d+)?(Z|[+-]\d{2}:?\d{2})?)?$/);
      if (m) {
        var time = (m[2] || '00:00') + (m[3] ? ':' + m[3] : ':00');
        var tz = m[4] || 'Z';
        return m[1] + 'T' + time + (tz === 'Z' ? 'Z' : tz.replace(' ', ''));
      }
    }
    return EPOCH_ISO;
  }

  function coreXml(meta, title) {
    var XSI = 'http://www.w3.org/2001/XMLSchema-instance';
    var out = XML_DECL +
      '<cp:coreProperties ' +
      'xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" ' +
      'xmlns:dc="http://purl.org/dc/elements/1.1/" ' +
      'xmlns:dcterms="http://purl.org/dc/terms/" ' +
      'xmlns:xsi="' + XSI + '">';
    if (title) { out += '<dc:title>' + esc(title) + '</dc:title>'; }
    if (meta.author) { out += '<dc:creator>' + esc(meta.author) + '</dc:creator>'; }
    out += '<dcterms:created xsi:type="dcterms:W3CDTF">' + meta.date + '</dcterms:created>';
    out += '<dcterms:modified xsi:type="dcterms:W3CDTF">' + meta.date + '</dcterms:modified>';
    if (meta.author) { out += '<cp:lastModifiedBy>' + esc(meta.author) + '</cp:lastModifiedBy>'; }
    return out + '</cp:coreProperties>';
  }

  function appXml() {
    return XML_DECL +
      '<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties">' +
      '<Application>IntegrityWatch Field / IW.export.docxWriter</Application>' +
      '<AppVersion>1.2</AppVersion></Properties>';
  }

  function documentXml(bodyXml) {
    return XML_DECL +
      '<w:document ' + NS_W + ' ' + NS_R + '><w:body>' + bodyXml +
      '<w:sectPr><w:pgSz w:w="' + PG_W + '" w:h="' + PG_H + '"/>' +
      '<w:pgMar w:top="' + MARGIN + '" w:right="' + MARGIN + '" w:bottom="' + MARGIN + '" w:left="' + MARGIN + '"' +
      ' w:header="720" w:footer="720" w:gutter="0"/></w:sectPr>' +
      '</w:body></w:document>';
  }

  // ------------------------------------------------------------------
  // build(doc, opts) -> Promise<Uint8Array>
  //   doc: {title?, meta?:{author?, date?}, blocks:[...]}
  //   opts: {method?: 'deflate'|'store' (default deflate), date?: Date|string
  //          — fallback de doc.meta.date}.
  // ------------------------------------------------------------------

  function build(doc, opts) {
    var files;
    try {
      if (!doc || typeof doc !== 'object' || Array.isArray(doc)) {
        throw docxError('doc debe ser un objeto {title?, meta?, blocks[]}');
      }
      if (doc.blocks !== undefined && doc.blocks !== null && !Array.isArray(doc.blocks)) {
        throw docxError('doc.blocks debe ser un array');
      }
      opts = opts || {};
      var metaIn = doc.meta || {};
      var title = (doc.title === null || doc.title === undefined) ? '' : line(doc.title);
      var author = (metaIn.author === null || metaIn.author === undefined)
        ? (opts.author === null || opts.author === undefined ? '' : String(opts.author))
        : String(metaIn.author);
      var date = normIso(metaIn.date !== undefined && metaIn.date !== null ? metaIn.date : opts.date);

      var bodyXml = '';
      if (title !== '') { bodyXml += heading(1, title); }
      var blocks = doc.blocks || [];
      for (var i = 0; i < blocks.length; i++) { bodyXml += blockXml(blocks[i], i); }
      if (blocks.length === 0 && title === '') { bodyXml += '<w:p/>'; }

      files = [
        { name: '[Content_Types].xml', data: contentTypesXml() },
        { name: '_rels/.rels', data: rootRelsXml() },
        { name: 'word/_rels/document.xml.rels', data: documentRelsXml() },
        { name: 'word/document.xml', data: documentXml(bodyXml) },
        { name: 'word/styles.xml', data: stylesXml() },
        { name: 'word/settings.xml', data: settingsXml() },
        { name: 'word/numbering.xml', data: numberingXml() },
        { name: 'docProps/core.xml', data: coreXml({ author: author, date: date }, title) },
        { name: 'docProps/app.xml', data: appXml() }
      ];
    } catch (e) {
      return Promise.reject(e);
    }
    var z = zipApi();
    if (!z) { return Promise.reject(docxError('IW.export.zip no esta cargado (orden de scripts o require)')); }
    return z.pack(files, { method: opts.method || 'deflate' });
  }

  // ------------------------------------------------------------------
  // buildFromSections(sections, opts) -> Promise<Uint8Array>
  //   Mapeo de las secciones del renderer (src/reports/renderer.js) a bloques:
  //   cover->title+meta, kpiRow->kpi, table->table (con columns; sin columns =
  //   clave-valor de 2 columnas), list->list, text->p, standards->list,
  //   chart->tabla de datos si trae data (array de puntos o kv de objeto), si
  //   no '[grafico no exportado a Word]' — NUNCA se rasteriza SVG;
  //   couponCards->tabla de calculo, disclaimer->p pequeno. Tipos desconocidos
  //   se omiten en silencio, igual que el renderer (sin console en Node).
  //   opts: lo de build + {translate?: key->string (default identidad)}.
  //   Acepta tambien el modelo completo {sections:[...], meta?} del renderer.
  //   Numeros via String(v) sin i18n deliberado: ver cabecera del modulo.
  // ------------------------------------------------------------------

  function identity(k) { return k === null || k === undefined ? '' : String(k); }

  function tr(translate, key) {
    if (key === null || key === undefined) { return ''; }
    var v = translate(key);
    return v === null || v === undefined ? '' : String(v);
  }

  function sectionBlocks(sections, translate) {
    var blocks = [];
    var title = '';
    var generatedAt = null;
    for (var i = 0; i < sections.length; i++) {
      var s = sections[i];
      if (!s || typeof s !== 'object' || !s.type) { continue; }
      var hd = function () { if (s.titleKey) { blocks.push({ type: 'h2', text: tr(translate, s.titleKey) }); } };
      switch (s.type) {
        case 'cover': {
          var t = s.titleKey ? tr(translate, s.titleKey) : (s.title === undefined ? '' : String(s.title));
          if (!title && t !== '') { title = t; }
          else if (t !== '') { blocks.push({ type: 'h1', text: t }); }
          var sub = (s.subtitle !== undefined && s.subtitle !== null) ? String(s.subtitle)
            : (s.subtitleKey ? tr(translate, s.subtitleKey) : '');
          if (sub !== '') { blocks.push({ type: 'p', text: sub }); }
          var m = s.meta || {};
          if (m.period && (m.period.fromISO || m.period.toISO)) {
            blocks.push({ type: 'p', text: 'Periodo: ' + (m.period.fromISO || '?') + ' — ' + (m.period.toISO || '?') });
          }
          if (m.generatedAtISO) {
            blocks.push({ type: 'p', text: 'Generado: ' + m.generatedAtISO });
            if (!generatedAt) { generatedAt = m.generatedAtISO; }
          }
          break;
        }
        case 'kpiRow': {
          hd();
          blocks.push({
            type: 'kpi',
            items: (s.items || []).map(function (it) {
              it = it || {};
              var value = (it.value === null || it.value === undefined) ? '' : String(it.value);
              if (it.unit) { value += ' ' + tr(translate, it.unit); }
              return { label: tr(translate, it.labelKey), value: value };
            })
          });
          break;
        }
        case 'table': {
          hd();
          var cols = s.columns || [];
          if (cols.length === 0) {
            // Clave-valor (renderKvTable del renderer): 2 columnas sin header.
            blocks.push({
              type: 'table',
              headers: [],
              rows: (s.rows || []).map(function (row) {
                row = row || {};
                var label = (row.label !== undefined && row.label !== null) ? tr(translate, row.label) : tr(translate, row.key);
                var value = (row.value === null || row.value === undefined) ? '' : String(row.value);
                if (row.unit) { value += ' ' + tr(translate, row.unit); }
                return [label, value];
              })
            });
          } else {
            blocks.push({
              type: 'table',
              headers: cols.map(function (c) { return tr(translate, c.labelKey); }),
              rows: (s.rows || []).map(function (row) {
                row = row || {};
                return cols.map(function (c) { return row[c.key]; });
              })
            });
          }
          break;
        }
        case 'list': {
          hd();
          blocks.push({
            type: 'list',
            items: (s.items || []).map(function (it) {
              it = it || {};
              return it.textKey ? tr(translate, it.textKey) : (it.text === undefined || it.text === null ? '' : String(it.text));
            })
          });
          break;
        }
        case 'text': {
          hd();
          var body = s.bodyKey ? tr(translate, s.bodyKey) : (s.body === undefined || s.body === null ? '' : String(s.body));
          blocks.push({ type: 'p', text: body });
          var note = s.noteKey ? tr(translate, s.noteKey) : (s.note === undefined || s.note === null ? '' : String(s.note));
          if (note !== '') { blocks.push({ type: 'p', text: note, small: true }); }
          break;
        }
        case 'standards': {
          hd();
          blocks.push({
            type: 'list',
            items: (s.items || []).map(function (it) {
              if (it === null || it === undefined) { return ''; }
              if (typeof it !== 'object') { return String(it); }
              var parts = [it.code || it.id, it.title, it.edition].filter(function (p) { return p !== undefined && p !== null && p !== ''; });
              return parts.join(' — ');
            })
          });
          break;
        }
        case 'chart': {
          hd();
          if (Array.isArray(s.data)) {
            var hasLabel = s.data.some(function (p) { return p && p.label !== undefined && p.label !== null; });
            var headers = [
              s.axis && s.axis.x ? tr(translate, s.axis.x) : 'x',
              s.axis && s.axis.y ? tr(translate, s.axis.y) : 'y'
            ];
            if (hasLabel) { headers.push('etiqueta'); }
            blocks.push({
              type: 'table',
              headers: headers,
              rows: s.data.map(function (p) {
                p = p || {};
                var row = [p.x, p.y];
                if (hasLabel) { row.push(p.label === undefined ? '' : String(p.label)); }
                return row;
              })
            });
          } else if (s.data && typeof s.data === 'object') {
            blocks.push({
              type: 'kpi',
              items: Object.keys(s.data).map(function (k) { return { label: k, value: s.data[k] }; })
            });
          } else {
            blocks.push({ type: 'p', text: CHART_PLACEHOLDER });
          }
          break;
        }
        case 'couponCards': {
          hd();
          blocks.push({
            type: 'table',
            headers: ['Punto', 'Rol', 'ΔW (mg)', 'ρ (g/cm³)', 'A (in²)', 't (h)', 'mpy', 'Nivel'],
            rows: (s.items || []).map(function (it) {
              it = it || {};
              if (!it.hasResult) { return [it.label, tr(translate, it.roleKey), '', '', '', '', '', '']; }
              return [it.label, tr(translate, it.roleKey), it.deltaW, it.density, it.areaIn2, it.hours, it.mpy, it.level || ''];
            })
          });
          break;
        }
        case 'disclaimer': {
          var label = tr(translate, s.labelKey);
          var dtext = s.textKey ? tr(translate, s.textKey) : '';
          blocks.push({ type: 'p', text: (label + (dtext ? ' ' + dtext : '')).trim(), small: true });
          break;
        }
        default:
          // Tipo no renderizable hoy: se omite igual que render() del renderer.
          break;
      }
    }
    return { title: title, blocks: blocks, generatedAt: generatedAt };
  }

  function buildFromSections(sections, opts) {
    var arr;
    var effective = Object.assign({}, opts);
    try {
      if (sections && !Array.isArray(sections) && Array.isArray(sections.sections)) {
        // Modelo completo del renderer: {id?, meta?:{generatedAtISO,...}, sections:[...]}.
        arr = sections.sections;
        if (effective.date === undefined && sections.meta && sections.meta.generatedAtISO) {
          effective.date = sections.meta.generatedAtISO;
        }
      } else if (Array.isArray(sections)) {
        arr = sections;
      } else {
        throw docxError('sections debe ser un array de secciones o un modelo {sections:[...]}');
      }
      if (effective.translate !== undefined && effective.translate !== null && typeof effective.translate !== 'function') {
        throw docxError('opts.translate debe ser una funcion key->string');
      }
    } catch (e) {
      return Promise.reject(e);
    }
    var mapped = sectionBlocks(arr, effective.translate || identity);
    var doc = {
      title: mapped.title,
      meta: {
        author: effective.author,
        date: effective.date !== undefined && effective.date !== null ? effective.date : mapped.generatedAt
      },
      blocks: mapped.blocks
    };
    return build(doc, { method: effective.method });
  }

  return {
    BAD_INPUT: CODE_BAD_INPUT,
    EPOCH_ISO: EPOCH_ISO,
    build: build,
    buildFromSections: buildFromSections
  };
});