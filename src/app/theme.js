/* IntegrityWatch Field — theme
   Light/dark/system theme handling persisted to localStorage and synced with the bus. */
(function (root, factory) {
  'use strict';
  var api = factory(root);
  root.IW = root.IW || {};
  root.IW.app = root.IW.app || {};
  root.IW.app.theme = api;
  if (typeof module === 'object' && module.exports) { module.exports = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  var THEMES = ['light', 'dark', 'system'];
  var _theme = 'system';
  var _storage = null;
  var _meta = null;
  var _bus = null;
  var _mq = null;

  function getStorage() {
    if (_storage) { return _storage; }
    if (typeof localStorage !== 'undefined') { return localStorage; }
    return null;
  }

  function readStored() {
    var st = getStorage();
    if (st && typeof st.getItem === 'function') {
      var v = st.getItem('iw.theme');
      if (THEMES.indexOf(v) !== -1) { return v; }
    }
    return null;
  }

  function systemPrefersDark() {
    if (typeof matchMedia === 'undefined') { return false; }
    return matchMedia('(prefers-color-scheme: dark)').matches;
  }

  function apply() {
    if (typeof document === 'undefined' || !document.documentElement) { return _theme; }
    var resolved = _theme === 'system' ? (systemPrefersDark() ? 'dark' : 'light') : _theme;
    document.documentElement.setAttribute('data-theme', resolved);
    return resolved;
  }

  function persist() {
    var st = getStorage();
    if (st && typeof st.setItem === 'function') { st.setItem('iw.theme', _theme); }
    if (_meta && typeof _meta.set === 'function') {
      try { _meta.set('theme', _theme); } catch (err) { /* ignore */ }
    }
  }

  function emitChanged() {
    if (_bus && typeof _bus.emit === 'function') { _bus.emit('theme:changed', { theme: _theme }); }
  }

  function setTheme(theme) {
    if (THEMES.indexOf(theme) === -1) { return _theme; }
    _theme = theme;
    persist();
    apply();
    emitChanged();
    return _theme;
  }

  function cycle() {
    var i = THEMES.indexOf(_theme);
    return setTheme(THEMES[(i + 1) % THEMES.length]);
  }

  function init(opts) {
    opts = opts || {};
    if (opts.storage) { _storage = opts.storage; }
    if (opts.meta) { _meta = opts.meta; }
    if (opts.bus) { _bus = opts.bus; }

    var current = readStored();
    if (!current && _meta && _meta.theme != null && THEMES.indexOf(_meta.theme) !== -1) { current = _meta.theme; }
    _theme = current || 'system';

    if (typeof matchMedia !== 'undefined') {
      _mq = matchMedia('(prefers-color-scheme: dark)');
      var onChange = function () {
        if (_theme === 'system') { apply(); emitChanged(); }
      };
      if (typeof _mq.addEventListener === 'function') { _mq.addEventListener('change', onChange); }
      else if (typeof _mq.addListener === 'function') { _mq.addListener(onChange); }
    }

    apply();
    return _theme;
  }

  return {
    init: init,
    apply: apply,
    setTheme: setTheme,
    cycle: cycle,
    getTheme: function () { return _theme; }
  };
});
