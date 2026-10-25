/* IntegrityWatch Field — inspectionEvidence
   Pure rendering helpers for field evidence (signature, photos, sketch). */
(function (root, factory) {
  'use strict';
  var api = factory(root);
  root.IW = root.IW || {};
  root.IW.components = root.IW.components || {};
  root.IW.components.inspectionEvidence = api;
  if (typeof module === 'object' && module.exports) { module.exports = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  var _document = (typeof document !== 'undefined') ? document : null;

  function el(tag, attrs) {
    if (!_document) { return { nodeType: 1, tagName: tag.toUpperCase(), textContent: '', style: {}, appendChild: function () {}, setAttribute: function () {}, addEventListener: function () {} }; }
    var u = root.IW && root.IW.ui;
    if (u && typeof u.el === 'function') { return u.el.apply(u, arguments); }
    var node = _document.createElement(tag);
    if (attrs) {
      if (attrs.class) { node.className = attrs.class; }
      if (attrs.text !== undefined && attrs.text !== null) { node.textContent = attrs.text; }
      if (attrs.attrs) {
        for (var k in attrs.attrs) {
          if (Object.prototype.hasOwnProperty.call(attrs.attrs, k) && attrs.attrs[k] != null) {
            node.setAttribute(k, attrs.attrs[k]);
          }
        }
      }
      if (attrs.on) {
        for (var e in attrs.on) {
          if (Object.prototype.hasOwnProperty.call(attrs.on, e)) { node.addEventListener(e, attrs.on[e]); }
        }
      }
    }
    for (var i = 2; i < arguments.length; i++) {
      var c = arguments[i];
      if (c === null || c === undefined || c === false) { continue; }
      if (typeof c === 'string') { node.appendChild(_document.createTextNode(c)); }
      else if (c && c.nodeType) { node.appendChild(c); }
    }
    return node;
  }

  function tt(key) {
    var i18n = root.IW && root.IW.i18n;
    return (i18n && typeof i18n.t === 'function') ? i18n.t(key) : key;
  }

  function fmtDateLocal(iso) {
    if (!iso) { return ''; }
    try { return new Date(iso).toLocaleString(); } catch (e) { return String(iso); }
  }

  function fmtGps(gps) {
    if (!gps || typeof gps.lat !== 'number' || typeof gps.lon !== 'number') { return ''; }
    var d = 5;
    return gps.lat.toFixed(d) + ', ' + gps.lon.toFixed(d);
  }

  // Build a list of [labelKey, node] pairs for keyValueTable.
  // Returns an array with zero null entries; safe for direct use in keyValueTable.
  function renderEvidenceRows(rec) {
    if (!rec || typeof rec !== 'object') { return []; }
    var rows = [];

    if (rec.signature) {
      var img = el('img', { class: 'evidence-thumb', attrs: { src: rec.signature, alt: tt('evidence.signature.label'), loading: 'lazy' } });
      rows.push([tt('evidence.signature.label'), img]);
    }

    if (rec.photos && rec.photos.length > 0) {
      var grid = el('div', { class: 'photo-grid' });
      rec.photos.forEach(function (p) {
        var photoImg = el('img', { class: 'evidence-thumb', attrs: { src: p.dataUrl, alt: tt('evidence.photos.label'), loading: 'lazy' } });
        var caption = '';
        if (p.capturedAt) { caption += fmtDateLocal(p.capturedAt); }
        var gpsStr = fmtGps(p.gps);
        if (gpsStr) { caption += (caption ? ' · ' : '') + gpsStr; }
        var item = el('div', { class: 'photo-grid__item' }, photoImg);
        if (caption) { item.appendChild(el('span', { class: 'photo-grid__caption', text: caption })); }
        grid.appendChild(item);
      });
      rows.push([tt('evidence.photos.label'), grid]);
    }

    if (rec.sketch) {
      var skImg = el('img', { class: 'evidence-thumb', attrs: { src: rec.sketch, alt: tt('evidence.sketch.label'), loading: 'lazy' } });
      rows.push([tt('evidence.sketch.label'), skImg]);
    }

    return rows;
  }

  return { renderEvidenceRows: renderEvidenceRows };
});