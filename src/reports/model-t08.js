/* IntegrityWatch Field — T-08 risk-based inspection (RBI) report model
   Pure (no DOM, no window, no locale formatting) model builder for the T-08
   "Inspección basada en riesgo (RBI)" report (docs/REPORTING-BLUEPRINT.md §T-08).
   Sweeps EVERY apmAsset with an rbi object holding finite pof and cof,
   computes score/band via IW.calc.apm.rbiRisk and the recommended interval
   via IW.calc.apm.inspectionIntervalMonths (both reused, never duplicated —
   same engine views/apm.js drives for the asset faceplate), and tracks the
   overdue days against the real rbi.nextInspectionISO field (SCHEMA.md §apmAssets).
   Returns { id, meta, sections, disclaimer } using the root.IW.reports.model
   section factories, mirroring model-t03.js / model-t04.js.

   REAL FIELDS ONLY: apmAssets.rbi is {pof:1..5, cof:1..5, band?, score?,
   inspectionBaseMonths, nextInspectionISO?} (SCHEMA.md, ingest/schemas.js).
   There is NO lastInspectionISO field on apmAssets, so lateness is measured
   against rbi.nextInspectionISO: when it is missing or unparseable the row
   shows daysLate null and the table note declares the data gap — nothing is
   invented. Persisted rbi.band/rbi.score are ignored: the report always
   recomputes from pof×cof through calc/apm so the numbers are traceable.

   MATRIX: the blueprint asks for a "matriz 5×5 con activos" and the report
   renderer DOES support the chart kind 'matrix' (IW.reports.charts.matrix):
   data = {cells:[{x,y,ids,count}]}, x = POF rank, y = COF rank (the same
   orientation views/apm.js uses), each cell carrying the asset codes placed
   at that probability/consequence combination. Cells outside 1..5 or without
   cells data render as an empty grid; the level tint of each cell is the
   chart's own xx*yy banding.

   Per-asset rules (this report only):
   - evaluated  = rbi present AND finite pof AND finite cof (mirrors the view's
     rbiBandOf guard); other assets are silently out of scope.
   - score/band = apm.rbiRisk({pof, cof}); bands: low/medium/high/veryHigh.
   - interval   = apm.inspectionIntervalMonths({band, baseMonths}) with
     baseMonths = rbi.inspectionBaseMonths || 24 (same fallback as views/apm.js).
   - daysLate   = floor((now - nextInspectionISO)/DAY) clamped at 0 when the
     due date is present; null when absent (data gap, counted in missingDate).
   - overdue    = due date present AND strictly in the past (rule R9 semantics).
   - confidence = per-asset share of the four RBI fields present with a
     usable value (pof, cof, inspectionBaseMonths, nextInspectionISO); the KPI
     is the mean over evaluated assets, in percent rounded to 2 decimals (0
     when there are no assets).

   Inspection plan (labelKeys only, prioritised): overdue action first (when
   any), then band escalations veryHigh/high (when any assets sit in them),
   then the missing-next-date action (when any), then the API 580 periodic
   re-evaluation action (whenever at least one asset is evaluated).

   Sector filter: opts.sector keeps only assets with that exact sector string
   (same shape as model-t04.js). Standards: prefers catalog entries
   api-580 / api-581 / iso-55000 (present in IW.data.standards) and falls back
   to the public documentary references. */
(function (root, factory) {
  'use strict';
  var api = factory(root);
  root.IW = root.IW || {};
  root.IW.reports = root.IW.reports || {};
  root.IW.reports.modelT08 = api;
  if (typeof module === 'object' && module.exports) { module.exports = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  var DAY = 86400000;
  var DEFAULT_BASE_MONTHS = 24;
  var CONFIDENCE_FIELDS = 4;

  function model() { return root.IW && root.IW.reports ? root.IW.reports.model : null; }
  function apmCalc() { return root.IW && root.IW.calc ? root.IW.calc.apm : null; }
  function registry() { return root.IW && root.IW.reports ? root.IW.reports.registry : null; }
  function standardsData() { return root.IW && root.IW.data ? root.IW.data.standards : null; }

  function isFiniteNum(v) { return typeof v === 'number' && isFinite(v); }

  function parseIso(v) {
    if (typeof v !== 'string' || v === '') { return null; }
    var ms = Date.parse(v);
    return isNaN(ms) ? null : ms;
  }

  // Raw model only: numbers are finite numbers or null; the band field
  // carries the raw calc id ('low'|'medium'|'high'|'veryHigh') and the visual
  // layer maps it to 'apm.bands.*' (same convention as views/apm.js).
  function evaluateAsset(asset, nowMs) {
    var rbi = asset && asset.rbi;
    if (!rbi || typeof rbi !== 'object') { return null; }
    var pof = isFiniteNum(rbi.pof) ? rbi.pof : null;
    var cof = isFiniteNum(rbi.cof) ? rbi.cof : null;
    if (pof === null || cof === null) { return null; }
    var apm = apmCalc();
    var risk = apm ? apm.rbiRisk({ pof: pof, cof: cof }) : null;
    var band = risk ? risk.band : null;
    var baseMonths = isFiniteNum(rbi.inspectionBaseMonths) && rbi.inspectionBaseMonths > 0
      ? rbi.inspectionBaseMonths : DEFAULT_BASE_MONTHS;
    var interval = (apm && band)
      ? apm.inspectionIntervalMonths({ band: band, baseMonths: baseMonths })
      : null;
    var dueMs = parseIso(rbi.nextInspectionISO);
    var hasBase = isFiniteNum(rbi.inspectionBaseMonths) && rbi.inspectionBaseMonths > 0;
    var confHits = 2 + (hasBase ? 1 : 0) + (dueMs !== null ? 1 : 0);
    return {
      code: asset.code || asset.id || null,
      sector: asset.sector || null,
      criticality: asset.criticality || null,
      pof: pof,
      cof: cof,
      score: risk ? risk.score : null,
      band: band,
      intervalMonths: interval,
      nextInspection: dueMs !== null ? rbi.nextInspectionISO : null,
      daysLate: dueMs === null ? null : Math.max(0, Math.floor((nowMs - dueMs) / DAY)),
      overdue: dueMs !== null && dueMs < nowMs,
      missingDate: dueMs === null,
      confidence: confHits / CONFIDENCE_FIELDS
    };
  }

  function sortRows(rows) {
    rows.sort(function (a, b) {
      var as = a.score === null ? -1 : a.score;
      var bs = b.score === null ? -1 : b.score;
      if (as !== bs) { return bs - as; }
      var ac = a.code || '';
      var bc = b.code || '';
      return ac < bc ? -1 : (ac > bc ? 1 : 0);
    });
    return rows;
  }

  // 5×5 risk-matrix cells in the exact shape IW.reports.charts.matrix reads:
  // {x: POF rank 1..5, y: COF rank 1..5, ids: [codes], count: n}; stable
  // order (x asc, y asc) and ids asc so snapshots are deterministic.
  function buildMatrixCells(rows) {
    var byCell = {};
    rows.forEach(function (r) {
      if (!isFiniteNum(r.pof) || !isFiniteNum(r.cof)) { return; }
      var x = Math.round(r.pof);
      var y = Math.round(r.cof);
      if (x < 1 || x > 5 || y < 1 || y > 5) { return; }
      var key = x + ':' + y;
      if (!byCell[key]) { byCell[key] = { x: x, y: y, ids: [] }; }
      byCell[key].ids.push(r.code || '');
    });
    var cells = Object.keys(byCell).map(function (key) {
      var c = byCell[key];
      c.ids.sort();
      return { x: c.x, y: c.y, ids: c.ids, count: c.ids.length };
    });
    cells.sort(function (a, b) { return a.x !== b.x ? a.x - b.x : a.y - b.y; });
    return cells;
  }

  function buildMatrixChart(cells) {
    return model().chart({
      kind: 'matrix',
      titleKey: 'reports.t08MatrixTitle',
      data: { cells: cells },
      axis: { x: 'apm.pof', y: 'apm.cof' }
    });
  }

  function buildAssetTable(rows) {
    var sec = model().table({
      titleKey: 'apm.rbi',
      emptyKey: 'reports.noData',
      columns: [
        { key: 'code', labelKey: 'apm.assetCode' },
        { key: 'pof', labelKey: 'apm.pof', align: true },
        { key: 'cof', labelKey: 'apm.cof', align: true },
        { key: 'score', labelKey: 'apm.riskScore', align: true },
        { key: 'band', labelKey: 'apm.riskBand' },
        { key: 'intervalMonths', labelKey: 'apm.suggestedInterval', align: true },
        { key: 'nextInspection', labelKey: 'apm.nextInspection' },
        { key: 'daysLate', labelKey: 'reports.t08DaysLate', align: true }
      ],
      rows: rows
    });
    sec.noteKey = 'reports.t08NoDateNote';
    return sec;
  }

  function buildPlan(rows) {
    var items = [];
    if (rows.length > 0) {
      var overdue = rows.some(function (r) { return r.overdue; });
      var veryHigh = rows.some(function (r) { return r.band === 'veryHigh'; });
      var high = rows.some(function (r) { return r.band === 'high'; });
      var noDate = rows.some(function (r) { return r.missingDate; });
      if (overdue) { items.push({ textKey: 'reports.t08ActionOverdue' }); }
      if (veryHigh) { items.push({ textKey: 'reports.t08ActionVeryHigh' }); }
      if (high) { items.push({ textKey: 'reports.t08ActionHigh' }); }
      if (noDate) { items.push({ textKey: 'reports.t08ActionNoDate' }); }
      items.push({ textKey: 'reports.t08ActionReview' });
    }
    return model().list({ titleKey: 'reports.t08Plan', items: items });
  }

  function pickStandard(catalogId, fallbackCode, fallbackTitle) {
    var src = standardsData();
    var list = (src && src.standards) || [];
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === catalogId) {
        return { id: list[i].code || list[i].id, title: list[i].title || '' };
      }
    }
    return { id: fallbackCode, title: fallbackTitle };
  }

  function buildStandards() {
    var items = [
      pickStandard('api-580', 'API 580', 'Risk-Based Inspection'),
      pickStandard('api-581', 'API 581', 'Risk-Based Inspection Methodology'),
      pickStandard('iso-55000', 'ISO 55000', 'Asset management — Overview, principles and terminology')
    ];
    return model().standards({ titleKey: 'reports.standardsApplied', items: items });
  }

  function nowMsOf(opts) {
    if (typeof opts.now === 'number' || typeof opts.now === 'string') {
      var ms = Date.parse(opts.now);
      if (!isNaN(ms)) { return ms; }
    }
    return Date.now();
  }

  function generatedAtISO(opts) { return new Date(nowMsOf(opts)).toISOString(); }

  function registerSelf() {
    var reg = registry();
    if (!reg || typeof reg.register !== 'function') { return; }
    try {
      reg.register({ id: 'T-08', titleKey: 'reports.t08Title', needs: [], buildModel: buildT08Model });
    } catch (e) {
      // Idempotent load: the only tolerable failure is a duplicate template
      // (e.g. the module was evaluated twice); anything else must surface.
      if (String((e && e.message) || '').indexOf('duplicate') === -1) { throw e; }
    }
  }

  function buildT08Model(opts) {
    opts = opts || {};
    var store = opts.repos || opts.store || {};
    registerSelf();
    var nowMs = nowMsOf(opts);

    function list(repo) {
      return (store[repo] && typeof store[repo].list === 'function') ? store[repo].list() : Promise.resolve([]);
    }

    return list('apmAssets').then(function (assets) {
      var apmAssets = Array.isArray(assets) ? assets : [];
      if (typeof opts.sector === 'string' && opts.sector !== '') {
        apmAssets = apmAssets.filter(function (a) { return a && a.sector === opts.sector; });
      }
      var rows = [];
      apmAssets.forEach(function (a) {
        var row = evaluateAsset(a, nowMs);
        if (row) { rows.push(row); }
      });
      sortRows(rows);

      var highBandCount = rows.filter(function (r) { return r.band === 'high' || r.band === 'veryHigh'; }).length;
      var overdueCount = rows.filter(function (r) { return r.overdue; }).length;
      var confidenceAvgPct = rows.length
        ? Math.round((rows.reduce(function (s, r) { return s + r.confidence; }, 0) / rows.length) * 10000) / 100
        : 0;

      var generatedAtISOStr = generatedAtISO(opts);
      var m = model();

      var sections = [
        m.cover({ titleKey: 'reports.t08Title', meta: { generatedAtISO: generatedAtISOStr } }),
        m.kpiRow({
          titleKey: 'reports.kpis',
          items: [
            { labelKey: 'reports.t08KpiEvaluated', value: rows.length },
            { labelKey: 'reports.t08KpiHighBand', value: highBandCount },
            { labelKey: 'reports.t08KpiOverdue', value: overdueCount },
            { labelKey: 'reports.t08KpiConfidence', value: confidenceAvgPct, unit: 'units.pct' }
          ]
        }),
        buildMatrixChart(buildMatrixCells(rows)),
        buildAssetTable(rows),
        buildPlan(rows),
        buildStandards()
      ];

      return {
        id: 'T-08',
        meta: { titleKey: 'reports.t08Title', generatedAtISO: generatedAtISOStr, footer: { textKey: 'reports.pageFooter', generatedKey: 'reports.generatedAt' } },
        sections: sections,
        // Mirrors the top-level report-disclaimer element of the sisters.
        disclaimer: m.disclaimer({ labelKey: 'reports.disclaimer' })
      };
    });
  }

  registerSelf();

  return { buildT08Model: buildT08Model };
});
