/* IntegrityWatch Field — apm view
   Asset performance management: sector tabs, asset table with health
   semaphore, asset detail with metrics, RBI 5x5 risk matrix and events. */
(function (root, factory) {
  'use strict';
  var api = factory(root);
  root.IW = root.IW || {};
  root.IW.views = root.IW.views || {};
  root.IW.views.apm = api;
  if (typeof module === 'object' && module.exports) { module.exports = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  var SECTORS = ['upstream', 'midstream', 'downstream'];
  var EVENT_TYPES = ['failure', 'maintenance', 'unplannedOutage', 'workOrder', 'inspection'];
  var STATUSES = ['running', 'standby', 'down', 'maintenance'];
  var CRITICALITIES = ['A', 'B', 'C'];
  var DAY_MS = 86400000;
  var HOUR_MS = 3600000;
  var SVG_NS = 'http://www.w3.org/2000/svg';

  var SECTOR_CATEGORIES = {
    upstream: ['well', 'platform', 'fpso', 'subsea', 'esp', 'suckerRod', 'gasLift', 'wellheadCompression', 'separator', 'storageTank'],
    midstream: ['pipeline', 'pumpStation', 'compressorStation', 'loadingTerminal', 'storageTank', 'gasPlant'],
    downstream: ['refinery', 'distillationUnit', 'hydrodesulfurization', 'reformer', 'heatExchanger', 'pump', 'compressor', 'column', 'furnace', 'utilitySteam', 'utilityAir', 'utilityNitrogen']
  };

  var _session = null;

  function teardown() {
    if (_session) {
      _session.active = false;
      (_session.offs || []).forEach(function (off) { if (typeof off === 'function') { off(); } });
      _session = null;
    }
  }

  function subscribe(bus, events, fn) {
    if (!bus || typeof bus.on !== 'function') { return; }
    if (!_session.offs) { _session.offs = []; }
    events.forEach(function (evt) {
      _session.offs.push(bus.on(evt, function (payload) {
        if (_session && _session.active && _session.container && _session.container.isConnected) { fn(payload); }
      }));
    });
  }

  function ui() { return root.IW.ui; }
  function lockApi() { return root.IW.security && root.IW.security.lock; }
  function calcApm() { return root.IW.calc && root.IW.calc.apm; }

  function el(tag, attrs) {
    var u = ui();
    if (u && typeof u.el === 'function') { return u.el.apply(u, arguments); }
    return document.createElement(tag);
  }

  function icon(name, size) {
    var u = ui();
    if (u && typeof u.icon === 'function') {
      var n = u.icon(name, size);
      return (n && n.nodeType) ? n : document.createTextNode('');
    }
    return document.createTextNode('');
  }

  function isOperatorLocked() {
    var lock = lockApi();
    return !!(lock && typeof lock.currentRole === 'function' && lock.currentRole() === 'operator');
  }

  function fmtDate(iso) {
    if (!iso) { return ''; }
    var i18n = root.IW.i18n;
    if (i18n && typeof i18n.formatDate === 'function') { return i18n.formatDate(iso, { dateStyle: 'medium' }); }
    try { return new Date(iso).toLocaleDateString(); } catch (e) { return String(iso); }
  }

  function fmtNum(v, digits) {
    var i18n = root.IW.i18n;
    var d = (digits === undefined || digits === null) ? 1 : digits;
    if (i18n && typeof i18n.formatNumber === 'function') { return i18n.formatNumber(v, { maximumFractionDigits: d }); }
    return String(v);
  }

  function toDateInput(iso) { return iso ? String(iso).slice(0, 10) : ''; }
  function fromDateInput(d) {
    if (!d) { return ''; }
    if (/^\d{4}-\d{2}-\d{2}$/.test(d)) { return d + 'T00:00:00.000Z'; }
    return d;
  }

  function newId(prefix) {
    return prefix + '-' + Date.now().toString(36) + '-' + Math.floor(Math.random() * 1e6).toString(36);
  }

  function eventDowntime(e) {
    if (typeof e.downtimeH === 'number') { return e.downtimeH; }
    if (e.start && e.end) {
      var s = Date.parse(e.start);
      var en = Date.parse(e.end);
      if (!isNaN(s) && !isNaN(en) && en >= s) { return (en - s) / HOUR_MS; }
    }
    return 0;
  }

  // Pure: aggregate APM metrics from events over an optional trailing window.
  function computeMetrics(events, opts) {
    opts = opts || {};
    var nowISO = opts.nowISO || new Date().toISOString();
    var windowDays = opts.windowDays || null;
    var apm = calcApm();
    var now = Date.parse(nowISO);
    var windowH = windowDays ? windowDays * 24 : null;
    var since = windowDays ? now - windowDays * DAY_MS : null;
    var failures = 0;
    var downtimeH = 0;
    (events || []).forEach(function (e) {
      var start = Date.parse(e.start);
      if (isNaN(start)) { return; }
      if (since !== null && start < since) { return; }
      if (e.type === 'failure') { failures += 1; }
      var dh = eventDowntime(e);
      if (typeof dh === 'number' && dh >= 0) { downtimeH += dh; }
    });
    return {
      windowH: windowH,
      failureCount: failures,
      downtimeH: downtimeH,
      availability: windowH ? (apm ? apm.availability({ windowH: windowH, downtimeH: downtimeH }) : null) : null,
      mtbf: windowH ? (apm ? apm.mtbf({ windowH: windowH, downtimeH: downtimeH, failureCount: failures }) : null) : null,
      mttr: apm ? apm.mttr({ downtimeH: downtimeH, failureCount: failures }) : null,
      failureRate: windowH ? (apm ? apm.failureRate({ failureCount: failures, windowH: windowH }) : null) : null
    };
  }

  // Pure: traffic-light health level from aggregated metrics.
  function healthLevel(metrics, thresholdPct) {
    var th = (typeof thresholdPct === 'number') ? thresholdPct : 90;
    if (!metrics) { return 'good'; }
    if (metrics.failureCount >= 3) { return 'bad'; }
    if (metrics.availability == null) { return 'good'; }
    if (metrics.availability < th) { return 'bad'; }
    if (metrics.availability < th + 5) { return 'warn'; }
    return 'good';
  }

  function healthIcon(level) {
    if (level === 'bad') { return 'alert-critical'; }
    if (level === 'warn') { return 'alert-warning'; }
    return 'check';
  }

  function rbiBandOf(asset) {
    var apm = calcApm();
    var rbi = asset.rbi || {};
    if (rbi.band) { return rbi.band; }
    if (typeof rbi.pof === 'number' && typeof rbi.cof === 'number' && apm) {
      var r = apm.rbiRisk({ pof: rbi.pof, cof: rbi.cof });
      return r.band;
    }
    return null;
  }

  function bandClass(band) {
    if (band === 'low') { return 'badge-low'; }
    if (band === 'medium') { return 'badge-moderate'; }
    if (band === 'high') { return 'badge-high'; }
    if (band === 'veryHigh') { return 'badge-severe'; }
    return 'badge-neutral';
  }

  function statusClass(status) {
    if (status === 'running') { return 'badge-low'; }
    if (status === 'maintenance') { return 'badge-moderate'; }
    if (status === 'down') { return 'badge-severe'; }
    return 'badge-neutral';
  }

  function critClass(crit) {
    if (crit === 'A') { return 'badge-severe'; }
    if (crit === 'B') { return 'badge-moderate'; }
    return 'badge-low';
  }

  function svgEl(tag, attrs) {
    var node = document.createElementNS(SVG_NS, tag);
    for (var k in attrs) {
      if (Object.prototype.hasOwnProperty.call(attrs, k) && attrs[k] !== null && attrs[k] !== undefined) {
        node.setAttribute(k, String(attrs[k]));
      }
    }
    return node;
  }

  // Build the 5x5 RBI risk matrix (API 581 orientation: POF on x, COF on y).
  function buildRiskMatrix(asset, t, onChange) {
    var apm = calcApm();
    var pof = (asset.rbi && typeof asset.rbi.pof === 'number') ? asset.rbi.pof : 1;
    var cof = (asset.rbi && typeof asset.rbi.cof === 'number') ? asset.rbi.cof : 1;

    var CELL = 56;
    var ORIGIN = 54;
    var SIZE = CELL * 5;
    var wrap = el('div', { class: 'rbi-wrap' });

    var svg = svgEl('svg', {
      class: 'rbi-matrix',
      viewBox: '0 0 ' + (ORIGIN + SIZE + 40) + ' ' + (ORIGIN + SIZE + 40),
      preserveAspectRatio: 'xMidYMid meet',
      role: 'img',
      'aria-label': t('apm.riskMatrix')
    });
    var title = svgEl('title');
    title.textContent = t('apm.riskMatrix');
    svg.appendChild(title);
    var desc = svgEl('desc');
    desc.textContent = t('apm.riskMatrixDesc');
    svg.appendChild(desc);

    // Axis labels
    var pofAxis = svgEl('text', { x: ORIGIN + SIZE / 2, y: ORIGIN + SIZE + 28, class: 'rbi-axis', 'text-anchor': 'middle' });
    pofAxis.textContent = t('apm.pof');
    svg.appendChild(pofAxis);
    var cofAxis = svgEl('text', { x: 16, y: ORIGIN + SIZE / 2, class: 'rbi-axis', 'text-anchor': 'middle', transform: 'rotate(-90 16 ' + (ORIGIN + SIZE / 2) + ')' });
    cofAxis.textContent = t('apm.cof');
    svg.appendChild(cofAxis);

    var highlight = null;
    var highlightLabel = null;

    for (var ci = 1; ci <= 5; ci++) {
      for (var pi = 1; pi <= 5; pi++) {
        var score = pi * ci;
        var band = apm ? apm.rbiRisk({ pof: pi, cof: ci }).band : 'low';
        var x = ORIGIN + (pi - 1) * CELL;
        var y = ORIGIN + (5 - ci) * CELL;
        var rect = svgEl('rect', { x: x, y: y, width: CELL, height: CELL, class: 'rbi-cell rbi-cell--' + band });
        svg.appendChild(rect);
        var txt = svgEl('text', { x: x + CELL / 2, y: y + CELL / 2 + 5, class: 'rbi-cell-text', 'text-anchor': 'middle' });
        txt.textContent = String(score);
        svg.appendChild(txt);
        rect.addEventListener('click', function (p, c) { return function () { setSelection(p, c); }; }(pi, ci));
      }
    }

    highlight = svgEl('rect', { class: 'rbi-current', x: 0, y: 0, width: CELL, height: CELL });
    svg.appendChild(highlight);
    highlightLabel = svgEl('text', { class: 'rbi-current-label', 'text-anchor': 'middle' });
    svg.appendChild(highlightLabel);

    function setSelection(p, c) {
      pof = p; cof = c;
      highlight.setAttribute('x', String(ORIGIN + (p - 1) * CELL));
      highlight.setAttribute('y', String(ORIGIN + (5 - c) * CELL));
      highlightLabel.setAttribute('x', String(ORIGIN + (p - 1) * CELL + CELL / 2));
      highlightLabel.setAttribute('y', String(ORIGIN + (5 - c) * CELL + CELL / 2 + 5));
      var sc = p * c;
      var band = apm ? apm.rbiRisk({ pof: p, cof: c }).band : 'low';
      highlightLabel.textContent = String(sc);
      if (pofSel) { pofSel.value = String(p); }
      if (cofSel) { cofSel.value = String(c); }
      if (bandBadge) { bandBadge.textContent = t('apm.bands.' + band); bandBadge.className = 'badge ' + bandClass(band); }
      if (onChange) { onChange(p, c, band); }
    }

    // Hidden data table for screen readers (mirrors the matrix).
    var hiddenTbl = el('table', { class: 'visually-hidden' });
    hiddenTbl.appendChild(el('caption', { text: t('a11y.chartDataTable') + ': ' + t('apm.riskMatrix') }));
    var htr = el('tr', null, el('th', { attrs: { scope: 'col' }, text: t('apm.pof') + ' / ' + t('apm.cof') }));
    for (var hi = 1; hi <= 5; hi++) { htr.appendChild(el('th', { attrs: { scope: 'col' }, text: String(hi) })); }
    hiddenTbl.appendChild(htr);
    for (var cr = 5; cr >= 1; cr--) {
      var tr = el('tr');
      tr.appendChild(el('th', { attrs: { scope: 'row' }, text: String(cr) }));
      for (var pc = 1; pc <= 5; pc++) { tr.appendChild(el('td', { text: String(pc * cr) })); }
      hiddenTbl.appendChild(tr);
    }

    // Synced POF/COF selects.
    var pofSel = el('select', { class: 'select', attrs: { 'aria-label': t('apm.pof') } });
    var cofSel = el('select', { class: 'select', attrs: { 'aria-label': t('apm.cof') } });
    for (var oi = 1; oi <= 5; oi++) {
      pofSel.appendChild(el('option', { attrs: { value: String(oi) }, text: String(oi) }));
      cofSel.appendChild(el('option', { attrs: { value: String(oi) }, text: String(oi) }));
    }
    pofSel.value = String(pof);
    cofSel.value = String(cof);
    pofSel.addEventListener('change', function () { setSelection(Number(pofSel.value), cof); });
    cofSel.addEventListener('change', function () { setSelection(pof, Number(cofSel.value)); });

    var bandBadge = el('span', { class: 'badge ' + bandClass(apm ? apm.rbiRisk({ pof: pof, cof: cof }).band : 'low'), text: t('apm.bands.' + (apm ? apm.rbiRisk({ pof: pof, cof: cof }).band : 'low')) });

    wrap.appendChild(svg);
    wrap.appendChild(el('div', { class: 'row' },
      el('span', { text: t('apm.pof') }), pofSel,
      el('span', { text: t('apm.cof') }), cofSel,
      el('span', { text: t('apm.riskBand') }), bandBadge));
    wrap.appendChild(hiddenTbl);

    setSelection(pof, cof);
    return { node: wrap, getPof: function () { return pof; }, getCof: function () { return cof; }, setSelection: setSelection };
  }

  function render(container, ctx) {
    var u = ui();
    if (!u || typeof u.el !== 'function' || !container) { return; }
    teardown();
    _session = { active: true, container: container, offs: [], params: ctx.params || {} };
    var t = (typeof ctx.i18n === 'function') ? ctx.i18n : function (k) { return k; };
    var repos = ctx.repos;
    var bus = ctx.bus;
    var navigate = ctx.navigate || function () {};
    var assetId = ctx.params && ctx.params.id;

    function consoleError(err) {
      if (typeof console !== 'undefined' && typeof console.error === 'function') { console.error(err); }
    }

    function reload() {
      if (!_session || !_session.active) { return; }
      var id = _session.params && _session.params.id;
      if (id) { drawDetail(id); } else { drawList(); }
    }

    subscribe(bus, ['data:changed:apmAssets', 'data:changed:apmEvents', 'data:changed:recommendations'], reload);

    function banner(err) {
      return el('div', { class: 'error-banner', attrs: { role: 'alert' }, text: t('common.error') + ': ' + (err && err.message ? err.message : String(err)) });
    }

    function loading() { return el('p', { class: 'empty-state', text: t('common.loading') }); }

    // ------------------------------------------------------------- list

    function drawList() {
      container.textContent = '';
      container.appendChild(loading());
      Promise.all([repos.apmAssets.list(), repos.apmEvents.list(), repos.meta.get('availabilityThresholdPct')]).then(function (res) {
        if (!_session || !_session.active) { return; }
        var assets = res[0] || [];
        var events = res[1] || [];
        var threshold = (typeof res[2] === 'number') ? res[2] : 90;
        container.textContent = '';
        container.appendChild(el('div', { class: 'row view-header' },
          el('h1', { text: t('apm.title') }),
          el('button', { class: 'btn btn-primary', on: { click: function () { openAssetForm(null); } } }, icon('plus', 18), el('span', { text: t('apm.newAsset') }))));

        var byAsset = {};
        events.forEach(function (e) { (byAsset[e.assetId] = byAsset[e.assetId] || []).push(e); });

        function panelFor(sector) {
          var list = sector === 'all' ? assets : assets.filter(function (a) { return a.sector === sector; });
          return buildAssetTable(list, byAsset, threshold);
        }

        var tabs = [
          { id: 'upstream', labelKey: 'common.upstream', render: function () { return panelFor('upstream'); } },
          { id: 'midstream', labelKey: 'common.midstream', render: function () { return panelFor('midstream'); } },
          { id: 'downstream', labelKey: 'common.downstream', render: function () { return panelFor('downstream'); } },
          { id: 'all', labelKey: 'common.all', render: function () { return panelFor('all'); } }
        ];
        container.appendChild(u.tabs(tabs));
      }).catch(function (err) {
        if (_session && _session.active) { container.textContent = ''; container.appendChild(banner(err)); }
      });
    }

    function buildAssetTable(list, byAsset, threshold) {
      var nowISO = new Date().toISOString();
      var columns = [
        { key: 'code', labelKey: 'apm.assetCode', render: function (v, row) { return el('button', { class: 'link', text: v, on: { click: function () { navigate('#/apm/' + row.id); } } }); } },
        { key: 'name', labelKey: 'apm.name' },
        { key: 'category', labelKey: 'apm.category', render: function (v) { return document.createTextNode(t('apm.categories.' + (v || 'pump'))); } },
        { key: 'criticality', labelKey: 'apm.criticality', render: function (v) { return el('span', { class: 'badge ' + critClass(v), text: t('apm.crit.' + (v || 'C')) }); } },
        { key: 'status', labelKey: 'apm.assetStatus', render: function (v) { return el('span', { class: 'badge ' + statusClass(v), text: t('apm.statuses.' + (v || 'running')) }); } },
        { key: 'band', labelKey: 'apm.riskBand', render: function (v, row) { var b = rbiBandOf(row); return b ? el('span', { class: 'badge ' + bandClass(b), text: t('apm.bands.' + b) }) : document.createTextNode(t('common.none')); } },
        { key: 'health', labelKey: 'apm.healthTitle', render: function (v, row) {
          var m = computeMetrics(byAsset[row.id] || [], { nowISO: nowISO, windowDays: 90 });
          var lvl = healthLevel(m, threshold);
          return el('span', { class: 'health health--' + lvl },
            icon(healthIcon(lvl), 18),
            el('span', { text: t('apm.health.' + lvl) }));
        } },
        { key: 'actions', labelKey: 'common.actions', render: function (v, row) { return assetActions(row); } }
      ];
      return u.table({ columns: columns, rows: list, captionKey: 'apm.assetsBySector', emptyKey: 'apm.noAssets' });
    }

    function assetActions(asset) {
      var locked = isOperatorLocked();
      var editBtn = el('button', { class: 'btn btn-ghost touch', attrs: { 'aria-label': t('common.edit') }, on: { click: function () { openAssetForm(asset); } } }, icon('edit', 18));
      var delBtn = el('button', { class: 'btn btn-ghost touch', attrs: { 'aria-label': t('common.delete') }, on: { click: function () { deleteAsset(asset); } } }, icon('trash', 18));
      delBtn.disabled = locked;
      return el('div', { class: 'row' }, editBtn, delBtn);
    }

    function deleteAsset(asset) {
      u.confirmDialog({ titleKey: 'common.confirm', bodyKey: 'apm.deleteAssetConfirm', danger: true }).then(function (ok) {
        if (!ok) { return; }
        repos.apmEvents.list().then(function (events) {
          var jobs = (events || []).filter(function (e) { return e.assetId === asset.id; }).map(function (e) { return repos.apmEvents.remove(e.id); });
          return Promise.all(jobs).then(function () { return repos.apmAssets.remove(asset.id); });
        }).catch(consoleError);
      });
    }

    // ----------------------------------------------------------- detail

    function drawDetail(assetId) {
      container.textContent = '';
      container.appendChild(loading());
      Promise.all([repos.apmAssets.get(assetId), repos.apmEvents.list(), repos.recommendations.list(), repos.meta.get('availabilityThresholdPct')]).then(function (res) {
        if (!_session || !_session.active) { return; }
        var asset = res[0];
        var allEvents = res[1] || [];
        var allRecs = res[2] || [];
        var threshold = (typeof res[3] === 'number') ? res[3] : 90;
        if (!asset) {
          container.textContent = '';
          container.appendChild(el('p', { class: 'empty-state', text: t('apm.noAssets') }));
          return;
        }
        var events = allEvents.filter(function (e) { return e.assetId === asset.id; });
        var recs = allRecs.filter(function (r) { return r.entityStore === 'apmAssets' && r.entityId === asset.id && r.status !== 'resolved'; });
        container.textContent = '';
        renderDetail(asset, events, recs, threshold);
      }).catch(function (err) {
        if (_session && _session.active) { container.textContent = ''; container.appendChild(banner(err)); }
      });
    }

    function renderDetail(asset, events, recs, threshold) {
      var locked = isOperatorLocked();
      var backBtn = el('button', { class: 'btn btn-ghost', on: { click: function () { navigate('#/apm'); } } }, icon('chevron-right', 18), el('span', { text: t('common.back') }));
      container.appendChild(el('div', { class: 'row view-header' }, backBtn, el('h1', { text: (asset.code || asset.id) + ' — ' + (asset.name || '') })));
      var editBtn = el('button', { class: 'btn btn-ghost', on: { click: function () { openAssetForm(asset); } } }, icon('edit', 18), el('span', { text: t('common.edit') }));
      var delBtn = el('button', { class: 'btn btn-ghost', on: { click: function () { deleteAsset(asset); } } }, icon('trash', 18), el('span', { text: t('common.delete') }));
      delBtn.disabled = locked;
      container.appendChild(el('div', { class: 'row view-header' }, editBtn, delBtn));

      // Ficha
      container.appendChild(el('section', { class: 'card' },
        el('h2', { class: 'section-title', text: t('apm.assetCode') }),
        u.keyValueTable([
          [t('common.sector'), document.createTextNode(t('common.' + (asset.sector || 'upstream')))],
          [t('apm.category'), document.createTextNode(t('apm.categories.' + (asset.category || 'pump')))],
          [t('apm.criticality'), el('span', { class: 'badge ' + critClass(asset.criticality), text: t('apm.crit.' + (asset.criticality || 'C')) })],
          [t('apm.assetStatus'), el('span', { class: 'badge ' + statusClass(asset.status), text: t('apm.statuses.' + (asset.status || 'running')) })],
          [t('common.notes'), document.createTextNode(asset.notes || t('common.none'))]
        ])));

      // Metrics
      var nowISO = new Date().toISOString();
      var m90 = computeMetrics(events, { nowISO: nowISO, windowDays: 90 });
      var mAll = computeMetrics(events, { nowISO: nowISO });
      container.appendChild(renderMetrics(asset, m90, mAll));

      // RBI matrix
      container.appendChild(el('section', { class: 'card' },
        el('h2', { class: 'section-title', text: t('apm.riskMatrix') }),
        (function () {
          var mat = buildRiskMatrix(asset, t, function () {});
          return mat.node;
        })()));

      // Inspection schedule
      container.appendChild(renderInspectionSchedule(asset));

      // Events
      var eventsHost = el('div');
      container.appendChild(el('section', { class: 'card' },
        el('div', { class: 'row view-header' },
          el('h2', { class: 'section-title', text: t('apm.events') }),
          el('button', { class: 'btn btn-primary', on: { click: function () { openEventForm(asset); } } }, icon('plus', 18), el('span', { text: t('apm.newEvent') }))),
        eventsHost));
      renderEvents(events, eventsHost);

      // Open recommendations
      container.appendChild(el('section', { class: 'card' },
        el('h2', { class: 'section-title', text: t('apm.openRecommendations') }),
        recs.length
          ? el('ul', { class: 'rec-list' }, recs.map(function (r) {
            return el('li', null,
              el('span', { class: 'badge ' + (r.severity === 'critical' ? 'badge-severe' : r.severity === 'warning' ? 'badge-moderate' : 'badge-low'), text: t('rules.name.' + r.ruleId) }),
              el('span', { text: t(r.messageKey, r.params || {}) }));
          }))
          : el('p', { class: 'empty-state', text: t('rules.noRecs') })));
    }

    function renderMetrics(asset, m90, mAll) {
      var grid = el('div', { class: 'grid-bento' });
      grid.appendChild(metricCard('apm.availability', m90.availability != null ? fmtNum(m90.availability, 1) + ' %' : '—', null));
      grid.appendChild(metricCard('apm.mtbf', m90.mtbf != null ? fmtNum(m90.mtbf, 0) + ' h' : '—', null));
      grid.appendChild(metricCard('apm.mttr', m90.mttr != null ? fmtNum(m90.mttr, 1) + ' h' : '—', null));
      grid.appendChild(metricCard('apm.failureRate', m90.failureRate != null ? fmtNum(m90.failureRate, 5) + ' /h' : '—', null));

      // OEE card with optional performance/quality inputs.
      var oeeCard = el('div', { class: 'kpi' });
      oeeCard.appendChild(el('span', { class: 'kpi__label', text: t('apm.oee') }));
      var aFrac = m90.availability != null ? m90.availability / 100 : 1;
      var pIn = el('input', { class: 'input', attrs: { type: 'number', min: '0', max: '100', step: '1', value: '100', 'aria-label': t('apm.oeePerformance') } });
      var qIn = el('input', { class: 'input', attrs: { type: 'number', min: '0', max: '100', step: '1', value: '100', 'aria-label': t('apm.oeeQuality') } });
      var oeeVal = el('span', { class: 'kpi__value num' });
      function updateOee() {
        var p = (Number(pIn.value) || 0) / 100;
        var q = (Number(qIn.value) || 0) / 100;
        var apm = calcApm();
        var o = apm ? apm.oee({ a: aFrac, p: p, q: q }) : aFrac * p * q;
        oeeVal.textContent = fmtNum(o * 100, 1) + ' %';
      }
      pIn.addEventListener('input', updateOee);
      qIn.addEventListener('input', updateOee);
      oeeCard.appendChild(el('div', { class: 'field' }, el('label', { class: 'field-label', text: t('apm.oeePerformance') }), pIn));
      oeeCard.appendChild(el('div', { class: 'field' }, el('label', { class: 'field-label', text: t('apm.oeeQuality') }), qIn));
      oeeCard.appendChild(oeeVal);
      updateOee();
      grid.appendChild(oeeCard);

      // Window toggle note.
      var note = el('p', { class: 'muted', text: t('apm.window90d') + ' · ' + t('apm.windowTotal') });
      return el('section', { class: 'card' },
        el('h2', { class: 'section-title', text: t('apm.metrics') }),
        grid, note);
    }

    function metricCard(labelKey, value, iconName) {
      var card = el('div', { class: 'kpi' });
      card.appendChild(el('span', { class: 'kpi__label', text: t(labelKey) }));
      card.appendChild(el('span', { class: 'kpi__value num', text: value }));
      return card;
    }

    function renderInspectionSchedule(asset) {
      var apm = calcApm();
      var rbi = asset.rbi || {};
      var band = rbiBandOf(asset);
      var interval = apm && band ? apm.inspectionIntervalMonths({ band: band, baseMonths: rbi.inspectionBaseMonths || 24 }) : (rbi.inspectionBaseMonths || 24);
      var next = rbi.nextInspectionISO;
      var box = el('div', { class: 'row' },
        el('span', { text: t('apm.nextInspection') + ': ' }),
        el('span', { class: 'num', text: next ? fmtDate(next) : t('common.none') }),
        el('span', { class: 'pill', text: t('apm.suggestedInterval') + ': ' + fmtNum(interval, 1) + ' ' + t('common.months') }));
      if (band) { box.appendChild(el('span', { class: 'badge ' + bandClass(band), text: t('apm.bands.' + band) })); }
      var reprogram = el('button', { class: 'btn btn-primary', text: t('apm.reprogram'), on: { click: function () {
        if (!apm) { return; }
        var newNext = apm.nextInspectionDate({ fromISO: new Date().toISOString(), months: interval });
        var rec = copyRec(asset);
        rec.rbi = rec.rbi || {};
        rec.rbi.nextInspectionISO = newNext;
        repos.apmAssets.save(rec).then(function () { u.toast('apm.reprogrammed', { severity: 'info' }); }).catch(consoleError);
      } } });
      box.appendChild(reprogram);
      return el('section', { class: 'card' },
        el('h2', { class: 'section-title', text: t('apm.inspectionBase') }), box);
    }

    function copyRec(rec) {
      var out = {};
      for (var k in rec) {
        if (Object.prototype.hasOwnProperty.call(rec, k) && k !== 'id' && k !== 'createdAt' && k !== 'updatedAt') { out[k] = rec[k]; }
      }
      out.id = rec.id;
      return out;
    }

    function renderEvents(events, host) {
      var sorted = events.slice().sort(function (a, b) { return (a.start < b.start) ? 1 : -1; });
      host.textContent = '';
      var columns = [
        { key: 'type', labelKey: 'apm.eventType', render: function (v) { return document.createTextNode(t('apm.eventTypes.' + (v || 'maintenance'))); } },
        { key: 'start', labelKey: 'apm.start', render: function (v) { return document.createTextNode(fmtDate(v)); } },
        { key: 'end', labelKey: 'apm.end', render: function (v) { return document.createTextNode(v ? fmtDate(v) : '—'); } },
        { key: 'downtimeH', labelKey: 'apm.downtime', align: 'num', render: function (v, row) { return el('span', { class: 'num', text: fmtNum(eventDowntime(row), 1) + ' h' }); } },
        { key: 'workOrderRef', labelKey: 'apm.workOrderRef', render: function (v) { return document.createTextNode(v || ''); } },
        { key: 'actions', labelKey: 'common.actions', render: function (v, row) {
          var b = el('button', { class: 'btn btn-ghost touch', attrs: { 'aria-label': t('common.delete') }, on: { click: function () { deleteEvent(row); } } }, icon('trash', 18));
          b.disabled = isOperatorLocked();
          return b;
        } }
      ];
      host.appendChild(u.table({ columns: columns, rows: sorted, captionKey: 'apm.events', emptyKey: 'apm.noEvents' }));
    }

    function deleteEvent(ev) {
      u.confirmDialog({ titleKey: 'common.confirm', bodyKey: 'apm.deleteEventConfirm', danger: true }).then(function (ok) {
        if (ok) { repos.apmEvents.remove(ev.id).catch(consoleError); }
      });
    }

    // ------------------------------------------------------------ forms

    function openAssetForm(asset) {
      var sector = asset ? asset.sector : 'upstream';
      var fields = [
        { name: 'code', labelKey: 'apm.assetCode', type: 'text', required: true },
        { name: 'name', labelKey: 'apm.name', type: 'text', required: true },
        { name: 'sector', labelKey: 'common.sector', type: 'select', options: SECTORS.map(function (s) { return { value: s, labelKey: 'common.' + s }; }) },
        { name: 'category', labelKey: 'apm.category', type: 'select', options: categoryOptions(sector) },
        { name: 'criticality', labelKey: 'apm.criticality', type: 'select', options: CRITICALITIES.map(function (c) { return { value: c, labelKey: 'apm.crit.' + c }; }) },
        { name: 'status', labelKey: 'apm.assetStatus', type: 'select', options: STATUSES.map(function (s) { return { value: s, labelKey: 'apm.statuses.' + s }; }) },
        { name: 'pof', labelKey: 'apm.pof', type: 'number', min: 1, max: 5, required: true },
        { name: 'cof', labelKey: 'apm.cof', type: 'number', min: 1, max: 5, required: true },
        { name: 'inspectionBaseMonths', labelKey: 'apm.inspectionBase', type: 'number', min: 1, required: true },
        { name: 'nextInspectionISO', labelKey: 'apm.nextInspection', type: 'date' },
        { name: 'availabilityOverridePct', labelKey: 'apm.availabilityOverride', type: 'number', min: 0, max: 100 },
        { name: 'notes', labelKey: 'common.notes', type: 'textarea' }
      ];
      var values = asset ? {
        code: asset.code, name: asset.name, sector: asset.sector, category: asset.category,
        criticality: asset.criticality, status: asset.status, pof: (asset.rbi && asset.rbi.pof) || 1,
        cof: (asset.rbi && asset.rbi.cof) || 1, inspectionBaseMonths: (asset.rbi && asset.rbi.inspectionBaseMonths) || 24,
        nextInspectionISO: toDateInput((asset.rbi && asset.rbi.nextInspectionISO)),
        availabilityOverridePct: asset.availabilityOverridePct, notes: asset.notes
      } : { sector: 'upstream', category: (SECTOR_CATEGORIES.upstream[0]), criticality: 'C', status: 'running', pof: 1, cof: 1, inspectionBaseMonths: 24 };
      var f = u.form(fields, values);

      // Live RBI band + interval suggestion.
      var bandEl = el('span', { class: 'badge badge-neutral', text: t('apm.bands.low') });
      var suggestEl = el('span', { class: 'pill' });
      var body = el('div', null, f.node, el('div', { class: 'row' }, el('span', { text: t('apm.riskBand') }), bandEl, suggestEl));

      function syncLive() {
        var apm = calcApm();
        var pof = Number(f.node.querySelector('#fld-pof').value) || 1;
        var cof = Number(f.node.querySelector('#fld-cof').value) || 1;
        var base = Number(f.node.querySelector('#fld-inspectionBaseMonths').value) || 24;
        if (apm) {
          var r = apm.rbiRisk({ pof: pof, cof: cof });
          bandEl.textContent = t('apm.bands.' + r.band);
          bandEl.className = 'badge ' + bandClass(r.band);
          var interval = apm.inspectionIntervalMonths({ band: r.band, baseMonths: base });
          var next = apm.nextInspectionDate({ fromISO: new Date().toISOString(), months: interval });
          suggestEl.textContent = t('apm.suggestedInterval') + ': ' + fmtNum(interval, 1) + ' ' + t('common.months');
          var dateInput = f.node.querySelector('#fld-nextInspectionISO');
          if (dateInput && !dateInput.value) { dateInput.value = toDateInput(next); }
        }
      }

      setTimeout(function () {
        ['#fld-pof', '#fld-cof', '#fld-inspectionBaseMonths'].forEach(function (sel) {
          var node = f.node.querySelector(sel);
          if (node) { node.addEventListener('change', syncLive); node.addEventListener('input', syncLive); }
        });
        var sectorSel = f.node.querySelector('#fld-sector');
        if (sectorSel) {
          sectorSel.addEventListener('change', function () {
            var catSel = f.node.querySelector('#fld-category');
            if (!catSel) { return; }
            var opts = categoryOptions(sectorSel.value);
            catSel.textContent = '';
            opts.forEach(function (o) { catSel.appendChild(el('option', { attrs: { value: o.value }, text: t(o.labelKey) })); });
            if (opts.length) { catSel.value = opts[0].value; }
          });
        }
        syncLive();
      }, 0);

      var dlg = u.dialog({
        titleKey: asset ? 'apm.editAsset' : 'apm.newAsset',
        bodyNode: body,
        actions: [
          { labelKey: 'common.cancel', kind: 'ghost', onClick: function () { return true; } },
          {
            labelKey: 'common.save', kind: 'primary', onClick: function () {
              if (!f.validate()) { return false; }
              var v = f.getValues();
              var rec = {
                id: asset ? asset.id : newId('apm'),
                code: v.code, name: v.name, sector: v.sector || 'upstream',
                category: v.category || (SECTOR_CATEGORIES[v.sector || 'upstream'][0]),
                criticality: v.criticality || 'C', status: v.status || 'running',
                rbi: {
                  pof: v.pof, cof: v.cof,
                  band: undefined, score: undefined,
                  inspectionBaseMonths: v.inspectionBaseMonths || 24,
                  nextInspectionISO: v.nextInspectionISO ? fromDateInput(v.nextInspectionISO) : undefined
                },
                availabilityOverridePct: v.availabilityOverridePct == null ? undefined : Number(v.availabilityOverridePct),
                notes: v.notes || undefined
              };
              var apm = calcApm();
              if (apm) {
                var r = apm.rbiRisk({ pof: rec.rbi.pof, cof: rec.rbi.cof });
                rec.rbi.band = r.band;
                rec.rbi.score = r.score;
              }
              repos.apmAssets.save(rec).then(function () { dlg.close(); }).catch(function (err) { consoleError(err); u.toast('common.error', { severity: 'critical' }); });
              return false;
            }
          }
        ]
      });
    }

    function categoryOptions(sector) {
      var list = SECTOR_CATEGORIES[sector] || SECTOR_CATEGORIES.upstream;
      return list.map(function (c) { return { value: c, labelKey: 'apm.categories.' + c }; });
    }

    function openEventForm(asset) {
      var fields = [
        { name: 'type', labelKey: 'apm.eventType', type: 'select', options: EVENT_TYPES.map(function (e) { return { value: e, labelKey: 'apm.eventTypes.' + e }; }) },
        { name: 'start', labelKey: 'apm.start', type: 'date', required: true },
        { name: 'end', labelKey: 'apm.end', type: 'date' },
        { name: 'downtimeH', labelKey: 'apm.downtime', type: 'number', min: 0 },
        { name: 'description', labelKey: 'common.notes', type: 'textarea' },
        { name: 'workOrderRef', labelKey: 'apm.workOrderRef', type: 'text' }
      ];
      var f = u.form(fields, { type: 'failure', start: new Date().toISOString().slice(0, 10) });
      var dlg = u.dialog({
        titleKey: 'apm.newEvent',
        bodyNode: f.node,
        actions: [
          { labelKey: 'common.cancel', kind: 'ghost', onClick: function () { return true; } },
          {
            labelKey: 'common.save', kind: 'primary', onClick: function () {
              if (!f.validate()) { return false; }
              var v = f.getValues();
              var startIso = v.start ? fromDateInput(v.start) : new Date().toISOString();
              var endIso = v.end ? fromDateInput(v.end) : undefined;
              if (endIso && Date.parse(endIso) < Date.parse(startIso)) {
                u.toast('apm.endBeforeStart', { severity: 'warning' });
                return false;
              }
              var downtime = (v.downtimeH == null || v.downtimeH === '') ? (endIso ? Math.max(0, (Date.parse(endIso) - Date.parse(startIso)) / HOUR_MS) : 0) : Number(v.downtimeH);
              var rec = {
                id: newId('evt'),
                assetId: asset.id,
                type: v.type || 'failure',
                start: startIso,
                end: endIso,
                downtimeH: downtime,
                description: v.description || undefined,
                workOrderRef: v.workOrderRef || undefined
              };
              repos.apmEvents.save(rec).then(function () { dlg.close(); }).catch(function (err) { consoleError(err); u.toast('common.error', { severity: 'critical' }); });
              return false;
            }
          }
        ]
      });
    }

    if (assetId) { drawDetail(assetId); } else { drawList(); }
  }

  return {
    id: 'apm',
    titleKey: 'nav.apm',
    icon: 'apm',
    render: render,
    computeMetrics: computeMetrics,
    healthLevel: healthLevel
  };
});
