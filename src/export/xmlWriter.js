/* IntegrityWatch Field — export.xmlWriter
    Escritor XML sin dependencias, espejo de los lectores tolerantes propios:
    objToXml (informes genéricos, releíbles por IW.ingest.formats 'xml') y
    witsmlOut (WITSML-lite EXACTO que lee IW.ingest.witsmlLite.parse).

    Decisiones documentadas:
    - Escape único & < > " ' siempre (vale para texto y atributos) más los
      control chars < 0x20 salvo \t \n \r, que se emiten como referencia
      numérica &#xN;. Limite: XML 1.0 prohíbe esos códigos incluso referidos;
      nuestros lectores tolerantes (witsmlLite/formats) los decodifican igual
      y preservan el dato (no lo borramos en silencio).
    - Nombres de elemento/clave se SANITIZAN a [A-Za-z_][\w.-]*: cualquier otro
      carácter (espacios, acentos, '!') pasa a '_' y si el primer carácter no
      es letra o '_' se le antepone '_'. Los VALORES conservan acentos crudos
      (UTF-8), como en csvWriter.
    - Arrays → elementos repetidos con el mismo nombre, recursivo para objetos
      anidados. null/undefined/objeto vacío → <tag/>; array vacío → nada.
      Array en la raíz → N <rootName> hermanos (válido para nuestros lectores
      tolerantes, no para un parser estricto).
    - opts.indent: número (espacios) o true (2) → multilínea; ausente/false/0
      → compacto. La declaración XML siempre va en su propia línea.
    - witsmlOut emite UN <channel> por lectura con su único <point/>, en el
      orden exacto de entrada: así parse() reconstruye las mismas lecturas
      (simetría dura probada en tests) y formats 'witsml' saca las filas
      [code, fecha, valor, unidad, source]. code = mpCodeByMpId[mpId], si no
      reading.mpCode, si no String(mpId). Lecturas sin fecha o sin valor
      numérico finito se OMITEN (un point sin time/value dispararía
      E_WITSML_POINT en el lector; preferimos no escribirlo). unit ausente →
      sin atributo. */
(function (root, factory) {
  'use strict';
  var api = factory(root);
  root.IW = root.IW || {};
  root.IW.export = root.IW.export || {};
  root.IW.export.xmlWriter = api;
  if (typeof module === 'object' && module.exports) { module.exports = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  var DECL = '<?xml version="1.0" encoding="UTF-8"?>';

  // Single-pass escape: five predefined entities + control chars (except
  // \t \n \r) as numeric references, so the '&' of a reference is never
  // re-escaped by a second pass.
  var ESC_RE = /[&<>"'\u0000-\u0008\u000B\u000C\u000E-\u001F]/g;
  function escapeXml(s) {
    return String(s).replace(ESC_RE, function (c) {
      switch (c) {
        case '&': return '&amp;';
        case '<': return '&lt;';
        case '>': return '&gt;';
        case '"': return '&quot;';
        case "'": return '&apos;';
        default: return '&#x' + c.charCodeAt(0).toString(16) + ';';
      }
    });
  }

  // Element/keys names folded to [A-Za-z_][\w.-]* (see header decisions).
  function sanitizeName(s, fallback) {
    var n = (s === null || s === undefined || s === '') ? String(fallback) : String(s);
    n = n.replace(/[^A-Za-z0-9_.\-]/g, '_');
    if (!/^[A-Za-z_]/.test(n)) { n = '_' + n; }
    return n;
  }

  function toPad(indent) {
    if (indent === undefined || indent === false || indent === 0) { return ''; }
    if (indent === true) { return '  '; }
    if (typeof indent === 'number' && isFinite(indent) && indent >= 1) {
      return new Array(Math.floor(indent) + 1).join(' ');
    }
    if (typeof indent === 'string') { return indent; }
    return '';
  }

  // Generic object → XML. rootName sanitized; obj recursed per the rules above.
  function objToXml(rootName, obj, opts) {
    opts = opts || {};
    var pad = toPad(opts.indent);
    var NL = pad ? '\n' : '';
    function prefix(depth) { return pad ? pad.repeat(depth) : ''; }

    function ser(name, value, depth) {
      var p = prefix(depth);
      if (Array.isArray(value)) {
        return value.map(function (item) {
          return ser(name, item, depth);
        }).join(NL);
      }
      if (value === null || value === undefined) { return p + '<' + name + '/>'; }
      if (value instanceof Date) { return scalar(name, isNaN(value.getTime()) ? '' : value.toISOString(), p); }
      if (typeof value === 'object') {
        var keys = Object.keys(value);
        if (!keys.length) { return p + '<' + name + '/>'; }
        var kids = keys.map(function (k) {
          return ser(sanitizeName(k, 'item'), value[k], depth + 1);
        }).join(NL);
        return p + '<' + name + '>' + NL + kids + NL + p + '</' + name + '>';
      }
      return scalar(name, String(value), p);
    }
    function scalar(name, text, p) {
      return p + '<' + name + '>' + escapeXml(text) + '</' + name + '>';
    }

    return DECL + '\n' + ser(sanitizeName(rootName, 'root'), obj, 0);
  }

  // One point per reading, one channel per reading: the exact shape
  // IW.ingest.witsmlLite.parse scans (attribute-only <point/> leaves inside
  // explicitly closed <channel> blocks; '>' never raw inside attributes).
  function witsmlOut(readings, opts) {
    opts = opts || {};
    var map = opts.mpCodeByMpId || {};
    var hasOwn = Object.prototype.hasOwnProperty;

    function codeOf(r) {
      if (r.mpId !== undefined && r.mpId !== null && hasOwn.call(map, String(r.mpId))) {
        return String(map[String(r.mpId)]);
      }
      if (r.mpCode !== undefined && r.mpCode !== null && r.mpCode !== '') { return String(r.mpCode); }
      if (r.mpId !== undefined && r.mpId !== null && r.mpId !== '') { return String(r.mpId); }
      return null;
    }
    function timeOf(v) {
      if (typeof v === 'string' && v !== '') { return v; }
      if (v instanceof Date && !isNaN(v.getTime())) { return v.toISOString(); }
      return null;
    }
    function valueOf(v) {
      if (typeof v === 'number' && isFinite(v)) { return String(v); }
      if (typeof v === 'string' && v.trim() !== '' && isFinite(Number(v))) { return String(Number(v)); }
      return null;
    }

    var lines = [DECL];
    var rootAttrs = ' version="1.4.1"';
    if (opts.companyId !== undefined && opts.companyId !== null && opts.companyId !== '') {
      rootAttrs += ' companyId="' + escapeXml(String(opts.companyId)) + '"';
    }
    lines.push('<witsml' + rootAttrs + '>');
    (readings || []).forEach(function (r) {
      if (!r || typeof r !== 'object') { return; }
      var code = codeOf(r);
      var time = timeOf(r.date);
      var value = valueOf(r.value);
      if (code === null || time === null || value === null) { return; }
      var attrs = ' name="' + escapeXml(code) + '" mpCode="' + escapeXml(code) + '"';
      if (r.wellUid !== undefined && r.wellUid !== null && r.wellUid !== '') {
        attrs += ' wellUid="' + escapeXml(String(r.wellUid)) + '"';
      }
      if (r.unit !== undefined && r.unit !== null && r.unit !== '') {
        attrs += ' unit="' + escapeXml(String(r.unit)) + '"';
      }
      lines.push('  <channel' + attrs + '>');
      lines.push('    <point time="' + escapeXml(time) + '" value="' + escapeXml(value) + '"/>');
      lines.push('  </channel>');
    });
    lines.push('</witsml>');
    return lines.join('\n') + '\n';
  }

  return {
    objToXml: objToXml,
    witsmlOut: witsmlOut,
    escapeXml: escapeXml,
    sanitizeName: sanitizeName
  };
});
