/* IntegrityWatch Field — dbMemory
   In-memory Map adapter implementing the same contract as db (for Node/tests). */
(function (root, factory) {
  'use strict';
  var api = factory(root);
  root.IW = root.IW || {};
  root.IW.core = root.IW.core || {};
  root.IW.core.dbMemory = api;
  if (typeof module === 'object' && module.exports) { module.exports = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  function keyOf(rec) {
    return (rec.key !== undefined && rec.key !== null) ? rec.key : rec.id;
  }

  function createAdapter() {
    var stores = {};

    function store(name) {
      if (!stores[name]) { stores[name] = new Map(); }
      return stores[name];
    }

    return {
      open: function () { return Promise.resolve(); },
      getAll: function (name) {
        var m = store(name);
        var out = [];
        m.forEach(function (v) { out.push(v); });
        return Promise.resolve(out);
      },
      get: function (name, id) {
        var m = store(name);
        if (m.has(id)) { return Promise.resolve(m.get(id)); }
        var found = null;
        m.forEach(function (v) { if (v.id === id || v.key === id) { found = v; } });
        return Promise.resolve(found);
      },
      put: function (name, rec) {
        store(name).set(keyOf(rec), rec);
        return Promise.resolve(rec);
      },
      bulkPut: function (name, recs) {
        var m = store(name);
        (recs || []).forEach(function (rec) { m.set(keyOf(rec), rec); });
        return Promise.resolve(recs || []);
      },
      remove: function (name, id) {
        var m = store(name);
        var found = null;
        m.forEach(function (v) { if (v.id === id || v.key === id) { found = v; } });
        if (found) { m.delete(keyOf(found)); }
        return Promise.resolve();
      },
      clear: function (name) {
        store(name).clear();
        return Promise.resolve();
      },
      query: function (name, index, value) {
        var m = store(name);
        var out = [];
        m.forEach(function (v) { if (v[index] === value) { out.push(v); } });
        return Promise.resolve(out);
      },
      count: function (name) {
        return Promise.resolve(store(name).size);
      }
    };
  }

  var api = createAdapter();
  api.create = createAdapter;

  return api;
});
