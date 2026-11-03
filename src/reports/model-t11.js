/* IntegrityWatch Field — T-11 trimestral ejecutivo (jerarquía IOGP) report model
    Pure (no DOM, no window, no locale formatting) model builder for the T-11
    "Informe trimestral ejecutivo" per docs/REPORTING-BLUEPRINT.md §T-11
    (IOGP Report 456 Partes A/G/H/I + API RP 754). T-11 COEXISTS with the
    operational 'quarterly' report: it does not replace it and consumes the
    same underlying information (readings, apm, recommendations) with only a
    different (tier) view. Aggregation glue mirrors model-quarterly.js input
    shaping so both reports agree; the calc FORMULAS live only in
    calc/apm.js / calc/corrosion.js and are never duplicated here.

    TIER MAPPING (decisión propia, documentada; los registros NO traen campo
    de severidad de evento ni jerarquía IOGP explícita):
    - Tier 1 (evento de seguridad de proceso con consecuencia significativa):
      apmEvents de tipo 'unplannedOutage' iniciados en el periodo con
      downtimeH > 0. El evento no tiene campo 'severity'; su consecuencia
      documentada real es el tiempo de parada (campos verificados en
      schemas/seed: id, assetId, type, start, end, downtimeH, description,
      workOrderRef), así que la consecuencia se lee del downtime.
    - Tier 2 (evento de alta potencialidad / near miss): apmEvents de tipo
      'failure' iniciados en el periodo con downtimeH > 0 (mismo criterio de
      consecuencia documentada).
    - Tier 3 (desafío a barreras): recomendaciones CON status 'open' de las
      reglas R1–R14 con disparo (lastTriggeredAt, fallback createdAt) dentro
      del periodo. El blueprint fija literalmente "Tier 3 (desafíos a
      barreras = R1–R14)": R1–R14 son las desviaciones de límites de
      integridad (CR, inhibidor, sensores, cupones, RBI, MTBF, disponibilidad,
      PSV). R15–R19 (RUL, API 576, B31G, CUI, MIC) se añadieron DESPUÉS del
      blueprint y NO entran en el conteo IOGP para no reinterpretarlo; viajan
      solo en las vistas de alertas de sus informes propios.
      Status 'acked' no cuenta como abierto (misma contabilidad que
      model-quarterly: open/acked/resolved separados).
    - Tier 4 (indicador de ejecución): conteo de inspecciones de línea
      (lineInspections) registradas en el periodo. Los porcentajes de
      ejecución del periodo van como KPIs, no como conteo.

    HONESTY (datos ausentes, nunca inventados):
    - % inspecciones a tiempo: lineInspections NO tiene fecha planificada en
      el esquema real (campos: id, systemId, type, lineAssetId, date,
      severity, fromKm, toKm, findings, reportRef, gps, photoMeta). El modelo
      sondea 'plannedDateISO' por si se añade; sin ningún registro con ese
      campo el KPI vale null (el renderer muestra '—') y la nota lo explica.
    - % datos válidos: las lecturas solo traen marca de calidad si entraron
      por ingesta (commit.js escribe quality.mark; hoy solo existe 'medido').
      Si ninguna lectura del periodo trae quality.mark, el KPI es null; si
      unas cuantas lo traen, el porcentaje se calcula solo sobre las marcadas
      (válida = mark === 'medido').
    - Tendencia 12 meses: si no hay NINGÚN desafío Tier 3 en la ventana, la
      sección chart se omite y la reemplaza un text con la nota (precedente
      T-09).

    Ventanas: periodo [fromISO, toISO] con la MISMA comparación de cadenas
    ISO que model-quarterly.inPeriod (acotaciones inclusivas). Para la
    disponibilidad se corrige la fuga del quarterly (su filtro de eventos no
    acotaba el borde superior) acotando por ambos lados; con periodos de
    cierre normal (eventos tras toISO fuera) el resultado coincide.
    Sin periodo parseable, la ventana de disponibilidad cae a los últimos
    90 días hasta opts.now, igual que quarterly.

    Estándares: IOGP 456 y API RP 754 NO están en el catálogo IW.data
    .standards (verificado); se emiten como ítems estáticos de respaldo
    (precedente T-02/T-07 con API 576), y si la integración los añade al
    catálogo con id 'iogp-456'/'api-754' el modelo los preferirá. */
(function (root, factory) {
  'use strict';
  var api = factory(root);
  root.IW = root.IW || {};
  root.IW.reports = root.IW.reports || {};
  root.IW.reports.modelT11 = api;
  if (typeof module === 'object' && module.exports) { module.exports = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  var DAY_MS = 86400000;
  var HOUR_MS = 3600000;
  var TREND_MONTHS = 12;
  var TOP_RECS = 5;

  function model() { return root.IW && root.IW.reports ? root.IW.reports.model : null; }
  function apm() { return root.IW && root.IW.calc ? root.IW.calc.apm : null; }
  function registry() { return root.IW && root.IW.reports ? root.IW.reports.registry : null; }
  function standardsData() { return root.IW && root.IW.data ? root.IW.data.standards : null; }

  // Tier 3 population fixed by the blueprint: R1–R14 (ids reales de
  // rules/definitions.js, sin ceros).
  var TIER3_RULES = {};
  (['R1', 'R2', 'R3', 'R4', 'R5', 'R6', 'R7', 'R8', 'R9', 'R10', 'R11', 'R12', 'R13', 'R14'])
    .forEach(function (id) { TIER3_RULES[id] = true; });

  // Severity ranking of rules/definitions.js findings (critical/high/warning/info).
  var SEV_RANK = { info: 0, warning: 1, high: 2, critical: 3 };

  function inPeriod(iso, from, to) {
    // Verbatim convention from model-quarterly.inPeriod: lexicographic ISO
    // string comparison, inclusive bounds, empty bound = unbounded.
    if (!iso) { return false; }
    if (from && iso < from) { return false; }
    if (to && iso > to) { return false; }
    return true;
  }

  function recTriggeredISO(r) { return r.lastTriggeredAt || r.createdAt || ''; }

  function isTier3Open(r, period) {
    return r && r.status === 'open' && TIER3_RULES[r.ruleId] &&
      inPeriod(recTriggeredISO(r), period.fromISO, period.toISO);
  }

  function mean(values) {
    var vals = values.filter(function (v) { return v !== null && typeof v === 'number' && isFinite(v); });
    if (!vals.length) { return null; }
    return vals.reduce(function (a, b) { return a + b; }, 0) / vals.length;
  }

  // CR media del periodo: misma forma que model-quarterly.avgCrInPeriod
  // (glue de agregación, no fórmula de calc — calc/corrosion.js no interviene).
  function avgCrInPeriod(readings, from, to) {
    var sum = 0, n = 0;
    (readings || []).forEach(function (r) {
      if (typeof r.crMpy === 'number' && isFinite(r.crMpy) && inPeriod(r.date, from, to)) {
        sum += r.crMpy; n++;
      }
    });
    return n ? sum / n : null;
  }

  // % inspecciones a tiempo: sin fecha planificada documentada, null honesto.
  // Si el esquema gana plannedDateISO, se calcula sobre las que la traen.
  function onTimePct(inspections, from, to) {
    var planned = (inspections || []).filter(function (i) {
      return inPeriod(i.date, from, to) && typeof i.plannedDateISO === 'string' && i.plannedDateISO;
    });
    if (!planned.length) { return null; }
    var onTime = planned.filter(function (i) { return String(i.date) <= String(i.plannedDateISO); }).length;
    return (onTime / planned.length) * 100;
  }

  // % datos válidos: sobre las lecturas del periodo QUE traen quality.mark
  // (hoy solo ingesta escribe marks; 'medido' es la marca válida del motor).
  function validDataPct(readings, from, to) {
    var marked = (readings || []).filter(function (r) {
      return inPeriod(r.date, from, to) && r.quality && typeof r.quality.mark === 'string';
    });
    if (!marked.length) { return null; }
    var valid = marked.filter(function (r) { return r.quality.mark === 'medido'; }).length;
    return (valid / marked.length) * 100;
  }

  // Disponibilidad media del periodo: mismo input shaping que el bloque de
  // disponibilidad de model-quarterly (override por activo, o downtime de
  // eventos failure|maintenance en la ventana vía calc.apm.availability),
  // con el borde superior acotado (corrección documentada en cabecera).
  function avgAvailability(assets, events, period) {
    var a = apm();
    var fromMs = Date.parse(period.fromISO);
    var toMs = Date.parse(period.toISO);
    if (isNaN(fromMs) || isNaN(toMs) || toMs < fromMs) {
      var anchor = Date.parse(new Date().toISOString());
      fromMs = anchor - 90 * DAY_MS;
      toMs = anchor;
    }
    var windowH = Math.max((toMs - fromMs) / HOUR_MS, 1);
    var vals = [];
    (assets || []).forEach(function (asset) {
      if (typeof asset.availabilityOverridePct === 'number') { vals.push(asset.availabilityOverridePct); return; }
      var downtime = 0;
      (events || []).forEach(function (e) {
        if (e.assetId !== asset.id) { return; }
        if (e.type !== 'failure' && e.type !== 'maintenance') { return; }
        var startMs = Date.parse(e.start);
        if (isNaN(startMs) || startMs < fromMs || startMs > toMs) { return; }
        if (typeof e.downtimeH === 'number') { downtime += e.downtimeH; }
      });
      var av = a && a.availability ? a.availability({ windowH: windowH, downtimeH: downtime }) : null;
      if (av !== null) { vals.push(av); }
    });
    return vals.length ? vals.reduce(function (x, y) { return x + y; }, 0) / vals.length : null;
  }

  function monthKey(isoStr) { return String(isoStr).slice(0, 7); }

  // Clave 'YYYY-MM' del último mes de la ventana de tendencia: mes del
  // toISO si es parseable; si no, mes de opts.now/Date.now().
  function endMonthKey(period, nowMs) {
    var toMs = Date.parse(period.toISO);
    if (!isNaN(toMs)) {
      var d = new Date(toMs);
      return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0');
    }
    var n = new Date(nowMs);
    return n.getUTCFullYear() + '-' + String(n.getUTCMonth() + 1).padStart(2, '0');
  }

  function monthSequence(endKey, count) {
    var parts = endKey.split('-');
    var y = Number(parts[0]);
    var m = Number(parts[1]);
    var keys = [];
    for (var i = 0; i < count; i++) {
      keys.unshift(y + '-' + String(m).padStart(2, '0'));
      m -= 1;
      if (m === 0) { m = 12; y -= 1; }
    }
    return keys;
  }

  // Serie mensual de desafíos Tier 3 (open, R1–R14) por mes UTC de disparo,
  // en la ventana de 12 meses que termina en el mes del cierre. Se cuentan
  // todos los meses (ceros incluidos) para que la sparkline ejecute recta.
  function monthlyTier3(recs, windowKeys) {
    var counts = {};
    windowKeys.forEach(function (k) { counts[k] = 0; });
    (recs || []).forEach(function (r) {
      if (!r || r.status !== 'open' || !TIER3_RULES[r.ruleId]) { return; }
      var key = monthKey(recTriggeredISO(r));
      if (Object.prototype.hasOwnProperty.call(counts, key)) { counts[key] += 1; }
    });
    return windowKeys.map(function (k) { return { month: k, count: counts[k] }; });
  }

  function buildStandards() {
    var src = standardsData();
    var list = (src && src.standards) || [];
    var fallback = [
      { id: 'iogp-456', code: 'IOGP 456', title: 'Supplementary guidance to API RP 754: Process Safety Performance Indicators' },
      { id: 'api-754', code: 'API RP 754', title: 'Process Safety Performance Indicators for the Refining and Petrochemical Industries' }
    ];
    var items = fallback.map(function (want) {
      for (var i = 0; i < list.length; i++) {
        if (list[i].id === want.id) { return { id: list[i].code || list[i].id, title: list[i].title || want.title }; }
      }
      return { id: want.code, title: want.title };
    });
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
      reg.register({ id: 'T-11', titleKey: 'reports.t11Title', needs: ['period'], buildModel: buildT11Model });
    } catch (e) {
      // Idempotent load: only a duplicate template (module evaluated twice)
      // is tolerated; anything else must surface.
      if (String((e && e.message) || '').indexOf('duplicate') === -1) { throw e; }
    }
  }

  function buildT11Model(opts) {
    opts = opts || {};
    var store = opts.repos || opts.store || {};
    var period = opts.period || { fromISO: '', toISO: '' };
    registerSelf();

    function list(repo) {
      return (store[repo] && typeof store[repo].list === 'function') ? store[repo].list() : Promise.resolve([]);
    }

    return Promise.all([
      list('readings'),
      list('recommendations'),
      list('apmAssets'),
      list('apmEvents'),
      list('lineInspections')
    ]).then(function (res) {
      var readings = Array.isArray(res[0]) ? res[0] : [];
      var recs = Array.isArray(res[1]) ? res[1] : [];
      var apmAssets = Array.isArray(res[2]) ? res[2] : [];
      var apmEvents = Array.isArray(res[3]) ? res[3] : [];
      var inspections = Array.isArray(res[4]) ? res[4] : [];
      var m = model();
      var generatedAtISOStr = generatedAtISO(opts);

      // --- tiers -------------------------------------------------------------
      var tier3Open = recs.filter(function (r) { return isTier3Open(r, period); });
      var tier1 = apmEvents.filter(function (e) {
        return e.type === 'unplannedOutage' && typeof e.downtimeH === 'number' && e.downtimeH > 0 &&
          inPeriod(e.start, period.fromISO, period.toISO);
      }).length;
      var tier2 = apmEvents.filter(function (e) {
        return e.type === 'failure' && typeof e.downtimeH === 'number' && e.downtimeH > 0 &&
          inPeriod(e.start, period.fromISO, period.toISO);
      }).length;
      var tier4 = inspections.filter(function (i) { return inPeriod(i.date, period.fromISO, period.toISO); }).length;

      // --- KPIs de ejecución --------------------------------------------------
      var onTime = onTimePct(inspections, period.fromISO, period.toISO);
      var validData = validDataPct(readings, period.fromISO, period.toISO);
      var avgCr = avgCrInPeriod(readings, period.fromISO, period.toISO);
      var avgAvail = avgAvailability(apmAssets, apmEvents, period);

      // --- tendencia 12 meses -------------------------------------------------
      var nowMs = Date.parse(generatedAtISOStr);
      var windowKeys = monthSequence(endMonthKey(period, nowMs), TREND_MONTHS);
      var series = monthlyTier3(recs, windowKeys);
      var seriesTotal = series.reduce(function (acc, p) { return acc + p.count; }, 0);

      // --- top recomendaciones accionables ----------------------------------
      var top = tier3Open.slice().sort(function (a, b) {
        var ra = SEV_RANK[a.severity] === undefined ? -1 : SEV_RANK[a.severity];
        var rb = SEV_RANK[b.severity] === undefined ? -1 : SEV_RANK[b.severity];
        if (ra !== rb) { return rb - ra; }
        var fa = String(a.fingerprint || a.id || '');
        var fb = String(b.fingerprint || b.id || '');
        return fa < fb ? -1 : (fa > fb ? 1 : 0);
      }).slice(0, TOP_RECS);
      var recItems = top.map(function (r) {
        return { text: String(r.fingerprint || r.id || r.ruleId) + ' · ' + String(r.severity || 'info') };
      });
      if (recItems.length) { recItems.push({ textKey: 'reports.t11ActionReview' }); }

      var trendSection = seriesTotal > 0
        ? m.chart({
          kind: 'trend',
          titleKey: 'reports.t11TrendTitle',
          data: series.map(function (p, i) { return { x: i + 1, y: p.count, label: p.month }; }),
          axis: { x: 'reports.t11Month', y: 'reports.t11Count' }
        })
        : m.text({ titleKey: 'reports.t11TrendTitle', bodyKey: 'reports.t11TrendNote' });

      var tiersTable = m.table({
        titleKey: 'reports.t11TiersTable',
        columns: [
          { key: 'tier', labelKey: 'reports.t11Tier' },
          { key: 'count', labelKey: 'reports.t11Count', align: true }
        ],
        rows: [
          { tier: 'Tier 1', count: tier1 },
          { tier: 'Tier 2', count: tier2 },
          { tier: 'Tier 3', count: tier3Open.length },
          { tier: 'Tier 4', count: tier4 }
        ]
      });
      tiersTable.noteKey = 'reports.t11TierNote';

      var sections = [
        m.cover({
          titleKey: 'reports.t11Title',
          subtitleKey: 'reports.t11Subtitle',
          meta: { period: { fromISO: period.fromISO, toISO: period.toISO }, generatedAtISO: generatedAtISOStr }
        }),
        m.kpiRow({
          titleKey: 'reports.kpis',
          items: [
            { labelKey: 'reports.t11KpiTier3', value: tier3Open.length },
            { labelKey: 'reports.t11KpiOnTime', value: onTime, unit: 'units.pct' },
            { labelKey: 'reports.t11KpiValidData', value: validData, unit: 'units.pct' },
            { labelKey: 'reports.kpiAvgCr', value: avgCr, unit: 'units.mpy' },
            { labelKey: 'reports.kpiAvailability', value: avgAvail, unit: 'units.pct' }
          ]
        }),
        tiersTable,
        trendSection,
        m.list({ titleKey: 'reports.t11RecsTitle', items: recItems }),
        m.text({
          titleKey: 'reports.methodology',
          bodyKey: 'reports.t11MethodologyBody',
          noteKey: 'reports.t11MethodologySources',
          noteClass: 'report-methodology-sources'
        }),
        buildStandards(),
        m.disclaimer({ labelKey: 'reports.disclaimer' })
      ];

      return {
        id: 'T-11',
        meta: {
          titleKey: 'reports.t11Title',
          subtitleKey: 'reports.t11Subtitle',
          period: period,
          generatedAtISO: generatedAtISOStr,
          footer: { textKey: 'reports.pageFooter', generatedKey: 'reports.generatedAt' }
        },
        sections: sections
      };
    });
  }

  registerSelf();

  return {
    buildT11Model: buildT11Model,
    // exported for tests: the tier-3 rule population fixed by the blueprint
    TIER3_RULE_IDS: ['R1', 'R2', 'R3', 'R4', 'R5', 'R6', 'R7', 'R8', 'R9', 'R10', 'R11', 'R12', 'R13', 'R14'],
    _monthSequence: monthSequence
  };
});
