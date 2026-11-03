/* IntegrityWatch Field — T-04 corrosion under insulation (CUI) report model
   Pure (no DOM, no window, no locale formatting) model builder for the T-04
   "Corrosión bajo aislamiento (CUI)" report (docs/REPORTING-BLUEPRINT.md §T-04).
   Sweeps EVERY monitoring point with cui.insulated truthy (optionally filtered
   by opts.sector), evaluates each one through IW.calc.cui583.assess (reused,
   never duplicated — same engine the CUI panel in views/corrosion.js runs) and
   tracks the age of the last CUI inspection (real MP field mp.cui.lastInspISO,
   see SCHEMA.md monitoringPoints.cui).
   Returns { id, meta, sections, disclaimer } using the root.IW.reports.model
   section factories, mirroring model-t03.js / model-dossier.js.

   CHARTS: the blueprint asks for a "mapa de riesgo por zona" and a "línea de
   tiempo de inspecciones", but the report renderer supports only the chart
   kinds trend/cusum/bullet/matrix (IW.reports.charts); neither kind exists.
   Per the T-03 precedent the risk picture and inspection history are carried
   by kpiRow + per-point table (last-inspection ISO date and age in days) +
   prioritised plan list, and the maps are left for the visual layer.

   Assessment inputs (documented rules; deterministic and input-safe):
   - If the operator saved a screening in mp.advanced.cui.inputs (shape of
     the panel in views/corrosion.js), its fields are used as-is per field.
   - Otherwise defaults MIRROR the panel's own auto-filled values so the
     report never disagrees with what the app shows:
       * materialClass: autodetect from the material id — ids starting with
         'ss-' or containing 'stainless'/'duplex' → 'ss', else 'cs' (the
         view's detectMaterialClass; the catalogue family is not consulted
         because duplex clad linings still corrode externally as 'ss').
       * operatingTempC: mp.process.tempC, else 40 (panel fallback).
       * insulationType: mapped from mp.cui.jacketType text (calcium/silicato
         → 'calcium-silicate', mineral/wool/lana → 'mineral-wool', closed/
         celda → 'closed-cell', none/ninguno → 'none'), else 'mineral-wool'
         (panel default). The resolved enum id is what the table shows.
       * coatingCondition 'good', environment 'temperate', flags false.

   Overdue rule: a point is overdue ("inspección vencida") when its
   mp.cui.lastInspISO is missing/unparseable (NOTA: treated as vencida, the
   scope text and the plan carry the note) or older than
   INSPECTION_INTERVAL_DAYS = 730 days (2 years — conservative screening
   interval consistent with API RP 571/583 practice for CUI damage; a
   documented assumption of THIS report, not a value from the standard).

   Inspection plan (labelKeys only): overdue action first (when any), then
   the API RP 583/571 method ladder accumulated up to the maximum risk level
   found — the same ladder cui583.assess prescribes per point (visual +
   thermo always; + pec from moderate; + rt/gw/utSpot from high; + utProgram
   at critical). Table rows are sorted by risk rank desc, then age desc
   (missing date first), then code asc.

   Standards: the catalog (IW.data.standards) has no api-583/api-571 entry
   today and editing it is out of this task's scope, so the section prefers
   catalog ids 'api-583'/'api-571' when present and otherwise emits the
   public documentary references below. Integration TODO: add them to
   src/data/standards.js; the report will pick them up automatically. */
(function (root, factory) {
  'use strict';
  var api = factory(root);
  root.IW = root.IW || {};
  root.IW.reports = root.IW.reports || {};
  root.IW.reports.modelT04 = api;
  if (typeof module === 'object' && module.exports) { module.exports = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  var DAY = 86400000;
  var INSPECTION_INTERVAL_DAYS = 730;
  var RISK_RANK = { low: 1, moderate: 2, high: 3, critical: 4 };
  // Cumulative API 583/571 method ladder, mirroring cui583.assess output.
  var METHOD_LADDER = [
    { textKey: 'cui.method.visual', minRank: 1 },
    { textKey: 'cui.method.thermo', minRank: 1 },
    { textKey: 'cui.method.pec', minRank: 2 },
    { textKey: 'cui.method.rt', minRank: 3 },
    { textKey: 'cui.method.gw', minRank: 3 },
    { textKey: 'cui.method.utSpot', minRank: 3 },
    { textKey: 'cui.method.utProgram', minRank: 4 }
  ];

  function model() { return root.IW && root.IW.reports ? root.IW.reports.model : null; }
  function cui583mod() { return root.IW && root.IW.calc ? root.IW.calc.cui583 : null; }
  function registry() { return root.IW && root.IW.reports ? root.IW.reports.registry : null; }
  function standardsData() { return root.IW && root.IW.data ? root.IW.data.standards : null; }

  // Raw model only: numbers are finite numbers or null; categorical fields
  // (insulationType, coatingCondition, environment, risk) carry the raw calc
  // id and the visual layer maps them ('cui.risk.*', 'cui.inputs.*', ...).
  function isFiniteNum(v) { return typeof v === 'number' && isFinite(v); }
  function trimmedStr(v) { return (typeof v === 'string' && v !== '') ? v : null; }

  // Mirrors the CUI panel's detectMaterialClass in views/corrosion.js.
  function detectMaterialClass(materialId) {
    if (!materialId) { return 'cs'; }
    var id = String(materialId).toLowerCase();
    if (id.indexOf('ss-') === 0 || id.indexOf('stainless') >= 0 ||
        id.indexOf('duplex') >= 0 || id.indexOf('super-duplex') >= 0) {
      return 'ss';
    }
    return 'cs';
  }

  function mapInsulationType(jacketType) {
    if (!jacketType) { return null; }
    var s = String(jacketType).toLowerCase();
    if (s.indexOf('calcium') >= 0 || s.indexOf('silicato') >= 0 || s.indexOf('silicate') >= 0) { return 'calcium-silicate'; }
    if (s.indexOf('mineral') >= 0 || s.indexOf('wool') >= 0 || s.indexOf('lana') >= 0) { return 'mineral-wool'; }
    if (s.indexOf('closed') >= 0 || s.indexOf('celda') >= 0) { return 'closed-cell'; }
    if (s.indexOf('none') >= 0 || s.indexOf('ninguno') >= 0) { return 'none'; }
    return null;
  }

  function resolveInputs(mp) {
    var cui = mp.cui || {};
    var adv = (mp.advanced && mp.advanced.cui && mp.advanced.cui.inputs) || {};
    var proc = mp.process || {};
    return {
      materialClass: trimmedStr(adv.materialClass) || detectMaterialClass(mp.material),
      operatingTempC: isFiniteNum(adv.operatingTempC) ? adv.operatingTempC
        : isFiniteNum(proc.tempC) ? proc.tempC : 40,
      insulationType: trimmedStr(adv.insulationType) || mapInsulationType(cui.jacketType) || 'mineral-wool',
      coatingCondition: trimmedStr(adv.coatingCondition) || 'good',
      environment: trimmedStr(adv.environment) || 'temperate',
      penetratingFeatures: !!adv.penetratingFeatures,
      cyclicService: !!adv.cyclicService,
      steamTraced: !!adv.steamTraced
    };
  }

  // Whole days since the last CUI inspection; null when the date is missing
  // or unparseable (a missing date is treated as VENCIDA, with a note).
  function daysSince(lastInspISO, nowMs) {
    if (typeof lastInspISO !== 'string' || lastInspISO === '') { return null; }
    var ms = Date.parse(lastInspISO);
    if (isNaN(ms)) { return null; }
    return Math.floor((nowMs - ms) / DAY);
  }

  function isOverdue(days) {
    return days === null || days > INSPECTION_INTERVAL_DAYS;
  }

  function assessPoint(mp, nowMs) {
    if (!mp || !mp.cui || !mp.cui.insulated) { return null; }
    var inputs = resolveInputs(mp);
    var mod = cui583mod();
    var res = null;
    if (mod && typeof mod.assess === 'function') {
      try { res = mod.assess(inputs); } catch (e) { res = null; }
    }
    var days = daysSince(mp.cui.lastInspISO, nowMs);
    return {
      code: mp.code || mp.id || null,
      tempC: inputs.operatingTempC,
      insulationType: inputs.insulationType,
      coatingCondition: inputs.coatingCondition,
      environment: inputs.environment,
      risk: (res && res.riskLevel) ? res.riskLevel : null,
      lastInsp: trimmedStr(mp.cui.lastInspISO),
      days: days,
      overdue: isOverdue(days)
    };
  }

  function rankOf(risk) { return RISK_RANK[risk] || 0; }

  function sortRows(rows) {
    rows.sort(function (a, b) {
      var ar = rankOf(a.risk);
      var br = rankOf(b.risk);
      if (ar !== br) { return br - ar; }
      var ad = a.days === null ? Infinity : a.days;
      var bd = b.days === null ? Infinity : b.days;
      if (ad !== bd) { return bd - ad; }
      var ac = a.code || '';
      var bc = b.code || '';
      return ac < bc ? -1 : (ac > bc ? 1 : 0);
    });
    return rows;
  }

  function buildRiskTable(rows) {
    return model().table({
      titleKey: 'corrosion.cuiTitle',
      emptyKey: 'reports.noData',
      columns: [
        { key: 'code', labelKey: 'corrosion.pointCode' },
        { key: 'tempC', labelKey: 'cui.inputs.temp', align: true },
        { key: 'insulationType', labelKey: 'cui.inputs.insulation' },
        { key: 'coatingCondition', labelKey: 'cui.inputs.coating' },
        { key: 'environment', labelKey: 'cui.inputs.environment' },
        { key: 'risk', labelKey: 'reports.t04Risk' },
        { key: 'lastInsp', labelKey: 'corrosion.lastCuiInspection' },
        { key: 'days', labelKey: 'reports.t04DaysSince', align: true }
      ],
      rows: rows
    });
  }

  function buildPlan(rows, overdueCount) {
    var items = [];
    if (overdueCount > 0) { items.push({ textKey: 'reports.t04ActionOverdue' }); }
    var maxRank = 0;
    rows.forEach(function (r) { maxRank = Math.max(maxRank, rankOf(r.risk)); });
    if (maxRank > 0) {
      METHOD_LADDER.forEach(function (m) {
        if (m.minRank <= maxRank) { items.push({ textKey: m.textKey }); }
      });
    }
    return model().list({ titleKey: 'reports.t04Plan', items: items });
  }

  function buildScopeNote() {
    return model().text({ titleKey: 'cui.title', bodyKey: 'reports.t04Scope' });
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
      pickStandard('api-583', 'API RP 583', 'Corrosion Under Insulation and Fireproofing'),
      pickStandard('api-571', 'API RP 571', 'Damage Mechanisms Affecting Fixed Equipment in the Refining Industry')
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
      reg.register({ id: 'T-04', titleKey: 'reports.t04Title', needs: [], buildModel: buildT04Model });
    } catch (e) {
      // Idempotent load: the only tolerable failure is a duplicate template
      // (e.g. the module was evaluated twice); anything else must surface.
      if (String((e && e.message) || '').indexOf('duplicate') === -1) { throw e; }
    }
  }

  function buildT04Model(opts) {
    opts = opts || {};
    var store = opts.repos || opts.store || {};
    registerSelf();
    var nowMs = nowMsOf(opts);

    function list(repo) {
      return (store[repo] && typeof store[repo].list === 'function') ? store[repo].list() : Promise.resolve([]);
    }

    return list('monitoringPoints').then(function (mps) {
      var monitoringPoints = Array.isArray(mps) ? mps : [];
      if (typeof opts.sector === 'string' && opts.sector !== '') {
        monitoringPoints = monitoringPoints.filter(function (mp) { return mp && mp.sector === opts.sector; });
      }
      var rows = [];
      monitoringPoints.forEach(function (mp) {
        var row = assessPoint(mp, nowMs);
        if (row) { rows.push(row); }
      });
      sortRows(rows);

      var highRiskCount = rows.filter(function (r) { return r.risk === 'high' || r.risk === 'critical'; }).length;
      var overdueCount = rows.filter(function (r) { return r.overdue; }).length;

      var generatedAtISOStr = generatedAtISO(opts);
      var m = model();

      var sections = [
        m.cover({ titleKey: 'reports.t04Title', meta: { generatedAtISO: generatedAtISOStr } }),
        m.kpiRow({
          titleKey: 'reports.kpis',
          items: [
            { labelKey: 'reports.t04KpiInsulated', value: rows.length },
            { labelKey: 'reports.t04KpiHighRisk', value: highRiskCount },
            { labelKey: 'reports.t04KpiOverdue', value: overdueCount }
          ]
        }),
        buildRiskTable(rows),
        buildPlan(rows, overdueCount),
        buildScopeNote(),
        buildStandards()
      ];

      return {
        id: 'T-04',
        meta: { titleKey: 'reports.t04Title', generatedAtISO: generatedAtISOStr, footer: { textKey: 'reports.pageFooter', generatedKey: 'reports.generatedAt' } },
        sections: sections,
        // Mirrors the top-level report-disclaimer element of the sisters.
        disclaimer: m.disclaimer({ labelKey: 'reports.disclaimer' })
      };
    });
  }

  registerSelf();

  return { buildT04Model: buildT04Model };
});
