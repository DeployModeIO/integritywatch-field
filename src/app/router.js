/* IntegrityWatch Field — router
   Hash router with a frozen route table, param parsing and async view rendering. */
(function (root, factory) {
  'use strict';
  var api = factory(root);
  root.IW = root.IW || {};
  root.IW.app = root.IW.app || {};
  root.IW.app.router = api;
  if (typeof module === 'object' && module.exports) { module.exports = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  var ROUTES = Object.freeze([
    'dashboard',
    'corrosion',
    'corrosion/mp/:id',
    'psv',
    'psv/:id',
    'pipelines',
    'pipelines/:id',
    'apm',
    'apm/:id',
    'ingest',
    'recommendations',
    'reports',
    'reports/dossier/:mpId',
    'reports/datasheet/:psvId',
    'glossary',
    'assistant',
    'admin'
  ]);

  var DEFAULT_VIEWS = {
    'dashboard': 'dashboard',
    'corrosion': 'corrosion',
    'corrosion/mp/:id': 'corrosion',
    'psv': 'psv',
    'psv/:id': 'psv',
    'pipelines': 'pipelines',
    'pipelines/:id': 'pipelines',
    'apm': 'apm',
    'apm/:id': 'apm',
    'ingest': 'ingest',
    'recommendations': 'recommendations',
    'reports': 'reports',
    'reports/dossier/:mpId': 'reports',
    'reports/datasheet/:psvId': 'reports',
    'glossary': 'glossary',
    'assistant': 'assistant',
    'admin': 'admin'
  };

  var _routes = {};
  var _store = null;
  var _repos = null;
  var _bus = null;
  var _t = null;
  var _getSector = function () { return null; };
  var _container = null;

  ROUTES.forEach(function (pattern) { _routes[pattern] = DEFAULT_VIEWS[pattern]; });

  function register(pattern, viewId) {
    _routes[pattern] = viewId;
  }

  function decode(s) {
    try { return decodeURIComponent(s); } catch (e) { return s; }
  }

  function tSafe(key, fallback) {
    if (typeof _t === 'function') { return _t(key); }
    var i18n = root.IW.i18n;
    if (i18n && typeof i18n.t === 'function') { return i18n.t(key); }
    return fallback;
  }

  function matchPath(path) {
    var segs = path.split('/').filter(function (s) { return s !== ''; });
    for (var i = 0; i < ROUTES.length; i++) {
      var pattern = ROUTES[i];
      var psegs = pattern.split('/').filter(function (s) { return s !== ''; });
      if (psegs.length !== segs.length) { continue; }
      var params = {};
      var ok = true;
      for (var j = 0; j < psegs.length; j++) {
        var p = psegs[j];
        if (p.charAt(0) === ':') { params[p.slice(1)] = decode(segs[j]); }
        else if (p !== segs[j]) { ok = false; break; }
      }
      if (ok) { return { pattern: pattern, params: params }; }
    }
    return null;
  }

  function currentHash() {
    if (typeof location !== 'undefined' && location.hash) { return location.hash; }
    return '#/dashboard';
  }

  function container() {
    if (typeof _container === 'function') { return _container(); }
    return _container;
  }

  // Restart the enter animation on the view container (no-op without a DOM).
  function playEnter(node) {
    if (!node || typeof node.classList === 'undefined') { return; }
    node.classList.remove('view-enter');
    void node.offsetWidth;
    node.classList.add('view-enter');
  }

  function render() {
    if (typeof document === 'undefined') { return Promise.resolve(); }
    var path = currentHash().replace(/^#\/?/, '');
    var matched = matchPath(path);
    var viewId = matched ? _routes[matched.pattern] : 'dashboard';
    var params = matched ? matched.params : {};
    if (!viewId) { viewId = 'dashboard'; }

    var c = container();
    if (!c) { return Promise.resolve(); }
    c.textContent = '';

    var ctx = {
      store: _store,
      repos: _repos,
      bus: _bus,
      i18n: _t,
      navigate: navigate,
      sector: typeof _getSector === 'function' ? _getSector() : undefined,
      params: params
    };

    if (_bus && typeof _bus.emit === 'function') {
      _bus.emit('route:changed', { viewId: viewId, params: params });
    }

    var views = root.IW.views;
    var view = views && views[viewId];
    if (!view || typeof view.render !== 'function') {
      c.textContent = viewId + ' — ' + tSafe('common.moduleLoading', 'module loading…');
      return Promise.resolve();
    }

    var out;
    try {
      out = view.render(c, ctx);
    } catch (err) {
      return Promise.reject(err);
    }
    return Promise.resolve(out).then(function () {
      playEnter(c);
    }).catch(function (err) {
      c.textContent = '';
      var errEl = document.createElement('div');
      errEl.className = 'error-banner';
      errEl.setAttribute('role', 'alert');
      errEl.textContent = tSafe('common.viewError', 'View error') + ': ' + (err && err.message ? err.message : String(err));
      c.appendChild(errEl);
      if (typeof console !== 'undefined' && typeof console.error === 'function') { console.error(err); }
    });
  }

  function navigate(hash) {
    if (!hash) { hash = '#/dashboard'; }
    if (hash.charAt(0) !== '#') { hash = '#' + hash; }
    if (typeof location !== 'undefined') {
      if (location.hash === hash) { render(); } else { location.hash = hash; }
    } else {
      render();
    }
  }

  function onHashChange() { render(); }

  function configure(opts) {
    opts = opts || {};
    if (opts.store !== undefined) { _store = opts.store; }
    if (opts.repos !== undefined) { _repos = opts.repos; }
    if (opts.bus !== undefined) { _bus = opts.bus; }
    if (opts.t !== undefined) { _t = opts.t; }
    else if (opts.i18n && typeof opts.i18n.t === 'function') { _t = opts.i18n.t; }
    if (typeof opts.getSector === 'function') { _getSector = opts.getSector; }
    if (opts.container !== undefined) { _container = opts.container; }
  }

  function start() {
    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
      window.addEventListener('hashchange', onHashChange);
    }
    if (_bus && typeof _bus.on === 'function') {
      _bus.on('locale:changed', function () { render(); });
      _bus.on('sector:changed', function () { render(); });
    }
    return render();
  }

  return {
    ROUTES: ROUTES,
    register: register,
    configure: configure,
    start: start,
    navigate: navigate,
    matchPath: matchPath,
    render: render
  };
});
