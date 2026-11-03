/* IntegrityWatch Field — export.reportFormats
   Capa de SALIDA de informes: aplana el modelo de secciones (src/reports/
   model.js) a hojas/celdas y produce cada formato descargable delegando en los
   escritores hermanos (xlsxWriter, docxWriter, csvWriter, xmlWriter). PDF NO
   se genera aquí: produce('pdf') devuelve action:'print' para que la UI lance
   su impresión propia del documento ya en pantalla (este módulo no toca DOM).

   Decisiones documentadas:
   - Formateo SOLO en esta capa (es salida, no modelo): los escritores
     hermanos emiten String(v) crudo por diseño de pureza; aquí los números
     pasan por Intl.NumberFormat(locale, {maximumFractionDigits: 3}) — el
     mínimo por defecto (0) ya recorta los ceros finales — con opts.locale
     default 'es'. Strings ISO de fecha viajan iguales (ISO→ISO). NaN/Infinity
     viajan como String(v) (ningún writer hermano aceptaría el número crudo).
   - Hojas: kpiRow va a una hoja FIJA 'KPIs' (fusiona todos los kpiRow del
     modelo, filas [label, value, unit]); table/list/chart/couponCards get una
     hoja por sección nombrada con su título (traducido si viene t), sanitizado
     a lo que Excel permite y truncado a 31; los nombres se hacen únicos con
     sufijo ' 2', ' 3'… ANTES de llamar a xlsxWriter (que RECHAZA duplicados
     post-sanitizar con XLSXW_BAD_INPUT). text/standards/disclaimer/cover
     comparten una única hoja 'Metadatos' de filas [campo, valor].
   - kv-table (table sin columns): 2 columnas [label|key traducidos,
     value + ' ' + unit] — espejo exacto del mapeo de docxWriter.
   - chart con data array: cabecera [axis.x, axis.y] (+ 'etiqueta' si algún
     punto trae label), espejo de docxWriter; data objeto → filas [k, v]; sin
     data → una celda '—'.
   - csvText: TODAS las hojas concatenadas, cada bloque precedido de una fila
     de título de UNA celda (la fila separadora pedida), BOM + ';' + CRLF
     (defaults de csvWriter.toText). Celdas ya formateadas: el CSV es para
     humanos/Excel, no round-trip del modelo.
   - xmlString: objToXml('informe', {meta, secciones}) con el modelo CRUDO
     (sin traducir ni formatear): es la ruta de round-trip para
     IW.ingest.formats 'xml', que toma el hijo más repetido bajo la raíz —
     aquí 'secciones' — como filas; las claves se sanitizan a
     [A-Za-z_][\w.-]* según xmlWriter.
   - jsonObject: referencia al modelo tal cual (no se clona y NUNCA se muta).
   - Traducción: opts.t (alias opts.translate) es la función key->string que
     la UI SIEMPRE pasa; sin ella viajan las claves crudas.
   - formatsFor(): copia de FORMATS INCLUYENDO 'pdf', como entradas planas —
     la lista NO lleva la acción de impresión adherida: produce('pdf')
     devuelve {action:'print'} y la UI decide cómo lanzar su print propio.
   - Errores tipados RF_* en err.code: RF_BAD_INPUT (modelo inválido),
     RF_BAD_FORMAT (formato fuera de FORMATS), RF_NO_WRITER (hermano sin
     cargar). Los XLSXW_ y DOCXW_ de los escritores burbujean tal cual.
   - Determinismo: ningún camino llama a Date.now; los zip internos fijan su
     epoch DOS. Dos produce() del mismo modelo → bytes idénticos (probado). */
(function (root, factory) {
  'use strict';
  var api = factory(root);
  root.IW = root.IW || {};
  root.IW.export = root.IW.export || {};
  root.IW.export.reportFormats = api;
  if (typeof module === 'object' && module.exports) { module.exports = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  // Hermanos al estilo docxWriter: en Node se aseguran por require en carga;
  // en el navegador basta el orden de scripts de index.html. El acceso real a
  // cada API se resuelve perezosamente al llamar (nunca en carga).
  if (typeof require === 'function') {
    var NEEDED = [
      ['zip', './zip.js'],
      ['csvWriter', './csvWriter.js'],
      ['xmlWriter', './xmlWriter.js'],
      ['xlsxWriter', './xlsxWriter.js'],
      ['docxWriter', './docxWriter.js']
    ];
    root.IW = root.IW || {};
    root.IW.export = root.IW.export || {};
    NEEDED.forEach(function (pair) {
      if (!root.IW.export[pair[0]]) {
        try { require(pair[1]); } catch (e) { /* la llamada fallará con RF_NO_WRITER */ }
      }
    });
  }

  var CODE_BAD_INPUT = 'RF_BAD_INPUT';
  var CODE_BAD_FORMAT = 'RF_BAD_FORMAT';
  var CODE_NO_WRITER = 'RF_NO_WRITER';

  var FORMATS = ['pdf', 'csv', 'xlsx', 'docx', 'json', 'xml'];
  var MIME = {
    pdf: 'application/pdf',
    csv: 'text/csv',
    xml: 'application/xml',
    json: 'application/json',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  };

  var MAX_SHEET_NAME = 31; // tope Excel, mismo que xlsxWriter
  // Caracteres que Excel prohíbe en nombres de hoja + control chars.
  var FORBIDDEN_SHEET = /[[\]:*?\/\\\u0000-\u001F\u007F]/g;
  var FORBIDDEN_FILE = /[<>:"/\\|?*\u0000-\u001F\u007F]/g;
  var KNOWN_EXT = /\.(pdf|csv|xlsx|docx|json|xml|txt|tsv|md|html|htm)$/i;

  function rfError(code, message) {
    var e = new Error(message);
    e.code = code;
    return e;
  }

  function apiOf(name, fnName) {
    var mod = root.IW && root.IW.export ? root.IW.export[name] : null;
    if (!mod || typeof mod[fnName] !== 'function') {
      throw rfError(CODE_NO_WRITER, 'IW.export.' + name + ' no está cargado (' + fnName + ')');
    }
    return mod;
  }

  // ------------------------------------------------------------------
  // Traducción y formateo (capa de salida)
  // ------------------------------------------------------------------

  // t opcional: sin ella la clave cruda; con ella, lo que devuelva (una
  // devolución vacía/nula cae también a la clave, como i18n.t de la UI).
  function tr(t, key) {
    if (key === null || key === undefined) { return ''; }
    var raw = String(key);
    if (typeof t !== 'function') { return raw; }
    var v = t(key);
    return v === undefined || v === null || v === '' ? raw : String(v);
  }

  var NF_CACHE = {};
  function numberFormatter(locale) {
    var loc = locale || 'es';
    if (!NF_CACHE[loc]) {
      if (typeof Intl === 'undefined' || !Intl.NumberFormat) { return null; }
      NF_CACHE[loc] = new Intl.NumberFormat(loc, { maximumFractionDigits: 3 });
    }
    return NF_CACHE[loc];
  }

  // Celda de salida: null/undefined -> ''; número -> Intl (<=3 decimales,
  // ceros recortados) o String si no es finito; Date -> ISO; objeto -> JSON.
  function fmtCell(v, t, locale) {
    if (v === null || v === undefined) { return ''; }
    if (typeof v === 'number') {
      if (!isFinite(v)) { return String(v); }
      var nf = numberFormatter(locale);
      return nf ? nf.format(v) : String(v);
    }
    if (typeof v === 'boolean') { return String(v); }
    if (v instanceof Date) { return isNaN(v.getTime()) ? '' : v.toISOString(); }
    if (typeof v === 'object') { return JSON.stringify(v); }
    return String(v); // ISO de fecha y textos viajan iguales
  }

  // Título visible de una sección (para nombre de hoja y fila CSV). Recibe el
  // ctx de flatten ({t, locale}), no la función suelta: todas las llamadas
  // internas pasan ctx.
  function sectionTitle(sec, ctx) {
    var ttl = sec.titleKey ? tr(ctx.t, sec.titleKey) : '';
    if (!ttl && sec.title !== undefined && sec.title !== null) { ttl = String(sec.title); }
    return ttl;
  }

  // ------------------------------------------------------------------
  // Nombres de hoja y de archivo
  // ------------------------------------------------------------------

  function cleanSheetName(name) {
    var out = String(name === null || name === undefined ? '' : name)
      .replace(FORBIDDEN_SHEET, '')
      .trim()
      .slice(0, MAX_SHEET_NAME)
      .trim();
    return out;
  }

  // Único con sufijo conservando el tope de 31 (xlsxWriter rechaza duplicados
  // post-sanitizar, así que la unicidad se garantiza AQUÍ).
  function uniqueSheetName(seen, base, fallback) {
    var name = cleanSheetName(base) || fallback;
    if (!seen[name]) { seen[name] = true; return name; }
    var n = 2;
    var room = MAX_SHEET_NAME - String(n).length - 1;
    var stem = name.slice(0, room > 0 ? room : MAX_SHEET_NAME);
    while (seen[stem + ' ' + n]) { n += 1; room = MAX_SHEET_NAME - String(n).length - 1; stem = name.slice(0, room > 0 ? room : MAX_SHEET_NAME); }
    var candidate = stem + ' ' + n;
    seen[candidate] = true;
    return candidate;
  }

  // Nombre de descarga: se queda con el basename, quita separadores e
  // inseguros de sistema de archivos, mata puntos de trayectoria ('..'), y
  // reemplaza una extensión conocida por la del formato pedido.
  function sanitizeFilename(raw, format) {
    var s = raw === undefined || raw === null ? '' : String(raw);
    var sep = Math.max(s.lastIndexOf('/'), s.lastIndexOf('\\'));
    if (sep !== -1) { s = s.slice(sep + 1); }
    s = s.replace(FORBIDDEN_FILE, '').replace(/^\.+/, '').trim().slice(0, 120);
    if (KNOWN_EXT.test(s)) { s = s.replace(KNOWN_EXT, ''); }
    if (!s) { s = 'informe'; }
    return s + '.' + format;
  }

  // ------------------------------------------------------------------
  // flatten(model, t | opts) -> {sheets, csvText, jsonObject, xmlString}
  // ------------------------------------------------------------------

  function resolveOpts(tOrOpts, localeArg) {
    var o = typeof tOrOpts === 'function' ? { t: tOrOpts } : (tOrOpts || {});
    var t = typeof o.t === 'function' ? o.t
      : (typeof o.translate === 'function' ? o.translate : undefined);
    return { t: t, locale: o.locale || localeArg || 'es' };
  }

  function kpiRows(sec, ctx) {
    return (sec.items || []).map(function (it) {
      it = it || {};
      return [tr(ctx.t, it.labelKey), fmtCell(it.value, ctx.t, ctx.locale), tr(ctx.t, it.unit)];
    });
  }

  function tableSheet(sec, ctx) {
    var cols = Array.isArray(sec.columns) ? sec.columns : [];
    if (!cols.length) {
      // kv-table sin columns: 2 columnas, espejo del mapeo de docxWriter.
      var rows = (sec.rows || []).map(function (row) {
        row = row || {};
        var labelKey = (row.label !== undefined && row.label !== null) ? row.label : row.key;
        var value = fmtCell(row.value, ctx.t, ctx.locale);
        if (row.unit) { value = (value + ' ' + tr(ctx.t, row.unit)).trim(); }
        return [tr(ctx.t, labelKey), value];
      });
      return { rows: rows, header: null };
    }
    var header = cols.map(function (c) { return tr(ctx.t, c && c.labelKey); });
    var trows = (sec.rows || []).map(function (row) {
      row = row || {};
      return cols.map(function (c) { return fmtCell(row[c && c.key], ctx.t, ctx.locale); });
    });
    return { rows: trows, header: header };
  }

  function listRows(sec, ctx) {
    return (sec.items || []).map(function (it) {
      it = it || {};
      var text = (it.text !== undefined && it.text !== null && String(it.text) !== '')
        ? String(it.text)
        : tr(ctx.t, it.textKey);
      return [text];
    });
  }

  function chartSheet(sec, ctx) {
    if (Array.isArray(sec.data)) {
      if (!sec.data.length) { return { rows: [['—']], header: null }; }
      var hasLabel = sec.data.some(function (p) { return p && p.label !== undefined && p.label !== null; });
      var header = [
        (sec.axis && sec.axis.x) ? tr(ctx.t, sec.axis.x) : 'x',
        (sec.axis && sec.axis.y) ? tr(ctx.t, sec.axis.y) : 'y'
      ];
      if (hasLabel) { header.push('etiqueta'); } // literal, como docxWriter
      var rows = sec.data.map(function (p) {
        p = p || {};
        var row = [fmtCell(p.x, ctx.t, ctx.locale), fmtCell(p.y, ctx.t, ctx.locale)];
        if (hasLabel) { row.push(p.label === undefined || p.label === null ? '' : String(p.label)); }
        return row;
      });
      return { rows: rows, header: header };
    }
    if (sec.data && typeof sec.data === 'object') {
      var kv = Object.keys(sec.data).map(function (k) {
        return [String(k), fmtCell(sec.data[k], ctx.t, ctx.locale)];
      });
      return { rows: kv, header: null };
    }
    return { rows: [['—']], header: null };
  }

  function couponSheet(sec, ctx) {
    var header = ['Punto', 'Rol', 'ΔW (mg)', 'ρ (g/cm³)', 'A (in²)', 't (h)', 'mpy', 'Nivel'];
    var rows = (sec.items || []).map(function (it) {
      it = it || {};
      if (!it.hasResult) { return [fmtCell(it.label, ctx.t, ctx.locale), tr(ctx.t, it.roleKey), '', '', '', '', '', '']; }
      return [
        fmtCell(it.label, ctx.t, ctx.locale), tr(ctx.t, it.roleKey),
        fmtCell(it.deltaW, ctx.t, ctx.locale), fmtCell(it.density, ctx.t, ctx.locale),
        fmtCell(it.areaIn2, ctx.t, ctx.locale), fmtCell(it.hours, ctx.t, ctx.locale),
        fmtCell(it.mpy, ctx.t, ctx.locale), it.level || ''
      ];
    });
    return { rows: rows, header: header };
  }

  function standardsValue(sec, ctx) {
    return (sec.items || []).map(function (it) {
      if (it === null || it === undefined) { return ''; }
      if (typeof it !== 'object') { return String(it); }
      return [it.code || it.id, it.title, it.edition]
        .filter(function (p) { return p !== undefined && p !== null && p !== ''; })
        .join(' — ');
    }).join(' · ');
  }

  // text/standards/disclaimer/cover comparten la hoja 'Metadatos' [campo, valor].
  function metaRowsFor(sec, ctx) {
    var out = [];
    switch (sec.type) {
      case 'cover': {
        var ttl = sectionTitle(sec, ctx);
        var sub = (sec.subtitle !== undefined && sec.subtitle !== null) ? String(sec.subtitle) : tr(ctx.t, sec.subtitleKey);
        out.push([ttl, sub]);
        var m = sec.meta || {};
        if (m.period && (m.period.fromISO || m.period.toISO)) {
          out.push(['Periodo', (m.period.fromISO || '?') + ' — ' + (m.period.toISO || '?')]); // literales espejo de docxWriter
        }
        if (m.generatedAtISO) { out.push(['Generado', String(m.generatedAtISO)]); }
        break;
      }
      case 'text': {
        var body = sec.bodyKey ? tr(ctx.t, sec.bodyKey) : (sec.body === undefined || sec.body === null ? '' : String(sec.body));
        var note = sec.noteKey ? tr(ctx.t, sec.noteKey) : (sec.note === undefined || sec.note === null ? '' : String(sec.note));
        out.push([sectionTitle(sec, ctx) || 'Texto', note ? body + ' | ' + note : body]);
        break;
      }
      case 'standards':
        out.push([sectionTitle(sec, ctx) || 'Normas', standardsValue(sec, ctx)]);
        break;
      case 'disclaimer':
        out.push([tr(ctx.t, sec.labelKey), tr(ctx.t, sec.textKey)]);
        break;
      default:
        break;
    }
    return out;
  }

  function flatten(model, tOrOpts, localeArg) {
    var ctx = resolveOpts(tOrOpts, localeArg);
    var sections = (model && Array.isArray(model.sections)) ? model.sections : [];
    var seen = Object.create(null);
    var sheets = [];
    var kpiSheet = null;
    // 'Metadatos' se acumula en buffer y se añade AL FINAL del aplanado.
    var metaBuf = [];

    function addSheet(base, fallback, rows, header, title) {
      var all = header ? [header].concat(rows) : rows;
      var sh = {
        name: uniqueSheetName(seen, base, fallback),
        title: title || base || fallback,
        rows: all,
        boldHeader: !!header
      };
      sheets.push(sh);
      return sh;
    }

    sections.forEach(function (sec) {
      if (!sec || typeof sec !== 'object' || !sec.type) { return; }
      switch (sec.type) {
        case 'cover':
        case 'text':
        case 'standards':
        case 'disclaimer':
          metaBuf.push.apply(metaBuf, metaRowsFor(sec, ctx));
          break;
        case 'kpiRow': {
          if (!kpiSheet) {
            kpiSheet = { name: uniqueSheetName(seen, 'KPIs', 'KPIs'), title: sectionTitle(sec, ctx) || 'KPIs', rows: [], boldHeader: false };
            sheets.push(kpiSheet);
          }
          kpiSheet.rows.push.apply(kpiSheet.rows, kpiRows(sec, ctx));
          break;
        }
        case 'table': {
          var ts = tableSheet(sec, ctx);
          addSheet(sectionTitle(sec, ctx), 'Tabla', ts.rows, ts.header);
          break;
        }
        case 'list': {
          addSheet(sectionTitle(sec, ctx), 'Lista', listRows(sec, ctx), null);
          break;
        }
        case 'chart': {
          var cs = chartSheet(sec, ctx);
          addSheet(sectionTitle(sec, ctx), 'Gráfico', cs.rows, cs.header);
          break;
        }
        case 'couponCards': {
          var cc = couponSheet(sec, ctx);
          addSheet(sectionTitle(sec, ctx), 'Cupones', cc.rows, cc.header);
          break;
        }
        default:
          // Tipo no aplano-able hoy: se omite igual que renderer/docxWriter.
          break;
      }
    });

    // El disclaimer vive a menudo en model.disclaimer (hermanas T-09+).
    if (model && model.disclaimer && typeof model.disclaimer === 'object') {
      metaBuf.push.apply(metaBuf, metaRowsFor({ type: 'disclaimer', labelKey: model.disclaimer.labelKey, textKey: model.disclaimer.textKey }, ctx));
    }
    if (metaBuf.length) {
      addSheet('Metadatos', 'Metadatos', metaBuf, null);
    }

    // --- csvText: hojas concatenadas con fila de título separadora ---------
    var allRows = [];
    sheets.forEach(function (sh) {
      allRows.push([sh.title || sh.name]);
      sh.rows.forEach(function (r) { allRows.push(r); });
    });
    var csvWriter = apiOf('csvWriter', 'toText');
    var csvText = csvWriter.toText(null, allRows); // BOM + ';' + CRLF por default

    // --- xmlString: modelo crudo bajo la raíz 'informe' -------------------
    var xmlWriter = apiOf('xmlWriter', 'objToXml');
    var xmlString = xmlWriter.objToXml('informe', {
      meta: (model && model.meta) || {},
      secciones: sections
    }, { indent: 2 });

    return {
      sheets: sheets,
      csvText: csvText,
      jsonObject: model, // tal cual: ni clon ni mutación
      xmlString: xmlString
    };
  }

  // ------------------------------------------------------------------
  // produce(model, format, opts) -> Promise<{format, filename, data, mime}>
  // ------------------------------------------------------------------

  function produce(model, format, opts) {
    opts = opts || {};
    try {
      if (!model || typeof model !== 'object' || Array.isArray(model) || !Array.isArray(model.sections)) {
        throw rfError(CODE_BAD_INPUT, 'model debe ser un objeto {sections: [...]}, recibido: ' + (model === null ? 'null' : typeof model));
      }
      if (FORMATS.indexOf(format) === -1) {
        throw rfError(CODE_BAD_FORMAT, "formato desconocido: '" + format + "' (esperado: " + FORMATS.join('/') + ')');
      }
    } catch (e) {
      return Promise.reject(e);
    }
    var ctx = resolveOpts(opts);
    var filename = sanitizeFilename(opts.filename, format);

    switch (format) {
      case 'pdf':
        // NO se genera: la UI imprime el documento ya renderizado en pantalla.
        return Promise.resolve({ format: 'pdf', action: 'print', filename: filename, mime: MIME.pdf });
      case 'json':
        return Promise.resolve({ format: 'json', filename: filename, data: JSON.stringify(model, null, 2), mime: MIME.json });
      case 'csv':
        return Promise.resolve({ format: 'csv', filename: filename, data: flatten(model, ctx).csvText, mime: MIME.csv });
      case 'xml':
        return Promise.resolve({ format: 'xml', filename: filename, data: flatten(model, ctx).xmlString, mime: MIME.xml });
      case 'xlsx': {
        try {
          var xw = apiOf('xlsxWriter', 'build');
          return xw.build(flatten(model, ctx).sheets, { method: opts.method }).then(function (bytes) {
            return { format: 'xlsx', filename: filename, data: bytes, mime: MIME.xlsx };
          });
        } catch (e) {
          return Promise.reject(e);
        }
      }
      case 'docx': {
        try {
          var dw = apiOf('docxWriter', 'buildFromSections');
          var dopts = { method: opts.method };
          if (ctx.t) { dopts.translate = ctx.t; }
          return dw.buildFromSections(model.sections, dopts).then(function (bytes) {
            return { format: 'docx', filename: filename, data: bytes, mime: MIME.docx };
          });
        } catch (e) {
          return Promise.reject(e);
        }
      }
      default:
        return Promise.reject(rfError(CODE_BAD_FORMAT, 'formato no implementado: ' + format));
    }
  }

  return {
    BAD_INPUT: CODE_BAD_INPUT,
    BAD_FORMAT: CODE_BAD_FORMAT,
    NO_WRITER: CODE_NO_WRITER,
    FORMATS: FORMATS,
    MIME: MIME,
    formatsFor: function () { return FORMATS.slice(); },
    flatten: flatten,
    produce: produce
  };
});
