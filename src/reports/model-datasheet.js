/* IntegrityWatch Field — datasheet report model
   Pure (no DOM, no window, no locale formatting) model builder for the PSV
   datasheet. Returns { id, meta, sections } using the root.IW.reports.model
   section factories. Key/value blocks are table sections with two columns. */
(function (root, factory) {
  'use strict';
  var api = factory(root);
  root.IW = root.IW || {};
  root.IW.reports = root.IW.reports || {};
  root.IW.reports.modelDatasheet = api;
  if (typeof module === 'object' && module.exports) { module.exports = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  function model() { return root.IW && root.IW.reports ? root.IW.reports.model : null; }
  function psvCalc() { return root.IW && root.IW.calc ? root.IW.calc.psv : null; }

  function rawNum(v) { return (typeof v === 'number' && isFinite(v)) ? v : null; }

  function kvColumns() {
    return [
      { key: 'key', align: 'right' },
      { key: 'value' }
    ];
  }

  function fluidName(p, t) {
    if (p.fluid && typeof p.fluid === 'object' && p.fluid.name) { return p.fluid.name; }
    var id = p.fluidId;
    if (id && t('fluids.' + id) !== 'fluids.' + id) { return t('fluids.' + id); }
    return id || null;
  }

  function statusLabel(t, status) {
    if (status === 'due') { return t('common.due'); }
    if (status === 'overdue') { return t('common.overdue'); }
    return t('common.ok');
  }

  function fluidProps(p) {
    var f = p.fluid || {};
    var phase = f.phase;
    if (!phase && p.fluidId) {
      var fluids = root.IW && root.IW.data ? root.IW.data.fluids : null;
      if (fluids && typeof fluids.byId === 'function') {
        var fluid = fluids.byId(p.fluidId);
        phase = fluid ? fluid.phase : null;
      }
    }
    return { phase: phase, M: f.M, Z: f.Z, k: f.k, G: f.G, viscCp: f.viscCp };
  }

  function computeC(p, props) {
    var calc = psvCalc();
    if (!calc || props.phase !== 'gas' || typeof props.k !== 'number') { return null; }
    try { return calc.flowCoefficientC(props.k, 'usc'); } catch (e) { return null; }
  }

  function computeF2(p, props) {
    var calc = psvCalc();
    var sizing = p.sizing || {};
    if (!calc || props.phase !== 'gas' || typeof props.k !== 'number') { return null; }
    if (sizing.F2 !== undefined) { return sizing.F2; }
    var P1 = (typeof p.setPressurePsig === 'number') ? p.setPressurePsig * 1.1 + 14.7 : null;
    var P2 = (typeof p.backPressurePsig === 'number') ? p.backPressurePsig + 14.7 : null;
    if (P1 === null || P2 === null || P1 <= P2) { return null; }
    if (calc.isCriticalFlow(P1, P2, props.k)) { return null; }
    var r = P2 / P1;
    return Math.sqrt((props.k / (props.k - 1)) * Math.pow(r, 2 / props.k) * (1 - Math.pow(r, (props.k - 1) / props.k)) / (1 - r));
  }

  function fieldRows(p, t) {
    var fluid = p.fluid || {};
    return [
      { key: 'psv.tag', value: p.tag || p.id || null },
      { key: 'psv.location', value: p.location || null },
      { key: 'psv.valveType', value: t('psv.types.' + (p.valveType || 'conventional')) },
      { key: 'psv.fluid', value: fluidName(p, t) },
      { key: 'psv.phase', value: fluid.phase ? t('psv.' + (fluid.phase === 'gas' ? 'gasVapor' : 'liquid')) : null },
      { key: 'psv.setPressure', value: rawNum(p.setPressurePsig) },
      { key: 'psv.backPressure', value: rawNum(p.backPressurePsig) },
      { key: 'psv.temperature', value: rawNum(p.operatingTempF) },
      { key: 'psv.certified', value: rawNum(p.certifiedCapacity) }
    ];
  }

  function sizingRows(p, t) {
    var props = fluidProps(p);
    var sizing = p.sizing || {};
    var C = computeC(p, props);
    var F2 = computeF2(p, props);
    var selectedArea = (typeof sizing.selectedAreaIn2 === 'number')
      ? sizing.selectedAreaIn2
      : rawNum(p.certifiedCapacity);
    return [
      { key: 'psv.kd', value: rawNum(p.Kd) },
      { key: 'psv.kb', value: rawNum(sizing.Kb !== undefined ? sizing.Kb : p.Kb) },
      { key: 'psv.kw', value: rawNum(sizing.Kw !== undefined ? sizing.Kw : p.Kw) },
      { key: 'psv.kc', value: rawNum(p.Kc) },
      { key: 'psv.kv', value: rawNum(sizing.Kv) },
      { key: 'reports.coefficientC', value: rawNum(C) },
      { key: 'reports.f2', value: rawNum(F2) },
      { key: 'reports.reynolds', value: rawNum(sizing.Re) },
      { key: 'psv.requiredArea', value: rawNum(sizing.AreqIn2) },
      { key: 'psv.flowCritical', value: sizing.critical === undefined ? null : t('psv.' + (sizing.critical ? 'flowCritical' : 'flowSubcritical')) },
      { key: 'psv.selectedOrifice', value: p.orificeLetter || sizing.selectedOrificeLetter || null },
      { key: 'psv.selectedArea', value: selectedArea },
      { key: 'psv.margin', value: rawNum(sizing.marginPct) }
    ];
  }

  function testDateRows(p, t) {
    return [
      { key: 'psv.lastTest', value: p.lastTestDate || null },
      { key: 'psv.nextTest', value: p.nextTestDate || null },
      { key: 'common.status', value: statusLabel(t, p.status) }
    ];
  }

  function standardsRows() {
    var standards = (root.IW && root.IW.data && root.IW.data.standards && root.IW.data.standards.standards) || [];
    return standards.filter(function (s) { return !s.usedIn || s.usedIn.indexOf('psv') !== -1; })
      .map(function (s) { return { key: s.code || s.id, value: s.edition || null }; });
  }

  function buildDatasheetModel(opts) {
    opts = opts || {};
    var store = opts.repos || opts.store || {};
    var psvId = opts.psvId;
    var t = opts.t || function (k) { return k; };
    var m = model();
    var generatedAtISO = new Date().toISOString();

    var getPsv = (store.psvs && typeof store.psvs.get === 'function')
      ? store.psvs.get(psvId)
      : Promise.resolve(null);

    return Promise.resolve(getPsv).then(function (p) {
      var subtitle = p ? (p.tag || p.id || null) : (psvId || null);

      if (!p) {
        return {
          id: 'datasheet',
          meta: { titleKey: 'reports.datasheetTitle', subtitle: subtitle, generatedAtISO: generatedAtISO, footer: { textKey: 'reports.pageFooter', generatedKey: 'reports.generatedAt' } },
          sections: [
            m.cover({ titleKey: 'reports.datasheetTitle', subtitle: subtitle, meta: { generatedAtISO: generatedAtISO } }),
            m.text({ bodyKey: 'reports.notFound' })
          ],
          disclaimer: m.disclaimer({ labelKey: 'reports.disclaimer' })
        };
      }

      return {
        id: 'datasheet',
        meta: { titleKey: 'reports.datasheetTitle', subtitle: subtitle, generatedAtISO: generatedAtISO, footer: { textKey: 'reports.pageFooter', generatedKey: 'reports.generatedAt' } },
        sections: [
          m.cover({ titleKey: 'reports.datasheetTitle', subtitle: subtitle, meta: { generatedAtISO: generatedAtISO } }),
          m.table({ titleKey: 'reports.datasheetFields', columns: kvColumns(), rows: fieldRows(p, t) }),
          m.table({ titleKey: 'psv.sizingTitle', columns: kvColumns(), rows: sizingRows(p, t) }),
          m.table({ titleKey: 'reports.testDates', columns: kvColumns(), rows: testDateRows(p, t) }),
          m.table({ titleKey: 'reports.standardsApplied', emptyKey: 'reports.noData', columns: kvColumns(), rows: standardsRows() })
        ],
        disclaimer: m.disclaimer({ labelKey: 'reports.disclaimer' })
      };
    });
  }

  return { buildDatasheetModel: buildDatasheetModel };
});
