/* IntegrityWatch Field — i18n
   Locale resolution, translation with plain-text param interpolation, and
   number/date formatting via Intl. Public API per CONTRACTS.md §4.11. */
(function (root, factory) {
  'use strict';
  var api = factory(root);
  root.IW = root.IW || {};
  root.IW.i18n = api;
  if (typeof module === 'object' && module.exports) { module.exports = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  var _locale = 'en';
  var _bus = null;
  var _storage = null;
  var _locales = null;

  // Registered locale tables come from the injected `locales` option or the
  // global IW_LOCALES populated by each src/i18n/locales/*.js file.
  function locales() {
    if (_locales) { return _locales; }
    return root.IW_LOCALES || {};
  }

  function getLocale() { return _locale; }

  // Storage abstraction: supports localStorage-like (getItem/setItem) and
  // Map-like (get/set) objects so tests can inject a plain Map.
  function storageGet(key) {
    var st = _storage;
    if (!st && typeof localStorage !== 'undefined') { st = localStorage; }
    if (!st) { return null; }
    if (typeof st.getItem === 'function') { return st.getItem(key); }
    if (typeof st.get === 'function') { return st.get(key); }
    return null;
  }

  function storageSet(key, value) {
    var st = _storage;
    if (!st && typeof localStorage !== 'undefined') { st = localStorage; }
    if (!st) { return; }
    if (typeof st.setItem === 'function') { st.setItem(key, value); return; }
    if (typeof st.set === 'function') { st.set(key, value); return; }
  }

  // Resolve a dotted key 'a.b.c' inside a locale table. Returns the string
  // value or undefined when the path does not reach a string.
  function resolve(locale, key) {
    var table = locales()[locale];
    if (!table) { return undefined; }
    var parts = String(key).split('.');
    var cur = table;
    for (var i = 0; i < parts.length; i++) {
      if (cur === null || cur === undefined) { return undefined; }
      cur = cur[parts[i]];
    }
    return (typeof cur === 'string') ? cur : undefined;
  }

  // Substitute {{name}} placeholders with plain-text param values. Missing or
  // null/undefined params leave the placeholder untouched.
  function interpolate(template, params) {
    return template.replace(/\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g, function (match, name) {
      var v = params[name];
      return (v === undefined || v === null) ? match : String(v);
    });
  }

  function t(key, params) {
    var val = resolve(_locale, key);
    if (val === undefined && _locale !== 'en') { val = resolve('en', key); }
    if (val === undefined) { val = key; }
    if (params) { val = interpolate(val, params); }
    return val;
  }

  function setLocale(code) {
    var table = locales();
    if (!table[code]) { code = 'en'; }
    _locale = code;
    storageSet('iw.locale', code);
    if (typeof document !== 'undefined' && document.documentElement) {
      var meta = (table[code] && table[code].__meta) || {};
      document.documentElement.lang = code;
      document.documentElement.dir = meta.dir || 'ltr';
    }
    if (_bus && typeof _bus.emit === 'function') {
      _bus.emit('locale:changed', { locale: code });
    }
    return code;
  }

  function listLocales() {
    var table = locales();
    return Object.keys(table).map(function (code) {
      var meta = (table[code] && table[code].__meta) || {};
      return {
        code: code,
        name: meta.name || code,
        nativeName: meta.nativeName || code,
        dir: meta.dir || 'ltr'
      };
    });
  }

  function formatNumber(v, opts) {
    try { return new Intl.NumberFormat(_locale, opts).format(v); } catch (e) { return String(v); }
  }

  function formatDate(iso, opts) {
    try { return new Intl.DateTimeFormat(_locale, opts).format(new Date(iso)); } catch (e) { return String(iso); }
  }

  function init(opts) {
    opts = opts || {};
    if (opts.locales) { _locales = opts.locales; }
    if (opts.bus) { _bus = opts.bus; }
    if (opts.storage) { _storage = opts.storage; }
    var stored = storageGet('iw.locale');
    if (stored && locales()[stored]) { _locale = stored; }
    return Promise.resolve(api);
  }

  var api = {
    init: init,
    t: t,
    setLocale: setLocale,
    getLocale: getLocale,
    listLocales: listLocales,
    formatNumber: formatNumber,
    formatDate: formatDate
  };

  return api;
});
