/* IntegrityWatch Field — T-03 sour service screening report model
   Pure (no DOM, no window, no locale formatting) model builder for the T-03
   "Screening de servicio ácido" report (docs/REPORTING-BLUEPRINT.md §T-03).
   Sweeps EVERY monitoring point with acid gas (h2sPpm > 0 or co2Ppm > 0),
   computes pH2S via IW.calc.corrosion.partialPressureH2S and the MR0175/ISO
   15156 region via IW.calc.corrosion.classifyMr0175 (both reused, never
   duplicated), and checks the installed material against the region.
   Returns { id, meta, sections, disclaimer } using the root.IW.reports.model
   section factories, mirroring model-dossier.js / model-quarterly.js.

   GAUGE: the blueprint asks for a "gauge de región ácida", but the report
   renderer supports only the chart kinds trend/cusum/bullet/matrix
   (IW.reports.charts); a 'gauge' kind does not exist. Per spec the severity
   picture is therefore carried by kpiRow + table + actions list, and the
   gauge is left for the visual layer when/if renderer gains that kind.

   Screening-level rules (this report only; the full MR0175/ISO 15156 region
   determination needs pH, chlorides and hardness, not modelled here):
   - pH2S = totalPressureKpa × h2sPpm/1e6 (points without h2sPpm screen at 0,
     region 'low').
   - "Severe" region = moderate or high (anything but 'low').
   - Aptitude by material family catalogue (IW.data.materials):
       * region low      → any catalogued material is apt;
       * region moderate/high → CRA families (stainless, duplex, clad) are
         apt; plain carbon steel is NOT (MR0175 conditions such as ≤22 HRC
         and HIC resistance cannot be verified at screening level);
       * material not in the catalogue → NOT apt (cannot be verified).
     Known limitation: 'cs-coated' is catalogued under family 'clad' (coating
     as barrier); screening accepts it, but the note in the actions table
     reminds that the base metal still carries carbon-steel limits. */
(function (root, factory) {
  'use strict';
  var api = factory(root);
  root.IW = root.IW || {};
  root.IW.reports = root.IW.reports || {};
  root.IW.reports.modelT03 = api;
  if (typeof module === 'object' && module.exports) { module.exports = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  var CRA_FAMILIES = { stainless: true, duplex: true, clad: true };

  function model() { return root.IW && root.IW.reports ? root.IW.reports.model : null; }
  function corrosion() { return root.IW && root.IW.calc ? root.IW.calc.corrosion : null; }
  function materials() { return root.IW && root.IW.data ? root.IW.data.materials : null; }
  function registry() { return root.IW && root.IW.reports ? root.IW.reports.registry : null; }
  function standardsData() { return root.IW && root.IW.data ? root.IW.data.standards : null; }

  // Raw model only: numbers are finite numbers or null; categorical fields
  // (region, apto) carry the raw id and the visual layer maps them to their
  // translation key ('corrosion.mr0175.*', 'common.yes'/'common.no').
  function rawNum(v) { return (typeof v === 'number' && isFinite(v)) ? v : null; }

  function materialEntry(id) {
    var cat = materials();
    return (cat && typeof cat.byId === 'function') ? cat.byId(id) : null;
  }

  function materialLabel(id) {
    var m = materialEntry(id);
    return m ? m.name : (id || null);
  }

  function acidGasPresent(proc) {
    var h2s = rawNum(proc.h2sPpm);
    var co2 = rawNum(proc.co2Ppm);
    return (h2s !== null && h2s > 0) || (co2 !== null && co2 > 0);
  }

  function isApt(materialId, region) {
    if (!region) { return false; }
    var m = materialEntry(materialId);
    if (!m) { return false; }
    if (region === 'low') { return true; }
    return !!CRA_FAMILIES[m.family];
  }

  function screenPoint(mp) {
    var proc = mp.process || {};
    if (!acidGasPresent(proc)) { return null; }
    var corr = corrosion();
    var pTotal = rawNum(proc.totalPressureKpa);
    var h2s = rawNum(proc.h2sPpm);
    var ph2s = null;
    if (corr && pTotal !== null && pTotal > 0) {
      try {
        // co2-only points screen at h2sPpm 0 → pH2S 0 → region 'low'.
        ph2s = corr.partialPressureH2S({ totalPressureKpa: pTotal, h2sPpm: h2s === null ? 0 : h2s }).kpa;
      } catch (e) { ph2s = null; }
    }
    var region = (corr && ph2s !== null) ? corr.classifyMr0175(ph2s) : null;
    return {
      code: mp.code || mp.id || null,
      h2s: h2s,
      pTotal: pTotal,
      ph2s: ph2s,
      region: region,
      material: materialLabel(mp.material),
      apto: isApt(mp.material, region) ? 'yes' : 'no'
    };
  }

  function buildScreeningTable(rows) {
    var sec = model().table({
      titleKey: 'corrosion.sourScreening',
      emptyKey: 'reports.noData',
      columns: [
        { key: 'code', labelKey: 'corrosion.pointCode' },
        { key: 'h2s', labelKey: 'corrosion.h2s', align: true },
        { key: 'pTotal', labelKey: 'corrosion.totalPressure', align: true },
        { key: 'ph2s', labelKey: 'corrosion.ph2s', align: true },
        { key: 'region', labelKey: 'corrosion.mr0175Ref' },
        { key: 'material', labelKey: 'corrosion.material' },
        { key: 'apto', labelKey: 'reports.t03Apt' }
      ],
      rows: rows
    });
    sec.noteKey = 'corrosion.screeningNote';
    return sec;
  }

  function buildActions(insufficientCount) {
    var items = [];
    if (insufficientCount > 0) {
      items.push({ textKey: 'reports.t03ActionUpgrade' });
      items.push({ textKey: 'reports.t03ActionEnvironment' });
    }
    return model().list({ titleKey: 'reports.t03Actions', items: items });
  }

  function buildStandards() {
    var src = standardsData();
    var list = (src && src.standards) || [];
    var items = [];
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === 'mr0175') {
        items.push({ id: list[i].code || list[i].id, title: list[i].title || '' });
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
      reg.register({ id: 'T-03', titleKey: 'reports.t03Title', needs: [], buildModel: buildT03Model });
    } catch (e) {
      // Idempotent load: the only tolerable failure is a duplicate template
      // (e.g. the module was evaluated twice); anything else must surface.
      if (String((e && e.message) || '').indexOf('duplicate') === -1) { throw e; }
    }
  }

  function buildT03Model(opts) {
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
        var row = screenPoint(mp);
        if (row) { rows.push(row); }
      });
      rows.sort(function (a, b) {
        var av = a.ph2s === null ? -1 : a.ph2s;
        var bv = b.ph2s === null ? -1 : b.ph2s;
        return bv - av;
      });

      var severeCount = rows.filter(function (r) { return r.region === 'moderate' || r.region === 'high'; }).length;
      var insufficientCount = rows.filter(function (r) { return r.apto === 'no'; }).length;

      var generatedAtISOStr = generatedAtISO(opts);
      var m = model();

      var sections = [
        m.cover({ titleKey: 'reports.t03Title', meta: { generatedAtISO: generatedAtISOStr } }),
        m.kpiRow({
          titleKey: 'reports.kpis',
          items: [
            { labelKey: 'reports.t03KpiScreened', value: rows.length },
            { labelKey: 'reports.t03KpiSevere', value: severeCount },
            { labelKey: 'reports.t03KpiInsufficient', value: insufficientCount }
          ]
        }),
        buildScreeningTable(rows),
        buildActions(insufficientCount),
        buildStandards()
      ];

      return {
        id: 'T-03',
        meta: { titleKey: 'reports.t03Title', generatedAtISO: generatedAtISOStr, footer: { textKey: 'reports.pageFooter', generatedKey: 'reports.generatedAt' } },
        sections: sections,
        // Mirrors the top-level report-disclaimer element of the sisters.
        disclaimer: m.disclaimer({ labelKey: 'reports.disclaimer' })
      };
    });
  }

  registerSelf();

  return { buildT03Model: buildT03Model };
});
