/* IntegrityWatch Field — T-01 modelo de alerta de integridad de punto
   Plantilla T-01 del blueprint (docs/REPORTING-BLUEPRINT.md §T-01): alerta de
   integridad de un punto de corrosión. Modelo puro (sin DOM, sin Intl, sin
   formateo de locale) que devuelve { id, meta, sections, disclaimer } con las
   factories de root.IW.reports.model, espejo de model-dossier.js.
   NO reimplementa fórmulas: toda la matemática vive en IW.calc.corrosion,
   IW.calc.norsok506 e IW.calc.remainingLife. */
(function (root, factory) {
  'use strict';
  var api = factory(root);
  root.IW = root.IW || {};
  root.IW.reports = root.IW.reports || {};
  root.IW.reports.modelT01 = api;
  if (typeof module === 'object' && module.exports) { module.exports = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  var DAY_MS = 86400000;
  var HOUR_MS = 3600000;
  // Umbral SP0775 de severidad (≥10 mpy) usado por la serie y la banda del gráfico.
  var SEVERE_LIMIT = 10;
  function model() { return root.IW && root.IW.reports ? root.IW.reports.model : null; }
  function corrosion() { return root.IW && root.IW.calc ? root.IW.calc.corrosion : null; }
  function norsok() { return root.IW && root.IW.calc ? root.IW.calc.norsok506 : null; }
  function remainingLifeCalc() { return root.IW && root.IW.calc ? root.IW.calc.remainingLife : null; }
  function unitsCalc() { return root.IW && root.IW.calc ? root.IW.calc.units : null; }
  function standardsData() { return root.IW && root.IW.data ? root.IW.data.standards : null; }

  // Modelo crudo: números finitos o null, fechas ISO, sin Intl/localDate/sin DOM.
  function rawNum(v) { return (typeof v === 'number' && isFinite(v)) ? v : null; }

  function parseMs(iso) {
    var ms = Date.parse(iso);
    return isNaN(ms) ? null : ms;
  }

  function avg(list) {
    if (!list.length) { return null; }
    var s = 0;
    for (var i = 0; i < list.length; i++) { s += list[i]; }
    return s / list.length;
  }

  // Ventanas de alerta como las reglas R1/R2/R7 (definiciones del motor de
  // reglas): lectura dentro de [now - ventana, now].
  function inLast(ms, nowMs, windowMs) { return ms !== null && ms <= nowMs && ms >= nowMs - windowMs; }

  // Series del punto ordenadas por fecha ascendente (ISO ordena lexicográficamente).
  function sortedReadings(readings, mpId) {
    return (readings || []).filter(function (r) { return r.mpId === mpId; })
      .slice().sort(function (a, b) { return (a.date < b.date) ? -1 : (a.date > b.date ? 1 : 0); });
  }

  function crValues(readings, nowMs, windowMs) {
    var out = [];
    readings.forEach(function (r) {
      if (typeof r.crMpy !== 'number' || !isFinite(r.crMpy)) { return; }
      if (inLast(parseMs(r.date), nowMs, windowMs)) { out.push(r.crMpy); }
    });
    return out;
  }

  // Predicción DWM (mpy) a partir del proceso del punto; null si no aplica.
  function dwmMpy(mp) {
    var corr = corrosion();
    var proc = mp.process || {};
    if (!(proc.co2Ppm > 0) || !(proc.totalPressureKpa > 0) || !corr) { return null; }
    var pCo2Bar = proc.totalPressureKpa * (proc.co2Ppm / 1e6) / 100;
    try {
      var m = corr.deWaardMilliams({ tempC: proc.tempC == null ? 25 : proc.tempC, pCo2Bar: pCo2Bar });
      return rawNum(m.mpy);
    } catch (e) { return null; }
  }

  // NORSOK M-506 si hay CO2 y los datos lo permiten; null si el motor rechaza
  // el caso (faltan pH/cizalla en el store actual).
  function norsokMpy(mp) {
    var ns = norsok();
    var proc = mp.process || {};
    if (!ns || !(proc.co2Ppm > 0) || !(proc.totalPressureKpa > 0)) { return null; }
    var res = null;
    try {
      res = ns.computeCR({
        temperatureC: proc.tempC,
        totalPressureBar: proc.totalPressureKpa / 100,
        co2MolePercent: proc.co2Ppm / 1e4,
        ph: proc.ph,
        wallShearPa: proc.wallShearPa,
        inhibitorEfficiencyPercent: proc.inhibitorEfficiencyPct
      });
    } catch (e) { return null; }
    if (!res || !res.ok) { return null; }
    var u = unitsCalc();
    return (u && typeof u.mmYearToMpy === 'function') ? rawNum(u.mmYearToMpy(res.crMMPerYear)) : null;
  }

  // RUL y fecha estimada de breach vía IW.calc.remainingLife (sin fórmulas propias).
  function computeRul(mp, readings, nowMs) {
    var rl = remainingLifeCalc();
    var none = { months: null, breachISO: null, confidence: null, method: null };
    if (!rl || mp.tNom == null || mp.tMin == null) { return none; }
    var series = readings.filter(function (r) { return typeof r.crMpy === 'number' && isFinite(r.crMpy); })
      .map(function (r) { return { date: r.date, value: r.crMpy }; });
    var ruling = rl.rulFromCorrosionRates(series, { tNom: mp.tNom, tMin: mp.tMin });
    if (!ruling || ruling.error) { return none; }
    var months = rawNum(ruling.rulMonths); // Infinity -> null (pureza)
    // Fecha de breach: aritmética de fechas pura desde `now` + meses (365.25/12 días/mes).
    var breachISO = (months !== null)
      ? new Date(nowMs + months * (365.25 / 12) * DAY_MS).toISOString()
      : null;
    return {
      months: months,
      breachISO: breachISO,
      confidence: typeof ruling.confidence === 'string' ? ruling.confidence : null,
      method: typeof ruling.method === 'string' ? ruling.method : null
    };
  }

  // Disparador de la alerta: R1 (≥10 mpy en 24 h) > R2 (avg7 ≥ 2×avg30) >
  // R7 (ratio medido/modelo fuera de 0.3–2), priorizados por severidad.
  function detectTrigger(readings, nowMs, avg7, modelMpy) {
    var spike = crValues(readings, nowMs, 24 * HOUR_MS).some(function (v) { return v >= SEVERE_LIMIT; });
    if (spike) { return { ruleId: 'R1', labelKey: 'rules.name.R1' }; }
    var avg30 = avg(crValues(readings, nowMs, 30 * DAY_MS));
    if (avg7 !== null && avg30 !== null && avg30 > 0 && avg7 >= 2 * avg30) {
      return { ruleId: 'R2', labelKey: 'rules.name.R2' };
    }
    if (avg7 !== null && modelMpy !== null && modelMpy > 0) {
      var ratio = avg7 / modelMpy;
      if (ratio > 2 || ratio < 0.3) { return { ruleId: 'R7', labelKey: 'rules.name.R7' }; }
    }
    return { ruleId: null, labelKey: null };
  }

  function buildKpis(mp, readings, nowMs, rul) {
    var corr = corrosion();
    var sorted = readings;
    var last = sorted.length ? sorted[sorted.length - 1] : null;
    var currentCr = last ? rawNum(last.crMpy) : null;
    var level = (corr && typeof currentCr === 'number') ? corr.classifySp0775(currentCr) : null;
    var avg7 = avg(crValues(sorted, nowMs, 7 * DAY_MS));
    var avg30 = avg(crValues(sorted, nowMs, 30 * DAY_MS));
    var delta = (avg7 !== null && avg30 !== null) ? avg7 - avg30 : null;
    var modelMpy = dwmMpy(mp);
    var ratio = (avg7 !== null && modelMpy !== null && modelMpy > 0) ? avg7 / modelMpy : null;
    return {
      items: [
        { labelKey: 'reports.cr', value: currentCr, unit: 'units.mpy', status: level },
        { labelKey: 'reports.t01Delta30', value: rawNum(delta), unit: 'units.mpy' },
        { labelKey: 'corrosion.modelRatio', value: rawNum(ratio) },
        { labelKey: 'corrosion.remainingLife', value: rul.months, unit: 'common.months' },
        { labelKey: 'reports.t01BreachDate', value: rul.breachISO }
      ],
      currentCr: currentCr,
      level: level,
      avg7: avg7,
      modelMpy: modelMpy
    };
  }

  // Serie con umbral: cada lectura con su límite SP0775 y clasificación.
  function buildSeriesTable(sorted) {
    var corr = corrosion();
    return model().table({
      titleKey: 'corrosion.readings',
      emptyKey: 'reports.noData',
      columns: [
        { key: 'date', labelKey: 'common.date' },
        { key: 'cr', labelKey: 'reports.cr', align: true },
        { key: 'limit', labelKey: 'reports.t01Threshold', align: true },
        { key: 'level', labelKey: 'corrosion.classification' },
        { key: 'source', labelKey: 'reports.source' }
      ],
      rows: sorted.map(function (r) {
        return {
          date: r.date || null,
          cr: rawNum(r.crMpy),
          limit: SEVERE_LIMIT,
          level: (corr && typeof r.crMpy === 'number') ? corr.classifySp0775(r.crMpy) : 'low',
          source: r.source || null
        };
      })
    });
  }

  // Clasificación SP0775 y contexto de tamizaje como lista con claves existentes.
  function buildClassificationList(mp, level) {
    var corr = corrosion();
    var proc = mp.process || {};
    var items = [];
    if (level) { items.push({ textKey: 'severity.' + level, status: level }); }
    if (corr && proc.h2sPpm > 0 && proc.totalPressureKpa > 0) {
      var ph2s = null;
      try { ph2s = corr.partialPressureH2S({ totalPressureKpa: proc.totalPressureKpa, h2sPpm: proc.h2sPpm }).kpa; } catch (e) { ph2s = null; }
      if (ph2s !== null) { items.push({ textKey: 'corrosion.mr0175.' + corr.classifyMr0175(ph2s) }); }
    }
    if (proc.co2Ppm > 0) { items.push({ textKey: 'corrosion.dwmNote' }); }
    return model().list({ titleKey: 'corrosion.sp0775Ref', items: items });
  }

  // Contexto numérico del proceso (tabla clave-valor, estilo dossier; claves existentes).
  function buildProcessContext(mp) {
    var corr = corrosion();
    var proc = mp.process || {};
    var rows = [];
    rows.push({ label: 'corrosion.h2s', value: rawNum(proc.h2sPpm), unit: 'units.ppm' });
    rows.push({ label: 'corrosion.co2', value: rawNum(proc.co2Ppm), unit: 'units.ppm' });
    rows.push({ label: 'corrosion.totalPressure', value: rawNum(proc.totalPressureKpa), unit: 'units.kPa' });
    rows.push({ label: 'corrosion.temperature', value: rawNum(proc.tempC), unit: 'units.degC' });
    var dwm = dwmMpy(mp);
    if (dwm !== null) { rows.push({ label: 'corrosion.dwmTitle', value: dwm, unit: 'units.mpy' }); }
    var ns = norsokMpy(mp);
    if (ns !== null) { rows.push({ label: 'norsok.cr', value: ns, unit: 'units.mpy' }); }
    if (corr && proc.h2sPpm > 0 && proc.totalPressureKpa > 0) {
      try {
        rows.push({ label: 'corrosion.sourScreening', value: rawNum(corr.partialPressureH2S({ totalPressureKpa: proc.totalPressureKpa, h2sPpm: proc.h2sPpm }).kpa), unit: 'units.kPa' });
      } catch (e) { /* sin pH2S si el cálculo falla */ }
    }
    return model().table({ titleKey: 'corrosion.processParams', columns: [], rows: rows });
  }

  // Acción recomendada derivada de las cifras (umbral superado o RUL crítica
  // -> acción; vigilancia en caso contrario).
  function buildActionText(currentCr, level, rul) {
    var urgent = level === 'severe' || currentCr >= 10 || (rul.months !== null && rul.months < 12);
    return model().text({
      titleKey: 'common.actions',
      bodyKey: urgent ? 'reports.t01Action' : 'reports.t01ActionWatch'
    });
  }

  // Tendencia: mismo shape del chart 'trend' que ya producen las plantillas
  // existentes (data [{x,y,label}], axis, bands) — el renderer no cambia.
  function buildTrendChart(sorted) {
    var pts = [];
    var maxY = null;
    sorted.forEach(function (r, i) {
      var y = rawNum(r.crMpy);
      if (y === null) { return; }
      pts.push({ x: i + 1, y: y, label: r.date || null });
      if (maxY === null || y > maxY) { maxY = y; }
    });
    var bands = [];
    if (maxY !== null && maxY > SEVERE_LIMIT) { bands.push({ from: SEVERE_LIMIT, to: maxY, status: 'crit' }); }
    return model().chart({
      kind: 'trend',
      titleKey: 'corrosion.trend',
      data: pts,
      axis: { x: 'common.date', y: 'reports.cr' },
      bands: bands
    });
  }

  // Normas aplicadas: mismo criterio de selección que el dossier (usadas en corrosión).
  function buildStandards() {
    var list = (standardsData() && standardsData().standards) || [];
    var used = list.filter(function (s) { return !s.usedIn || s.usedIn.indexOf('corrosion') !== -1; });
    return model().standards({
      titleKey: 'reports.standardsApplied',
      items: used.map(function (s) { return { id: s.code || s.id, title: s.title || '' }; })
    });
  }

  function buildT01Model(opts) {
    opts = opts || {};
    var store = opts.repos || opts.store || {};
    var mpId = opts.mpId;
    var nowMs = opts.now != null ? parseMs(opts.now) : Date.now();
    if (nowMs === null || isNaN(nowMs)) { nowMs = Date.now(); }

    function list(repo) {
      return (store[repo] && typeof store[repo].list === 'function') ? store[repo].list() : Promise.resolve([]);
    }
    function get(repo, id) {
      return (store[repo] && typeof store[repo].get === 'function') ? store[repo].get(id) : Promise.resolve(null);
    }

    return Promise.all([
      get('monitoringPoints', mpId),
      list('readings')
    ]).then(function (data) {
      var mp = data[0] || {};
      var sorted = sortedReadings(Array.isArray(data[1]) ? data[1] : [], mpId);
      var generatedAtISO = new Date().toISOString();
      var subtitle = mp.code || mp.id || mpId;

      var rul = computeRul(mp, sorted, nowMs);
      var kpis = buildKpis(mp, sorted, nowMs, rul);
      var trigger = detectTrigger(sorted, nowMs, kpis.avg7, kpis.modelMpy);

      var cover = trigger.labelKey
        ? model().cover({ titleKey: 'reports.t01Title', subtitleKey: trigger.labelKey, meta: { generatedAtISO: generatedAtISO } })
        : model().cover({ titleKey: 'reports.t01Title', subtitle: subtitle, meta: { generatedAtISO: generatedAtISO } });

      var sections = [
        cover,
        model().kpiRow({ titleKey: 'reports.kpis', items: kpis.items }),
        buildSeriesTable(sorted),
        buildClassificationList(mp, kpis.level),
        buildProcessContext(mp),
        buildActionText(kpis.currentCr, kpis.level, rul),
        buildTrendChart(sorted),
        buildStandards()
      ];

      return {
        id: 'T-01',
        meta: {
          titleKey: 'reports.t01Title',
          subtitle: subtitle,
          triggerRuleId: trigger.ruleId,
          generatedAtISO: generatedAtISO,
          footer: { textKey: 'reports.pageFooter', generatedKey: 'reports.generatedAt' }
        },
        sections: sections,
        // Igual que el dossier: el disclaimer vive en la raíz del modelo, no como sección.
        disclaimer: model().disclaimer({ labelKey: 'reports.disclaimer' })
      };
    });
  }

  // Claves i18n NUEVAS introducidas por T-01 (faltan en locales/*.js hasta que
  // se agreguen; tests/report-t01.test.js exige que esta lista sea exacta).
  var NEW_LOCALE_KEYS = [
    'reports.t01Title',
    'reports.t01Delta30',
    'reports.t01BreachDate',
    'reports.t01Threshold',
    'reports.t01Action',
    'reports.t01ActionWatch'
  ];

  var apiExports = { buildT01Model: buildT01Model, NEW_LOCALE_KEYS: NEW_LOCALE_KEYS };

  // Registro en el registry (tolerante a hot-reload: un id duplicado se ignora).
  try {
    if (root.IW && root.IW.reports && root.IW.reports.registry && typeof root.IW.reports.registry.register === 'function') {
      root.IW.reports.registry.register({
        id: 'T-01',
        titleKey: 'reports.t01Title',
        needs: ['mpId'],
        buildModel: apiExports.buildT01Model
      });
    }
  } catch (e) { /* id ya registrado: ignore para recargas en caliente */ }

  return apiExports;
});
