/* IntegrityWatch Field — quarterly report model
   Pure (no DOM, no window, no locale formatting) model builder for the
   quarterly integrity report. Returns { id, meta, sections } using the
   root.IW.reports.model section factories. */
(function (root, factory) {
  'use strict';
  var api = factory(root);
  root.IW = root.IW || {};
  root.IW.reports = root.IW.reports || {};
  root.IW.reports.modelQuarterly = api;
  if (typeof module === 'object' && module.exports) { module.exports = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  var DAY_MS = 86400000;

  function model() { return root.IW && root.IW.reports ? root.IW.reports.model : null; }
  function corrosion() { return root.IW && root.IW.calc ? root.IW.calc.corrosion : null; }
  function apm() { return root.IW && root.IW.calc ? root.IW.calc.apm : null; }

  function inPeriod(iso, from, to) {
    if (!iso) { return false; }
    if (from && iso < from) { return false; }
    if (to && iso > to) { return false; }
    return true;
  }

  function avgCrInPeriod(readings, from, to) {
    var sum = 0, n = 0;
    (readings || []).forEach(function (r) {
      if (typeof r.crMpy === 'number' && isFinite(r.crMpy) && inPeriod(r.date, from, to)) {
        sum += r.crMpy; n++;
      }
    });
    return n ? sum / n : null;
  }

  function weeklyBuckets(readings, from, to) {
    var fromMs = Date.parse(from);
    var toMs = Date.parse(to);
    var buckets = [];
    if (isNaN(fromMs) || isNaN(toMs) || toMs < fromMs) { return buckets; }
    var span = Math.max(toMs - fromMs, DAY_MS);
    var count = Math.ceil(span / (7 * DAY_MS));
    var sums = [], counts = [];
    for (var i = 0; i < count; i++) { sums[i] = 0; counts[i] = 0; }
    (readings || []).forEach(function (r) {
      if (typeof r.crMpy !== 'number' || !isFinite(r.crMpy)) { return; }
      var ms = Date.parse(r.date);
      if (isNaN(ms) || ms < fromMs || ms > toMs) { return; }
      var idx = Math.min(count - 1, Math.floor((ms - fromMs) / (7 * DAY_MS)));
      sums[idx] += r.crMpy; counts[idx]++;
    });
    for (var j = 0; j < count; j++) {
      buckets.push({ week: j + 1, value: counts[j] ? sums[j] / counts[j] : null, count: counts[j] });
    }
    return buckets;
  }

  function topCriticalModel(t, readings, monitoringPoints) {
    var corr = corrosion();
    var byMp = {};
    (monitoringPoints || []).forEach(function (mp) { byMp[mp.id] = mp; });
    var acc = {};
    (readings || []).forEach(function (r) {
      if (typeof r.crMpy !== 'number' || !isFinite(r.crMpy)) { return; }
      if (!acc[r.mpId]) { acc[r.mpId] = { sum: 0, n: 0 }; }
      acc[r.mpId].sum += r.crMpy; acc[r.mpId].n++;
    });
    var rows = Object.keys(acc).map(function (id) {
      var a = acc[id];
      var avg = a.sum / a.n;
      var mp = byMp[id] || {};
      return { code: mp.code || id, avg: avg, level: corr ? corr.classifySp0775(avg) : 'low' };
    }).sort(function (a, b) { return b.avg - a.avg; }).slice(0, 10);

    return {
      titleKey: 'reports.topCritical',
      emptyKey: 'reports.noData',
      columns: [
        { key: 'code', labelKey: 'corrosion.pointCode' },
        { key: 'avg', labelKey: 'reports.avgCr', align: true },
        { key: 'level', labelKey: 'corrosion.classification' }
      ],
      rows: rows
    };
  }

  function eiByPairsModel(t, coupons) {
    var corr = corrosion();
    var byPair = {};
    (coupons || []).forEach(function (c) {
      if (!c.pairId) { return; }
      if (!byPair[c.pairId]) { byPair[c.pairId] = {}; }
      byPair[c.pairId][c.role === 'inhibited' ? 'inhibited' : 'blank'] = c;
    });
    var rows = [];
    Object.keys(byPair).forEach(function (pairId) {
      var p = byPair[pairId];
      var blank = p.blank, inh = p.inhibited;
      if (!blank || !inh) { return; }
      var ei = corr ? corr.inhibitorEfficiency({ crBlankMpy: blank.crMpy, crInhibitedMpy: inh.crMpy }) : null;
      var band = (corr && ei !== null) ? corr.eiBand(ei) : null;
      rows.push({
        pairId: pairId,
        blank: blank.crMpy == null ? null : blank.crMpy,
        inhibited: inh.crMpy == null ? null : inh.crMpy,
        ei: ei,
        band: band
      });
    });

    return {
      titleKey: 'reports.eiByPairs',
      emptyKey: 'reports.noData',
      columns: [
        { key: 'pairId', labelKey: 'corrosion.pair' },
        { key: 'blank', labelKey: 'corrosion.blank', align: true },
        { key: 'inhibited', labelKey: 'corrosion.inhibited', align: true },
        { key: 'ei', labelKey: 'reports.eiPct', align: true },
        { key: 'band', labelKey: 'reports.band' }
      ],
      rows: rows
    };
  }

  function campaignsModel(t, coupons, from, to) {
    var rows = (coupons || []).filter(function (c) {
      return inPeriod(c.startDate, from, to) || inPeriod(c.endDate, from, to);
    }).map(function (c) {
      var deltaW = (typeof c.wiMg === 'number' && typeof c.wfMg === 'number') ? c.wiMg - c.wfMg : null;
      return {
        mpId: c.mpId || null,
        role: c.role || null,
        deltaW: deltaW,
        area: c.areaIn2 == null ? null : c.areaIn2,
        days: c.days == null ? null : c.days,
        cr: c.crMpy == null ? null : c.crMpy
      };
    });

    return {
      titleKey: 'reports.campaignsTable',
      emptyKey: 'reports.noData',
      columns: [
        { key: 'mpId', labelKey: 'corrosion.pointCode' },
        { key: 'role', labelKey: 'corrosion.couponRole' },
        { key: 'deltaW', labelKey: 'reports.deltaW', align: true },
        { key: 'area', labelKey: 'corrosion.area', align: true },
        { key: 'days', labelKey: 'corrosion.exposureDays', align: true },
        { key: 'cr', labelKey: 'reports.cr', align: true }
      ],
      rows: rows
    };
  }

  function recsSummaryModel(t, recs) {
    var counts = { open: 0, acked: 0, resolved: 0 };
    var openRows = [];
    (recs || []).forEach(function (r) {
      if (counts[r.status] !== undefined) { counts[r.status]++; }
      if (r.status === 'open') {
        openRows.push({
          ruleId: r.ruleId,
          name: t('rules.name.' + r.ruleId),
          severity: r.severity,
          entity: r.entityLabel || r.entityId || null
        });
      }
    });

    return {
      counts: counts,
      section: {
        titleKey: 'reports.recsSummary',
        emptyKey: 'reports.noData',
        columns: [
          { key: 'ruleId', labelKey: 'rules.rule' },
          { key: 'name', labelKey: 'reports.ruleName' },
          { key: 'severity', labelKey: 'common.severity' },
          { key: 'entity', labelKey: 'rules.entity' }
        ],
        rows: openRows
      }
    };
  }

  function standardsModel() {
    var list = (root.IW && root.IW.data && root.IW.data.standards && root.IW.data.standards.standards) || [];
    var used = list.filter(function (s) { return !s.usedIn || s.usedIn.indexOf('reports') !== -1; });
    var items = used.map(function (s) {
      return { id: s.code || s.id, title: s.title || '' };
    });
    return { titleKey: 'reports.standardsApplied', items: items };
  }

  function buildQuarterlyModel(opts) {
    opts = opts || {};
    var store = opts.repos || opts.store || {};
    var period = opts.period || { fromISO: '', toISO: '' };
    var t = opts.t || function (k) { return k; };
    var m = model();

    function list(repo) {
      return (store[repo] && typeof store[repo].list === 'function')
        ? store[repo].list()
        : Promise.resolve([]);
    }

    return Promise.all([
      list('monitoringPoints'),
      list('readings'),
      list('coupons'),
      list('psvs'),
      list('apmAssets'),
      list('apmEvents'),
      list('recommendations')
    ]).then(function (data) {
      var monitoringPoints = Array.isArray(data[0]) ? data[0] : [];
      var readings = Array.isArray(data[1]) ? data[1] : [];
      var coupons = Array.isArray(data[2]) ? data[2] : [];
      var psvs = Array.isArray(data[3]) ? data[3] : [];
      var apmAssets = Array.isArray(data[4]) ? data[4] : [];
      var apmEvents = Array.isArray(data[5]) ? data[5] : [];
      var recs = Array.isArray(data[6]) ? data[6] : [];
      var corr = corrosion();
      var apmCalc = apm();

      var periodReadings = readings.filter(function (r) { return inPeriod(r.date, period.fromISO, period.toISO); });
      var severePoints = monitoringPoints.filter(function (mp) {
        return periodReadings.some(function (r) { return r.mpId === mp.id && typeof r.crMpy === 'number' && r.crMpy >= 10; });
      }).length;
      var psvOverdue = psvs.filter(function (p) { return p.status === 'overdue'; }).length;
      var recsBySev = { critical: 0, warning: 0, info: 0 };
      recs.forEach(function (r) {
        if (r.status === 'open' && recsBySev[r.severity] !== undefined) { recsBySev[r.severity]++; }
      });

      var fromMs = Date.parse(period.fromISO) || (Date.now() - 90 * DAY_MS);
      var toMs = Date.parse(period.toISO) || Date.now();
      var windowH = Math.max((toMs - fromMs) / 3600000, 1);
      var availVals = [];
      apmAssets.forEach(function (a) {
        if (typeof a.availabilityOverridePct === 'number') { availVals.push(a.availabilityOverridePct); return; }
        var downtime = 0;
        apmEvents.forEach(function (e) {
          if (e.assetId !== a.id) { return; }
          if (e.type !== 'failure' && e.type !== 'maintenance') { return; }
          var startMs = Date.parse(e.start);
          if (isNaN(startMs) || startMs < fromMs) { return; }
          downtime += (typeof e.downtimeH === 'number') ? e.downtimeH : 0;
        });
        var av = apmCalc && apmCalc.availability ? apmCalc.availability({ windowH: windowH, downtimeH: downtime }) : null;
        if (av !== null) { availVals.push(av); }
      });
      var avgAvailability = availVals.length ? availVals.reduce(function (a, b) { return a + b; }, 0) / availVals.length : null;

      var avgCr = avgCrInPeriod(readings, period.fromISO, period.toISO);
      var buckets = weeklyBuckets(readings, period.fromISO, period.toISO);

      var recsModel = recsSummaryModel(t, recs);
      var generatedAtISO = new Date().toISOString();

      var kpiItems = [
        { labelKey: 'reports.kpiAvgCr', value: avgCr, unit: 'units.mpy' },
        { labelKey: 'dashboard.kpiSeverePoints', value: severePoints },
        { labelKey: 'dashboard.kpiPsvOverdue', value: psvOverdue },
        { labelKey: 'reports.kpiAvailability', value: avgAvailability, unit: 'units.pct' },
        { labelKey: 'dashboard.criticalCount', value: recsBySev.critical },
        { labelKey: 'dashboard.warningCount', value: recsBySev.warning },
        { labelKey: 'dashboard.infoCount', value: recsBySev.info },
        { labelKey: 'reports.recsOpen', value: recsModel.counts.open },
        { labelKey: 'reports.recsAcked', value: recsModel.counts.acked },
        { labelKey: 'reports.recsResolved', value: recsModel.counts.resolved }
      ];

      var sections = [
        m.cover({ titleKey: 'reports.cover', subtitleKey: 'reports.coverSubtitle', meta: { period: period, generatedAtISO: generatedAtISO } }),
        m.kpiRow({ titleKey: 'reports.kpis', items: kpiItems }),
        m.chart({ kind: 'trend', titleKey: 'reports.weeklyChartTitle', data: buckets.filter(b => b.value !== null && b.value !== undefined && isFinite(b.value)).map((b, i) => ({ x: i + 1, y: b.value, label: b.week })), axis: { x: 'reports.week', y: 'reports.avgCr' } }),
        m.table(topCriticalModel(t, readings, monitoringPoints)),
        m.table(eiByPairsModel(t, coupons)),
        m.table(campaignsModel(t, coupons, period.fromISO, period.toISO)),
        m.table(recsModel.section),
        m.standards(standardsModel()),
        m.text({ titleKey: 'reports.methodology', bodyKey: 'reports.methodologyBody', noteKey: 'reports.methodologySources', noteClass: 'report-methodology-sources' }),
        m.disclaimer({ labelKey: 'reports.disclaimer' })
      ];

      return {
        id: 'quarterly',
        meta: { titleKey: 'reports.cover', subtitleKey: 'reports.coverSubtitle', period: period, generatedAtISO: generatedAtISO, footer: { textKey: 'reports.pageFooter', generatedKey: 'reports.generatedAt' } },
        sections: sections
      };
    });
  }

  return { buildQuarterlyModel: buildQuarterlyModel };
});
