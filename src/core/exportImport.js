/* IntegrityWatch Field — exportImport
   JSON export/import of all stores with merge/replace semantics and dry-run. */
(function (root, factory) {
  'use strict';
  var api = factory(root);
  root.IW = root.IW || {};
  root.IW.core = root.IW.core || {};
  root.IW.core.exportImport = api;
  if (typeof module === 'object' && module.exports) { module.exports = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  var APP = 'integritywatch-field';
  var VERSION = 1;
  var DEBUG_ONLY = 'mutationQueue';

  // Minimal per-store required-field schema (TASK 3). Field names match the
  // records actually produced by src/data/seed.js and the view save paths.
  var REQUIRED_FIELDS = {
    monitoringPoints: ['code'],
    readings: ['mpId', 'crMpy'],
    coupons: ['mpId'],
    psvs: ['tag'],
    pipelineSystems: ['name'],
    lineAssets: ['systemId'],
    lineInspections: ['systemId'],
    apmAssets: ['code'],
    apmEvents: ['assetId', 'start'],
    recommendations: ['ruleId']
  };

  function missingRequiredFields(name, rec) {
    var fields = REQUIRED_FIELDS[name];
    if (!fields || !fields.length) { return null; }
    var missing = [];
    fields.forEach(function (f) {
      var v = rec[f];
      if (v === undefined || v === null || v === '') { missing.push(f); }
    });
    return missing.length ? missing : null;
  }

  function exportStoreNames(store, debug) {
    return Object.keys(store).filter(function (k) {
      if (k === 'meta') { return false; }
      if (k === DEBUG_ONLY) { return !!debug; }
      return true;
    });
  }

  function exportAll(store, opts) {
    opts = opts || {};
    var names = exportStoreNames(store, opts.debug);
    return Promise.all(names.map(function (name) {
      return store[name].list().then(function (recs) { return { name: name, recs: recs }; });
    })).then(function (results) {
      var data = {};
      results.forEach(function (r) { data[r.name] = r.recs; });
      return { app: APP, version: VERSION, exportedAt: new Date().toISOString(), data: data };
    });
  }

  function isRecord(rec) {
    return typeof rec === 'object' && rec !== null && !Array.isArray(rec) &&
      rec.id !== undefined && rec.id !== null && rec.id !== '';
  }

  function idOf(rec) {
    return rec.id;
  }

  function importStore(repo, name, recs, opts, summary) {
    var valid = [];
    (recs || []).forEach(function (rec, i) {
      if (!isRecord(rec)) {
        summary.errors.push({
          code: 'E_BAD_RECORD',
          store: name,
          index: i,
          message: 'record must be an object with a non-empty id'
        });
        return;
      }
      var missing = missingRequiredFields(name, rec);
      if (missing) {
        summary.errors.push({
          code: 'E_SCHEMA',
          store: name,
          index: i,
          message: 'missing required field(s): ' + missing.join(', ')
        });
        return;
      }
      valid.push(rec);
    });

    return repo.list().then(function (existing) {
      var ids = {};
      existing.forEach(function (r) { ids[idOf(r)] = true; });

      var created = 0;
      var updated = 0;
      var deleted = 0;

      if (opts.mode === 'replace') {
        deleted = existing.length;
        created = valid.length;
      } else {
        valid.forEach(function (r) {
          if (ids[idOf(r)]) { updated++; } else { created++; }
        });
      }

      if (opts.dryRun) {
        summary.created += created;
        summary.updated += updated;
        summary.deleted += deleted;
        return null;
      }

      if (opts.mode === 'replace') {
        summary.deleted += deleted;
        return repo.clear().then(function () {
          return repo.saveAll(valid).then(function () { summary.created += created; });
        });
      }

      summary.created += created;
      summary.updated += updated;
      return repo.saveAll(valid);
    });
  }

  function importAll(store, payload, opts) {
    opts = opts || {};
    var mode = opts.mode === 'replace' ? 'replace' : 'merge';
    var dryRun = !!opts.dryRun;
    var summary = { created: 0, updated: 0, deleted: 0, errors: [] };

    if (!payload || typeof payload !== 'object' || typeof payload.data !== 'object' || payload.data === null) {
      summary.errors.push({ code: 'E_INVALID_PAYLOAD', store: null, index: -1, message: 'payload.data must be an object' });
      return Promise.resolve(summary);
    }

    var names = Object.keys(payload.data);
    var chain = Promise.resolve();
    names.forEach(function (name) {
      // Resolve a store only via its own property, never the prototype chain:
      // guards `__proto__` / `constructor` and any inherited key from resolving
      // to a non-repository and crashing.
      var repo = null;
      if (Object.prototype.hasOwnProperty.call(store, name) && store[name] && typeof store[name].list === 'function') {
        repo = store[name];
      }
      if (!repo) {
        summary.errors.push({ code: 'E_UNKNOWN_STORE', store: name, index: -1, message: 'unknown store: ' + name });
        return;
      }
      chain = chain.then(function () {
        return importStore(repo, name, payload.data[name], { mode: mode, dryRun: dryRun }, summary);
      });
    });
    return chain.then(function () { return summary; });
  }

  return { exportAll: exportAll, importAll: importAll };
});
