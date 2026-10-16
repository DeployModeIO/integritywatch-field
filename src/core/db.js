/* IntegrityWatch Field — db
   IndexedDB adapter for the integritywatch database (schema-driven). */
(function (root, factory) {
  'use strict';
  var api = factory(root);
  root.IW = root.IW || {};
  root.IW.core = root.IW.core || {};
  root.IW.core.db = api;
  if (typeof module === 'object' && module.exports) { module.exports = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  var DB_NAME = 'integritywatch';
  var DB_VERSION = 1;

  var SCHEMA = [
    { name: 'meta', keyPath: 'key', indexes: [] },
    { name: 'monitoringPoints', keyPath: 'id', indexes: ['systemId', 'sector'] },
    { name: 'readings', keyPath: 'id', indexes: ['mpId', 'date'] },
    { name: 'coupons', keyPath: 'id', indexes: ['mpId', 'pairId'] },
    { name: 'psvs', keyPath: 'id', indexes: ['assetId', 'status'] },
    { name: 'pipelineSystems', keyPath: 'id', indexes: ['operator'] },
    { name: 'lineAssets', keyPath: 'id', indexes: ['systemId', 'stationKm', 'type'] },
    { name: 'lineInspections', keyPath: 'id', indexes: ['systemId', 'lineAssetId', 'date'] },
    { name: 'apmAssets', keyPath: 'id', indexes: ['sector', 'category', 'criticality'] },
    { name: 'apmEvents', keyPath: 'id', indexes: ['assetId', 'start'] },
    { name: 'recommendations', keyPath: 'id', indexes: ['status', 'severity', 'fingerprint', 'entityStore'] },
    { name: 'importLog', keyPath: 'id', indexes: ['at'] },
    { name: 'mutationQueue', keyPath: 'id', indexes: ['createdAt'] }
  ];

  var _db = null;

  function available() {
    return typeof indexedDB !== 'undefined';
  }

  function requestResult(req) {
    return new Promise(function (resolve, reject) {
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
  }

  function open() {
    if (!available()) {
      var err = new Error('IndexedDB unavailable');
      err.code = 'E_NO_IDB';
      return Promise.reject(err);
    }
    return new Promise(function (resolve, reject) {
      var req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = function () {
        var db = req.result;
        SCHEMA.forEach(function (s) {
          if (!db.objectStoreNames.contains(s.name)) {
            var store = db.createObjectStore(s.name, { keyPath: s.keyPath });
            s.indexes.forEach(function (idx) { store.createIndex(idx, idx, { unique: false }); });
          }
        });
      };
      req.onsuccess = function () { _db = req.result; resolve(); };
      req.onerror = function () { reject(req.error); };
    });
  }

  function store(name, mode) {
    if (!_db) { return Promise.reject(new Error('db not open')); }
    return _db.transaction(name, mode || 'readonly').objectStore(name);
  }

  function getAll(name) {
    if (!_db) { return Promise.resolve([]); }
    return requestResult(store(name).getAll());
  }

  function get(name, id) {
    if (!_db) { return Promise.resolve(undefined); }
    return requestResult(store(name).get(id));
  }

  function put(name, rec) {
    if (!_db) { return Promise.resolve(rec); }
    return requestResult(store(name, 'readwrite').put(rec)).then(function () { return rec; });
  }

  function bulkPut(name, recs) {
    if (!_db) { return Promise.resolve(recs || []); }
    return new Promise(function (resolve, reject) {
      var tx = _db.transaction(name, 'readwrite');
      var os = tx.objectStore(name);
      (recs || []).forEach(function (rec) { os.put(rec); });
      tx.oncomplete = function () { resolve(recs || []); };
      tx.onerror = function () { reject(tx.error); };
    });
  }

  function remove(name, id) {
    if (!_db) { return Promise.resolve(); }
    return requestResult(store(name, 'readwrite').delete(id));
  }

  function clear(name) {
    if (!_db) { return Promise.resolve(); }
    return requestResult(store(name, 'readwrite').clear());
  }

  function query(name, index, value) {
    if (!_db) { return Promise.resolve([]); }
    return requestResult(store(name).index(index).getAll(value));
  }

  function count(name) {
    if (!_db) { return Promise.resolve(0); }
    return requestResult(store(name).count());
  }

  return {
    open: open,
    getAll: getAll,
    get: get,
    put: put,
    bulkPut: bulkPut,
    remove: remove,
    clear: clear,
    query: query,
    count: count
  };
});
