/* IntegrityWatch Field — main
   Boot sequence: db, i18n, theme, seed, shell, router, scheduler and service worker. */
(function (root, factory) {
  'use strict';
  var api = factory(root);
  root.IW = root.IW || {};
  root.IW.app = root.IW.app || {};
  root.IW.app.main = api;
  if (typeof module === 'object' && module.exports) { module.exports = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  function tSafe(key, fallback) {
    var i18n = root.IW.i18n;
    return (i18n && typeof i18n.t === 'function') ? i18n.t(key) : fallback;
  }

  // Fixed-position banner for boot-time errors/notices: body is a grid, so an
  // in-flow banner would be auto-placed into the 240px sidebar cell.
  function fixedBanner(text) {
    var banner = document.createElement('div');
    banner.className = 'error-banner';
    banner.setAttribute('role', 'alert');
    banner.textContent = text;
    banner.style.position = 'fixed';
    banner.style.insetBlockStart = 'var(--sp-3)';
    banner.style.insetInlineStart = 'var(--sp-3)';
    banner.style.insetInlineEnd = 'var(--sp-3)';
    banner.style.zIndex = '1100';
    return banner;
  }

  function bootError(err) {
    if (typeof document === 'undefined') { return; }
    var banner = fixedBanner(tSafe('common.bootError', 'Boot error') + ': ' + (err && err.message ? err.message : String(err)));
    if (document.body) { document.body.appendChild(banner); }
  }

  function storage() {
    return (typeof localStorage !== 'undefined') ? localStorage : null;
  }

  function showFallbackNotice() {
    var message = tSafe('common.inMemoryNotice', 'IndexedDB unavailable; running with in-memory storage. Changes may not persist.');
    if (typeof document === 'undefined') { return; }
    var ui = root.IW.ui;
    if (ui && typeof ui.toast === 'function') {
      try { ui.toast(message, { severity: 'warning' }); return; } catch (e) { /* fall through to banner */ }
    }
    var banner = fixedBanner(message);
    if (document.body) { document.body.appendChild(banner); }
  }

  function boot() {
    var bus = root.IW.core.bus;
    var theme = root.IW.app.theme;
    var i18n = root.IW.i18n;
    var shell = root.IW.app.shell;
    var router = root.IW.app.router;
    var db = root.IW.core.db;
    var storeApi = root.IW.core.store;
    var seed = root.IW.data.seed;
    var syncQueue = root.IW.core.syncQueue;

    var adapter = db;
    var repos = null;
    var syncEndpointCache = null;

    function loadSyncEndpoint() {
      if (!repos) { return Promise.resolve(null); }
      return repos.meta.get('syncEndpoint').then(function (endpoint) {
        syncEndpointCache = endpoint || null;
        return syncEndpointCache;
      });
    }

    if (bus && typeof bus.on === 'function') {
      bus.on('data:changed:meta', function () { loadSyncEndpoint(); });
    }

    return Promise.resolve()
      .then(function () {
        return adapter.open().catch(function (err) {
          var memory = root.IW.core.dbMemory;
          var fallback = (memory && typeof memory.create === 'function') ? memory.create() : null;
          if (!fallback) { throw err; }
          if (typeof console !== 'undefined' && typeof console.warn === 'function') {
            console.warn('IndexedDB open failed, falling back to in-memory storage:', err);
          }
          adapter = fallback;
          showFallbackNotice();
          return fallback.open();
        });
      })
      .then(function () {
        repos = storeApi.create(adapter);
        return i18n.init({ locales: root.IW_LOCALES, bus: bus, storage: storage() });
      })
      .then(function () {
        return repos.meta.get('theme').then(function (metaTheme) {
          theme.init({ storage: storage(), meta: { theme: metaTheme }, bus: bus });
        });
      })
      .then(function () {
        return repos.meta.get('demoLoaded').then(function (loaded) {
          if (loaded === undefined || loaded === null || loaded === false) {
            return Promise.resolve()
              .then(function () {
                if (seed && typeof seed.demo === 'function') { return seed.demo(repos); }
                return null;
              })
              .then(function () { return repos.meta.set('demoLoaded', true); })
              .catch(function (err) {
                if (typeof console !== 'undefined' && typeof console.warn === 'function') { console.warn('demo seed unavailable:', err); }
              });
          }
          return undefined;
        });
      })
      .then(function () {
        if (typeof document === 'undefined') { return; }
        var rootEl = document.getElementById('app') || document.body;
        var shellHandle = shell.mount({ root: rootEl, repos: repos, store: storeApi, bus: bus, i18n: i18n });
        router.configure({
          store: storeApi,
          repos: repos,
          bus: bus,
          t: i18n.t,
          getSector: function () { return shellHandle.getSector(); },
          container: function () { return document.getElementById('main'); }
        });
        return router.start();
      })
      .then(function () {
        if (!syncQueue || typeof syncQueue.init !== 'function') { return undefined; }
        return loadSyncEndpoint().then(function () {
          return syncQueue.init({
            bus: bus,
            adapter: adapter,
            getEndpoint: function () { return syncEndpointCache; }
          });
        });
      })
      .then(function () { registerServiceWorker(); })
      .catch(function (err) {
        if (typeof console !== 'undefined' && typeof console.error === 'function') { console.error('boot failed:', err); }
        bootError(err);
      });
  }

  function registerServiceWorker() {
    if (typeof navigator === 'undefined' || typeof navigator.serviceWorker === 'undefined') { return; }
    if (typeof location === 'undefined') { return; }
    if (location.protocol !== 'http:' && location.protocol !== 'https:') { return; }
    navigator.serviceWorker.register('sw.js').then(function (reg) {
      // Force an update check on every load so a new release is picked up on the next reload.
      // Requires bumping CACHE_NAME in sw.js for every release: node tools/bump-cache.cjs
      if (reg && typeof reg.update === 'function') { reg.update().catch(function () {}); }
    }).catch(function (err) {
      if (typeof console !== 'undefined' && typeof console.warn === 'function') { console.warn('SW registration failed:', err); }
    });
    navigator.serviceWorker.addEventListener('message', function (event) {
      if (event && event.data && event.data.type === 'sw:updated') {
        var bus = root.IW.core.bus;
        if (bus && typeof bus.emit === 'function') { bus.emit('sw:update', event.data); }
      }
    });
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function () { boot(); });
    } else {
      boot();
    }
  }

  return { boot: boot, registerServiceWorker: registerServiceWorker };
});
