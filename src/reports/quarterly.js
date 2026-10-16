/* IntegrityWatch Field — quarterly report
   Print-first A4 quarterly integrity report builder (async over repositories). */
(function (root, factory) {
  'use strict';
  var api = factory(root);
  root.IW = root.IW || {};
  root.IW.reports = root.IW.reports || {};
  root.IW.reports.quarterly = api;
  if (typeof module === 'object' && module.exports) { module.exports = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  var DAY_MS = 86400000;

  function corrosion() { return root.IW && root.IW.calc ? root.IW.calc.corrosion : null; }
  function apm() { return root.IW && root.IW.calc ? root.IW.calc.apm : null; }
  function i18nApi() { return root.IW && root.IW.i18n; }

  function fmtNum(v, dec) {
    if (v === null || v === undefined || (typeof v === 'number' && isNaN(v))) { return '—'; }
    var api = i18nApi();
    if (api && typeof api.formatNumber === 'function') {
      return api.formatNumber(v, { maximumFractionDigits: dec === undefined ? 2 : dec });
    }
    return (dec === undefined) ? String(v) : Number(v).toFixed(dec);
  }

  function fmtDate(iso) {
    if (!iso) { return '—'; }
    var api = i18nApi();
    if (api && typeof api.formatDate === 'function') {
      return api.formatDate(iso, { dateStyle: 'medium' });
    }
    return String(iso);
  }

  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      if (attrs.class) { node.className = attrs.class; }
      if (attrs.text !== undefined && attrs.text !== null) { node.textContent = attrs.text; }
      if (attrs.attrs) {
        for (var k in attrs.attrs) {
          if (Object.prototype.hasOwnProperty.call(attrs.attrs, k) && attrs.attrs[k] !== null && attrs.attrs[k] !== undefined) {
            node.setAttribute(k, attrs.attrs[k]);
          }
        }
      }
    }
    for (var i = 2; i < arguments.length; i++) { append(node, arguments[i]); }
    return node;
  }

  function elNS(tag, attrs) {
    var node = document.createElementNS('http://www.w3.org/2000/svg', tag);
    if (attrs) {
      for (var k in attrs) {
        if (Object.prototype.hasOwnProperty.call(attrs, k) && attrs[k] !== null && attrs[k] !== undefined) {
          node.setAttribute(k, attrs[k]);
        }
      }
    }
    for (var i = 2; i < arguments.length; i++) { append(node, arguments[i]); }
    return node;
  }

  function append(node, children) {
    var arr = Array.isArray(children) ? children : [children];
    for (var i = 0; i < arr.length; i++) {
      var c = arr[i];
      if (c === null || c === undefined || c === false) { continue; }
      if (typeof c === 'string' || typeof c === 'number') { node.appendChild(document.createTextNode(String(c))); }
      else if (c instanceof Node) { node.appendChild(c); }
      else if (Array.isArray(c)) { append(node, c); }
    }
  }

  function section(t, titleKey, bodyNodes, extraClass) {
    var sec = el('section', { class: 'report-section' + (extraClass ? ' ' + extraClass : '') });
    sec.appendChild(el('h2', { text: t(titleKey) }));
    append(sec, bodyNodes);
    return sec;
  }

  function kpi(t, labelKey, value) {
    return el('div', { class: 'kpi report-kpi' },
      el('span', { class: 'kpi__label', text: t(labelKey) }),
      el('span', { class: 'kpi__value num', text: value }));
  }

  function table(t, opts) {
    var wrap = el('div', { class: 'table-wrap report-table' });
    var tbl = el('table', { class: 'data' });
    if (opts.captionKey) { tbl.appendChild(el('caption', { text: t(opts.captionKey) })); }
    var thead = el('thead');
    var htr = el('tr');
    (opts.columns || []).forEach(function (c) {
      var th = el('th', { attrs: { scope: 'col' }, text: t(c.labelKey) });
      if (c.align) { th.className = 'num'; }
      htr.appendChild(th);
    });
    thead.appendChild(htr);
    tbl.appendChild(thead);
    var tbody = el('tbody');
    var rows = opts.rows || [];
    if (rows.length === 0) {
      tbody.appendChild(el('tr', null, el('td', { class: 'empty-state', attrs: { colspan: String((opts.columns || []).length || 1) }, text: t(opts.emptyKey || 'reports.noData') })));
    } else {
      rows.forEach(function (row) {
        var tr = el('tr');
        (opts.columns || []).forEach(function (c) {
          var td = el('td');
          if (c.render) { append(td, c.render(row)); }
          else {
            var v = row[c.key];
            td.textContent = (v === undefined || v === null) ? '' : String(v);
          }
          if (c.align) { td.className = 'num'; }
          tr.appendChild(td);
        });
        tbody.appendChild(tr);
      });
    }
    tbl.appendChild(tbody);
    wrap.appendChild(tbl);
    return wrap;
  }

  function severityBadge(t, level) {
    return el('span', { class: 'badge badge-' + (level || 'low'), text: t('severity.' + (level || 'low')) });
  }

  function inPeriod(iso, from, to) {
    if (!iso) { return false; }
    if (from && iso < from) { return false; }
    if (to && iso > to) { return false; }
    return true;
  }

  // Average corrosion rate over the readings that fall in the period.
  function avgCrInPeriod(readings, from, to) {
    var sum = 0, n = 0;
    (readings || []).forEach(function (r) {
      if (typeof r.crMpy === 'number' && isFinite(r.crMpy) && inPeriod(r.date, from, to)) {
        sum += r.crMpy; n++;
      }
    });
    return n ? sum / n : null;
  }

  // Bucket readings into weekly averages across the period (7-day bins from `from`).
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

  // Vector SVG weekly average CR chart with a visually-hidden data table fallback.
  function buildWeeklyChart(t, buckets) {
    var W = 640, H = 240, padL = 46, padR = 16, padT = 16, padB = 34;
    var values = buckets.map(function (b) { return b.value; }).filter(function (v) { return v !== null; });
    var max = values.length ? Math.max.apply(null, values) : 0;
    if (max <= 0) { max = 1; }

    var svg = elNS('svg', { viewBox: '0 0 ' + W + ' ' + H, role: 'img', class: 'report-chart' });
    svg.appendChild(elNS('title', {}, t('reports.weeklyChartTitle')));
    svg.appendChild(elNS('desc', {}, t('reports.weeklyChartAlt')));

    var plotW = W - padL - padR;
    var plotH = H - padT - padB;
    var n = Math.max(buckets.length, 1);
    var step = plotW / n;

    // Baseline.
    svg.appendChild(elNS('line', { x1: padL, y1: padT + plotH, x2: padL + plotW, y2: padT + plotH, class: 'report-chart-axis' }));

    // y grid lines (0, 0.5, 1.0 of max) with value labels.
    [0, 0.5, 1].forEach(function (frac) {
      var y = padT + plotH - frac * plotH;
      svg.appendChild(elNS('line', { x1: padL, y1: y, x2: padL + plotW, y2: y, class: 'report-chart-grid' }));
      var label = elNS('text', { x: padL - 6, y: y + 4, class: 'report-chart-tick', 'text-anchor': 'end' });
      label.textContent = fmtNum(max * frac, 1);
      svg.appendChild(label);
    });

    var points = [];
    buckets.forEach(function (b, i) {
      var cx = padL + step * (i + 0.5);
      points.push(cx);
      if (b.value !== null) {
        var cy = padT + plotH - (b.value / max) * plotH;
        svg.appendChild(elNS('circle', { cx: cx, cy: cy, r: 3, class: 'report-chart-dot' }));
        var lbl = elNS('text', { x: cx, y: padT + plotH + 16, class: 'report-chart-tick', 'text-anchor': 'middle' });
        lbl.textContent = t('reports.week') + ' ' + b.week;
        svg.appendChild(lbl);
      }
    });

    var hasPoints = values.length > 0;
    if (hasPoints) {
      var pts = [];
      buckets.forEach(function (b, i) {
        if (b.value === null) { return; }
        var cx = padL + step * (i + 0.5);
        var cy = padT + plotH - (b.value / max) * plotH;
        pts.push(cx.toFixed(1) + ',' + cy.toFixed(1));
      });
      svg.appendChild(elNS('polyline', { points: pts.join(' '), class: 'report-chart-line' }));
    }

    // Alternative data table (visually hidden, for screen readers / no-SVG).
    var alt = table(t, {
      captionKey: 'reports.weeklyChartTitle',
      columns: [
        { key: 'week', labelKey: 'reports.week' },
        { key: 'avg', labelKey: 'reports.avgCr', align: true }
      ],
      rows: buckets.map(function (b) {
        return { week: b.week, avg: b.value === null ? '—' : fmtNum(b.value, 3) };
      })
    });
    alt.className = 'table-wrap visually-hidden';

    var wrap = el('div', { class: 'report-chart-wrap' }, svg, alt);
    return wrap;
  }

  // Top critical monitoring points by average CR (SP0775 classification).
  function buildTopCritical(t, readings, monitoringPoints) {
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

    return table(t, {
      captionKey: 'reports.topCritical',
      columns: [
        { key: 'code', labelKey: 'corrosion.pointCode' },
        { key: 'avg', labelKey: 'reports.avgCr', align: true },
        { key: 'level', labelKey: 'corrosion.classification', render: function (row) { return severityBadge(t, row.level); } }
      ],
      rows: rows.map(function (r) {
        return { code: r.code, avg: fmtNum(r.avg, 3), level: r.level };
      })
    });
  }

  // Inhibitor efficiency per coupon pair.
  function buildEiByPairs(t, coupons) {
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
        blank: blank.crMpy,
        inhibited: inh.crMpy,
        ei: ei,
        band: band
      });
    });
    return table(t, {
      captionKey: 'reports.eiByPairs',
      columns: [
        { key: 'pairId', labelKey: 'corrosion.pair' },
        { key: 'blank', labelKey: 'corrosion.blank', align: true },
        { key: 'inhibited', labelKey: 'corrosion.inhibited', align: true },
        { key: 'ei', labelKey: 'reports.eiPct', align: true },
        { key: 'band', labelKey: 'reports.band', render: function (row) { return row.band ? el('span', { class: 'pill', text: t('corrosion.eiBands.' + row.band) }) : el('span', { text: '—' }); } }
      ],
      rows: rows.map(function (r) {
        return {
          pairId: r.pairId,
          blank: r.blank == null ? '—' : fmtNum(r.blank, 3),
          inhibited: r.inhibited == null ? '—' : fmtNum(r.inhibited, 3),
          ei: r.ei === null ? '—' : fmtNum(r.ei, 1),
          band: r.band
        };
      })
    });
  }

  // Coupon campaigns within the period.
  function buildCampaigns(t, coupons, from, to) {
    var rows = (coupons || []).filter(function (c) {
      return inPeriod(c.startDate, from, to) || inPeriod(c.endDate, from, to);
    }).map(function (c) {
      var deltaW = (typeof c.wiMg === 'number' && typeof c.wfMg === 'number') ? c.wiMg - c.wfMg : null;
      return {
        mpId: c.mpId || '—',
        role: c.role || '—',
        deltaW: deltaW,
        area: c.areaIn2,
        days: c.days,
        cr: c.crMpy
      };
    });
    return table(t, {
      captionKey: 'reports.campaignsTable',
      columns: [
        { key: 'mpId', labelKey: 'corrosion.pointCode' },
        { key: 'role', labelKey: 'corrosion.couponRole' },
        { key: 'deltaW', labelKey: 'reports.deltaW', align: true },
        { key: 'area', labelKey: 'corrosion.area', align: true },
        { key: 'days', labelKey: 'corrosion.exposureDays', align: true },
        { key: 'cr', labelKey: 'reports.cr', align: true }
      ],
      rows: rows.map(function (r) {
        return {
          mpId: r.mpId,
          role: r.role,
          deltaW: r.deltaW == null ? '—' : fmtNum(r.deltaW, 1),
          area: r.area == null ? '—' : fmtNum(r.area, 2),
          days: r.days == null ? '—' : fmtNum(r.days, 0),
          cr: r.cr == null ? '—' : fmtNum(r.cr, 3)
        };
      })
    });
  }

  // Recommendations summary counts + open recommendations table.
  function buildRecsSummary(t, recs) {
    var counts = { open: 0, acked: 0, resolved: 0 };
    var openRows = [];
    (recs || []).forEach(function (r) {
      if (counts[r.status] !== undefined) { counts[r.status]++; }
      if (r.status === 'open') {
        openRows.push({ ruleId: r.ruleId, name: t('rules.name.' + r.ruleId), severity: r.severity, entity: r.entityLabel || r.entityId });
      }
    });
    var summaryRow = el('div', { class: 'row' },
      kpi(t, 'reports.recsOpen', String(counts.open)),
      kpi(t, 'reports.recsAcked', String(counts.acked)),
      kpi(t, 'reports.recsResolved', String(counts.resolved)));
    var openTable = table(t, {
      captionKey: 'reports.recsSummary',
      columns: [
        { key: 'ruleId', labelKey: 'rules.rule' },
        { key: 'name', labelKey: 'reports.ruleName' },
        { key: 'severity', labelKey: 'common.severity', render: function (row) { return severityBadge(t, row.severity); } },
        { key: 'entity', labelKey: 'rules.entity' }
      ],
      rows: openRows.map(function (r) {
        return { ruleId: r.ruleId, name: r.name, severity: r.severity, entity: r.entity || '—' };
      })
    });
    return el('div', { class: 'report-recs' }, summaryRow, openTable);
  }

  function buildStandards(t) {
    var list = (root.IW && root.IW.data && root.IW.data.standards && root.IW.data.standards.standards) || [];
    var used = list.filter(function (s) { return !s.usedIn || s.usedIn.indexOf('reports') !== -1; });
    if (used.length === 0) { return el('p', { class: 'empty-state', text: t('reports.noData') }); }
    var rows = used.map(function (s) {
      return { code: s.code || s.id, edition: s.edition || '—', title: s.title || '' };
    });
    return table(t, {
      captionKey: 'reports.standardsApplied',
      columns: [
        { key: 'code', labelKey: 'glossary.reference' },
        { key: 'title', labelKey: 'reports.title' },
        { key: 'edition', labelKey: 'admin.version' }
      ],
      rows: rows.map(function (r) { return { code: r.code, title: r.title, edition: r.edition }; })
    });
  }

  function buildCover(t, period) {
    var appName = t('common.appName');
    return el('header', { class: 'report-cover' },
      el('h1', { text: t('reports.cover') }),
      el('p', { class: 'report-cover-subtitle', text: t('reports.coverSubtitle') }),
      el('p', { class: 'report-cover-app', text: appName }),
      el('p', { class: 'report-cover-period', text: t('reports.period') + ': ' + fmtDate(period.fromISO) + ' — ' + fmtDate(period.toISO) }),
      el('p', { class: 'report-cover-generated', text: t('reports.generatedAt') + ': ' + fmtDate(new Date().toISOString()) }));
  }

  function build(opts) {
    opts = opts || {};
    if (typeof document === 'undefined') { return Promise.resolve(null); }
    var store = opts.repos || opts.store || {};
    var period = opts.period || { fromISO: '', toISO: '' };
    var t = opts.t || function (k) { return k; };

    function list(repo) { return (store[repo] && typeof store[repo].list === 'function') ? store[repo].list() : Promise.resolve([]); }

    return Promise.all([
      list('monitoringPoints'),
      list('readings'),
      list('coupons'),
      list('psvs'),
      list('apmAssets'),
      list('apmEvents'),
      list('recommendations')
    ]).then(function (data) {
      var monitoringPoints = data[0];
      var readings = data[1];
      var coupons = data[2];
      var psvs = data[3];
      var apmAssets = data[4];
      var apmEvents = data[5];
      var recs = data[6];
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

      // Average APM availability over the period window.
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

      var doc = el('div', { class: 'print-root report report-quarterly' });
      doc.appendChild(buildCover(t, period));

      // KPI block.
      doc.appendChild(section(t, 'reports.kpis', [
        el('div', { class: 'grid-bento report-kpis' },
          kpi(t, 'reports.kpiAvgCr', avgCr === null ? '—' : fmtNum(avgCr, 3) + ' ' + t('units.mpy')),
          kpi(t, 'dashboard.kpiSeverePoints', String(severePoints)),
          kpi(t, 'dashboard.kpiPsvOverdue', String(psvOverdue)),
          kpi(t, 'reports.kpiAvailability', avgAvailability === null ? '—' : fmtNum(avgAvailability, 1) + ' ' + t('units.pct'))),
        el('div', { class: 'grid-bento report-kpis' },
          kpi(t, 'dashboard.criticalCount', String(recsBySev.critical)),
          kpi(t, 'dashboard.warningCount', String(recsBySev.warning)),
          kpi(t, 'dashboard.infoCount', String(recsBySev.info)))
      ]));

      doc.appendChild(section(t, 'reports.weeklyChartTitle', [buildWeeklyChart(t, buckets)], 'page-break'));
      doc.appendChild(section(t, 'reports.topCritical', [buildTopCritical(t, readings, monitoringPoints)]));
      doc.appendChild(section(t, 'reports.eiByPairs', [buildEiByPairs(t, coupons)]));
      doc.appendChild(section(t, 'reports.campaignsTable', [buildCampaigns(t, coupons, period.fromISO, period.toISO)]));
      doc.appendChild(section(t, 'reports.recsSummary', [buildRecsSummary(t, recs)], 'page-break'));
      doc.appendChild(section(t, 'reports.standardsApplied', [buildStandards(t)]));

      // Methodology note + disclaimer.
      var methodology = section(t, 'reports.methodology', [
        el('p', { text: t('reports.methodologyBody') }),
        el('p', { class: 'report-methodology-sources', text: t('reports.methodologySources') })
      ]);
      doc.appendChild(methodology);

      var disclaimer = el('div', { class: 'report-disclaimer', attrs: { role: 'note' } },
        el('strong', { text: t('reports.disclaimer') }));
      doc.appendChild(disclaimer);

      var footer = el('footer', { class: 'report-footer', text: t('reports.pageFooter') + ' · ' + t('reports.generatedAt') + ' ' + fmtDate(new Date().toISOString()) });
      doc.appendChild(footer);

      return doc;
    });
  }

  return { build: build };
});
