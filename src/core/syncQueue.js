/* IntegrityWatch Field — syncQueue
   Offline mutation queue with backoff retry and online auto-flush. */
(function (root, factory) {
  'use strict';
  var api = factory(root);
  root.IW = root.IW || {};
  root.IW.core = root.IW.core || {};
  root.IW.core.syncQueue = api;
  if (typeof module === 'object' && module.exports) { module.exports = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  var BACKOFF_MS = [1000, 5000, 30000];
  var MAX_ATTEMPTS = 5;
  var STORE = 'mutationQueue';

  var _bus = null;
  var _adapter = null;
  var _getEndpoint = null;
  var _fetch = null;
  var _online = null;
  var _pendingCount = 0;
  var _seq = 0;

  function defaultScheduler(cb, ms) {
    var t = setTimeout(cb, ms);
    if (t && typeof t.unref === 'function') { t.unref(); }
  }

  var _scheduler = defaultScheduler;

  function emit(evt, payload) {
    if (_bus && typeof _bus.emit === 'function') { _bus.emit(evt, payload); }
  }

  function isOnline() {
    if (_online) { return _online(); }
    if (typeof navigator !== 'undefined' && typeof navigator.onLine === 'boolean') { return navigator.onLine; }
    return true;
  }

  function resolveFetch() {
    if (_fetch) { return _fetch; }
    if (typeof fetch === 'function') { return fetch; }
    return null;
  }

  function newId() {
    _seq += 1;
    var rnd = (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function')
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2, 10);
    return 'mq-' + Date.now().toString(36) + '-' + _seq.toString(36) + '-' + rnd;
  }

  function isPending(row) {
    return !row.sentISO && !row.dead;
  }

  function refreshCount() {
    if (!_adapter) { _pendingCount = 0; return Promise.resolve(); }
    return _adapter.getAll(STORE).then(function (rows) {
      _pendingCount = (rows || []).filter(isPending).length;
    });
  }

  function backoffMs(attempts) {
    var idx = attempts - 1;
    if (idx < 0) { idx = 0; }
    if (idx >= BACKOFF_MS.length) { idx = BACKOFF_MS.length - 1; }
    return BACKOFF_MS[idx];
  }

  function scheduleRetry(attempts) {
    _scheduler(function () { flush(); }, backoffMs(attempts));
  }

  function failRecord(row) {
    row.attempts = (row.attempts || 0) + 1;
    row.lastAttemptISO = new Date().toISOString();
    if (row.attempts >= MAX_ATTEMPTS) { row.dead = true; }
    return _adapter.put(STORE, row).then(function () { return false; });
  }

  function isSuccess(res) {
    return !!res && (res.ok === true ||
      (typeof res.status === 'number' && res.status >= 200 && res.status < 300));
  }

  function postOne(row) {
    var endpoint = _getEndpoint ? _getEndpoint() : null;
    if (!endpoint) { return Promise.resolve(false); }
    var fetchFn = resolveFetch();
    if (!fetchFn) { return Promise.resolve(false); }

    var p;
    try {
      p = fetchFn(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(row.op),
        keepalive: false
      });
    } catch (e) {
      return failRecord(row);
    }

    return Promise.resolve(p).then(function (res) {
      if (isSuccess(res)) {
        row.sentISO = new Date().toISOString();
        row.lastAttemptISO = row.sentISO;
        return _adapter.put(STORE, row).then(function () { return true; });
      }
      return failRecord(row);
    }).catch(function () {
      return failRecord(row);
    });
  }

  function init(opts) {
    opts = opts || {};
    _bus = opts.bus || null;
    _adapter = opts.adapter || null;
    _getEndpoint = opts.getEndpoint || function () { return null; };
    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
      window.addEventListener('online', function () { flush(); });
    }
    return refreshCount();
  }

  function enqueue(op) {
    if (!_adapter) { return Promise.resolve(null); }
    var rec = {
      id: newId(),
      op: op,
      createdAt: new Date().toISOString(),
      attempts: 0,
      dead: false
    };
    return _adapter.put(STORE, rec).then(function () {
      _pendingCount += 1;
      return rec;
    });
  }

  function flush() {
    if (!_adapter) { return Promise.resolve({ sent: 0, failed: 0 }); }
    if (!isOnline()) { return Promise.resolve({ sent: 0, failed: 0 }); }
    var endpoint = _getEndpoint ? _getEndpoint() : null;
    if (!endpoint) { return Promise.resolve({ sent: 0, failed: 0 }); }

    return _adapter.getAll(STORE).then(function (rows) {
      var pending = (rows || []).filter(isPending);
      if (pending.length === 0) {
        return refreshCount().then(function () { return { sent: 0, failed: 0 }; });
      }

      var sent = 0;
      var failed = 0;
      var chain = Promise.resolve();
      pending.forEach(function (row) {
        chain = chain.then(function () {
          return postOne(row).then(function (ok) {
            if (ok) { sent++; } else { failed++; }
          });
        });
      });

      return chain.then(function () {
        var stillPending = pending.filter(isPending);
        var maxAttempts = 0;
        stillPending.forEach(function (r) {
          if ((r.attempts || 0) > maxAttempts) { maxAttempts = r.attempts; }
        });
        emit('queue:flushed', { sent: sent, failed: failed });
        if (stillPending.length > 0 && maxAttempts > 0) {
          scheduleRetry(maxAttempts);
        }
        return refreshCount().then(function () { return { sent: sent, failed: failed }; });
      });
    });
  }

  function pending() {
    return _pendingCount;
  }

  return {
    init: init,
    enqueue: enqueue,
    flush: flush,
    pending: pending,
    __setFetch: function (fn) { _fetch = fn; },
    __setScheduler: function (fn) { _scheduler = fn || defaultScheduler; },
    __setOnline: function (fn) { _online = fn; }
  };
});
