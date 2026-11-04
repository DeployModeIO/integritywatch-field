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

  function emitChanged(storeName, type, extra) {
    var bus = root.IW.core && root.IW.core.bus;
    if (bus && typeof bus.emit === 'function') {
      var payload = { store: storeName, type: type };
      if (extra) { for (var k in extra) { if (Object.prototype.hasOwnProperty.call(extra, k)) payload[k] = extra[k]; } }
      bus.emit('data:changed:' + storeName, payload);
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

  /* ── Enganche de auditoría (P4-C) ──────────────────────────────────────────
     Decisiones:
     - Guard anti-recursión: el store 'auditLog' NUNCA se auto-audita
       (security.auditlog.record escribe vía este mismo repo).
     - auditIsOn = módulo IW.security.auditlog presente con record(). Si el
       módulo no está cargado (tests sin security), los hooks son no-op exactos:
       ni lectura previa ni promesa extra de escritura.
     - Best-effort estricto: el write de negocio se COMMITEA primero (put/
       bulkPut/remove/clear del adapter) y luego se enlaza record() con .catch
       swallow: un fallo de auditoría jamás rompe ni revierte el write. La
       serialización FIFO vive en security/auditlog.js (_chain protege head/
       seq), así que aquí solo se espera lo mínimo (la promesa del propio
       record) para que save()/remove() resuelvan con la bitácora escrita.
     - create|update se decide ANTES del put con adapter.get(storeName, id):
       registro previo → 'update' (before/after), sin previo → 'create'
       (before: null). remove solo audita si existía algo que borrar.
     - before/after = registros COMPLETOS redactados (no diffs mínimos): los
       dataURL largos (photos[i].dataUrl, signature, etc.) se reemplazan por
       '[dataURL N bytes]' para no inflar la cadena de hash con binarios.
       La redacción es recursiva sobre objetos/arrays y deja el resto igual.
     - saveAll/clear emiten UNA entrada agregada ('bulk-write' con count,
       'bulk-clear' con count 0) SIN before/after: el diff por registro vive
       en el diario de commit de syncQueue; duplicarlo aquí rompería la
       granularidad documentada de auditlog (imports masivos = 1 entrada). ─ */
  var DATAURL_RE = /^data:[^;,]*;base64,/i;

  function auditApi() {
    var sec = root.IW.security;
    return (sec && sec.auditlog && typeof sec.auditlog.record === 'function') ? sec.auditlog : null;
  }

  function redactAudit(value) {
    if (typeof value === 'string') {
      return DATAURL_RE.test(value) ? '[dataURL ' + value.length + ' bytes]' : value;
    }
    if (Array.isArray(value)) {
      var arr = [];
      for (var i = 0; i < value.length; i++) { arr.push(redactAudit(value[i])); }
      return arr;
    }
    if (value && typeof value === 'object') {
      var out = {};
      for (var k in value) {
        if (Object.prototype.hasOwnProperty.call(value, k)) { out[k] = redactAudit(value[k]); }
      }
      return out;
    }
    return value;
  }

  function makeRepo(adapter, storeName, enqueue) {
    var auditable = storeName !== 'auditLog';

    function auditRecord(entry) {
      var al = auditApi();
      if (!al) { return Promise.resolve(undefined); }
      return Promise.resolve(al.record(entry)).catch(function () { return undefined; });
    }

    function prevOf(id) {
      return Promise.resolve(adapter.get(storeName, id)).catch(function () { return null; });
    }

    return {
      list: function () { return adapter.getAll(storeName); },
      get: function (id) { return adapter.get(storeName, id); },
      save: function (rec, nowISO) {
        var c = stamp(rec, nowISO);
        var wantAudit = auditable && !!auditApi();
        var pre = wantAudit ? prevOf(c.id) : Promise.resolve(null);
        return pre.then(function (prev) {
          return adapter.put(storeName, c).then(function () {
            emitChanged(storeName, 'put');
            if (enqueue) { enqueue({ type: 'put', store: storeName, rec: c }); }
            if (!wantAudit) { return undefined; }
            return auditRecord({
              action: prev ? 'update' : 'create',
              store: storeName,
              entityId: c.id,
              before: prev ? redactAudit(prev) : null,
              after: redactAudit(c)
            });
          });
        }).then(function () { return c; });
      },
      saveAll: function (recs) {
        var now = new Date().toISOString();
        var out = (recs || []).map(function (rec) { return stamp(rec, now); });
        var wantAudit = auditable && !!auditApi();
        return adapter.bulkPut(storeName, out).then(function () {
          emitChanged(storeName, 'bulk');
          if (wantAudit) {
            return auditRecord({ action: 'bulk-write', store: storeName, count: out.length });
          }
          return undefined;
        }).then(function () { return out; });
      },
      remove: function (id) {
        var wantAudit = auditable && !!auditApi();
        var pre = wantAudit ? prevOf(id) : Promise.resolve(null);
        return pre.then(function (prev) {
          return adapter.remove(storeName, id).then(function () {
            emitChanged(storeName, 'remove');
            if (enqueue) { enqueue({ type: 'delete', store: storeName, id: id }); }
            if (!wantAudit || !prev) { return undefined; }
            return auditRecord({ action: 'delete', store: storeName, entityId: id, before: redactAudit(prev) });
          });
        });
      },
      clear: function () {
        var wantAudit = auditable && !!auditApi();
        return adapter.clear(storeName).then(function () {
          emitChanged(storeName, 'clear');
          if (wantAudit) { return auditRecord({ action: 'bulk-clear', store: storeName, count: 0 }); }
          return undefined;
        });
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
          emitChanged('meta', 'put', { key: key });
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

    var repos = {
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
      // Bitácora local-inmutable: NO encola sync (sin enqueue) y su repo está
      // excluido del hook de auditoría por el guard 'auditLog' de makeRepo.
      auditLog: makeRepo(adapter, 'auditLog'),
      mutationQueue: makeRepo(adapter, 'mutationQueue', enqueue)
    };

    // initAudit NO es un repositorio: se define NO ENUMERABLE para que los
    // consumidores que enumeran Object.keys(repos) (exportImport.exportAll,
    // syncQueue, etc.) sigan viendo exactamente los stores de datos.
    Object.defineProperty(repos, 'initAudit', {
      enumerable: false,
      value: function (opts) {
        var al = auditApi();
        if (!al || typeof al.init !== 'function') {
          return Promise.reject(new Error('initAudit: IW.security.auditlog no está cargado'));
        }
        opts = opts || {};
        return al.init({ auditRepo: repos.auditLog, metaRepo: repos.meta, actorFn: opts.actorFn });
      }
    });

    return repos;
  }

  return { create: create };
});
