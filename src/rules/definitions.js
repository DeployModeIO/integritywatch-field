/* IntegrityWatch Field — rules definitions
   Pure rule catalogue R1–R15 evaluated over a state snapshot (SCHEMA §3, TESTS §11). */
(function (root, factory) {
  'use strict';
  var api = factory(root);
  root.IW = root.IW || {};
  root.IW.rules = root.IW.rules || {};
  root.IW.rules.definitions = api;
  if (typeof module === 'object' && module.exports) { module.exports = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  // Node-only sibling fallbacks so the calc modules resolve when this file is
  // required standalone (browser relies on script order in index.html).
  if (typeof require === 'function' && !(root.IW && root.IW.calc && root.IW.calc.corrosion)) {
    try { require('../calc/corrosion.js'); } catch (e) { /* ignore */ }
  }
  if (typeof require === 'function' && !(root.IW && root.IW.calc && root.IW.calc.apm)) {
    try { require('../calc/apm.js'); } catch (e) { /* ignore */ }
  }
  if (typeof require === 'function' && !(root.IW && root.IW.calc && root.IW.calc.remainingLife)) {
    try { require('../calc/remainingLife.js'); } catch (e) { /* ignore */ }
  }

  var HOUR_MS = 3600000;
  var DAY_MS = 86400000;

  function corrosion() { return (root.IW && root.IW.calc) ? root.IW.calc.corrosion : null; }
  function apm() { return (root.IW && root.IW.calc) ? root.IW.calc.apm : null; }
  function remainingLife() { return (root.IW && root.IW.calc) ? root.IW.calc.remainingLife : null; }

  function parse(iso) { return Date.parse(iso); }
  function r2(v) { return Math.round(v * 100) / 100; }

  function inLastMs(ms, nowMs, windowMs) {
    return !isNaN(ms) && ms <= nowMs && ms >= nowMs - windowMs;
  }

  function avg(list) {
    if (!list || list.length === 0) { return 0; }
    var s = 0;
    for (var i = 0; i < list.length; i++) { s += list[i]; }
    return s / list.length;
  }

  function populationStd(list) {
    var n = list.length;
    if (n === 0) { return 0; }
    var m = avg(list);
    var v = 0;
    for (var i = 0; i < n; i++) { v += (list[i] - m) * (list[i] - m); }
    return Math.sqrt(v / n);
  }

  function daysBetween(nowMs, refMs) { return Math.floor((nowMs - refMs) / DAY_MS); }

  function mpMap(state) {
    var map = {};
    (state.monitoringPoints || []).forEach(function (mp) { map[mp.id] = mp; });
    return map;
  }

  function readingsFor(state, mpId) {
    return (state.readings || []).filter(function (r) { return r.mpId === mpId; });
  }

  function makeFinding(ruleId, severity, entityStore, entityId, params, label) {
    return {
      ruleId: ruleId,
      severity: severity,
      entityStore: entityStore,
      entityId: entityId,
      messageKey: 'rules.msg.' + ruleId,
      params: params,
      fingerprint: ruleId + ':' + entityStore + ':' + entityId,
      entityLabel: label
    };
  }

  function isProbe(mp) {
    var t = mp && mp.sensorType;
    return t === 'erProbe' || t === 'lprProbe' || t === 'h2Probe';
  }

  // R1: any monitoring-point reading with crMpy >= 10 within the last 24 h -> critical.
  function R1(state) {
    var nowMs = parse(state.nowISO);
    var mps = mpMap(state);
    var maxCr = {};
    (state.readings || []).forEach(function (r) {
      if (typeof r.crMpy !== 'number' || r.crMpy < 10) { return; }
      if (!inLastMs(parse(r.date), nowMs, 24 * HOUR_MS)) { return; }
      var mp = mps[r.mpId];
      if (!mp) { return; }
      if (!(mp.id in maxCr) || r.crMpy > maxCr[mp.id]) { maxCr[mp.id] = r.crMpy; }
    });
    var findings = [];
    Object.keys(maxCr).forEach(function (mpId) {
      var mp = mps[mpId];
      findings.push(makeFinding('R1', 'critical', 'monitoringPoints', mpId, { code: mp.code, cr: r2(maxCr[mpId]) }, mp.code));
    });
    return findings;
  }

  // R2: per MP with >=5 readings in each window, avg7d >= 2 * avg30d (avg30d > 0) -> warning.
  function R2(state) {
    var nowMs = parse(state.nowISO);
    var findings = [];
    (state.monitoringPoints || []).forEach(function (mp) {
      var w7 = [];
      var w30 = [];
      readingsFor(state, mp.id).forEach(function (r) {
        var ms = parse(r.date);
        if (isNaN(ms) || typeof r.crMpy !== 'number') { return; }
        if (inLastMs(ms, nowMs, 7 * DAY_MS)) { w7.push(r.crMpy); }
        if (inLastMs(ms, nowMs, 30 * DAY_MS)) { w30.push(r.crMpy); }
      });
      if (w7.length < 5 || w30.length < 5) { return; }
      var avg7 = avg(w7);
      var avg30 = avg(w30);
      if (avg30 <= 0) { return; }
      if (avg7 >= 2 * avg30) {
        findings.push(makeFinding('R2', 'warning', 'monitoringPoints', mp.id,
          { code: mp.code, avg7: r2(avg7), avg30: r2(avg30), ratio: r2(avg7 / avg30) }, mp.code));
      }
    });
    return findings;
  }

  function couponCrMpy(c) {
    if (typeof c.crMpy === 'number') { return c.crMpy; }
    var corr = corrosion();
    if (!corr || typeof corr.crFromWeightLoss !== 'function') { return null; }
    if (typeof c.wiMg !== 'number' || typeof c.wfMg !== 'number') { return null; }
    if (typeof c.densityGcm3 !== 'number' || typeof c.areaIn2 !== 'number') { return null; }
    var hours = c.exposedHours;
    if (typeof hours !== 'number' && typeof c.days === 'number') { hours = 24 * c.days; }
    if (typeof hours !== 'number' || hours <= 0) { return null; }
    try {
      var res = corr.crFromWeightLoss({
        deltaWmg: c.wiMg - c.wfMg,
        densityGcm3: c.densityGcm3,
        areaIn2: c.areaIn2,
        hours: hours
      });
      return (res && typeof res.mpy === 'number') ? res.mpy : null;
    } catch (e) {
      return null;
    }
  }

  // R3: coupon pair (same pairId) with inhibitor efficiency < 70 % -> warning.
  function R3(state) {
    var mps = mpMap(state);
    var corr = corrosion();
    var pairs = {};
    (state.coupons || []).forEach(function (c) {
      var key = (c.mpId || '') + '::' + (c.pairId || '');
      if (!pairs[key]) { pairs[key] = { mpId: c.mpId, blank: null, inhibited: null }; }
      if (c.role === 'blank') { pairs[key].blank = c; }
      else if (c.role === 'inhibited') { pairs[key].inhibited = c; }
    });
    var findings = [];
    Object.keys(pairs).forEach(function (key) {
      var p = pairs[key];
      if (!p.blank || !p.inhibited || !p.mpId) { return; }
      var mp = mps[p.mpId];
      if (!mp) { return; }
      var blankCr = couponCrMpy(p.blank);
      var inhCr = couponCrMpy(p.inhibited);
      if (blankCr === null || inhCr === null) { return; }
      var ei = (corr && typeof corr.inhibitorEfficiency === 'function')
        ? corr.inhibitorEfficiency({ crBlankMpy: blankCr, crInhibitedMpy: inhCr })
        : null;
      if (ei === null) { return; }
      if (ei < 70) {
        findings.push(makeFinding('R3', 'warning', 'monitoringPoints', mp.id, { code: mp.code, ei: r2(ei) }, mp.code));
      }
    });
    return findings;
  }

  // R4: inhibitor residual outside the 80–150 % target band -> warning;
  // within the early-warning margin [80-band,80) U (150,150+band] -> info.
  function R4(state) {
    var bandPct = (state.settings && typeof state.settings.residualBandPct === 'number')
      ? state.settings.residualBandPct : 20;
    var findings = [];
    (state.monitoringPoints || []).forEach(function (mp) {
      var proc = mp.process || {};
      var target = proc.inhibitorTargetPpm;
      var residual = proc.inhibitorResidualPpm;
      if (typeof target !== 'number' || target <= 0) { return; }
      if (typeof residual !== 'number') { return; }
      var pct = residual / target * 100;
      var band = pct < 80 ? 'under' : (pct > 150 ? 'over' : 'onTarget');
      var severity = null;
      if ((pct > 80 - bandPct && pct < 80) || (pct > 150 && pct <= 150 + bandPct)) {
        severity = 'info';
      } else if (pct < 80 || pct > 150) {
        severity = 'warning';
      }
      if (severity) {
        findings.push(makeFinding('R4', severity, 'monitoringPoints', mp.id, { code: mp.code, pct: r2(pct), band: band }, mp.code));
      }
    });
    return findings;
  }

  // R5: probe sensor with a 24 h z-score outlier (|z| > threshold, sigma > 0)
  // or >= stuckSensorCount consecutive identical readings (any date) -> warning.
  function R5(state) {
    var nowMs = parse(state.nowISO);
    var zThreshold = (state.settings && typeof state.settings.zScoreThreshold === 'number')
      ? state.settings.zScoreThreshold : 3;
    var stuckCount = (state.settings && typeof state.settings.stuckSensorCount === 'number')
      ? state.settings.stuckSensorCount : 10;
    var findings = [];
    (state.monitoringPoints || []).forEach(function (mp) {
      if (!isProbe(mp)) { return; }
      var rdg = readingsFor(state, mp.id);
      var vals24 = [];
      rdg.forEach(function (r) {
        var ms = parse(r.date);
        if (typeof r.crMpy === 'number' && inLastMs(ms, nowMs, 24 * HOUR_MS)) {
          vals24.push({ v: r.crMpy, ms: ms });
        }
      });
      var zFired = false;
      var zValue = null;
      if (vals24.length >= 2) {
        var nums = vals24.map(function (x) { return x.v; });
        var sigma = populationStd(nums);
        if (sigma > 0) {
          var mean = avg(nums);
          var maxZ = 0;
          vals24.forEach(function (x) {
            var z = Math.abs(x.v - mean) / sigma;
            if (z > maxZ) { maxZ = z; zValue = x.v; }
          });
          if (maxZ > zThreshold) { zFired = true; }
        }
      }
      var sorted = rdg.slice().sort(function (a, b) { return parse(a.date) - parse(b.date); });
      var maxRun = 0;
      var run = 0;
      var prev = null;
      sorted.forEach(function (r) {
        if (prev !== null && r.crMpy === prev) { run++; }
        else { run = 1; }
        if (run > maxRun) { maxRun = run; }
        prev = r.crMpy;
      });
      if (zFired) {
        findings.push(makeFinding('R5', 'warning', 'monitoringPoints', mp.id,
          { code: mp.code, reason: 'zscore', value: r2(zValue) }, mp.code));
      } else if (maxRun >= stuckCount) {
        findings.push(makeFinding('R5', 'warning', 'monitoringPoints', mp.id,
          { code: mp.code, reason: 'stuck' }, mp.code));
      }
    });
    return findings;
  }

  // R6: coupon with endDate + 90 d < now and status != retired -> info,
  // warning once overdue more than 180 d.
  function R6(state) {
    var nowMs = parse(state.nowISO);
    var mps = mpMap(state);
    var findings = [];
    (state.coupons || []).forEach(function (c) {
      if (c.status === 'retired') { return; }
      if (!c.endDate) { return; }
      var endMs = parse(c.endDate);
      if (isNaN(endMs)) { return; }
      if (endMs + 90 * DAY_MS < nowMs) {
        var days = daysBetween(nowMs, endMs);
        var severity = days > 180 ? 'warning' : 'info';
        var mp = mps[c.mpId];
        var code = mp ? mp.code : c.mpId;
        findings.push(makeFinding('R6', severity, 'coupons', c.id, { code: code, days: days }, code));
      }
    });
    return findings;
  }

  // R7: per MP with CO2 process data, DWM model vs 7 d measured average:
  // ratio > 2 -> critical, ratio < 0.3 -> info.
  function R7(state) {
    var nowMs = parse(state.nowISO);
    var corr = corrosion();
    var findings = [];
    (state.monitoringPoints || []).forEach(function (mp) {
      var proc = mp.process || {};
      if (!(proc.co2Ppm > 0) || !(proc.totalPressureKpa > 0)) { return; }
      var vals7 = [];
      readingsFor(state, mp.id).forEach(function (r) {
        var ms = parse(r.date);
        if (typeof r.crMpy === 'number' && inLastMs(ms, nowMs, 7 * DAY_MS)) { vals7.push(r.crMpy); }
      });
      if (vals7.length === 0) { return; }
      var pCo2Bar = proc.totalPressureKpa * (proc.co2Ppm / 1e6) / 100;
      var model = null;
      if (corr && typeof corr.deWaardMilliams === 'function') {
        try {
          var m = corr.deWaardMilliams({ tempC: proc.tempC, pCo2Bar: pCo2Bar });
          if (m && typeof m.mpy === 'number') { model = m.mpy; }
        } catch (e) { model = null; }
      }
      if (model === null || model <= 0) { return; }
      var measured = avg(vals7);
      var ratio = measured / model;
      if (ratio > 2) {
        findings.push(makeFinding('R7', 'critical', 'monitoringPoints', mp.id,
          { code: mp.code, ratio: r2(ratio), measured: r2(measured), model: r2(model) }, mp.code));
      } else if (ratio < 0.3) {
        findings.push(makeFinding('R7', 'info', 'monitoringPoints', mp.id,
          { code: mp.code, ratio: r2(ratio), measured: r2(measured), model: r2(model) }, mp.code));
      }
    });
    return findings;
  }

  // R8: sour-service screening per MP: classifyMr0175 high -> critical, moderate -> warning.
  function R8(state) {
    var corr = corrosion();
    var findings = [];
    (state.monitoringPoints || []).forEach(function (mp) {
      var proc = mp.process || {};
      if (!(proc.h2sPpm > 0) || !(proc.totalPressureKpa > 0)) { return; }
      var ph2s = null;
      if (corr && typeof corr.partialPressureH2S === 'function') {
        try {
          ph2s = corr.partialPressureH2S({ totalPressureKpa: proc.totalPressureKpa, h2sPpm: proc.h2sPpm }).kpa;
        } catch (e) { ph2s = null; }
      }
      if (ph2s === null) { return; }
      var level = (corr && typeof corr.classifyMr0175 === 'function') ? corr.classifyMr0175(ph2s) : null;
      var severity = level === 'high' ? 'critical' : (level === 'moderate' ? 'warning' : null);
      if (severity) {
        findings.push(makeFinding('R8', severity, 'monitoringPoints', mp.id,
          { code: mp.code, ph2sKpa: r2(ph2s), level: level }, mp.code));
      }
    });
    return findings;
  }

  // R9: apmAsset RBI inspection overdue -> warning; > 90 d -> critical.
  function R9(state) {
    var nowMs = parse(state.nowISO);
    var findings = [];
    (state.apmAssets || []).forEach(function (a) {
      var rbi = a.rbi || {};
      if (!rbi.nextInspectionISO) { return; }
      var nextMs = parse(rbi.nextInspectionISO);
      if (isNaN(nextMs)) { return; }
      if (nextMs < nowMs) {
        var days = daysBetween(nowMs, nextMs);
        var severity = days > 90 ? 'critical' : 'warning';
        findings.push(makeFinding('R9', severity, 'apmAssets', a.id, { name: a.name || a.code, days: days }, a.name || a.code));
      }
    });
    return findings;
  }

  function sumDowntime(evts) {
    var sum = 0;
    evts.forEach(function (e) {
      if (typeof e.downtimeH === 'number') { sum += e.downtimeH; }
      else if (e.start && e.end) {
        var d = (parse(e.end) - parse(e.start)) / HOUR_MS;
        if (d > 0) { sum += d; }
      }
    });
    return sum;
  }

  // R10: apmAsset MTBF (last 90 d) < 50 % of MTBF (previous 90 d), both with >=1 failure.
  function R10(state) {
    var nowMs = parse(state.nowISO);
    var a = apm();
    var windowH = 90 * 24;
    var findings = [];
    (state.apmAssets || []).forEach(function (asset) {
      var failures = (state.apmEvents || []).filter(function (e) {
        return e.assetId === asset.id && e.type === 'failure';
      });
      var nowFail = [];
      var prevFail = [];
      failures.forEach(function (e) {
        var ms = parse(e.start);
        if (isNaN(ms)) { return; }
        if (inLastMs(ms, nowMs, 90 * DAY_MS)) { nowFail.push(e); }
        else if (inLastMs(ms, nowMs, 180 * DAY_MS)) { prevFail.push(e); }
      });
      if (nowFail.length === 0 || prevFail.length === 0 || !a) { return; }
      var mtbfNow = a.mtbf({ windowH: windowH, downtimeH: sumDowntime(nowFail), failureCount: nowFail.length });
      var mtbfPrev = a.mtbf({ windowH: windowH, downtimeH: sumDowntime(prevFail), failureCount: prevFail.length });
      if (mtbfNow === null || mtbfPrev === null) { return; }
      if (mtbfNow < 0.5 * mtbfPrev) {
        findings.push(makeFinding('R10', 'warning', 'apmAssets', asset.id,
          { name: asset.name || asset.code, mtbfNow: r2(mtbfNow), mtbfPrev: r2(mtbfPrev) }, asset.name || asset.code));
      }
    });
    return findings;
  }

  // R11: apmAsset availability (last 90 d) below threshold (or override) -> warning.
  function R11(state) {
    var nowMs = parse(state.nowISO);
    var a = apm();
    var threshold = (state.settings && typeof state.settings.availabilityThresholdPct === 'number')
      ? state.settings.availabilityThresholdPct : 90;
    var windowH = 90 * 24;
    var findings = [];
    (state.apmAssets || []).forEach(function (asset) {
      var t = typeof asset.availabilityOverridePct === 'number' ? asset.availabilityOverridePct : threshold;
      var evts = (state.apmEvents || []).filter(function (e) {
        return e.assetId === asset.id && inLastMs(parse(e.start), nowMs, 90 * DAY_MS);
      });
      if (!a) { return; }
      var pct = a.availability({ windowH: windowH, downtimeH: sumDowntime(evts) });
      if (pct === null) { return; }
      if (pct < t) {
        findings.push(makeFinding('R11', 'warning', 'apmAssets', asset.id,
          { name: asset.name || asset.code, pct: r2(pct), threshold: t }, asset.name || asset.code));
      }
    });
    return findings;
  }

  // R12: apmAsset with >=3 failure events in 90 d -> warning.
  function R12(state) {
    var nowMs = parse(state.nowISO);
    var findings = [];
    (state.apmAssets || []).forEach(function (asset) {
      var count = (state.apmEvents || []).filter(function (e) {
        return e.assetId === asset.id && e.type === 'failure' && inLastMs(parse(e.start), nowMs, 90 * DAY_MS);
      }).length;
      if (count >= 3) {
        findings.push(makeFinding('R12', 'warning', 'apmAssets', asset.id,
          { name: asset.name || asset.code, count: count }, asset.name || asset.code));
      }
    });
    return findings;
  }

  // R13: PSV next test overdue -> warning; > 30 d -> critical.
  function R13(state) {
    var nowMs = parse(state.nowISO);
    var findings = [];
    (state.psvs || []).forEach(function (p) {
      if (!p.nextTestDate) { return; }
      var nextMs = parse(p.nextTestDate);
      if (isNaN(nextMs)) { return; }
      if (nextMs < nowMs) {
        var days = daysBetween(nowMs, nextMs);
        var severity = days > 30 ? 'critical' : 'warning';
        findings.push(makeFinding('R13', severity, 'psvs', p.id, { tag: p.tag || p.id, days: days }, p.tag || p.id));
      }
    });
    return findings;
  }

  // R14: PSV installed capacity smaller than required (marginPct < 0) -> critical.
  function R14(state) {
    var findings = [];
    (state.psvs || []).forEach(function (p) {
      var sizing = p.sizing || {};
      if (typeof sizing.marginPct !== 'number') { return; }
      if (sizing.marginPct < 0) {
        findings.push(makeFinding('R14', 'critical', 'psvs', p.id, { tag: p.tag || p.id, margin: r2(sizing.marginPct) }, p.tag || p.id));
      }
    });
    return findings;
  }

  // R15: monitoring point with tNom+tMin and >=2 CR readings whose RUL < 12 months -> high
  function R15(state) {
    var rl = remainingLife();
    if (!rl || typeof rl.rulFromCorrosionRates !== 'function') { return []; }
    var findings = [];
    (state.monitoringPoints || []).forEach(function (mp) {
      if (mp.tMin == null || mp.tNom == null) { return; }
      var rdgs = readingsFor(state, mp.id);
      if (rdgs.length < 2) { return; }
      var series = rdgs.map(function (r) { return { date: r.date, value: r.crMpy }; });
      var result = rl.rulFromCorrosionRates(series, { tNom: mp.tNom, tMin: mp.tMin });
      if (!result || result.error) { return; }
      if (result.rulMonths < 12 && result.rulMonths >= 0) {
        findings.push(makeFinding('R15', 'high', 'monitoringPoints', mp.id,
          { code: mp.code, rulMonths: r2(result.rulMonths), confidence: result.confidence || 'low' }, mp.code));
      }
    });
    return findings;
  }

  // R16: PSV with API 576 inspNext overdue -> high
  function R16(state) {
    var nowMs = parse(state.nowISO);
    var findings = [];
    (state.psvs || []).forEach(function (p) {
      if (!p.inspNext) { return; }
      var nextMs = parse(p.inspNext);
      if (isNaN(nextMs)) { return; }
      if (nextMs < nowMs) {
        findings.push(makeFinding('R16', 'high', 'psvs', p.id, { tag: p.tag || p.id }, p.tag || p.id));
      }
    });
    return findings;
  }

  // R17: ILI anomaly exceeds safe pressure on asset with opPressure -> high
  function R17(state) {
    var findings = [];
    var pipelineSystems = state.pipelineSystems || [];
    var iliAnomalies = state.iliAnomalies || [];
    if (!pipelineSystems.length || !iliAnomalies.length) { return findings; }

    // Build a map of systemId -> { Su, D, t, opPressure }
    var sysMap = {};
    // We need material->SMYS lookup
    var materials = (root.IW && root.IW.data && root.IW.data.materials) ? root.IW.data.materials : null;

    pipelineSystems.forEach(function (sys) {
      if (sys.opPressureMpa == null || sys.wallThicknessMm == null || sys.dnIn == null) { return; }
      var Su = 414; // default X52
      if (materials && materials.byId && sys.material) {
        var mat = materials.byId(sys.material);
        if (mat && mat.smysMpa) { Su = mat.smysMpa; }
      }
      sysMap[sys.id] = { Su: Su, D: sys.dnIn * 25.4, t: sys.wallThicknessMm, opPressure: sys.opPressureMpa };
    });

    iliAnomalies.forEach(function (a) {
      var sysParams = sysMap[a.systemId];
      if (!sysParams) { return; }
      // Compute Pf using B31G
      var pa = (root.IW && root.IW.calc) ? root.IW.calc.pipelineAssessment : null;
      if (!pa || typeof pa.b31g !== 'function') { return; }
      var r = pa.b31g({
        D: sysParams.D,
        t: sysParams.t,
        Su: sysParams.Su,
        depthPct: a.depthPct,
        lengthMm: a.lengthMm,
        modified: false
      });
      var Pf = r.Pf;
      var pAllow = Pf > 0 ? Pf / (1.43 * 0.72) : 0;
      if (pAllow > 0 && sysParams.opPressure > pAllow) {
        findings.push(makeFinding('R17', 'high', 'iliAnomalies', a.id, {
          code: a.id,
          required: r2(sysParams.opPressure),
          safe: r2(pAllow)
        }, a.id));
      }
    });
    return findings;
  }

  return {
    rules: [
      { id: 'R1', evaluate: R1 },
      { id: 'R2', evaluate: R2 },
      { id: 'R3', evaluate: R3 },
      { id: 'R4', evaluate: R4 },
      { id: 'R5', evaluate: R5 },
      { id: 'R6', evaluate: R6 },
      { id: 'R7', evaluate: R7 },
      { id: 'R8', evaluate: R8 },
      { id: 'R9', evaluate: R9 },
      { id: 'R10', evaluate: R10 },
      { id: 'R11', evaluate: R11 },
      { id: 'R12', evaluate: R12 },
      { id: 'R13', evaluate: R13 },
      { id: 'R14', evaluate: R14 },
      { id: 'R15', evaluate: R15 },
      { id: 'R16', evaluate: R16 },
      { id: 'R17', evaluate: R17 }
    ]
  };
});
