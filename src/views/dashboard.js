/* IntegrityWatch Field — dashboard view
   Sector overview: corrosion KPIs, severity heatmap, compliance feed and rules run. */
(function (root, factory) {
  'use strict';
  var api = factory(root);
  root.IW = root.IW || {};
  root.IW.views = root.IW.views || {};
  root.IW.views.dashboard = api;
  if (typeof module === 'object' && module.exports) { module.exports = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  var SEV_RANK = { critical: 3, warning: 2, info: 1, low: 0, moderate: 1, high: 2, severe: 3 };

  function i18nApi() { return root.IW.i18n; }

  function fmtNum(v, digits) {
    var d = (digits === undefined || digits === null) ? 2 : digits;
    if (v === null || v === undefined || typeof v !== 'number' || !isFinite(v)) { return ''; }
    var i18n = i18nApi();
    if (i18n && typeof i18n.formatNumber === 'function') {
      return i18n.formatNumber(v, { maximumFractionDigits: d });
    }
    return String(Number(v.toFixed(d)));
  }

  function fmtDate(iso, opts) {
    if (!iso) { return ''; }
    var i18n = i18nApi();
    if (i18n && typeof i18n.formatDate === 'function') { return i18n.formatDate(iso, opts); }
    return String(iso);
  }

  function corrosion() { return root.IW.calc && root.IW.calc.corrosion; }

  function inSector(mp, sector) {
    if (!sector || sector === 'all') { return true; }
    return mp.sector === sector;
  }

  // Latest reading (by date) per monitoring point.
  function latestByMp(readings) {
    var byMp = {};
    var times = {};
    (readings || []).forEach(function (r) {
      var id = r.mpId;
      if (!id) { return; }
      var t = Date.parse(r.date);
      if (isNaN(t)) { t = 0; }
      if (!byMp[id] || t >= (times[id] === undefined ? -1 : times[id])) {
        byMp[id] = r;
        times[id] = t;
      }
    });
    return byMp;
  }

  function psvDue(p) {
    if (p.status === 'overdue' || p.status === 'due') { return true; }
    if (p.status === 'ok') { return false; }
    if (!p.nextTestDate) { return false; }
    var next = Date.parse(p.nextTestDate);
    if (isNaN(next)) { return false; }
    return next < Date.now();
  }

  function loadData(h) {
    return Promise.all([
      h.repos.monitoringPoints.list(),
      h.repos.readings.list(),
      h.repos.psvs.list(),
      h.repos.recommendations.list(),
      h.repos.meta.get('lastRulesRunISO').catch(function () { return undefined; })
    ]).then(function (d) {
      return {
        points: d[0] || [],
        readings: d[1] || [],
        psvs: d[2] || [],
        recs: d[3] || [],
        lastRulesRunISO: d[4]
      };
    });
  }

  function compute(h, data) {
    var sector = h.sector;
    var corr = corrosion();
    var latest = latestByMp(data.readings);
    var points = (data.points || []).filter(function (mp) { return inSector(mp, sector); });

    var sum = 0;
    var n = 0;
    var severeCount = 0;
    var heat = [];
    points.forEach(function (mp) {
      var r = latest[mp.id];
      var mpy = r && typeof r.crMpy === 'number' ? r.crMpy : null;
      var sev = mpy === null ? 'low' : (corr && corr.classifySp0775 ? corr.classifySp0775(mpy) : 'low');
      if (mpy !== null) { sum += mpy; n++; }
      if (mpy !== null && mpy >= 10) { severeCount++; }
      heat.push({ mp: mp, lastMpy: mpy, sev: sev });
    });
    heat.sort(function (a, b) {
      var av = a.lastMpy === null ? -1 : a.lastMpy;
      var bv = b.lastMpy === null ? -1 : b.lastMpy;
      if (bv !== av) { return bv - av; }
      return String(a.mp.code).localeCompare(String(b.mp.code));
    });

    var psvOverdue = (data.psvs || []).filter(psvDue).length;

    var openRecs = (data.recs || []).filter(function (r) { return r.status === 'open'; });
    var apmAlerts = 0;
    var byAsset = {};
    openRecs.forEach(function (r) {
      if (r.entityStore === 'apmAssets') {
        if (r.entityId && !byAsset[r.entityId]) { byAsset[r.entityId] = true; apmAlerts++; }
      }
    });

    var feed = openRecs.slice().sort(function (a, b) {
      var av = SEV_RANK[a.severity] !== undefined ? SEV_RANK[a.severity] : 0;
      var bv = SEV_RANK[b.severity] !== undefined ? SEV_RANK[b.severity] : 0;
      if (bv !== av) { return bv - av; }
      return String(b.createdAt || '').localeCompare(String(a.createdAt || ''));
    });

    return {
      avgCr: n > 0 ? sum / n : null,
      severeCount: severeCount,
      psvOverdue: psvOverdue,
      apmAlerts: apmAlerts,
      pendingCompliance: openRecs.length,
      heat: heat,
      feed: feed,
      criticalCount: openRecs.filter(function (r) { return r.severity === 'critical'; }).length,
      warningCount: openRecs.filter(function (r) { return r.severity === 'warning'; }).length,
      infoCount: openRecs.filter(function (r) { return r.severity === 'info'; }).length
    };
  }

  function kpiCard(h, labelKey, valueText, iconName) {
    var card = h.ui.el('div', { class: 'kpi' });
    if (iconName) {
      card.appendChild(h.ui.el('span', { class: 'kpi__icon', attrs: { 'aria-hidden': 'true' } }, h.ui.icon(iconName, 20)));
    }
    card.appendChild(h.ui.el('span', { class: 'kpi__label', text: h.t(labelKey) }));
    card.appendChild(h.ui.el('span', { class: 'kpi__value', text: valueText }));
    return card;
  }

  function buildHeatmap(h, heat) {
    var card = h.ui.el('section', { class: 'card' });
    card.appendChild(h.ui.el('h2', { class: 'section-title', text: h.t('dashboard.heatmapTitle') }));
    card.appendChild(h.ui.el('p', { class: 'section-hint', text: h.t('dashboard.heatmapHint') }));

    if (!heat.length) {
      card.appendChild(h.ui.el('p', { class: 'empty-state', text: h.t('common.empty') }));
      return card;
    }

    var grid = h.ui.el('div', { class: 'heatmap-grid', attrs: { role: 'group', 'aria-label': h.t('dashboard.heatmapTitle') } });
    heat.forEach(function (p) {
      var valueText = p.lastMpy === null ? '—' : fmtNum(p.lastMpy, 1);
      var cell = h.ui.el('a', {
        class: 'heat-cell heat-cell-' + p.sev,
        attrs: {
          href: '#/corrosion/mp/' + encodeURIComponent(p.mp.id),
          title: p.mp.code + ': ' + (p.lastMpy === null ? '—' : fmtNum(p.lastMpy, 2) + ' ' + h.t('units.mpy'))
        },
        on: {
          click: function (ev) {
            ev.preventDefault();
            h.navigate('#/corrosion/mp/' + encodeURIComponent(p.mp.id));
          }
        }
      },
        h.ui.el('span', { class: 'heat-cell__shape shape shape-' + p.sev, attrs: { 'aria-hidden': 'true' } }),
        h.ui.el('span', { class: 'heat-cell__code', text: p.mp.code }),
        h.ui.el('span', { class: 'heat-cell__value num', text: valueText })
      );
      grid.appendChild(cell);
    });
    card.appendChild(grid);

    // Accessible data-table alternative for the heatmap.
    var alt = h.ui.el('div', { class: 'visually-hidden' });
    var tbl = h.ui.el('table');
    tbl.appendChild(h.ui.el('caption', { text: h.t('a11y.chartDataTable') + ': ' + h.t('dashboard.heatmapTitle') }));
    var thead = h.ui.el('thead');
    var htr = h.ui.el('tr');
    [h.t('corrosion.pointCode'), h.t('common.value'), h.t('common.severity')].forEach(function (label) {
      htr.appendChild(h.ui.el('th', { attrs: { scope: 'col' }, text: label }));
    });
    thead.appendChild(htr);
    tbl.appendChild(thead);
    var tbody = h.ui.el('tbody');
    heat.forEach(function (p) {
      var tr = h.ui.el('tr');
      tr.appendChild(h.ui.el('td', { text: p.mp.code }));
      tr.appendChild(h.ui.el('td', { text: p.lastMpy === null ? '' : fmtNum(p.lastMpy, 2) + ' mpy' }));
      tr.appendChild(h.ui.el('td', { text: h.t('severity.' + p.sev) }));
      tbody.appendChild(tr);
    });
    tbl.appendChild(tbody);
    alt.appendChild(tbl);
    card.appendChild(alt);
    return card;
  }

  function buildFeed(h, feed) {
    var card = h.ui.el('section', { class: 'card' });
    card.appendChild(h.ui.el('h2', { class: 'section-title', text: h.t('dashboard.alertsFeed') }));

    var counts = h.ui.el('div', { class: 'row feed-counts' });
    counts.appendChild(h.ui.el('span', { class: 'pill', text: h.t('dashboard.criticalCount') + ': ' + h.computed.criticalCount }));
    counts.appendChild(h.ui.el('span', { class: 'pill', text: h.t('dashboard.warningCount') + ': ' + h.computed.warningCount }));
    counts.appendChild(h.ui.el('span', { class: 'pill', text: h.t('dashboard.infoCount') + ': ' + h.computed.infoCount }));
    card.appendChild(counts);

    if (!feed.length) {
      card.appendChild(h.ui.el('p', { class: 'empty-state', text: h.t('dashboard.noAlerts') }));
      return card;
    }

    var list = h.ui.el('ul', { class: 'alerts-feed' });
    feed.slice(0, 10).forEach(function (rec) {
      var sev = rec.severity || 'info';
      var iconName = sev === 'critical' ? 'alert-critical' : (sev === 'warning' ? 'alert-warning' : 'alert-info');
      var msg = h.t(rec.messageKey || 'rules.title', rec.params || {});
      var li = h.ui.el('li', { class: 'alert-item' });
      var a = h.ui.el('a', {
        class: 'alert-item__link',
        attrs: { href: '#/recommendations', title: h.t('nav.recommendations') },
        on: { click: function (ev) { ev.preventDefault(); h.navigate('#/recommendations'); } }
      },
        h.ui.el('span', { class: 'alert-item__icon alert-item__icon--' + sev, attrs: { 'aria-hidden': 'true' } }, h.ui.icon(iconName, 20)),
        h.ui.el('span', { class: 'alert-item__body' },
          h.ui.el('span', { class: 'alert-item__sev', text: h.t('common.' + sev) }),
          h.ui.el('span', { class: 'alert-item__text', text: msg })
        )
      );
      li.appendChild(a);
      list.appendChild(li);
    });
    card.appendChild(list);

    var viewAll = h.ui.el('div', { class: 'row row--end' });
    viewAll.appendChild(h.ui.el('a', {
      class: 'btn btn-ghost',
      attrs: { href: '#/recommendations' },
      on: { click: function (ev) { ev.preventDefault(); h.navigate('#/recommendations'); } },
      text: h.t('dashboard.viewAll')
    }));
    card.appendChild(viewAll);
    return card;
  }

  function build(h, data) {
    h.computed = compute(h, data);
    var c = h.computed;

    var frag = document.createDocumentFragment();

    var header = h.ui.el('div', { class: 'page-header' });
    header.appendChild(h.ui.el('h1', { text: h.t('dashboard.title') }));

    // Actions: sector view + last run (the run-rules trigger lives in the global header).
    var actions = h.ui.el('div', { class: 'actions' });
    actions.appendChild(h.ui.el('span', { class: 'pill', text: h.t('dashboard.sectorView') + ': ' + (h.sector ? h.t('common.' + h.sector) : h.t('common.all')) }));
    actions.appendChild(h.ui.el('span', {
      class: 'rules-last-run',
      text: h.t('dashboard.lastRulesRun') + ': ' + (data.lastRulesRunISO ? fmtDate(data.lastRulesRunISO, { dateStyle: 'short', timeStyle: 'short' }) : h.t('common.none'))
    }));
    header.appendChild(actions);
    frag.appendChild(header);

    // KPI bento grid.
    var grid = h.ui.el('div', { class: 'grid-bento' });
    grid.appendChild(kpiCard(h, 'dashboard.kpiAvgCr', c.avgCr === null ? '—' : fmtNum(c.avgCr, 2) + ' ' + h.t('units.mpy'), 'corrosion'));
    grid.appendChild(kpiCard(h, 'dashboard.kpiSeverePoints', String(c.severeCount), 'alert-critical'));
    grid.appendChild(kpiCard(h, 'dashboard.kpiPsvOverdue', String(c.psvOverdue), 'valve'));
    grid.appendChild(kpiCard(h, 'dashboard.kpiApmAlerts', String(c.apmAlerts), 'apm'));
    grid.appendChild(kpiCard(h, 'dashboard.kpiPendingCompliance', String(c.pendingCompliance), 'recs'));
    frag.appendChild(grid);

    frag.appendChild(buildHeatmap(h, c.heat));
    frag.appendChild(buildFeed(h, c.feed));

    return frag;
  }

  function loadingNode(h) {
    return h.ui.el('div', { class: 'empty-state', attrs: { role: 'status' } },
      h.ui.el('span', { class: 'spinner', attrs: { 'aria-hidden': 'true' } }),
      h.ui.el('span', { text: h.t('common.loading') }));
  }

  function errorNode(h, err) {
    return h.ui.el('div', { class: 'empty-state', attrs: { role: 'alert' } },
      h.ui.el('span', { class: 'alert-item__icon', attrs: { 'aria-hidden': 'true' } }, h.ui.icon('alert-critical', 24)),
      h.ui.el('span', { text: h.t('common.error') + ': ' + (err && err.message ? err.message : String(err)) }));
  }

  // Live subscription handle shared across renders of this module.
  var _live = null;

  function disposeLive() {
    if (_live) {
      _live.dead = true;
      (_live.offs || []).forEach(function (off) { try { off(); } catch (e) { /* ignore */ } });
      _live.offs = [];
      _live = null;
    }
  }

  function subscribe(h, live, evt, fn) {
    if (!h.bus || typeof h.bus.on !== 'function') { return; }
    var off = h.bus.on(evt, function (payload) {
      if (live.dead) { return; }
      fn(payload);
    });
    live.offs.push(off);
  }

  return {
    id: 'dashboard',
    titleKey: 'nav.dashboard',
    icon: 'dashboard',
    render: function (container, ctx) {
      if (typeof document === 'undefined' || !container) { return Promise.resolve(); }
      var ui = root.IW.ui;
      var t = ctx.i18n || function (k) { return k; };
      var repos = ctx.repos;
      var bus = ctx.bus;
      var navigate = ctx.navigate || function (hash) { if (typeof location !== 'undefined') { location.hash = hash; } };

      var h = {
        t: t, ui: ui, repos: repos, bus: bus, navigate: navigate, sector: ctx.sector, computed: null
      };

      disposeLive();
      var live = { dead: false, offs: [] };
      _live = live;

      container.textContent = '';
      container.appendChild(loadingNode(h));

      function reload() {
        if (live.dead || !container.isConnected) { return Promise.resolve(); }
        container.textContent = '';
        container.appendChild(loadingNode(h));
        return loadData(h).then(function (data) {
          if (live.dead || !container.isConnected) { return; }
          container.textContent = '';
          container.appendChild(build(h, data));
        }).catch(function (err) {
          if (live.dead || !container.isConnected) { return; }
          container.textContent = '';
          container.appendChild(errorNode(h, err));
        });
      }

      // Tear down when another view takes over.
      subscribe(h, live, 'route:changed', function (d) {
        if (!d || d.viewId !== 'dashboard') { disposeLive(); }
      });
      // Live re-render on any relevant data change.
      subscribe(h, live, 'data:changed:monitoringPoints', reload);
      subscribe(h, live, 'data:changed:readings', reload);
      subscribe(h, live, 'data:changed:psvs', reload);
      subscribe(h, live, 'data:changed:recommendations', reload);
      subscribe(h, live, 'data:changed:meta', reload);

      return loadData(h).then(function (data) {
        if (live.dead || !container.isConnected) { return; }
        container.textContent = '';
        container.appendChild(build(h, data));
      }).catch(function (err) {
        if (live.dead || !container.isConnected) { return; }
        container.textContent = '';
        container.appendChild(errorNode(h, err));
      });
    }
  };
});
