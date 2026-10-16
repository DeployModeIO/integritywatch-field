/* IntegrityWatch Field — rules engine
   Rule evaluation, reconciliation and sweep over repository state (R1–R14). */
(function (root, factory) {
  'use strict';
  var api = factory(root);
  root.IW = root.IW || {};
  root.IW.rules = root.IW.rules || {};
  root.IW.rules.engine = api;
  if (typeof module === 'object' && module.exports) { module.exports = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  var DAY_MS = 86400000;
  var MAX_HISTORY = 50;

  function definitions() { return (root.IW && root.IW.rules) ? root.IW.rules.definitions : null; }
  function bus() { return (root.IW && root.IW.core) ? root.IW.core.bus : null; }

  function evaluate(state) {
    var defs = definitions();
    var rules = defs && defs.rules ? defs.rules : [];
    var findings = [];
    rules.forEach(function (r) {
      if (r && typeof r.evaluate === 'function') {
        var out = r.evaluate(state);
        if (out && out.length) { findings = findings.concat(out); }
      }
    });
    return findings;
  }

  function copyRec(rec) {
    var out = {};
    for (var k in rec) {
      if (Object.prototype.hasOwnProperty.call(rec, k)) { out[k] = rec[k]; }
    }
    if (Array.isArray(rec.history)) { out.history = rec.history.slice(); }
    if (rec.params && typeof rec.params === 'object') { out.params = Object.assign({}, rec.params); }
    return out;
  }

  function pushHistory(rec, entry) {
    if (!Array.isArray(rec.history)) { rec.history = []; }
    rec.history.push(entry);
    if (rec.history.length > MAX_HISTORY) {
      rec.history = rec.history.slice(rec.history.length - MAX_HISTORY);
    }
  }

  function reconcile(findings, existingRecs, opts) {
    opts = opts || {};
    var nowISO = opts.nowISO;
    var actor = opts.actor || 'local';
    var toCreate = [];
    var toUpdate = [];
    var toReopen = [];
    var byFingerprint = {};
    (existingRecs || []).forEach(function (r) { byFingerprint[r.fingerprint] = r; });
    var seen = {};
    (findings || []).forEach(function (f) {
      if (!f || !f.fingerprint) { return; }
      if (seen[f.fingerprint]) { return; }
      seen[f.fingerprint] = true;
      var existing = byFingerprint[f.fingerprint];
      if (!existing) {
        var rec = {
          id: f.fingerprint,
          ruleId: f.ruleId,
          fingerprint: f.fingerprint,
          severity: f.severity,
          entityStore: f.entityStore,
          entityId: f.entityId,
          messageKey: f.messageKey,
          params: f.params || {},
          status: 'open',
          createdAt: nowISO,
          lastTriggeredAt: nowISO,
          triggerCount: 1,
          history: [{ action: 'created', at: nowISO, by: actor }]
        };
        if (f.entityLabel !== undefined) { rec.entityLabel = f.entityLabel; }
        toCreate.push(rec);
      } else if (existing.status === 'resolved') {
        var reopened = copyRec(existing);
        reopened.status = 'open';
        reopened.lastTriggeredAt = nowISO;
        reopened.triggerCount = (existing.triggerCount || 0) + 1;
        delete reopened.resolvedAt;
        delete reopened.resolvedBy;
        delete reopened.resolveNote;
        pushHistory(reopened, { action: 'reopened', at: nowISO, by: actor });
        toReopen.push(reopened);
      } else {
        var updated = copyRec(existing);
        updated.lastTriggeredAt = nowISO;
        updated.triggerCount = (existing.triggerCount || 0) + 1;
        pushHistory(updated, { action: 'triggered', at: nowISO, by: actor });
        toUpdate.push(updated);
      }
    });
    return { toCreate: toCreate, toUpdate: toUpdate, toReopen: toReopen };
  }

  function mergeSettings(settings) {
    settings = settings || {};
    return {
      residualBandPct: typeof settings.residualBandPct === 'number' ? settings.residualBandPct : 20,
      availabilityThresholdPct: typeof settings.availabilityThresholdPct === 'number' ? settings.availabilityThresholdPct : 90,
      stuckSensorCount: typeof settings.stuckSensorCount === 'number' ? settings.stuckSensorCount : 10,
      zScoreThreshold: typeof settings.zScoreThreshold === 'number' ? settings.zScoreThreshold : 3
    };
  }

  function psvStatus(nextTestDate, nowISO) {
    if (!nextTestDate) { return 'ok'; }
    var next = Date.parse(nextTestDate);
    if (isNaN(next)) { return 'ok'; }
    var nowMs = nowISO ? Date.parse(nowISO) : Date.now();
    if (isNaN(nowMs)) { nowMs = Date.now(); }
    var d = new Date(nowMs);
    var today = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
    var nd = new Date(next);
    var nextDay = Date.UTC(nd.getUTCFullYear(), nd.getUTCMonth(), nd.getUTCDate());
    var overdue = today - 30 * DAY_MS;
    if (nextDay < overdue) { return 'overdue'; }
    if (nextDay < today) { return 'due'; }
    return 'ok';
  }

  var SEV_RANK = { low: 0, moderate: 1, high: 2, severe: 3 };

  function worstSeverity(list) {
    var worst = null;
    (list || []).forEach(function (s) {
      if (s && SEV_RANK[s] !== undefined) {
        if (worst === null || SEV_RANK[s] > SEV_RANK[worst]) { worst = s; }
      }
    });
    return worst;
  }

  function sweep(repos, settings, actor) {
    actor = actor || 'local';
    var cfg = mergeSettings(settings);
    var nowISO = new Date().toISOString();

    return Promise.all([
      repos.monitoringPoints.list(),
      repos.readings.list(),
      repos.coupons.list(),
      repos.psvs.list(),
      repos.apmAssets.list(),
      repos.apmEvents.list(),
      repos.recommendations.list(),
      repos.lineAssets.list(),
      repos.lineInspections.list()
    ]).then(function (data) {
      var state = {
        nowISO: nowISO,
        monitoringPoints: data[0],
        readings: data[1],
        coupons: data[2],
        psvs: data[3],
        apmAssets: data[4],
        apmEvents: data[5],
        recommendations: data[6],
        settings: cfg
      };
      var findings = evaluate(state);
      var plan = reconcile(findings, data[6], { nowISO: nowISO, actor: actor });
      var criticals = findings.filter(function (f) { return f.severity === 'critical'; }).length;

      var writes = [];
      plan.toCreate.forEach(function (rec) { writes.push(repos.recommendations.save(rec, nowISO)); });
      plan.toUpdate.forEach(function (rec) { writes.push(repos.recommendations.save(rec, nowISO)); });
      plan.toReopen.forEach(function (rec) { writes.push(repos.recommendations.save(rec, nowISO)); });

      // Refresh PSV status (ok/due/overdue) from nextTestDate.
      data[3].forEach(function (p) {
        var st = psvStatus(p.nextTestDate, nowISO);
        if (p.status !== st) {
          var c = {};
          for (var k in p) { if (Object.prototype.hasOwnProperty.call(p, k)) { c[k] = p[k]; } }
          c.status = st;
          writes.push(repos.psvs.save(c, nowISO));
        }
      });

      // Refresh lineAsset integrity severity = worst severity of its inspections.
      var inspectionsByAsset = {};
      data[8].forEach(function (insp) {
        var id = insp.lineAssetId;
        if (!id) { return; }
        if (!inspectionsByAsset[id]) { inspectionsByAsset[id] = []; }
        inspectionsByAsset[id].push(insp.severity);
      });
      data[7].forEach(function (asset) {
        var worst = worstSeverity(inspectionsByAsset[asset.id]);
        var newVal = worst === null ? null : worst;
        var current = asset.integritySeverity === undefined ? null : asset.integritySeverity;
        if (current !== newVal) {
          var c = {};
          for (var k2 in asset) { if (Object.prototype.hasOwnProperty.call(asset, k2)) { c[k2] = asset[k2]; } }
          if (newVal === null) { delete c.integritySeverity; }
          else { c.integritySeverity = newVal; }
          writes.push(repos.lineAssets.save(c, nowISO));
        }
      });

      writes.push(repos.meta.set('lastRulesRunISO', nowISO));

      return Promise.all(writes).then(function () {
        var summary = {
          created: plan.toCreate.length,
          updated: plan.toUpdate.length,
          reopened: plan.toReopen.length,
          criticals: criticals
        };
        var b = bus();
        if (b && typeof b.emit === 'function') {
          b.emit('rules:run', summary);
          if (summary.created > 0) { b.emit('recs:new', { count: summary.created }); }
        }
        return summary;
      });
    });
  }

  return { evaluate: evaluate, reconcile: reconcile, sweep: sweep };
});
