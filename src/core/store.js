/* IntegrityWatch Field — store
   Repository layer over an injected adapter (generic CRUD + meta key/value). */
(function (root, factory) {
  'use strict';
  var api = factory(root);
  root.IW = root.IW || {};
  root.IW.core = root.IW.core || {};
  root.IW.core.store = api;
  if (typeof module === 'object' && module.exports) { module.exports = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  var DAY_MS = 86400000;

  function emitChanged(storeName, type) {
    var bus = root.IW.core && root.IW.core.bus;
    if (bus && typeof bus.emit === 'function') {
      bus.emit('data:changed:' + storeName, { store: storeName, type: type });
    }
  }

  function copy(rec) {
    var out = {};
    for (var k in rec) {
      if (Object.prototype.hasOwnProperty.call(rec, k)) { out[k] = rec[k]; }
    }
    return out;
  }

  function stamp(rec, nowISO) {
    var now = nowISO || new Date().toISOString();
    var c = copy(rec);
    if (!c.createdAt) { c.createdAt = now; }
    c.updatedAt = now;
    return c;
  }

  function makeRepo(adapter, storeName, enqueue) {
    return {
      list: function () { return adapter.getAll(storeName); },
      get: function (id) { return adapter.get(storeName, id); },
      save: function (rec, nowISO) {
        var c = stamp(rec, nowISO);
        return adapter.put(storeName, c).then(function () {
          emitChanged(storeName, 'put');
          if (enqueue) { enqueue({ type: 'put', store: storeName, rec: c }); }
          return c;
        });
      },
      saveAll: function (recs) {
        var now = new Date().toISOString();
        var out = (recs || []).map(function (rec) { return stamp(rec, now); });
        return adapter.bulkPut(storeName, out).then(function () {
          emitChanged(storeName, 'bulk');
          return out;
        });
      },
      remove: function (id) {
        return adapter.remove(storeName, id).then(function () {
          emitChanged(storeName, 'remove');
          if (enqueue) { enqueue({ type: 'delete', store: storeName, id: id }); }
        });
      },
      clear: function () {
        return adapter.clear(storeName).then(function () { emitChanged(storeName, 'clear'); });
      }
    };
  }

  function corrosionApi() {
    return (root.IW.calc && root.IW.calc.corrosion) ? root.IW.calc.corrosion : null;
  }

  function computeCrMpy(c) {
    if (typeof c.wiMg !== 'number' || typeof c.wfMg !== 'number') { return; }
    if (typeof c.densityGcm3 !== 'number' || typeof c.areaIn2 !== 'number') { return; }
    var corrosion = corrosionApi();
    if (!corrosion || typeof corrosion.crFromWeightLoss !== 'function') { return; }
    var hours = c.exposedHours;
    if (typeof hours !== 'number' && typeof c.days === 'number') { hours = 24 * c.days; }
    if (typeof hours !== 'number') { return; }
    try {
      var r = corrosion.crFromWeightLoss({
        deltaWmg: c.wiMg - c.wfMg,
        densityGcm3: c.densityGcm3,
        areaIn2: c.areaIn2,
        hours: hours
      });
      if (r && typeof r.mpy === 'number') { return r.mpy; }
    } catch (e) {
      return undefined;
    }
    return undefined;
  }

  function makeCouponsRepo(adapter, enqueue) {
    var base = makeRepo(adapter, 'coupons', enqueue);
    return {
      list: base.list,
      get: base.get,
      saveAll: base.saveAll,
      remove: base.remove,
      clear: base.clear,
      save: function (rec, nowISO) {
        var c = copy(rec);
        if (typeof c.days === 'number') { c.exposedHours = 24 * c.days; }
        var cr = computeCrMpy(c);
        if (typeof cr === 'number') { c.crMpy = cr; }
        return base.save(c, nowISO);
      }
    };
  }

  function startOfUtcDay(ms) {
    var d = new Date(ms);
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  }

  function computePsvStatus(nextTestDate, nowISO) {
    if (!nextTestDate) { return 'ok'; }
    var next = Date.parse(nextTestDate);
    if (isNaN(next)) { return 'ok'; }
    var nowMs = nowISO ? Date.parse(nowISO) : Date.now();
    if (isNaN(nowMs)) { nowMs = Date.now(); }
    var today = startOfUtcDay(nowMs);
    var nextDay = startOfUtcDay(next);
    var overdue = today - 30 * DAY_MS;
    if (nextDay < overdue) { return 'overdue'; }
    if (nextDay < today) { return 'due'; }
    return 'ok';
  }

  function makePsvsRepo(adapter, enqueue) {
    var base = makeRepo(adapter, 'psvs', enqueue);
    return {
      list: base.list,
      get: base.get,
      saveAll: base.saveAll,
      remove: base.remove,
      clear: base.clear,
      save: function (rec, nowISO) {
        var c = copy(rec);
        c.status = computePsvStatus(c.nextTestDate, nowISO);
        return base.save(c, nowISO);
      }
    };
  }

  function makeMeta(adapter) {
    var repo = makeRepo(adapter, 'meta');
    return {
      get: function (key) {
        return adapter.get('meta', key).then(function (rec) { return rec ? rec.value : undefined; });
      },
      set: function (key, value) {
        return adapter.put('meta', { key: key, value: value }).then(function () {
          emitChanged('meta', 'put');
        });
      },
      list: repo.list
    };
  }

  function create(adapter) {
    var sq = root.IW.core && root.IW.core.syncQueue;
    var bus = root.IW.core && root.IW.core.bus;
    var meta = makeMeta(adapter);
    var endpointPromise = null;

    if (sq && typeof sq.enqueue === 'function' && bus && typeof bus.on === 'function') {
      bus.on('data:changed:meta', function () { endpointPromise = null; });
    }

    function enqueue(op) {
      if (!sq || typeof sq.enqueue !== 'function') { return; }
      try {
        if (!endpointPromise) {
          endpointPromise = meta.get('syncEndpoint').catch(function () { return null; });
        }
        endpointPromise.then(function (endpoint) {
          if (!endpoint) { return; }
          try { sq.enqueue(op); } catch (e) { /* never break save/remove */ }
        });
      } catch (e) { /* never break save/remove */ }
    }

    return {
      meta: meta,
      monitoringPoints: makeRepo(adapter, 'monitoringPoints', enqueue),
      readings: makeRepo(adapter, 'readings', enqueue),
      coupons: makeCouponsRepo(adapter, enqueue),
      psvs: makePsvsRepo(adapter, enqueue),
      pipelineSystems: makeRepo(adapter, 'pipelineSystems', enqueue),
      lineAssets: makeRepo(adapter, 'lineAssets', enqueue),
      lineInspections: makeRepo(adapter, 'lineInspections', enqueue),
      iliAnomalies: makeRepo(adapter, 'iliAnomalies', enqueue),
      apmAssets: makeRepo(adapter, 'apmAssets', enqueue),
      apmEvents: makeRepo(adapter, 'apmEvents', enqueue),
      recommendations: makeRepo(adapter, 'recommendations', enqueue),
      importLog: makeRepo(adapter, 'importLog', enqueue),
      mutationQueue: makeRepo(adapter, 'mutationQueue', enqueue)
    };
  }

  return { create: create };
});
