/* IntegrityWatch Field — T-07 PSV fleet report model
   Pure (no DOM, no window, no locale formatting) model builder for the T-07
   "PSV: sizing, margen y recertificación" FLEET view (docs/REPORTING-BLUEPRINT.md
   §T-07). The single-valve datasheet already exists (model-datasheet.js); this
   report sweeps the whole psvs repo instead. Mirrors model-t03.js for purity,
   registration and key reporting.

    CALC (never duplicated, never trusted from caches):
    - margen %, capacidad real y área seleccionada se recalculan con
      IW.calc.psv: sizeGasVapor/sizeLiquid (área requerida, espejo de la ruta
      del seed: P1 = set·1.1 + 14.7 psia, P2 = back + 14.7, TR = °F + 459.67),
      selectOrifice (orificio requerido) y realCapacity (margen y capacidad
      real sobre el orificio INSTALADO). Si las entradas crudas están
      incompletas se usa p.sizing.AreqIn2 cacheado (también derivado de calc);
      sin ninguna fuente el valor viaja null.
    - status: makePsvsRepo (core/store.js) SOLO recalcula p.status al GUARDAR;
      list() no lo toca. Por eso el modelo NO lee p.status: lo deriva de
      nextTestDate frente a opts.now con la misma aritmética de día UTC que
      store.computePsvStatus: vencida >30 días de atraso = 'overdue', atrasada
      1–30 días = 'due', futura o el mismo día = 'ok'.
    - días a próxima prueba: delta de días calendario UTC (misma base que el
      status); null si falta la fecha.

    PLAN DE RECERTIFICACIÓN: el factory model().list recorta los items a
    textKey/text/status y renderList llama t(textKey) SIN params, así que las
    fechas ISO no pueden viajar como params interpolables (precedente T-06:
    sin primitiva, valores crudos). Los items por PSV llevan la fecha ISO
    VERBATIM en `text` (dato crudo, sin formato local — igual que las filas de
    tabla), y la acción global (cuando hay vencidas) es labelKey puro.

    CATEGÓRICOS: la tabla y el plan usan ids crudos (status ∈ ok|due|overdue,
    mapeables a common.ok/common.due/common.overdue por la capa visual, como
    el region de T-03). Unidades de capacidad por fase: lb/h gas, gpm líquido
    (nota t07Note).

    NORMAS: catálogo IW.data.standards (api-520-1, api-526) como T-03; API 576
    no es entrada del catálogo, se añade estática (precedente de respaldo
    estático de T-02) porque el blueprint la exige para la inspección.

    FILTRO: opts.systemId opcional deja solo PSVs cuyo campo systemId coincide
    (el registro PSV del núcleo usa assetId; los importados pueden traer
    systemId — sin filtro se reporta la flota completa).

    NEW_ES_KEYS (añadidas a src/i18n/locales/es.js, a propagar a los otros 6
    locales en integración): reports.t07Title, reports.t07KpiFleet,
    reports.t07KpiOverdue, reports.t07KpiNegMargin, reports.t07KpiSoon90,
    reports.t07Fleet, reports.t07ColFluid, reports.t07ColMargin,
    reports.t07ColDays, reports.t07ColOrifInstalled, reports.t07ColOrifRequired,
    reports.t07CapReal, reports.t07CapReq, reports.t07Plan,
    reports.t07ActionSchedule, reports.t07Note. Reutilizadas: psv.tag,
    psv.setPressure, reports.kpis, reports.noData, reports.standardsApplied,
    reports.disclaimer, reports.pageFooter, reports.generatedAt. */
(function (root, factory) {
  'use strict';
  var api = factory(root);
  root.IW = root.IW || {};
  root.IW.reports = root.IW.reports || {};
  root.IW.reports.modelT07 = api;
  if (typeof module === 'object' && module.exports) { module.exports = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  var DAY_MS = 86400000;
  var OVERDUE_DAYS = 30;
  var SOON_WINDOW_DAYS = 90;
  var OVERPRESSURE_PCT = 10; // convención del seed y del panel PSV (P1 = set·1.1)

  function model() { return root.IW && root.IW.reports ? root.IW.reports.model : null; }
  function psvCalc() { return root.IW && root.IW.calc ? root.IW.calc.psv : null; }
  function registry() { return root.IW && root.IW.reports ? root.IW.reports.registry : null; }
  function standardsData() { return root.IW && root.IW.data ? root.IW.data.standards : null; }
  function fluidsData() { return root.IW && root.IW.data ? root.IW.data.fluids : null; }

  function rawNum(v) { return (typeof v === 'number' && isFinite(v)) ? v : null; }

  function startOfUtcDay(ms) {
    var d = new Date(ms);
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  }

  function nowMs(opts) {
    if (typeof opts.now === 'number' || typeof opts.now === 'string') {
      var ms = Date.parse(opts.now);
      if (!isNaN(ms)) { return ms; }
    }
    return Date.now();
  }

  // Mismo umbral semántico que store.computePsvStatus (recalcular siempre:
  // p.status solo se actualiza al guardar). daysToNext en días calendario UTC.
  function deriveRecert(nextTestDate, todayMs) {
    if (!nextTestDate) { return { days: null, status: null }; }
    var nextMs = Date.parse(nextTestDate);
    if (isNaN(nextMs)) { return { days: null, status: null }; }
    var today = startOfUtcDay(todayMs);
    var nextDay = startOfUtcDay(nextMs);
    var days = Math.round((nextDay - today) / DAY_MS);
    var status = (nextDay < today - OVERDUE_DAYS * DAY_MS) ? 'overdue'
      : (nextDay < today) ? 'due' : 'ok';
    return { days: days, status: status };
  }

  function fluidOf(p) {
    var f = p.fluid && typeof p.fluid === 'object' ? p.fluid : null;
    if (f) { return f; }
    var cat = fluidsData();
    if (cat && p.fluidId && typeof cat.byId === 'function') {
      return cat.byId(p.fluidId) || {};
    }
    return {};
  }

  function phaseOf(p, fluid) {
    var phase = fluid.phase;
    if (!phase && p.phase) { phase = p.phase; }
    if (!phase) {
      if (rawNum(p.Wlbh) !== null) { phase = 'gas'; }
      else if (rawNum(p.Qgpm) !== null) { phase = 'liquid'; }
    }
    return phase === 'liquid' ? 'liquid' : phase === 'gas' ? 'gas' : null;
  }

  // Required area recomputed via calc when the raw inputs are complete
  // (mirrors data/seed.js buildPsvs); falls back to the cached calc-derived
  // sizing.AreqIn2; null when neither source exists.
  function computeAreq(p, sizing, fluid, phase) {
    var calc = psvCalc();
    if (!calc) { return rawNum(sizing.AreqIn2); }
    var set = rawNum(p.setPressurePsig);
    var back = rawNum(p.backPressurePsig);
    try {
      if (phase === 'gas') {
        var W = rawNum(p.Wlbh);
        var M = rawNum(fluid.M);
        var k = rawNum(fluid.k);
        var T = rawNum(p.operatingTempF);
        var Z = rawNum(fluid.Z);
        if (W !== null && W > 0 && set !== null && set > 0 && M !== null && M > 0 &&
            k !== null && k > 1 && T !== null) {
          var Kb = rawNum(sizing.Kb);
          if (Kb === null) {
            Kb = calc.kbBackpressure({
              valveType: p.valveType, backPressurePsig: back === null ? 0 : back,
              setPressurePsig: set, overpressurePct: OVERPRESSURE_PCT
            });
          }
          var g = calc.sizeGasVapor({
            Wlbh: W,
            P1psia: set * (1 + OVERPRESSURE_PCT / 100) + 14.7,
            P2psia: (back === null ? 0 : back) + 14.7,
            TR: T + 459.67,
            Z: Z === null ? 1 : Z,
            M: M, k: k,
            Kd: rawNum(p.Kd) === null ? 0.975 : p.Kd,
            Kb: Kb,
            Kc: rawNum(p.Kc) === null ? 1 : p.Kc
          });
          return rawNum(g.AreqIn2);
        }
      } else if (phase === 'liquid') {
        var Q = rawNum(p.Qgpm);
        var G = rawNum(fluid.G);
        if (Q !== null && Q > 0 && set !== null && set > 0 && G !== null && G > 0) {
          var Kw = rawNum(sizing.Kw);
          if (Kw === null) {
            Kw = calc.kwBackpressureLiquid({
              valveType: p.valveType, backPressurePsig: back === null ? 0 : back,
              setPressurePsig: set
            });
          }
          var l = calc.sizeLiquid({
            Qgpm: Q, G: G, setPressurePsig: set, overpressurePct: OVERPRESSURE_PCT,
            backPressurePsig: back === null ? 0 : back,
            Kd: rawNum(p.Kd) === null ? 0.65 : p.Kd,
            Kw: Kw,
            Kc: rawNum(p.Kc) === null ? 1 : p.Kc,
            viscCp: fluid.viscCp
          });
          return rawNum(l.AreqIn2);
        }
      }
    } catch (e) { /* incomplete/invalid record → cached value below */ }
    return rawNum(sizing.AreqIn2);
  }

  function installedAreaOf(p, sizing) {
    var area = rawNum(p.certifiedCapacity);
    return area !== null ? area : rawNum(sizing.selectedAreaIn2);
  }

  function letterForArea(calc, area) {
    var orifices = (calc && calc.ORIFICES_526) || [];
    for (var i = 0; i < orifices.length; i++) {
      if (orifices[i].areaIn2 === area) { return orifices[i].letter; }
    }
    return null;
  }

  function psvRow(p, calc, todayMs) {
    var sizing = p.sizing || {};
    var fluid = fluidOf(p);
    var phase = phaseOf(p, fluid);
    var recert = deriveRecert(p.nextTestDate, todayMs);

    var Areq = computeAreq(p, sizing, fluid, phase);
    var installed = installedAreaOf(p, sizing);

    var marginPct = null;
    var capReal = null;
    if (calc && installed !== null && Areq !== null && Areq > 0) {
      try {
        var cap = calc.realCapacity({
          orificeAreaIn2: installed, AreqIn2: Areq,
          Wlbh: rawNum(p.Wlbh) === null ? undefined : p.Wlbh,
          Qgpm: rawNum(p.Qgpm) === null ? undefined : p.Qgpm
        });
        marginPct = rawNum(cap.marginPct);
        capReal = phase === 'liquid' ? rawNum(cap.QrealGpm) : rawNum(cap.WrealLbh);
        if (capReal === null) { capReal = rawNum(cap.WrealLbh) !== null ? cap.WrealLbh : rawNum(cap.QrealGpm); }
      } catch (e) { marginPct = null; capReal = null; }
    }

    var requiredLetter = null;
    if (calc && Areq !== null && Areq > 0) {
      try {
        var sel = calc.selectOrifice(Areq);
        requiredLetter = sel && !sel.error ? sel.letter : null;
      } catch (e) { requiredLetter = null; }
    }

    var installedLetter = p.orificeLetter || sizing.selectedOrificeLetter || null;
    if (!installedLetter && calc && installed !== null) {
      installedLetter = letterForArea(calc, installed);
    }

    var capReq = phase === 'liquid' ? rawNum(p.Qgpm) : rawNum(p.Wlbh);
    if (capReq === null) { capReq = rawNum(p.Qgpm) !== null ? rawNum(p.Qgpm) : rawNum(p.Wlbh); }

    return {
      tag: p.tag || p.id || null,
      fluid: fluid.name || p.fluidId || null,
      setPressure: rawNum(p.setPressurePsig),
      margin: marginPct,
      days: recert.days,
      orificeInstalled: installedLetter,
      orificeRequired: requiredLetter,
      capReal: capReal,
      capReq: capReq,
      status: recert.status,
      nextTestDate: p.nextTestDate || null
    };
  }

  function urgencyRank(row) {
    if (row.days === null) { return 2; }
    return row.days < 0 ? 0 : 1;
  }

  function byUrgency(a, b) {
    var ra = urgencyRank(a);
    var rb = urgencyRank(b);
    if (ra !== rb) { return ra - rb; }
    var da = a.days === null ? Infinity : a.days;
    var db = b.days === null ? Infinity : b.days;
    if (da !== db) { return da - db; }
    return String(a.tag || '').localeCompare(String(b.tag || ''));
  }

  // Status → list status class token (renderer prefixes 'is-').
  function planStatus(status) {
    if (status === 'overdue') { return 'critical'; }
    if (status === 'due') { return 'warning'; }
    return 'info';
  }

  function buildFleetTable(rows) {
    var sec = model().table({
      titleKey: 'reports.t07Fleet',
      emptyKey: 'reports.noData',
      columns: [
        { key: 'tag', labelKey: 'psv.tag' },
        { key: 'fluid', labelKey: 'reports.t07ColFluid' },
        { key: 'setPressure', labelKey: 'psv.setPressure', align: true },
        { key: 'margin', labelKey: 'reports.t07ColMargin', align: true },
        { key: 'days', labelKey: 'reports.t07ColDays', align: true },
        { key: 'orificeInstalled', labelKey: 'reports.t07ColOrifInstalled' },
        { key: 'orificeRequired', labelKey: 'reports.t07ColOrifRequired' },
        { key: 'capReal', labelKey: 'reports.t07CapReal', align: true },
        { key: 'capReq', labelKey: 'reports.t07CapReq', align: true },
        { key: 'status', labelKey: 'common.status' }
      ],
      // nextTestDate is carried on rows for the plan only; the table factory
      // keeps whole row objects, so the column set is what the renderer shows.
      rows: rows.map(function (r) {
        return {
          tag: r.tag, fluid: r.fluid, setPressure: r.setPressure, margin: r.margin,
          days: r.days, orificeInstalled: r.orificeInstalled, orificeRequired: r.orificeRequired,
          capReal: r.capReal, capReq: r.capReq, status: r.status
        };
      })
    });
    sec.noteKey = 'reports.t07Note';
    return sec;
  }

  function buildPlan(rows, overdueCount) {
    var items = [];
    if (overdueCount > 0) {
      items.push({ textKey: 'reports.t07ActionSchedule', status: 'critical' });
    }
    rows.forEach(function (r) {
      if (!r.nextTestDate) { return; }
      // ISO date verbatim in `text`: the list factory and renderList drop
      // (never interpolate) params — see header comment.
      items.push({ text: String(r.tag) + ' · ' + r.nextTestDate, status: planStatus(r.status) });
    });
    return model().list({ titleKey: 'reports.t07Plan', items: items });
  }

  function buildStandards() {
    var src = standardsData();
    var list = (src && src.standards) || [];
    var wanted = ['api-520-1', 'api-526'];
    var items = [];
    var seen576 = false;
    for (var i = 0; i < list.length; i++) {
      var s = list[i];
      if (wanted.indexOf(s.id) !== -1) {
        items.push({ id: s.code || s.id, title: s.title || '' });
      }
      if (s.id === 'api-576') { seen576 = true; }
    }
    if (!seen576) {
      // Static fallback (T-02 precedent): the catalogue has no API 576 entry
      // and the blueprint requires it for the recertification picture.
      items.push({ id: 'API 576', title: 'Inspection Systems for Pressure-relieving Equipment' });
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
      reg.register({ id: 'T-07', titleKey: 'reports.t07Title', needs: [], buildModel: buildT07Model });
    } catch (e) {
      // Idempotent load: the only tolerable failure is a duplicate template
      // (e.g. the module was evaluated twice); anything else must surface.
      if (String((e && e.message) || '').indexOf('duplicate') === -1) { throw e; }
    }
  }

  function buildT07Model(opts) {
    opts = opts || {};
    var store = opts.repos || opts.store || {};
    registerSelf();

    function list(repo) {
      return (store[repo] && typeof store[repo].list === 'function') ? store[repo].list() : Promise.resolve([]);
    }

    return list('psvs').then(function (recs) {
      var calc = psvCalc();
      var todayMs = nowMs(opts);
      var psvs = Array.isArray(recs) ? recs : [];
      if (opts.systemId) {
        psvs = psvs.filter(function (p) { return p && p.systemId === opts.systemId; });
      }

      var rows = psvs.map(function (p) { return psvRow(p, calc, todayMs); });
      rows.sort(byUrgency);

      var overdueCount = rows.filter(function (r) { return r.status === 'overdue' || r.status === 'due'; }).length;
      var negMarginCount = rows.filter(function (r) { return r.margin !== null && r.margin < 0; }).length;
      var soonCount = rows.filter(function (r) { return r.days !== null && r.days >= 0 && r.days <= SOON_WINDOW_DAYS; }).length;

      var generatedAtISOStr = generatedAtISO(opts);
      var m = model();

      var coverOpts = { titleKey: 'reports.t07Title', meta: { generatedAtISO: generatedAtISOStr } };
      if (opts.systemId) { coverOpts.subtitle = opts.systemId; }

      var sections = [
        m.cover(coverOpts),
        m.kpiRow({
          titleKey: 'reports.kpis',
          items: [
            { labelKey: 'reports.t07KpiFleet', value: rows.length },
            { labelKey: 'reports.t07KpiOverdue', value: overdueCount },
            { labelKey: 'reports.t07KpiNegMargin', value: negMarginCount },
            { labelKey: 'reports.t07KpiSoon90', value: soonCount }
          ]
        }),
        buildFleetTable(rows),
        buildPlan(rows, overdueCount),
        buildStandards()
      ];

      return {
        id: 'T-07',
        meta: { titleKey: 'reports.t07Title', generatedAtISO: generatedAtISOStr, footer: { textKey: 'reports.pageFooter', generatedKey: 'reports.generatedAt' } },
        sections: sections,
        // Mirrors the top-level report-disclaimer element of the sisters.
        disclaimer: m.disclaimer({ labelKey: 'reports.disclaimer' })
      };
    });
  }

  registerSelf();

  return { buildT07Model: buildT07Model };
});
