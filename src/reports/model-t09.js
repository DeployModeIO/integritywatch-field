/* IntegrityWatch Field — T-09 confiabilidad y disponibilidad report model
   Pure (no DOM, no window, no locale formatting) model builder for the T-09
   "Confiabilidad y disponibilidad de activos" report (docs/REPORTING-BLUEPRINT.md
   §2.2 maps calc/apm.js to T-09; §T-09 spec is the report's own).
   Builds per-sector (or all-sector) reliability figures from IW.calc.apm using
   the EXACT input shaping of views/apm.js computeMetrics: windowH is the fixed
   window, failureCount counts events of type 'failure' inside the window, and
   downtimeH sums eventDowntime over EVERY event type inside the window
   (downtime is downtime regardless of whether the event was a failure).

   Window: 90 trailing days ending at opts.now (the standard ISO 14224
   collection window the app itself shows as 'apm.window90d'). opts.period
   {fromISO,toISO} overrides it: the window becomes period-bounded and is
   anchored at toISO, so the pure calc receives the same {windowH,downtimeH,
   failureCount} shape either way.

   ISO 14224 fields actually present in this data model (verified names):
   - apmAssets.iso14224.failureMode / .failureConsequence (enums from
     src/ingest/schemas.js: mechanical|wear|fatigue|corrosion|electrical|
     instrumentation|other and none|personal|environment|costs). These live on
     the ASSET (the seed comment in schemas.js: 'el modo ISO 14224 vive en
     apmAssets; el evento lo llama type'). The demo seed leaves them unset;
     they appear via CSV/XLSX import or the asset form.
   - apmAssets.category: the ISO 14224 equipment-category id (well, platform,
     pump, centrifugalPump, ...; translated visually via apm.categories.*).
   - apmEvents have NO isoFailureMode field. The real per-event cause fields
     are .type and .description. The Pareto therefore groups failure events
     by the owning asset's iso14224.failureMode when it is set, and falls
     back to the event type itself otherwise — a field the data really has.
     Cause cells carry the raw id; the visual layer maps them through
     apm.iso14224.failureModes.* / apm.eventTypes.*.

   OEE: a = availability/100 and p = q = 1, the same defaults the OEE card in
   views/apm.js uses (the app has no production-rate or quality data source);
   reported as a percentage like the view.

   Trend: monthly MTBF (UTC calendar months with >=1 failure event among the
   in-scope assets, full history, not window-bound). Per month:
   windowH = hours in that month, downtimeH = eventDowntime sum over every
   in-scope event that started in the month, failureCount = failure events.
   The chart is emitted only when the month series yields >=3 MTBF points;
   otherwise a text section with the explanatory note replaces it.

   Actions: up to the 3 worst assets by MTBF (assets without failures — MTBF
   null — are never "worst"). The per-asset lines are raw technical strings
   (code · MTBF value · xN event count: codes and units are locale-neutral);
   the concrete recommendation is a single textKey item. */
(function (root, factory) {
  'use strict';
  var api = factory(root);
  root.IW = root.IW || {};
  root.IW.reports = root.IW.reports || {};
  root.IW.reports.modelT09 = api;
  if (typeof module === 'object' && module.exports) { module.exports = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  var DAY_MS = 86400000;
  var HOUR_MS = 3600000;
  var DEFAULT_WINDOW_DAYS = 90;

  function model() { return root.IW && root.IW.reports ? root.IW.reports.model : null; }
  function apmCalc() { return root.IW && root.IW.calc ? root.IW.calc.apm : null; }
  function registry() { return root.IW && root.IW.reports ? root.IW.reports.registry : null; }
  function standardsData() { return root.IW && root.IW.data ? root.IW.data.standards : null; }

  function rawNum(v) { return (typeof v === 'number' && isFinite(v)) ? v : null; }

  // Verbatim from views/apm.js eventDowntime: explicit downtimeH, else the
  // start..end span, else 0.
  function eventDowntime(e) {
    if (typeof e.downtimeH === 'number') { return e.downtimeH; }
    if (e.start && e.end) {
      var s = Date.parse(e.start);
      var en = Date.parse(e.end);
      if (!isNaN(s) && !isNaN(en) && en >= s) { return (en - s) / HOUR_MS; }
    }
    return 0;
  }

  // Same shape as views/apm.js computeMetrics(events, {nowISO, windowDays}):
  // window = [sinceMs, untilMs); failures only from type 'failure';
  // downtime from every event type in the window. Views only had the lower
  // bound (its window trails "now", so nothing starts later); with an
  // explicit period the upper bound must be enforced too.
  function computeMetrics(events, windowH, sinceMs, untilMs) {
    var apm = apmCalc();
    var failures = 0;
    var downtimeH = 0;
    var count = 0;
    (events || []).forEach(function (e) {
      var start = Date.parse(e.start);
      if (isNaN(start)) { return; }
      if (sinceMs !== null && start < sinceMs) { return; }
      if (untilMs !== null && start >= untilMs) { return; }
      count += 1;
      if (e.type === 'failure') { failures += 1; }
      var dh = eventDowntime(e);
      if (typeof dh === 'number' && dh >= 0) { downtimeH += dh; }
    });
    var availability = apm ? apm.availability({ windowH: windowH, downtimeH: downtimeH }) : null;
    return {
      eventCount: count,
      failureCount: failures,
      downtimeH: downtimeH,
      availability: availability,
      mtbf: apm ? apm.mtbf({ windowH: windowH, downtimeH: downtimeH, failureCount: failures }) : null,
      mttr: apm ? apm.mttr({ downtimeH: downtimeH, failureCount: failures }) : null,
      // Same as the OEE card in views/apm.js: p = q = 100 % (no production or
      // quality data source), so OEE reduces to availability.
      oee: (apm && availability !== null) ? apm.oee({ a: availability / 100, p: 1, q: 1 }) * 100 : null,
      failureRate: apm ? apm.failureRate({ failureCount: failures, windowH: windowH }) : null
    };
  }

  function mean(values) {
    var vals = values.filter(function (v) { return v !== null && typeof v === 'number' && isFinite(v); });
    if (!vals.length) { return null; }
    return vals.reduce(function (a, b) { return a + b; }, 0) / vals.length;
  }

  function round1(v) { return Math.round(v * 10) / 10; }

  // Month key (UTC 'YYYY-MM') of an ISO start, and the month's [from,to) bounds.
  function monthKey(isoStr) { return String(isoStr).slice(0, 7); }
  function monthBounds(key) {
    var parts = key.split('-');
    var from = Date.UTC(Number(parts[0]), Number(parts[1]) - 1, 1);
    var to = Date.UTC(Number(parts[0]) + (Number(parts[1]) === 12 ? 1 : 0), (Number(parts[1]) % 12), 1);
    return { from: from, to: to };
  }

  // Monthly MTBF series over the full event history of the in-scope assets.
  function monthlyMtbf(events) {
    var apm = apmCalc();
    if (!apm) { return []; }
    var buckets = {};
    events.forEach(function (e) {
      var start = Date.parse(e.start);
      if (isNaN(start)) { return; }
      var key = monthKey(e.start);
      if (!buckets[key]) { buckets[key] = { failures: 0, downtimeH: 0 }; }
      if (e.type === 'failure') { buckets[key].failures += 1; }
      var dh = eventDowntime(e);
      if (typeof dh === 'number' && dh >= 0) { buckets[key].downtimeH += dh; }
    });
    var keys = Object.keys(buckets).sort();
    var series = [];
    keys.forEach(function (key) {
      var b = buckets[key];
      if (b.failures < 1) { return; } // months without failures have no MTBF point
      var mb = monthBounds(key);
      var windowH = (mb.to - mb.from) / HOUR_MS;
      var mtbf = apm.mtbf({ windowH: windowH, downtimeH: b.downtimeH, failureCount: b.failures });
      if (mtbf !== null && isFinite(mtbf)) { series.push({ month: key, mtbf: mtbf }); }
    });
    return series;
  }

  // Pareto cause of a failure event: the owning asset's ISO 14224 failure
  // mode when set (schemas.js: the mode lives on apmAssets), else the event
  // type — the cause field the events actually carry.
  function causeOf(asset, e) {
    var iso = (asset && asset.iso14224) || {};
    return iso.failureMode || e.type || 'other';
  }

  function buildAssetTable(rows) {
    var sec = model().table({
      titleKey: 'reports.t09Assets',
      emptyKey: 'reports.noData',
      columns: [
        { key: 'code', labelKey: 'apm.assetCode' },
        { key: 'category', labelKey: 'apm.category' },
        { key: 'events', labelKey: 'apm.events', align: true },
        { key: 'mtbf', labelKey: 'apm.mtbf', align: true },
        { key: 'mttr', labelKey: 'apm.mttr', align: true },
        { key: 'availability', labelKey: 'apm.availability', align: true }
      ],
      rows: rows
    });
    sec.noteKey = 'reports.t09AssetsNote';
    return sec;
  }

  function buildParetoTable(rows) {
    var sec = model().table({
      titleKey: 'reports.t09Pareto',
      emptyKey: 'reports.noData',
      columns: [
        { key: 'cause', labelKey: 'apm.iso14224.failureMode' },
        { key: 'count', labelKey: 'reports.t09Count', align: true },
        { key: 'share', labelKey: 'reports.t09Share', align: true }
      ],
      rows: rows
    });
    sec.noteKey = 'reports.t09ParetoNote';
    return sec;
  }

  function buildTrendSection(series) {
    var m = model();
    if (series.length >= 3) {
      return m.chart({
        kind: 'trend',
        titleKey: 'reports.t09MtbfTrend',
        data: series.map(function (p, i) { return { x: i + 1, y: p.mtbf, label: p.month }; }),
        axis: { x: 'reports.t09Month', y: 'apm.mtbf' }
      });
    }
    return m.text({ titleKey: 'reports.t09MtbfTrend', bodyKey: 'reports.t09TrendNote' });
  }

  function buildActions(worst) {
    var items = worst.map(function (a) {
      return { text: a.code + ' · MTBF ' + round1(a.mtbf) + ' h · ×' + a.failureCount };
    });
    if (items.length) { items.push({ textKey: 'reports.t09ActionReview' }); }
    return model().list({ titleKey: 'reports.t09Actions', items: items });
  }

  function buildStandards() {
    var src = standardsData();
    var list = (src && src.standards) || [];
    var wanted = { 'iso-14224': true, 'iso-55000': true };
    var items = [];
    for (var i = 0; i < list.length; i++) {
      if (wanted[list[i].id]) {
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

  function windowSpec(opts) {
    var period = (opts.period && typeof opts.period === 'object') ? opts.period : null;
    var fromMs = period ? Date.parse(period.fromISO) : NaN;
    var toMs = period ? Date.parse(period.toISO) : NaN;
    if (period && !isNaN(fromMs) && !isNaN(toMs) && toMs > fromMs) {
      return { period: period, windowH: (toMs - fromMs) / HOUR_MS, sinceMs: fromMs, untilMs: toMs };
    }
    var anchorMs;
    if (typeof opts.now === 'number' && isFinite(opts.now)) { anchorMs = opts.now; }
    else if (typeof opts.now === 'string' && !isNaN(Date.parse(opts.now))) { anchorMs = Date.parse(opts.now); }
    else { anchorMs = Date.now(); }
    return {
      period: null,
      windowH: DEFAULT_WINDOW_DAYS * 24,
      sinceMs: anchorMs - DEFAULT_WINDOW_DAYS * DAY_MS,
      untilMs: anchorMs
    };
  }

  function registerSelf() {
    var reg = registry();
    if (!reg || typeof reg.register !== 'function') { return; }
    try {
      reg.register({ id: 'T-09', titleKey: 'reports.t09Title', needs: [], buildModel: buildT09Model });
    } catch (e) {
      // Idempotent load: the only tolerable failure is a duplicate template
      // (e.g. the module was evaluated twice); anything else must surface.
      if (String((e && e.message) || '').indexOf('duplicate') === -1) { throw e; }
    }
  }

  function buildT09Model(opts) {
    opts = opts || {};
    var store = opts.repos || opts.store || {};
    registerSelf();

    function list(repo) {
      return (store[repo] && typeof store[repo].list === 'function') ? store[repo].list() : Promise.resolve([]);
    }

    return Promise.all([list('apmAssets'), list('apmEvents')]).then(function (res) {
      var assetsAll = Array.isArray(res[0]) ? res[0] : [];
      var eventsAll = Array.isArray(res[1]) ? res[1] : [];
      var sector = (typeof opts.sector === 'string' && opts.sector) ? opts.sector : null;
      var win = windowSpec(opts);
      var m = model();

      var assets = sector ? assetsAll.filter(function (a) { return a.sector === sector; }) : assetsAll;
      var byId = {};
      assets.forEach(function (a) { if (a && a.id) { byId[a.id] = a; } });
      var scoped = eventsAll.filter(function (e) { return e && Object.prototype.hasOwnProperty.call(byId, e.assetId); });
      function inWindow(e) {
        var start = Date.parse(e.start);
        if (isNaN(start)) { return false; }
        if (start < win.sinceMs) { return false; }
        if (win.untilMs !== null && start >= win.untilMs) { return false; }
        return true;
      }

      // Per-asset rows over the same window the KPIs use.
      var rows = assets.map(function (a) {
        var mine = scoped.filter(function (e) { return e.assetId === a.id; });
        var mm = computeMetrics(mine, win.windowH, win.sinceMs, win.untilMs);
        return {
          code: a.code || a.id || null,
          category: a.category || null,
          events: mm.eventCount,
          mtbf: rawNum(mm.mtbf),
          mttr: rawNum(mm.mttr),
          availability: rawNum(mm.availability),
          failureCount: mm.failureCount
        };
      });
      // Worst reliability first: lowest MTBF; assets without failures (MTBF
      // null) sort last; ties broken by code for determinism.
      rows.sort(function (a, b) {
        var av = a.mtbf === null ? Infinity : a.mtbf;
        var bv = b.mtbf === null ? Infinity : b.mtbf;
        if (av !== bv) { return av - bv; }
        return String(a.code) < String(b.code) ? -1 : (String(a.code) > String(b.code) ? 1 : 0);
      });
      var tableRows = rows.map(function (r) {
        return { code: r.code, category: r.category, events: r.events, mtbf: r.mtbf, mttr: r.mttr, availability: r.availability };
      });

      // Fleet KPIs (same shaping; failure rate over the whole window).
      var fleet = computeMetrics(scoped, win.windowH, win.sinceMs, win.untilMs);
      var avgAvailability = mean(rows.map(function (r) { return r.availability; }));
      var avgMtbf = mean(rows.map(function (r) { return r.mtbf; }));
      var avgMttr = mean(rows.map(function (r) { return r.mttr; }));
      var avgOee = avgAvailability === null ? null : avgAvailability; // p = q = 1

      // Pareto over failure events in the window, by cause.
      var counts = {};
      var total = 0;
      scoped.forEach(function (e) {
        if (e.type !== 'failure') { return; }
        if (!inWindow(e)) { return; }
        var cause = causeOf(byId[e.assetId], e);
        counts[cause] = (counts[cause] || 0) + 1;
        total += 1;
      });
      var pareto = Object.keys(counts).map(function (cause) {
        return { cause: cause, count: counts[cause], share: (counts[cause] / total) * 100 };
      }).sort(function (a, b) {
        if (a.count !== b.count) { return b.count - a.count; }
        return a.cause < b.cause ? -1 : (a.cause > b.cause ? 1 : 0);
      });

      var worst = rows.filter(function (r) { return r.mtbf !== null; }).slice(0, 3);
      var series = monthlyMtbf(scoped);

      var generatedAtISOStr = generatedAtISO(opts);

      var sections = [
        m.cover({
          titleKey: 'reports.t09Title',
          meta: win.period ? { period: { fromISO: win.period.fromISO, toISO: win.period.toISO }, generatedAtISO: generatedAtISOStr } : { generatedAtISO: generatedAtISOStr }
        }),
        m.kpiRow({
          titleKey: 'reports.kpis',
          items: [
            { labelKey: 'apm.availability', value: avgAvailability, unit: 'units.pct' },
            { labelKey: 'apm.mtbf', value: avgMtbf, unit: 'units.h' },
            { labelKey: 'apm.mttr', value: avgMttr, unit: 'units.h' },
            { labelKey: 'apm.oee', value: avgOee, unit: 'units.pct' },
            { labelKey: 'reports.t09KpiFailureRate', value: rawNum(fleet.failureRate), unit: 'units.perH' }
          ]
        }),
        buildAssetTable(tableRows),
        buildParetoTable(pareto),
        buildTrendSection(series),
        buildActions(worst),
        buildStandards()
      ];

      return {
        id: 'T-09',
        meta: {
          titleKey: 'reports.t09Title',
          generatedAtISO: generatedAtISOStr,
          footer: { textKey: 'reports.pageFooter', generatedKey: 'reports.generatedAt' }
        },
        sections: sections,
        // Mirrors the top-level report-disclaimer element of the sisters.
        disclaimer: m.disclaimer({ labelKey: 'reports.disclaimer' })
      };
    });
  }

  registerSelf();

  return {
    buildT09Model: buildT09Model,
    // exported for tests: pure window/series shaping mirrors of views/apm.js
    _computeMetrics: computeMetrics,
    _monthlyMtbf: monthlyMtbf
  };
});
