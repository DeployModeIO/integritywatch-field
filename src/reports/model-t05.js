/* IntegrityWatch Field — T-05 MIC (microbiologically influenced corrosion) report model
   Pure (no DOM, no window, no locale formatting) model builder for the T-05
   "Corrosión microbiológica (MIC)" report (docs/REPORTING-BLUEPRINT.md §T-05).
   Sweeps EVERY monitoring point that carries MIC screening data — the inputs
   persisted by the corrosion view at mp.advanced.mic.inputs (legacy shape:
   mp.advanced.mic.result.inputs) — and re-evaluates each via
   IW.calc.mic.assess (reused, never duplicated). Points are prioritized by
   result: high first, then moderate, then low; ties broken by score desc and
   code asc so the table order is deterministic.

   Data-model honesty (spec rule: never invent factors that do not exist):
   the monitoring-point schema has NO fields for microbial counts (SRB/APB),
   pH or redox potential — the MIC screening only stores binary factors plus
   temperatureC. The recommended-sampling section therefore lists actions
   (enumerate counts, sample biofilm) instead of numbers, and a dedicated
   "text" section states the missing data with a labelKey.

   Standards: NACE TM0194 / API 571 (the basis named in calc/mic.js and in the
   es label mic.title) are NOT entries of the IW.data.standards catalogue and
   files outside this task's scope cannot be touched, so the standards section
   is built from the catalogue and comes out empty on today's data; the
   renderer shows reports.noData there. The citation itself remains visible
   through the table title mic.title.

   Screening-level rules (this report only):
   - A point is "evaluated" iff it has a non-empty inputs object (either
     shape above). Points without advanced.mic, or with a persisted result but
     no recoverable inputs, are skipped — the result cannot be re-derived
     purely and is not copied blindly into the report.
   - assess() is called with the stored inputs verbatim; riskLevel/score/
     drivers come only from IW.calc.mic.assess.
   - Table carries raw categorical ids (risk) and raw driver label keys joined
     with ' · ' for traceability; the visual layer maps them to mic.risk.* /
     mic.driver.* (same convention as T-03's region column). */
(function (root, factory) {
  'use strict';
  var api = factory(root);
  root.IW = root.IW || {};
  root.IW.reports = root.IW.reports || {};
  root.IW.reports.modelT05 = api;
  if (typeof module === 'object' && module.exports) { module.exports = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  var RISK_RANK = { high: 0, moderate: 1, low: 2 };
  var DRIVER_SEP = ' · ';

  function model() { return root.IW && root.IW.reports ? root.IW.reports.model : null; }
  function mic() { return root.IW && root.IW.calc ? root.IW.calc.mic : null; }
  function standardsData() { return root.IW && root.IW.data ? root.IW.data.standards : null; }
  function registry() { return root.IW && root.IW.reports ? root.IW.reports.registry : null; }

  // Raw model only: numbers are finite numbers or null; categorical fields
  // (risk) carry the raw id and the visual layer maps them to their key.
  function rawNum(v) { return (typeof v === 'number' && isFinite(v)) ? v : null; }

  function hasOwnKeys(obj) {
    for (var k in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, k)) { return true; }
    }
    return false;
  }

  // Persisted shapes written by views/corrosion.js:
  //   mp.advanced.mic.inputs = { freeWater, stagnant, ..., temperatureC }
  //   legacy: mp.advanced.mic.result.inputs (the view itself also falls back to it)
  function micInputsOf(mp) {
    var mic = mp.advanced && mp.advanced.mic;
    if (!mic || typeof mic !== 'object') { return null; }
    if (mic.inputs && typeof mic.inputs === 'object' && hasOwnKeys(mic.inputs)) { return mic.inputs; }
    var res = mic.result;
    if (res && typeof res === 'object' && res.inputs && typeof res.inputs === 'object' && hasOwnKeys(res.inputs)) {
      return res.inputs;
    }
    return null;
  }

  function evaluatePoint(mp) {
    var inputs = micInputsOf(mp);
    if (!inputs) { return null; }
    var mod = mic();
    if (!mod || typeof mod.assess !== 'function') { return null; }
    var res;
    try {
      res = mod.assess(inputs);
    } catch (e) {
      return null;
    }
    if (!res || res.ok !== true) { return null; }
    return {
      code: mp.code || mp.id || null,
      temperatureC: rawNum(inputs.temperatureC),
      drivers: (res.drivers || []).join(DRIVER_SEP),
      score: res.score,
      risk: res.riskLevel
    };
  }

  // Prioriza resultado alto: high → moderate → low; empate por score desc y
  // code asc (comparación por operador, sin localeCompare, para determinismo).
  function compareRows(a, b) {
    var ra = RISK_RANK[a.risk] === undefined ? 9 : RISK_RANK[a.risk];
    var rb = RISK_RANK[b.risk] === undefined ? 9 : RISK_RANK[b.risk];
    if (ra !== rb) { return ra - rb; }
    if (a.score !== b.score) { return b.score - a.score; }
    var ac = String(a.code === null ? '' : a.code);
    var bc = String(b.code === null ? '' : b.code);
    if (ac < bc) { return -1; }
    if (ac > bc) { return 1; }
    return 0;
  }

  function buildMicTable(rows) {
    var sec = model().table({
      titleKey: 'mic.title',
      emptyKey: 'reports.noData',
      columns: [
        { key: 'code', labelKey: 'corrosion.pointCode' },
        { key: 'temperatureC', labelKey: 'corrosion.temperature', align: true },
        { key: 'drivers', labelKey: 'reports.t05Drivers' },
        { key: 'score', labelKey: 'mic.score', align: true },
        { key: 'risk', labelKey: 'reports.t05Risk' }
      ],
      rows: rows
    });
    sec.noteKey = 'reports.t05Note';
    return sec;
  }

  function buildSampling(rows) {
    var atRisk = rows.some(function (r) { return r.risk === 'moderate' || r.risk === 'high'; });
    var items = [];
    if (atRisk) {
      // Counts are not modelled: recommend collecting them, never report numbers.
      items.push({ textKey: 'reports.t05SampleCounts' });
      items.push({ textKey: 'reports.t05SampleBiofilm' });
    }
    return model().list({ titleKey: 'reports.t05Sampling', items: items });
  }

  function buildDataGaps() {
    return model().text({
      titleKey: 'reports.t05DataGaps',
      bodyKey: 'reports.t05DataGapsBody'
    });
  }

  function buildTreatment(rows) {
    var items = [];
    if (rows.length === 0) {
      items.push({ textKey: 'reports.t05RunScreening' });
    } else {
      var high = rows.some(function (r) { return r.risk === 'high'; });
      var moderate = rows.some(function (r) { return r.risk === 'moderate'; });
      if (high) {
        items.push({ textKey: 'reports.t05BioShock' });
        items.push({ textKey: 'reports.t05BioRetest' });
      } else if (moderate) {
        items.push({ textKey: 'reports.t05BioMonitor' });
      }
    }
    return model().list({ titleKey: 'reports.t05Treatment', items: items });
  }

  function buildStandards() {
    // Catalog-sourced (as in T-03): TM0194/API 571 are not catalogue entries,
    // so items stay empty rather than inventing a record.
    var src = standardsData();
    var list = (src && src.standards) || [];
    var items = [];
    for (var i = 0; i < list.length; i++) {
      var id = list[i].id || '';
      if (id.indexOf('tm0194') !== -1 || id.indexOf('api-571') !== -1) {
        items.push({ id: list[i].code || id, title: list[i].title || '' });
      }
    }
    return model().standards({ titleKey: 'reports.standardsApplied', items: items });
  }

  function generatedAtISO(opts) {
    var d;
    if (typeof opts.now === 'number' || typeof opts.now === 'string') {
      d = new Date(opts.now);
      if (isNaN(d.getTime())) { d = new Date(); }
    } else {
      d = new Date();
    }
    return d.toISOString();
  }

  function registerSelf() {
    var reg = registry();
    if (!reg || typeof reg.register !== 'function') { return; }
    try {
      reg.register({ id: 'T-05', titleKey: 'reports.t05Title', needs: [], buildModel: buildT05Model });
    } catch (e) {
      // Idempotent load: the only tolerable failure is a duplicate template
      // (e.g. the module was evaluated twice); anything else must surface.
      if (String((e && e.message) || '').indexOf('duplicate') === -1) { throw e; }
    }
  }

  function buildT05Model(opts) {
    opts = opts || {};
    var store = opts.repos || opts.store || {};
    registerSelf();

    function list(repo) {
      return (store[repo] && typeof store[repo].list === 'function') ? store[repo].list() : Promise.resolve([]);
    }

    return list('monitoringPoints').then(function (mps) {
      var monitoringPoints = Array.isArray(mps) ? mps : [];
      var rows = [];
      monitoringPoints.forEach(function (mp) {
        var row = evaluatePoint(mp);
        if (row) { rows.push(row); }
      });
      rows.sort(compareRows);

      var highCount = rows.filter(function (r) { return r.risk === 'high'; }).length;

      var generatedAtISOStr = generatedAtISO(opts);
      var m = model();

      var sections = [
        m.cover({ titleKey: 'reports.t05Title', meta: { generatedAtISO: generatedAtISOStr } }),
        m.kpiRow({
          titleKey: 'reports.kpis',
          items: [
            { labelKey: 'reports.t05KpiEvaluated', value: rows.length },
            { labelKey: 'reports.t05KpiHigh', value: highCount }
          ]
        }),
        buildMicTable(rows),
        buildSampling(rows),
        buildDataGaps(),
        buildTreatment(rows),
        buildStandards()
      ];

      return {
        id: 'T-05',
        meta: { titleKey: 'reports.t05Title', generatedAtISO: generatedAtISOStr, footer: { textKey: 'reports.pageFooter', generatedKey: 'reports.generatedAt' } },
        sections: sections,
        // Mirrors the top-level report-disclaimer element of the sisters.
        disclaimer: m.disclaimer({ labelKey: 'reports.disclaimer' })
      };
    });
  }

  registerSelf();

  return { buildT05Model: buildT05Model };
});
