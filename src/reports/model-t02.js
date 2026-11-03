/* IntegrityWatch Field — T-02 report model (blueprint §T-02)
   Tratamiento químico y eficiencia de inhibidor. Modelo puro (sin DOM, sin
   window, sin formato de locale) construido con las factorías de secciones de
   root.IW.reports.model, espejo de model-dossier.js. Números como rawNum
   (finitos o null), fechas como cadenas ISO, claves de traducción verbatim.
   EI por par SOLO con IW.calc.corrosion.inhibitorEfficiency; CR de cupones
   SOLO con IW.calc.corrosion.crFromWeightLoss; balance de residual SOLO con
   IW.calc.corrosion.inhibitorBalance. opts = {repos, t?, now?, period?, sector?},
   needs = [] (sin obligatorios). */
(function (root, factory) {
  'use strict';
  var api = factory(root);
  root.IW = root.IW || {};
  root.IW.reports = root.IW.reports || {};
  root.IW.reports.modelT02 = api;
  if (typeof module === 'object' && module.exports) { module.exports = api; }
  // Registro al final (id T-02). Si registry aún no está cargado el intento
  // se omite en silencio; un duplicado se ignora: la primera inscripción gana.
  try {
    var registry = root.IW.reports.registry;
    if (registry && typeof registry.register === 'function') {
      registry.register({
        id: 'T-02',
        titleKey: 'reports.t02Title',
        needs: [],
        buildModel: api.buildT02Model
      });
    }
  } catch (e) { /* duplicate: ya registrado */ }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  function model() { return root.IW && root.IW.reports ? root.IW.reports.model : null; }
  function corrosion() { return root.IW && root.IW.calc ? root.IW.calc.corrosion : null; }
  function standardsData() { return root.IW && root.IW.data ? root.IW.data.standards : null; }

  // Raw model only: numbers are finite numbers or null, dates are ISO strings.
  function rawNum(v) { return (typeof v === 'number' && isFinite(v)) ? v : null; }

  function generatedISO(now) {
    if (typeof now === 'number' || typeof now === 'string') {
      var d = new Date(now);
      if (!isNaN(d.getTime())) { return d.toISOString(); }
    }
    return new Date().toISOString();
  }

  // Filtro period: cupones/lecturas dentro del rango si viene opts.period.
  // T-02 no expone tabla de lecturas: el filtro aplica a los cupones por su
  // fecha de fin (o inicio si no tiene fin). Comparación ISO lexicográfica.
  function isoInPeriod(iso, period) {
    if (!period || (!period.fromISO && !period.toISO)) { return true; }
    if (!iso) { return false; }
    if (period.fromISO && iso < period.fromISO) { return false; }
    if (period.toISO && iso > period.toISO) { return false; }
    return true;
  }

  function couponHours(c) {
    if (typeof c.exposedHours === 'number') { return c.exposedHours; }
    if (typeof c.days === 'number') { return c.days * 24; }
    return null;
  }

  // CR de un cupón calculada por calc (crFromWeightLoss); null si falta dato.
  function couponCr(c, corr) {
    if (!corr) { return null; }
    var deltaW = (typeof c.wiMg === 'number' && typeof c.wfMg === 'number') ? c.wiMg - c.wfMg : null;
    var dens = rawNum(c.densityGcm3);
    if (dens === null && typeof c.material === 'string' && typeof corr.materialDensity === 'function') {
      dens = rawNum(corr.materialDensity(c.material));
    }
    var hours = couponHours(c);
    if (deltaW === null || dens === null || dens <= 0 || !c.areaIn2 || hours === null || hours <= 0) {
      return null;
    }
    var result = null;
    try {
      result = corr.crFromWeightLoss({ deltaWmg: deltaW, densityGcm3: dens, areaIn2: c.areaIn2, hours: hours });
    } catch (e) { result = null; }
    return result ? rawNum(result.mpy) : null;
  }

  function couponDeltaW(c) {
    return (typeof c.wiMg === 'number' && typeof c.wfMg === 'number') ? rawNum(c.wiMg - c.wfMg) : null;
  }

  // Tabla de pares de cupones: blank vs inhibited, pesos (ΔW), días expuestos,
  // CR calculada por calc y EI por par solo con inhibitorEfficiency.
  function buildPairsSection(coupons, period, sectorMpIds) {
    var corr = corrosion();
    var byPair = {};
    var order = [];
    (coupons || []).forEach(function (c) {
      if (!c || !c.pairId) { return; }
      if (sectorMpIds && c.mpId && !sectorMpIds[c.mpId]) { return; }
      var effDate = c.endDate || c.startDate || null;
      if (!isoInPeriod(effDate, period)) { return; }
      if (!byPair[c.pairId]) { byPair[c.pairId] = {}; order.push(c.pairId); }
      byPair[c.pairId][c.role === 'inhibited' ? 'inhibited' : 'blank'] = c;
    });

    var rows = order.map(function (pairId) {
      var p = byPair[pairId];
      var blank = p.blank, inh = p.inhibited;
      if (!blank || !inh) { return null; }
      var crBlank = couponCr(blank, corr);
      var crInh = couponCr(inh, corr);
      var ei = corr && crBlank !== null && crInh !== null
        ? corr.inhibitorEfficiency({ crBlankMpy: crBlank, crInhibitedMpy: crInh })
        : null;
      return {
        pairId: pairId,
        days: rawNum(blank.days != null ? blank.days : (couponHours(blank) !== null ? couponHours(blank) / 24 : null)),
        deltaWBlank: couponDeltaW(blank),
        deltaWInhibited: couponDeltaW(inh),
        crBlank: crBlank,
        crInhibited: crInh,
        ei: rawNum(ei),
        band: (corr && ei !== null && typeof corr.eiBand === 'function') ? corr.eiBand(ei) : null
      };
    }).filter(function (r) { return r !== null; });

    var section = model().table({
      titleKey: 'reports.eiByPairs',
      emptyKey: 'reports.noData',
      columns: [
        { key: 'pairId', labelKey: 'corrosion.pair' },
        { key: 'days', labelKey: 'corrosion.exposureDays', align: true },
        { key: 'deltaWBlank', labelKey: 'corrosion.deltaWBlank', align: true },
        { key: 'deltaWInhibited', labelKey: 'corrosion.deltaWInhibited', align: true },
        { key: 'crBlank', labelKey: 'corrosion.blank', align: true },
        { key: 'crInhibited', labelKey: 'corrosion.inhibited', align: true },
        { key: 'ei', labelKey: 'reports.eiPct', align: true },
        { key: 'band', labelKey: 'reports.band' }
      ],
      rows: rows
    });

    return { section: section, rows: section.rows };
  }

  // Residual vs objetivo por punto con inhibitorBalance de calc. Los valores
  // de proceso son la foto actual: no tienen fecha, no los afecta el period.
  function buildBalanceSection(monitoringPoints, sector) {
    var corr = corrosion();
    var mps = (monitoringPoints || []).filter(function (mp) {
      if (sector && mp.sector !== sector) { return false; }
      var proc = mp.process || {};
      return typeof proc.inhibitorTargetPpm === 'number' && proc.inhibitorTargetPpm > 0
        && typeof proc.inhibitorResidualPpm === 'number';
    }).sort(function (a, b) {
      var ka = a.code || a.id || '';
      var kb = b.code || b.id || '';
      return ka < kb ? -1 : (ka > kb ? 1 : 0);
    });

    var rows = mps.map(function (mp) {
      var proc = mp.process || {};
      var bal = null;
      if (corr && typeof corr.inhibitorBalance === 'function') {
        try {
          bal = corr.inhibitorBalance({ targetPpm: proc.inhibitorTargetPpm, residualPpm: proc.inhibitorResidualPpm });
        } catch (e) { bal = null; }
      }
      return {
        point: mp.code || mp.id || null,
        target: rawNum(proc.inhibitorTargetPpm),
        residual: rawNum(proc.inhibitorResidualPpm),
        pct: bal ? rawNum(bal.pct) : null,
        band: bal ? bal.band : null
      };
    });

    return { section: model().table({
      titleKey: 'corrosion.inhibitorBalance',
      emptyKey: 'reports.noData',
      columns: [
        { key: 'point', labelKey: 'corrosion.pointCode' },
        { key: 'target', labelKey: 'corrosion.inhibitorTarget', align: true },
        { key: 'residual', labelKey: 'corrosion.inhibitorResidual', align: true },
        { key: 'pct', labelKey: 'corrosion.balanceResult', align: true },
        { key: 'band', labelKey: 'reports.band' }
      ],
      rows: rows
    }), rows: rows };
  }

  function meanOf(values) {
    var n = 0, sum = 0;
    values.forEach(function (v) {
      if (typeof v === 'number' && isFinite(v)) { sum += v; n++; }
    });
    return n ? sum / n : null;
  }

  // Desviación % vs banda 80–150 del balance: 0 dentro de banda, distancia al
  // borde más cercano fuera de ella (under: 80−pct, over: pct−150).
  function bandDeviation(pct) {
    if (pct === null) { return null; }
    if (pct < 80) { return 80 - pct; }
    if (pct > 150) { return pct - 150; }
    return 0;
  }

  function buildKpiSection(pairRows, balanceRows) {
    var corr = corrosion();
    var meanEi = meanOf(pairRows.map(function (r) { return r.ei; }));
    var meanResidual = meanOf(balanceRows.map(function (r) { return r.residual; }));
    var meanDev = meanOf(balanceRows.map(function (r) { return bandDeviation(r.pct); }));
    var items = [
      {
        labelKey: 'corrosion.inhibitorEfficiency',
        value: rawNum(meanEi),
        unit: 'units.pct',
        status: (corr && meanEi !== null && typeof corr.eiBand === 'function') ? corr.eiBand(meanEi) : null
      },
      {
        labelKey: 'corrosion.inhibitorResidual',
        value: rawNum(meanResidual),
        unit: 'units.ppm',
        status: null
      },
      {
        labelKey: 'corrosion.balanceResult',
        value: rawNum(meanDev),
        unit: 'units.pct',
        status: meanDev === null ? null : (meanDev > 0 ? 'warning' : 'info')
      }
    ];
    return model().kpiRow({ titleKey: 'reports.kpis', items: items });
  }

  // Recomendaciones de dosificación derivadas de las cifras (bandas del
  // blueprint: EI < 70 % revisar dosificación; balance > 150 % o fuera de
  // objetivo; todo dentro de bandas → mantener).
  function buildRecsSection(pairRows, balanceRows) {
    var items = [];
    var hasLowEi = pairRows.some(function (r) { return r.ei !== null && r.ei < 70; });
    var hasUnder = balanceRows.some(function (r) { return r.band === 'under'; });
    var hasOver = balanceRows.some(function (r) { return r.band === 'over'; });
    if (hasLowEi) { items.push({ textKey: 'reports.t02RecLowEi', status: 'warning' }); }
    if (hasUnder) { items.push({ textKey: 'reports.t02RecUnderBalance', status: 'warning' }); }
    if (hasOver) { items.push({ textKey: 'reports.t02RecOverBalance', status: 'info' }); }
    var measuredSomething = pairRows.length > 0 || balanceRows.length > 0;
    if (measuredSomething && !hasLowEi && !hasUnder && !hasOver) {
      items.push({ textKey: 'reports.t02RecOk', status: 'info' });
    }
    return model().list({ titleKey: 'reports.recsSummary', items: items });
  }

  // ASTM G1/G4 + NACE SP0775 desde el catálogo de normas; ids estáticos como
  // respaldo si el catálogo no está cargado.
  function buildStandardsSection() {
    var wanted = [
      { id: 'astm-g1', code: 'ASTM G1' },
      { id: 'astm-g4', code: 'ASTM G4' },
      { id: 'sp0775', code: 'NACE/AMPP SP0775' }
    ];
    var list = (standardsData() && standardsData().standards) || [];
    var items = wanted.map(function (w) {
      for (var i = 0; i < list.length; i++) {
        if (list[i].id === w.id) {
          return { id: list[i].code || w.code, title: list[i].title || '' };
        }
      }
      return { id: w.code, title: '' };
    });
    return model().standards({ titleKey: 'reports.standardsApplied', items: items });
  }

  function buildT02Model(opts) {
    opts = opts || {};
    var store = opts.repos || opts.store || {};
    var period = opts.period || null;
    var sector = (typeof opts.sector === 'string' && opts.sector !== '') ? opts.sector : null;
    var m = model();
    if (!m) { throw new Error('model-t02: IW.reports.model no está cargado'); }

    function list(repo) {
      return (store[repo] && typeof store[repo].list === 'function') ? store[repo].list() : Promise.resolve([]);
    }

    return Promise.all([
      list('monitoringPoints'),
      list('coupons')
    ]).then(function (data) {
      var monitoringPoints = Array.isArray(data[0]) ? data[0] : [];
      var coupons = Array.isArray(data[1]) ? data[1] : [];

      var sectorMpIds = null;
      if (sector) {
        sectorMpIds = {};
        monitoringPoints.forEach(function (mp) {
          if (mp && mp.sector === sector && mp.id) { sectorMpIds[mp.id] = true; }
        });
      }

      var pairs = buildPairsSection(coupons, period, sectorMpIds);
      var balance = buildBalanceSection(monitoringPoints, sector);
      var generatedAtISO = generatedISO(opts.now);
      var subtitle = sector || null;

      var sections = [
        m.cover({
          titleKey: 'reports.t02Title',
          subtitle: subtitle,
          meta: { period: period || undefined, generatedAtISO: generatedAtISO }
        }),
        buildKpiSection(pairs.rows, balance.rows),
        pairs.section,
        balance.section,
        buildRecsSection(pairs.rows, balance.rows),
        buildStandardsSection()
      ];

      return {
        id: 't02',
        meta: {
          titleKey: 'reports.t02Title',
          period: period || null,
          generatedAtISO: generatedAtISO,
          footer: { textKey: 'reports.pageFooter', generatedKey: 'reports.generatedAt' }
        },
        sections: sections,
        // Espejo de model-dossier.js: el disclaimer vive fuera de las secciones.
        disclaimer: m.disclaimer({ labelKey: 'reports.disclaimer' })
      };
    });
  }

  return { buildT02Model: buildT02Model };
});
