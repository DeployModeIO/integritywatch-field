/* IntegrityWatch Field — dossier report model
   Pure (no DOM, no window, no locale formatting) model builder for the
   monitoring-point dossier. Returns { id, meta, sections, disclaimer } using
   the root.IW.reports.model section factories, mirroring dossier.js. */
(function (root, factory) {
  'use strict';
  var api = factory(root);
  root.IW = root.IW || {};
  root.IW.reports = root.IW.reports || {};
  root.IW.reports.modelDossier = api;
  if (typeof module === 'object' && module.exports) { module.exports = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  function model() { return root.IW && root.IW.reports ? root.IW.reports.model : null; }
  function corrosion() { return root.IW && root.IW.calc ? root.IW.calc.corrosion : null; }
  function materials() { return root.IW && root.IW.data ? root.IW.data.materials : null; }
  function standardsData() { return root.IW && root.IW.data ? root.IW.data.standards : null; }

  // Raw model only: numbers are finite numbers or null, dates are ISO strings.
  // Categorical fields (sector, sensorType, level, valveType, status) carry the
  // raw id and the renderer maps them to their translation key; `label`,
  // `titleKey`, `labelKey` and `unit` carry translation keys verbatim.
  function rawNum(v) { return (typeof v === 'number' && isFinite(v)) ? v : null; }

  function materialName(id) {
    var cat = materials();
    if (cat && typeof cat.byId === 'function') {
      var m = cat.byId(id);
      return m ? m.name : (id || null);
    }
    return id || null;
  }

  function materialDensity(id) {
    var cat = materials();
    if (cat && typeof cat.byId === 'function') {
      var m = cat.byId(id);
      return m ? m.densityGcm3 : null;
    }
    return null;
  }

  function buildPointInfo(mp) {
    var proc = mp.process || {};
    // Key-value table (no column headers): rows carry { label, value, unit? }.
    var rows = [
      { label: 'corrosion.pointCode', value: mp.code || mp.id || null },
      { label: 'common.sector', value: mp.sector || 'upstream' },
      { label: 'corrosion.line', value: mp.line || null },
      { label: 'corrosion.material', value: materialName(mp.material) },
      { label: 'corrosion.sensorType', value: mp.sensorType || 'visual' },
      { label: 'corrosion.h2s', value: rawNum(proc.h2sPpm), unit: 'units.ppm' },
      { label: 'corrosion.co2', value: rawNum(proc.co2Ppm), unit: 'units.ppm' },
      { label: 'corrosion.totalPressure', value: rawNum(proc.totalPressureKpa), unit: 'units.kPa' },
      { label: 'corrosion.temperature', value: rawNum(proc.tempC), unit: 'units.degC' },
      { label: 'corrosion.inhibitorTarget', value: rawNum(proc.inhibitorTargetPpm), unit: 'units.ppm' },
      { label: 'corrosion.inhibitorResidual', value: rawNum(proc.inhibitorResidualPpm), unit: 'units.ppm' }
    ];
    return model().table({ titleKey: 'reports.pointInfo', columns: [], rows: rows });
  }

  function buildReadings(readings) {
    var corr = corrosion();
    var sorted = (readings || []).slice().sort(function (a, b) {
      return (a.date < b.date) ? -1 : (a.date > b.date ? 1 : 0);
    });
    return model().table({
      titleKey: 'corrosion.readings',
      emptyKey: 'reports.noData',
      columns: [
        { key: 'date', labelKey: 'common.date' },
        { key: 'cr', labelKey: 'reports.cr', align: true },
        { key: 'level', labelKey: 'corrosion.classification' },
        { key: 'source', labelKey: 'reports.source' }
      ],
      rows: sorted.map(function (r) {
        return {
          date: r.date || null,
          cr: rawNum(r.crMpy),
          level: (corr && typeof r.crMpy === 'number') ? corr.classifySp0775(r.crMpy) : 'low',
          source: r.source || null
        };
      })
    });
  }

  function buildCouponsCalc(coupons, density) {
    var corr = corrosion();
    var items = (coupons || []).map(function (c) {
      var deltaW = (typeof c.wiMg === 'number' && typeof c.wfMg === 'number') ? c.wiMg - c.wfMg : null;
      var dens = (typeof c.densityGcm3 === 'number') ? c.densityGcm3 : density;
      var hours = (typeof c.exposedHours === 'number') ? c.exposedHours : (typeof c.days === 'number' ? c.days * 24 : null);
      var result = null;
      if (deltaW !== null && dens && c.areaIn2 && hours && corr) {
        try {
          result = corr.crFromWeightLoss({ deltaWmg: deltaW, densityGcm3: dens, areaIn2: c.areaIn2, hours: hours });
        } catch (e) { result = null; }
      }
      var mpy = result ? result.mpy : null;
      return {
        label: c.pairId || c.id || null,
        roleKey: c.role === 'inhibited' ? 'corrosion.inhibited' : 'corrosion.blank',
        deltaW: rawNum(deltaW),
        density: rawNum(dens),
        areaIn2: rawNum(c.areaIn2),
        hours: rawNum(hours),
        mpy: rawNum(mpy),
        level: (corr && typeof mpy === 'number') ? corr.classifySp0775(mpy) : null,
        hasResult: result !== null
      };
    });
    return model().couponCards({ titleKey: 'reports.astmCalc', items: items });
  }

  function buildScreening(mp) {
    var corr = corrosion();
    var proc = mp.process || {};
    var rows = [];
    var hasSour = typeof proc.h2sPpm === 'number' && proc.h2sPpm > 0 && typeof proc.totalPressureKpa === 'number' && proc.totalPressureKpa > 0;
    if (hasSour && corr) {
      var pp = corr.partialPressureH2S({ totalPressureKpa: proc.totalPressureKpa, h2sPpm: proc.h2sPpm });
      rows.push({
        label: 'corrosion.sourScreening',
        value: rawNum(pp.kpa),
        unit: 'units.kPa',
        mr0175: corr.classifyMr0175(pp.kpa)
      });
    }
    var hasDwm = typeof proc.co2Ppm === 'number' && proc.co2Ppm > 0 && typeof proc.totalPressureKpa === 'number' && proc.totalPressureKpa > 0;
    if (hasDwm && corr) {
      var pCo2Kpa = proc.totalPressureKpa * (proc.co2Ppm / 1e6);
      var pCo2Bar = pCo2Kpa / 100;
      var dwm = corr.deWaardMilliams({ tempC: proc.tempC || 25, pCo2Bar: pCo2Bar });
      rows.push({
        label: 'corrosion.dwmTitle',
        value: rawNum(dwm.mpy),
        unit: 'units.mpy'
      });
    }
    // Key-value table (no column headers): rows carry { label, value, unit?, mr0175? }.
    return model().table({ titleKey: 'reports.screening', columns: [], rows: rows });
  }

  function buildAssociatedPsvs(psvs, mp) {
    var linked = (psvs || []).filter(function (p) {
      return (mp.id && p.assetId === mp.id) || (mp.systemId && p.assetId === mp.systemId);
    });
    var chosen = linked.length > 0 ? linked : (psvs || []);
    var sec = model().table({
      titleKey: 'reports.associatedPsvs',
      emptyKey: 'reports.noData',
      columns: [
        { key: 'tag', labelKey: 'psv.tag' },
        { key: 'type', labelKey: 'psv.valveType' },
        { key: 'set', labelKey: 'psv.setPressure', align: true },
        { key: 'status', labelKey: 'common.status' }
      ],
      rows: chosen.map(function (p) {
        return {
          tag: p.tag || p.id || null,
          type: p.valveType || 'conventional',
          set: rawNum(p.setPressurePsig),
          status: p.status || 'ok'
        };
      })
    });
    // The DOM builder shows a note when no PSV links by assetId/systemId.
    if (linked.length === 0) { sec.noteKey = 'reports.associationCriterion'; }
    return sec;
  }

  function buildStandards() {
    var list = (standardsData() && standardsData().standards) || [];
    var used = list.filter(function (s) { return !s.usedIn || s.usedIn.indexOf('corrosion') !== -1; });
    var sec = model().standards({
      titleKey: 'reports.standardsApplied',
      items: used.map(function (s) { return { id: s.code || s.id, title: s.title || '' }; })
    });
    // `standards` keeps only {id,title}; carry the edition the dossier table shows.
    used.forEach(function (s, i) { sec.items[i].edition = s.edition || null; });
    return sec;
  }

  function buildDossierModel(opts) {
    opts = opts || {};
    var store = opts.repos || opts.store || {};
    var mpId = opts.mpId;

    function list(repo) {
      return (store[repo] && typeof store[repo].list === 'function') ? store[repo].list() : Promise.resolve([]);
    }
    function get(repo, id) {
      return (store[repo] && typeof store[repo].get === 'function') ? store[repo].get(id) : Promise.resolve(null);
    }

    return Promise.all([
      get('monitoringPoints', mpId),
      list('readings'),
      list('coupons'),
      list('psvs')
    ]).then(function (data) {
      var mp = data[0];
      var readings = Array.isArray(data[1]) ? data[1] : [];
      var coupons = Array.isArray(data[2]) ? data[2] : [];
      var psvs = Array.isArray(data[3]) ? data[3] : [];

      var subtitle = mp ? (mp.code || mp.id) : mpId;
      var mpSafe = mp || {};
      var generatedAtISO = new Date().toISOString();

      var readingsForPoint = readings.filter(function (r) { return r.mpId === mpId; });
      var couponsForPoint = coupons.filter(function (c) { return c.mpId === mpId; });

      var density = null;
      if (mpSafe.material) { density = materialDensity(mpSafe.material); }

      var sections = [
        model().cover({ titleKey: 'reports.dossierTitle', subtitle: subtitle, meta: { generatedAtISO: generatedAtISO } }),
        buildPointInfo(mpSafe),
        buildReadings(readingsForPoint),
        buildCouponsCalc(couponsForPoint, density),
        buildScreening(mpSafe),
        buildAssociatedPsvs(psvs, mpSafe),
        buildStandards()
      ];

      return {
        id: 'dossier',
        meta: { titleKey: 'reports.dossierTitle', subtitle: subtitle, generatedAtISO: generatedAtISO, footer: { textKey: 'reports.pageFooter', generatedKey: 'reports.generatedAt' } },
        sections: sections,
        // Mirrors the top-level report-disclaimer element in dossier.js (not a section).
        disclaimer: model().disclaimer({ labelKey: 'reports.disclaimer' })
      };
    });
  }

  return { buildDossierModel: buildDossierModel };
});
