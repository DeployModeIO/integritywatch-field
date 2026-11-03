/* IntegrityWatch Field — ingest/units
   Normalizadores para ingesta masiva: numeros con separadores ES/EN/RU,
   conversion de unidades por dimension, fechas (incl. serie Excel),
   celdas 'valor unidad' y clave canonicalize para alias de esquemas.
   Reutiliza IW.calc.units (G1: src/calc/** se REUTILIZA, NUNCA se modifica). */
(function (root, factory) {
  'use strict';
  var api = factory(root);
  root.IW = root.IW || {};
  root.IW.ingest = root.IW.ingest || {};
  root.IW.ingest.units = api;
  if (typeof module === 'object' && module.exports) { module.exports = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  // Carga hermana a demanda (mismo patron que src/ingest/csv.js) para que el
  // require standalone en Node resuelva IW.calc.units. Protegido: nunca falla
  // la carga; si an no esta, se usan constantes espejo identicas (ver abajo).
  if (typeof require === 'function' && !(root.IW && root.IW.calc && root.IW.calc.units)) {
    try { require('../calc/units.js'); } catch (e) { /* ignore */ }
  }

  function cu() { return root.IW && root.IW.calc && root.IW.calc.units; }

  // Constantes espejo de src/calc/units.js (fallback; valores identicos).
  var MPY_TO_MM_YEAR = 0.0254;
  var MPY_TO_UM_YEAR = 25.4;
  var MM_YEAR_TO_MPY = 1 / MPY_TO_MM_YEAR;

  function calcMmYearToMpy(v) { var c = cu(); return c ? c.mmYearToMpy(v) : v * MM_YEAR_TO_MPY; }
  function calcMpyToMmYear(m) { var c = cu(); return c ? c.mpyToMmYear(m) : m * MPY_TO_MM_YEAR; }
  function calcMpyToUmYear(m) { var c = cu(); return c ? c.mpyToUmYear(m) : m * MPY_TO_UM_YEAR; }
  function calcUmYearToMpy(u) { return u / MPY_TO_UM_YEAR; } // inverso: calc.units no lo publica
  function calcFToC(f) { var c = cu(); return c ? c.fToC(f) : (f - 32) * 5 / 9; }
  function calcCToF(v) { var c = cu(); return c ? c.cToF(v) : (v * 9 / 5) + 32; }
  function calcKToC(k) { var c = cu(); return c ? c.kToC(k) : k - 273.15; }
  function calcCToK(v) { return v + 273.15; }
  function identity(v) { return v; }

  // ---------------------------------------------------------------------
  // canonicalize — clave de alias para schemas.js / mapping.js.
  // Definicion EXACTA (pactada): minusculas; sin acentos (NFD + borrado de
  // diacriticos U+0300-U+036F); '²'->'2'; '°'->''; espacios, '.', '_', '-'
  // y '/' colapsados a un unico '_'; el resto de simbolos (parentesis,
  // comas, corchetes, '*', '^'...) se elimina; se recortan '_' en los
  // bordes. UNICA extension: se conservan los signos micro 'µ' (U+00B5) y
  // 'μ' (U+03BC) para que 'µm' no colapse en 'm' (metros) al buscar unidades.
  // Idempotente: canonicalize(canonicalize(x)) === canonicalize(x).
  //   'Presión (Kg/cm²)' -> 'presion_kg_cm2'   (requisito de la spec)
  //   'mm/a' -> 'mm_a' · 'kg/cm2' -> 'kg_cm2'
  // ---------------------------------------------------------------------
  function canonicalize(s) {
    return String(s === null || s === undefined ? '' : s)
      .toLowerCase()
      .replace(/\u00B2/g, '2')
      .replace(/\u00B0/g, '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[ ._\-/]+/g, '_')
      .replace(/[^a-z0-9_\u00B5\u03BC]+/g, '')
      .replace(/^_+|_+$/g, '');
  }

  // ---------------------------------------------------------------------
  // normalizeNumber — heuristicas de separador (documentadas y cubiertas en
  // tests/ingest-units.test.js):
  //  1. Signos: '-', '−' (U+2212), '–' (U+2013) y '+' al inicio.
  //  2. Mil separadores: espacio fino (U+00A0/2002/2003/2007/2009/202F) y
  //     punto medio U+00B7 se normalizan a espacio antes de parsear.
  //  3. '45%' -> 0.45 (porcentaje de campo: se interpreta como fraccion).
  //  4. Tokens vacios/NA -> null: '', '-', '--', '—', '/', 'n/a', 'na',
  //     'nan', 'null', 'none', 'nil' (comparados via canonicalize, asi
  //     'N.A.' tambien cae en NA).
  //  5. Criterio coma-vs-punto (la ULTIMA aparicion de ',' o '.' decide):
  //     a) Con AMBOS simbolos presentes: el ultimo es decimal si los grupos
  //        a su izquierda, separados por el OTRO simbolo, forman agrupacion
  //        valida (primer grupo 1-3 digitos, siguientes EXACTAMENTE 3).
  //        '1.234,56' -> 1234.56 (ES) · '1,234.56' -> 1234.56 (EN) ·
  //        '1,234.5678' -> 1234.5678 · '1.2345,678' -> null (grupos invalidos).
  //     b) Con UN solo simbolo repetido: si todo el cuerpo agrupa validamente
  //        es miles ('1.234.567' -> 1234567); si no, el ultimo puede ser
  //        decimal cuando el resto agrupa y deja 1-3 digitos ('1,234,56' ->
  //        1234.56 ES); si nada funciona -> null ('1,23,456').
  //     c) Con UN solo simbolo UNA sola vez: cola de 1-2 digitos -> decimal
  //        ('2.31' -> 2.31, '12,5' -> 12.5); cola de exactamente 3 ->
  //        AGRUPADOR si el grupo izquierdo mide 1-3 ('1.500' -> 1500,
  //        '45.000' -> 45000; por eso stripUnit('1.500 psi') = 1500), y
  //        decimal si el izquierdo mide 4+ ('1234.500' -> 1234.5); cola de
  //        4+ -> decimal ('1.2345' -> 1.2345); cola de 0 -> null ('5.').
  //     Nota: la regla (c) con cola==3 elige agrupador porque '1.234' como
  //     decimal haria imposible el requisito pactado '1.500 psi' = 1500.
  //  6. NaN/Infinity -> null.
  // ---------------------------------------------------------------------
  var NUM_CORE = /^\d+(?:[.,]\d+)*$/;
  var NUM_RE = /^([+-]?)([\d .,]+)(%)?$/;

  function isNA(t) {
    var k = canonicalize(t);
    return k === '' || k === 'na' || k === 'nan' || k === 'null' ||
      k === 'none' || k === 'nil' || k === '/' || k === '-' || k === '--';
  }

  // Grupos de miles: el primero 1-3 digitos, los demas EXACTAMENTE 3.
  function validGroups(str, sep) {
    var parts = str.split(sep);
    for (var i = 0; i < parts.length; i++) {
      var n = parts[i].length;
      if (i === 0) { if (n < 1 || n > 3) { return false; } }
      else if (n !== 3) { return false; }
    }
    return true;
  }

  // Devuelve >=0 indice del separador decimal, -1 si es solo agrupacion,
  // o null si el cuerpo es ilegible.
  function decideSeparators(body) {
    var lastDot = body.lastIndexOf('.');
    var lastCom = body.lastIndexOf(',');
    var rightmost = Math.max(lastDot, lastCom);
    if (rightmost < 0) { return -1; } // sin separadores
    if (rightmost === body.length - 1) { return null; } // cola vacia: '5.'
    var c = body.charAt(rightmost);
    var o = c === '.' ? ',' : '.';
    var head = body.slice(0, rightmost);
    var tail = body.length - rightmost - 1;
    var oi = body.indexOf(o);
    var count = 0;
    for (var i = 0; i < body.length; i++) { if (body.charAt(i) === c) { count += 1; } }

    if (oi >= 0) { // ambos simbolos presentes (o necesariamente esta a la izq.)
      return (tail >= 1 && validGroups(head, o)) ? rightmost : null;
    }
    if (count === 1) { // un solo simbolo una sola vez
      if (tail <= 2) { return rightmost; }
      if (tail === 3) { return head.length <= 3 ? -1 : rightmost; }
      return rightmost; // tail >= 4 -> decimal
    }
    // simbolo unico repetido: agrupacion pura primero, decimal de apoyo despues
    if (validGroups(body, c)) { return -1; }
    if (tail >= 1 && tail <= 3 && validGroups(head, c)) { return rightmost; }
    return null;
  }

  function normalizeNumber(raw) {
    if (raw === null || raw === undefined) { return null; }
    if (typeof raw === 'number') { return isFinite(raw) ? raw : null; }
    if (typeof raw !== 'string') { return null; }
    var s = raw
      .replace(/[\u00A0\u2007\u2002\u2003\u2009\u202F\u00B7]/g, ' ')
      .replace(/[\u2212\u2013]/g, '-')
      .trim();
    if (s === '' || isNA(s)) { return null; }

    var m = NUM_RE.exec(s);
    if (!m) { return null; }
    var sign = m[1] === '-' ? -1 : 1;
    var isPct = m[3] === '%';
    var body = m[2].replace(/[ ]/g, '');
    if (!NUM_CORE.test(body)) { return null; }

    var decIdx = decideSeparators(body);
    if (decIdx === null) { return null; }

    var out;
    if (decIdx < 0) {
      out = parseFloat(body.replace(/[.,]/g, ''));
    } else {
      out = parseFloat(body.slice(0, decIdx).replace(/[.,]/g, '') + '.' + body.slice(decIdx + 1));
    }
    if (isNaN(out) || !isFinite(out)) { return null; }
    var v = sign * out;
    return isPct ? v * 0.01 : v;
  }

  // ---------------------------------------------------------------------
  // UNITS — tabla por dimension con factores a la unidad CANONICA.
  // Canonicas (documentadas): presion=bar | longitud (esesor)=mm |
  // tasaCorrosion=mpy | temperatura=C | masa=g | masaPerArea=g/m2 |
  // estacion=km (lineAssets.stationKm).
  // Las claves se guardan ya canonicalizadas: canonicalize elimina '°' y
  // '.', por eso '°c' convive con 'c', 'deg.C'->'degc', 'In.'->'in'.
  // 'mmpy' se trata como mm/a y aporta warning 'MMY_AMBIGUOUS'.
  // 'g/m2·h' NO esta en tasaCorrosion (es flujo de masa, no de espesor; se
  // omite a proposito) y 'mdd' se omite segun spec.
  // ---------------------------------------------------------------------
  var PSI_BAR = 0.06894757293168361; // 6.894757293 kPa = /100 bar
  var OZFT2_GM2 = 28.349523125 / 0.09290304; // 1 oz/ft2 en g/m2 = 305.1518068296244

  // canonicalize mapea '/'->'_' y ²->2, asi las claves son 'kg_cm2', 'mm_a',
  // 'g_m2'... Los signos micro ('µ' U+00B5, 'μ' U+03BC) se conservan; el
  // alias griego->micro cubre 'μm_a'. 'g/m2·h' NO se registra: es flujo de
  // masa, no tasa de corrosion (omitido a proposito, igual que 'mdd').
  var UNIT_ALIAS = {
    '\u03BCm': '\u00B5m',
    '\u03BCm_a': '\u00B5m_a'
  };

  var UNITS = {
    presion: { canonical: 'bar', units: {
      'bar':  { f: 1 },
      'barg': { f: 1, basis: 'gauge' },
      'bara': { f: 1, basis: 'abs' },
      'psi':  { f: PSI_BAR },
      'psig': { f: PSI_BAR, basis: 'gauge' },
      'psia': { f: PSI_BAR, basis: 'abs' },
      'kpa':  { f: 0.01 },
      'mpa':  { f: 10 },
      'mpag': { f: 10, basis: 'gauge' },
      'mpaa': { f: 10, basis: 'abs' },
      'mpam': { f: 10 }, // MPa manometrica: numerico identico a MPA, basis gauge
      'atm':  { f: 1.01325 },
      'kg_cm2':  { f: 0.980665 },
      'kgf_cm2': { f: 0.980665 } // 'kgf/cm²' post-canonicalize ('²'->'2')
    } },
    longitud: { canonical: 'mm', units: {
      'mm':  { f: 1 },
      'cm':  { f: 10 },
      'm':   { f: 1000 },
      'in':  { f: 25.4 },
      'pulgadas': { f: 25.4 },
      'mil':  { f: 0.0254 },
      'mils': { f: 0.0254 },
      'thou': { f: 0.0254 },
      '\u00B5m': { f: 0.001 },
      'um':  { f: 0.001 }
    } },
    tasaCorrosion: { canonical: 'mpy', units: {
      'mpy':  { f: 1 },
      'mm_a': { f: MM_YEAR_TO_MPY, toC: calcMmYearToMpy, fromC: calcMpyToMmYear },
      'mmpy': { f: MM_YEAR_TO_MPY, toC: calcMmYearToMpy, fromC: calcMpyToMmYear, warn: 'MMY_AMBIGUOUS' },
      '\u00B5m_a': { f: 1 / MPY_TO_UM_YEAR, toC: calcUmYearToMpy, fromC: calcMpyToUmYear },
      'um_a': { f: 1 / MPY_TO_UM_YEAR, toC: calcUmYearToMpy, fromC: calcMpyToUmYear }
    } },
    temperatura: { canonical: 'c', units: {
      'c':    { f: 1, toC: identity, fromC: identity },
      'degc': { f: 1, toC: identity, fromC: identity },
      'f':    { f: 1, toC: calcFToC, fromC: calcCToF },
      'degf': { f: 1, toC: calcFToC, fromC: calcCToF }
    } },
    masa: { canonical: 'g', units: {
      'g':  { f: 1 },
      'kg': { f: 1000 },
      'mg': { f: 0.001 },
      'lb': { f: 453.59237 },
      'oz': { f: 28.349523125 }
    } },
    masaPerArea: { canonical: 'g_m2', units: {
      'g_m2':   { f: 1 },
      'oz_ft2': { f: OZFT2_GM2 } // 'oz/ft²' post-canonicalize cae aqui ('²'->'2', '/'->'_')
    } },
    estacion: { canonical: 'km', units: {
      'km':  { f: 1 },
      'm':   { f: 0.001 },
      'ft':  { f: 0.0003048 },
      'millas': { f: 1.609344 },
      'mi':  { f: 1.609344 }
    } }
  };

  // Kelvin: solo ORIGEN (la canonica de temperatura es °C; no se usa como destino).
  UNITS.temperatura.units.k = { f: 1, toC: calcKToC, fromC: calcCToK, noTarget: true };

  var DIM_INDEX = {};
  Object.keys(UNITS).forEach(function (dim) {
    DIM_INDEX[canonicalize(dim)] = dim;
    var us = UNITS[dim].units;
    Object.keys(us).forEach(function (key) {
      var e = us[key];
      e.key = key;
      e.dim = dim;
      e.canonical = UNITS[dim].canonical;
      if (!DIM_INDEX[key]) { DIM_INDEX[key] = dim; }
    });
  });
  // Alias de nombres de dimension que admite la ingesta ('longitud/esesor',
  // 'masaPerArea' camel o con separadores, 'areaMasa' variante del spec).
  DIM_INDEX.esesor = 'longitud';
  DIM_INDEX.masa_per_area = 'masaPerArea';
  DIM_INDEX.area_masa = 'masaPerArea';
  DIM_INDEX.areamasa = 'masaPerArea';

  function resolveUnit(raw, dimName) {
    var k = canonicalize(raw);
    if (k === '') { return null; }
    if (Object.prototype.hasOwnProperty.call(UNIT_ALIAS, k)) { k = UNIT_ALIAS[k]; }
    if (dimName) { return UNITS[dimName].units[k] || null; }
    var d = DIM_INDEX[k];
    return d ? UNITS[d].units[k] : null;
  }

  function toCanonical(e, v) { return e.toC ? e.toC(v) : v * e.f; }
  function fromCanonical(e, v) { return e.fromC ? e.fromC(v) : v / e.f; }

  // ---------------------------------------------------------------------
  // convert(value, fromUnit, toUnit, dimension)
  //  - case-insensitive, acentos/espacios tolerados ('Kg/cm²' == 'kg/cm2').
  //  - dimension opcional: choca con la unidad -> UNIT_UNKNOWN (no existe en
  //    esa dimension); dos dimensiones distintas -> UNIT_DIMENSION.
  //  - unidad desconocida -> {code:'UNIT_UNKNOWN'}.
  //  - gauge/abs: se propaga el NUMERICO sin convertir a absoluta; resultado
  //    lleva 'basis' ('gauge'|'abs'|'unknown') detectado por sufijo g/a y
  //    warning 'BASIS_MISMATCH' solo al cruzar gauge con abs explicitos.
  //  - 'mmpy' -> warning 'MMY_AMBIGUOUS' (se toma por mm/a).
  //  - temperatura no es multiplicativa: 'factor' = 1 y la conversion usa
  //    las funciones offset de IW.calc.units (fToC/cToF/kToC).
  //  - from===to -> factor 1, valor identico.
  // ---------------------------------------------------------------------
  function convert(value, fromUnit, toUnit, dimension) {
    if (typeof value !== 'number' || !isFinite(value)) {
      return { code: 'UNIT_DIMENSION', error: 'INVALID_VALUE', message: 'value debe ser un numero finito' };
    }
    var dimName = dimension ? DIM_INDEX[canonicalize(dimension)] : undefined;
    if (dimension && !dimName) {
      return { code: 'UNIT_UNKNOWN', error: 'DIMENSION_UNKNOWN', dimension: canonicalize(dimension), message: 'dimension desconocida' };
    }
    var fe = resolveUnit(fromUnit, dimName);
    if (!fe) {
      return { code: 'UNIT_UNKNOWN', error: 'FROM_UNKNOWN', from: fromUnit, dimension: dimName || null, message: 'unidad de origen desconocida' };
    }
    var te = resolveUnit(toUnit, dimName);
    if (!te) {
      return { code: 'UNIT_UNKNOWN', error: 'TO_UNKNOWN', to: toUnit, dimension: dimName || null, message: 'unidad de destino desconocida' };
    }
    if (fe.dim !== te.dim) {
      return { code: 'UNIT_DIMENSION', error: 'CROSS_DIMENSION', from: fe.dim, to: te.dim, message: 'unidades de dimensiones distintas' };
    }
    if (te.noTarget) {
      return { code: 'UNIT_DIMENSION', error: 'NO_TARGET', to: te.key, message: 'kelvin no es destino: la canonica de temperatura es °C' };
    }

    var warnings = [];
    var sameKey = fe.key === te.key;
    var factor = sameKey ? 1 : (fe.dim === 'temperatura' ? 1 : fe.f / te.f);
    var out = sameKey ? value : fromCanonical(te, toCanonical(fe, value));

    var result = {
      value: out,
      from: fe.key,
      to: te.key,
      factor: factor,
      dimension: fe.dim,
      canonical: fe.canonical
    };

    if (fe.warn) { warnings.push(fe.warn); }
    if (te.warn && te.warn !== fe.warn) { warnings.push(te.warn); }

    if (fe.dim === 'presion') {
      var fb = fe.basis || 'unknown';
      var tb = te.basis || 'unknown';
      result.basis = tb !== 'unknown' ? tb : fb;
      if (fb !== 'unknown' && tb !== 'unknown' && fb !== tb) { warnings.push('BASIS_MISMATCH'); }
    }
    if (warnings.length) { result.warnings = warnings; }
    return result;
  }

  // ---------------------------------------------------------------------
  // parseDate(raw, opts) — funciones puras, sin "hoy" (Date solo en UTC).
  // Formatos aceptados:
  //   YYYY-MM-DD[THH:mm:ss][Z] · YYYY[/.]MM[/.]DD · DD-MM-YYYY ·
  //   DD/MM/YYYY (ambiguo si ambos <=12) · DD.MM.YYYY ·
  //   DD-Mon-YYYY / DD Mon YYYY / Mon DD[,] YYYY (ene/abr/jun/jul/ago/
  //   sep/set/oct/nov/dic + EN jan..dec) · YYYYMMDD (8 digitos) ·
  //   numero o cadena numerica = serie Excel (epoch 1899-12-30 EXACTAMENTE
  //   como xlsx.js; valido 0..2958465 = 2200-12-31).
  // Ambigüedad slash: la spec fija 'default false→es', es decir lectura
  // DD/MM hispana. preferDMY:true FUERZA DD/MM aun cuando el segundo numero
  // >12 (then BAD_MONTH); por default la evidencia de rango desempata
  // (b>12 -> MM/DD, a>12 -> DD/MM). ambiguous:true en el caso dual.
  // Rechazos: mes>12 (BAD_MONTH), dia fuera del mes incluidos 31-02
  // (BAD_DAY), ano fuera de 1900-2200 (YEAR_RANGE), serie fuera de rango
  // (SERIAL_RANGE), vacio (EMPTY), inentendible (UNPARSEABLE).
  // ---------------------------------------------------------------------
  var EPOCH_1900 = Date.UTC(1899, 11, 30);
  var DAY_MS = 86400000;
  var SERIAL_MAX = 2958465; // 2200-12-31 con epoch 1899-12-30 (misma base que xlsx.js)
  var MONTHS = {
    en: { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 },
    es: { ene: 1, feb: 2, mar: 3, abr: 4, may: 5, jun: 6, jul: 7, ago: 8, sep: 9, set: 9, oct: 10, nov: 11, dic: 12 }
  };

  function pad2(n) { return (n < 10 ? '0' : '') + n; }

  function daysInMonth(year, month) {
    var d = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    if (month === 2 && ((year % 4 === 0 && year % 100 !== 0) || year % 400 === 0)) { return 29; }
    return d[month - 1];
  }

  function baseRes(format) {
    return { iso: null, ambiguous: false, format: format, reason: null };
  }

  function assemble(y, mo, d, format, hh, mi, ss) {
    var res = baseRes(format);
    if (mo < 1 || mo > 12) { res.reason = 'BAD_MONTH'; return res; }
    if (d < 1 || d > daysInMonth(y, mo)) { res.reason = 'BAD_DAY'; return res; }
    if (hh === undefined || hh === null) {
      res.iso = y + '-' + pad2(mo) + '-' + pad2(d);
      return res;
    }
    if (hh > 23 || mi > 59 || ss > 60) { res.reason = 'BAD_TIME'; return res; }
    res.iso = y + '-' + pad2(mo) + '-' + pad2(d) + 'T' + pad2(hh) + ':' + pad2(mi) + ':' + pad2(ss);
    return res;
  }

  function yearCheck(res, y) {
    if (res.iso && (y < 1900 || y > 2200)) { res.iso = null; res.reason = 'YEAR_RANGE'; }
    return res;
  }

  function monthNum(name) {
    var key = String(name).toLowerCase();
    if (Object.prototype.hasOwnProperty.call(MONTHS.es, key)) { return MONTHS.es[key]; }
    if (Object.prototype.hasOwnProperty.call(MONTHS.en, key)) { return MONTHS.en[key]; }
    // nombre completo ('julio', 'agosto', 'septiembre', 'january'...): los
    // primeros 3 letras desempatan sin ambiguedad en ambos idiomas.
    var p = key.slice(0, 3);
    if (Object.prototype.hasOwnProperty.call(MONTHS.es, p)) { return MONTHS.es[p]; }
    if (Object.prototype.hasOwnProperty.call(MONTHS.en, p)) { return MONTHS.en[p]; }
    return null;
  }

  function excelSerial(v) {
    var res = baseRes('excelSerial');
    if (!(v >= 0 && v <= SERIAL_MAX)) { res.reason = 'SERIAL_RANGE'; return res; }
    var day = Math.floor(v);
    var secs = Math.round((v - day) * 86400);
    if (secs >= 86400) { day += 1; secs -= 86400; }
    var d = new Date(EPOCH_1900 + day * DAY_MS + secs * 1000);
    var y = d.getUTCFullYear();
    if (y < 1900 || y > 2200) { res.reason = 'YEAR_RANGE'; return res; }
    var iso = y + '-' + pad2(d.getUTCMonth() + 1) + '-' + pad2(d.getUTCDate());
    if (secs > 0) {
      iso += 'T' + pad2(d.getUTCHours()) + ':' + pad2(d.getUTCMinutes()) + ':' + pad2(d.getUTCSeconds());
    }
    res.iso = iso;
    return res;
  }

  function parseDate(raw, opts) {
    var preferDMY = !!(opts && opts.preferDMY);
    if (raw === null || raw === undefined) { return baseResUnknown(); }
    if (typeof raw === 'number') {
      if (!isFinite(raw)) { var rn = baseRes('excelSerial'); rn.reason = 'SERIAL_RANGE'; return rn; }
      return excelSerial(raw);
    }
    if (typeof raw !== 'string') { return baseResUnknown(); }
    var s = raw.trim();
    if (s === '') { return baseResUnknown(); }

    // ISO con hora: 2026-06-05T08:30:00 (se tolera 'T' o espacio y sufijo Z).
    var isoT = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{1,2}):(\d{2})(?::(\d{2}))?Z?$/.exec(s);
    if (isoT) {
      var y1 = Number(isoT[1]);
      return yearCheck(assemble(y1, Number(isoT[2]), Number(isoT[3]), 'iso-datetime',
        Number(isoT[4]), Number(isoT[5]), isoT[6] === undefined ? 0 : Number(isoT[6])), y1);
    }

    // ISO compacto: 2026-06-05
    var isoD = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
    if (isoD) {
      var y2 = Number(isoD[1]);
      return yearCheck(assemble(y2, Number(isoD[2]), Number(isoD[3]), 'iso'), y2);
    }

    // YYYY/MM[/DD]
    var ymdSlash = /^(\d{4})\/(\d{1,2})(?:\/(\d{1,2}))?$/.exec(s);
    if (ymdSlash) {
      var y3 = Number(ymdSlash[1]);
      if (ymdSlash[3] === undefined) {
        var ry = baseRes(Number(ymdSlash[2]) >= 1 && Number(ymdSlash[2]) <= 12 ? 'ym' : 'ymd');
        ry.reason = 'INCOMPLETE';
        return ry;
      }
      return yearCheck(assemble(y3, Number(ymdSlash[2]), Number(ymdSlash[3]), 'ymd'), y3);
    }

    // 8 digitos: YYYYMMDD (si el anio no cae en rango, serie Excel larga).
    if (/^\d{8}$/.test(s)) {
      var y4 = Number(s.slice(0, 4));
      if (y4 >= 1900 && y4 <= 2200) {
        return yearCheck(assemble(y4, Number(s.slice(4, 6)), Number(s.slice(6, 8)), 'ymd8'), y4);
      }
    }

    // Serie Excel numerica.
    if (/^\d+(?:\.\d+)?$/.test(s)) {
      var n = parseFloat(s);
      if (isFinite(n) && n >= 0 && n <= SERIAL_MAX) { return excelSerial(n); }
      var rs = baseRes('excelSerial');
      rs.reason = 'SERIAL_RANGE';
      return rs;
    }

    // DD/MM/YYYY — ambiguo si ambos <=12; por spec default false→es (DD/MM);
    // preferDMY:true reafirma DD/MM. Si b>12 solo cabe MM/DD.
    var slash = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
    if (slash) {
      var a = Number(slash[1]), b = Number(slash[2]), y5 = Number(slash[3]);
      var ambiguous = a <= 12 && b <= 12;
      // default (preferDMY falsy): 'es' -> DD/MM; con evidencia de rango
      // (b>12) solo cabe MM/DD. preferDMY:true fuerza DD/MM incluso contra
      // la evidencia (=> BAD_MONTH si b>12), para datasets ES mixtos.
      var dmy = true;
      if (!ambiguous && a <= 12 && b > 12 && !preferDMY) { dmy = false; }
      var r = dmy ? assemble(y5, b, a, 'dmy') : assemble(y5, a, b, 'mdy');
      r.ambiguous = ambiguous;
      return yearCheck(r, y5);
    }

    // DD-MM-YYYY (lectura D-M-Y fija: los guiones no se declaran ambiguos)
    var dash = /^(\d{1,2})-(\d{1,2})-(\d{4})$/.exec(s);
    if (dash) {
      var y6 = Number(dash[3]);
      return yearCheck(assemble(y6, Number(dash[2]), Number(dash[1]), 'dmy'), y6);
    }

    // DD.MM.YYYY
    var dot = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(s);
    if (dot) {
      var y7 = Number(dot[3]);
      return yearCheck(assemble(y7, Number(dot[2]), Number(dot[1]), 'dmy'), y7);
    }

    // DD[- ]Mon[- ]YYYY
    var dmyName = /^(\d{1,2})[ \-]([A-Za-z]{3,9})[ \-](\d{4})$/.exec(s);
    if (dmyName) {
      var mn = monthNum(dmyName[2]);
      if (!mn) { var rn2 = baseRes('monthName'); rn2.reason = 'BAD_MONTH'; return rn2; }
      var y8 = Number(dmyName[3]);
      return yearCheck(assemble(y8, mn, Number(dmyName[1]), 'dmy-name'), y8);
    }

    // Mon DD[,] YYYY
    var mdyName = /^([A-Za-z]{3,9})[ \-](\d{1,2})(?:,?[ \-](\d{4}))?$/.exec(s);
    if (mdyName) {
      if (mdyName[3] === undefined) { var rc = baseRes('monthName'); rc.reason = 'INCOMPLETE'; return rc; }
      var mn2 = monthNum(mdyName[1]);
      if (!mn2) { var rn3 = baseRes('monthName'); rn3.reason = 'BAD_MONTH'; return rn3; }
      var y9 = Number(mdyName[3]);
      return yearCheck(assemble(y9, mn2, Number(mdyName[2]), 'mdy-name'), y9);
    }

    var ru = baseRes('unknown');
    ru.reason = 'UNPARSEABLE';
    return ru;
  }

  function baseResUnknown() {
    var r = baseRes('unknown');
    r.reason = 'EMPTY';
    return r;
  }

  // ---------------------------------------------------------------------
  // stripUnit('12.4 bar') -> {value:12.4, unit:'bar'}
  // stripUnit('1.500 psi') -> {value:1500, unit:'psi'} ('1.500' agrupa por
  // la regla (c) de normalizeNumber). unit=null si no hay texto tras el
  // numero; '45%' -> unit '%'. El texto de unidad se devuelve recortado
  // conservando caja/acentos: canonicalizalo con canonicalize() si lo usas
  // como clave.
  // ---------------------------------------------------------------------
  var STRIP_RE = /^([+-]?\d[\d .,]*\d|[+-]?\d)([\s\S]*)$/;

  function stripUnit(rawString) {
    if (typeof rawString !== 'string') { return { value: null, unit: null }; }
    var s = rawString
      .replace(/[\u00A0\u2007\u2002\u2003\u2009\u202F\u00B7]/g, ' ')
      .replace(/[\u2212\u2013]/g, '-')
      .trim();
    if (s === '') { return { value: null, unit: null }; }
    var m = STRIP_RE.exec(s);
    if (!m) { return { value: null, unit: s }; }
    var v = normalizeNumber(m[1]);
    if (v === null) { return { value: null, unit: s }; }
    var tail = m[2].trim();
    return { value: v, unit: tail === '' ? null : tail };
  }

  return {
    canonicalize: canonicalize,
    normalizeNumber: normalizeNumber,
    convert: convert,
    parseDate: parseDate,
    stripUnit: stripUnit,
    UNITS: UNITS,
    EPOCH_1900: EPOCH_1900
  };
});
