/* IntegrityWatch Field — report section model
   Pure factories for report section shapes. No DOM, no window, no locale formatting.
   Each factory returns a plain serialisable object copying only the fields passed in
   (empty arrays allowed; raw numbers and ISO strings preserved verbatim).

   Shapes:
     cover(o)      -> { type:'cover', titleKey, subtitleKey, meta:{period, generatedAtISO} }
     kpiRow(o)     -> { type:'kpiRow', titleKey, items:[{labelKey, value, unit, status}] }
     table(o)      -> { type:'table', titleKey, columns:[{key,labelKey,align}], rows:[{...}], emptyKey }
     list(o)       -> { type:'list', titleKey, items:[{textKey|text, status}] }
     text(o)       -> { type:'text', titleKey, bodyKey|body }
     chart(o)      -> { type:'chart', kind:'trend'|'cusum'|'bullet'|'matrix', titleKey, data, axis, bands }
      standards(o)  -> { type:'standards', titleKey, items:[{id,title}] }
      couponCards(o)-> { type:'couponCards', titleKey, items:[{label, roleKey, deltaW, density, areaIn2, hours, mpy, level, hasResult}] }
      disclaimer(o) -> { type:'disclaimer', labelKey, textKey } */
(function (root, factory) {
  'use strict';
  var api = factory(root);
  root.IW = root.IW || {};
  root.IW.reports = root.IW.reports || {};
  root.IW.reports.model = api;
  if (typeof module === 'object' && module.exports) { module.exports = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  function pick(src, keys) {
    var out = {};
    if (!src || typeof src !== 'object') { return out; }
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      if (src[k] !== undefined) { out[k] = src[k]; }
    }
    return out;
  }

  function hasKeys(obj) {
    for (var k in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, k)) { return true; }
    }
    return false;
  }

  function scalar(src, key, out) {
    if (src[key] !== undefined) { out[key] = src[key]; }
  }

  function cover(o) {
    o = o || {};
    var r = { type: 'cover' };
    scalar(o, 'titleKey', r);
    scalar(o, 'subtitleKey', r);
    scalar(o, 'subtitle', r);
    if (o.meta) {
      var meta = pick(o.meta, ['period', 'generatedAtISO']);
      if (hasKeys(meta)) { r.meta = meta; }
    }
    return r;
  }

  function kpiRow(o) {
    o = o || {};
    var r = { type: 'kpiRow', items: [] };
    scalar(o, 'titleKey', r);
    if (Array.isArray(o.items)) {
      r.items = o.items.map(function (it) { return pick(it, ['labelKey', 'value', 'unit', 'status']); });
    }
    return r;
  }

  function table(o) {
    o = o || {};
    var r = { type: 'table', columns: [], rows: [] };
    scalar(o, 'titleKey', r);
    scalar(o, 'emptyKey', r);
    if (Array.isArray(o.columns)) {
      r.columns = o.columns.map(function (c) { return pick(c, ['key', 'labelKey', 'align']); });
    }
    if (Array.isArray(o.rows)) {
      r.rows = o.rows.map(function (row) { return row && typeof row === 'object' ? Object.assign({}, row) : row; });
    }
    return r;
  }

  function list(o) {
    o = o || {};
    var r = { type: 'list', items: [] };
    scalar(o, 'titleKey', r);
    if (Array.isArray(o.items)) {
      r.items = o.items.map(function (it) { return pick(it, ['textKey', 'text', 'status']); });
    }
    return r;
  }

  function text(o) {
    o = o || {};
    var r = { type: 'text' };
    scalar(o, 'titleKey', r);
    scalar(o, 'bodyKey', r);
    scalar(o, 'body', r);
    scalar(o, 'noteKey', r);
    scalar(o, 'noteClass', r);
    return r;
  }

  function chart(o) {
    o = o || {};
    var r = { type: 'chart', bands: [] };
    scalar(o, 'kind', r);
    scalar(o, 'titleKey', r);
    scalar(o, 'data', r);
    scalar(o, 'axis', r);
    if (Array.isArray(o.bands)) { r.bands = o.bands; }
    return r;
  }

  function standards(o) {
    o = o || {};
    var r = { type: 'standards', items: [] };
    scalar(o, 'titleKey', r);
    if (Array.isArray(o.items)) {
      r.items = o.items.map(function (it) { return pick(it, ['id', 'title']); });
    }
    return r;
  }

  function couponCards(o) {
    o = o || {};
    var r = { type: 'couponCards', items: [] };
    scalar(o, 'titleKey', r);
    if (Array.isArray(o.items)) {
      r.items = o.items.map(function (it) {
        return pick(it, ['label', 'roleKey', 'deltaW', 'density', 'areaIn2', 'hours', 'mpy', 'level', 'hasResult']);
      });
    }
    return r;
  }

  function disclaimer(o) {
    o = o || {};
    var r = { type: 'disclaimer' };
    scalar(o, 'labelKey', r);
    scalar(o, 'textKey', r);
    return r;
  }

  return {
    cover: cover,
    kpiRow: kpiRow,
    table: table,
    list: list,
    text: text,
    chart: chart,
    standards: standards,
    couponCards: couponCards,
    disclaimer: disclaimer
  };
});
