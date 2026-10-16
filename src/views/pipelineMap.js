/* IntegrityWatch Field — pipelineMap view
   Reusable schematic SVG map of line assets along a pipeline system, colored
   and shaped by integrity severity, with tooltip, side panel and filters. */
(function (root, factory) {
  'use strict';
  var api = factory(root);
  root.IW = root.IW || {};
  root.IW.views = root.IW.views || {};
  root.IW.views.pipelineMap = api;
  if (typeof module === 'object' && module.exports) { module.exports = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  var SEVERITIES = ['low', 'moderate', 'high', 'severe'];
  var ASSET_TYPES = ['sectionValve', 'blockValve', 'flange', 'fitting', 'pumpStation', 'compressorStation', 'tank', 'sump', 'valveChamber', 'crossing', 'row', 'meteringStation'];
  var SVG_NS = 'http://www.w3.org/2000/svg';
  var DAY_MS = 86400000;

  var _session = null;

  function teardown() {
    if (_session) {
      _session.active = false;
      (_session.offs || []).forEach(function (off) { if (typeof off === 'function') { off(); } });
      if (_session.handle && typeof _session.handle.destroy === 'function') { _session.handle.destroy(); }
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
  function icons() { return root.IW.ui && root.IW.ui.icons; }

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

  function svgEl(tag, attrs) {
    var node = document.createElementNS(SVG_NS, tag);
    for (var k in attrs) {
      if (Object.prototype.hasOwnProperty.call(attrs, k) && attrs[k] !== null && attrs[k] !== undefined) {
        node.setAttribute(k, String(attrs[k]));
      }
    }
    return node;
  }

  function shapeClass(sev) {
    return 'map-node map-node--' + (sev || 'none');
  }

  function matchesFilter(asset, filter) {
    filter = filter || {};
    var okType = !filter.type || (asset.type === filter.type);
    var okSev = !filter.severity || ((asset.integritySeverity || '') === filter.severity);
    return okType && okSev;
  }

  function lastInspectionFor(assetId, inspections) {
    var latest = null;
    (inspections || []).forEach(function (insp) {
      if (insp.lineAssetId === assetId && insp.date) {
        if (!latest || insp.date > latest) { latest = insp.date; }
      }
    });
    return latest;
  }

  function buildShape(sev) {
    if (sev === 'low') { return svgEl('circle', { r: 10, class: shapeClass(sev) }); }
    if (sev === 'moderate') { return svgEl('rect', { x: -9, y: -9, width: 18, height: 18, class: shapeClass(sev) }); }
    if (sev === 'high') { return svgEl('polygon', { points: '0,-11 10,9 -10,9', class: shapeClass(sev) }); }
    if (sev === 'severe') {
      var g = svgEl('g', { class: 'map-node-severe' });
      g.appendChild(svgEl('circle', { r: 12, class: 'map-node--severe-bg' }));
      g.appendChild(svgEl('path', { d: 'M-8,-8 L8,8 M-8,8 L8,-8', class: 'map-node map-node--severe' }));
      return g;
    }
    return svgEl('circle', { r: 10, class: shapeClass('none') });
  }

  function buildLegend(t) {
    var legend = el('div', { class: 'map-legend', attrs: { 'aria-label': t('pipelines.mapLegend') } });
    SEVERITIES.forEach(function (s) {
      legend.appendChild(el('span', { class: 'map-legend-item' },
        el('span', { class: 'shape shape-' + s, attrs: { 'aria-hidden': 'true' } }),
        el('span', { text: t('severity.' + s) })));
    });
    legend.appendChild(el('span', { class: 'map-legend-item' },
      el('span', { class: 'shape shape-none', attrs: { 'aria-hidden': 'true' } }),
      el('span', { text: t('common.none') })));
    return legend;
  }

  // Shared DOM helper (uses IW.ui.el when available).
  function el(tag, attrs) {
    var u = ui();
    if (u && typeof u.el === 'function') { return u.el.apply(u, arguments); }
    var node = document.createElement(tag);
    if (attrs && attrs.text !== undefined && attrs.text !== null) { node.textContent = attrs.text; }
    return node;
  }

  function renderInto(container, opts) {
    var u = ui();
    if (!u || typeof u.el !== 'function' || !container) { return { setFilter: function () {}, destroy: function () {} }; }
    var t = (typeof opts.t === 'function') ? opts.t : function (k) { return k; };
    var navigate = opts.navigate || function () {};
    var onRequestDetail = opts.onRequestDetail || null;
    var system = opts.system || {};
    var assets = (opts.lineAssets || []).slice().sort(function (a, b) {
      var ka = (typeof a.stationKm === 'number') ? a.stationKm : Number(a.stationKm) || 0;
      var kb = (typeof b.stationKm === 'number') ? b.stationKm : Number(b.stationKm) || 0;
      return ka - kb;
    });
    var inspections = opts.inspections || [];
    var from = (typeof system.stationFromKm === 'number') ? system.stationFromKm : (Number(system.stationFromKm) || 0);
    var to = (typeof system.stationToKm === 'number') ? system.stationToKm : (Number(system.stationToKm) || 0);
    if (!(to > from)) { to = from + 1; }

    var PAD = 70;
    var VIEW_W = 1000;
    var VIEW_H = 280;
    var LINE_Y = 140;
    var LANE = 60;
    var innerW = VIEW_W - 2 * PAD;

    function xOf(km) {
      var n = (typeof km === 'number') ? km : (Number(km) || from);
      return PAD + ((n - from) / (to - from)) * innerW;
    }
    function yOf(side) {
      if (side === 'left') { return LINE_Y - LANE; }
      if (side === 'right') { return LINE_Y + LANE; }
      return LINE_Y;
    }

    var wrap = el('div', { class: 'map-wrap' });
    wrap.appendChild(buildLegend(t));
    wrap.appendChild(el('p', { class: 'map-hint', text: t('pipelines.schematicHint') + ' (' + t('common.keyboardHint') + ')' }));

    var svg = svgEl('svg', {
      class: 'map-svg',
      viewBox: '0 0 ' + VIEW_W + ' ' + VIEW_H,
      preserveAspectRatio: 'xMidYMid meet',
      role: 'group',
      'aria-label': t('pipelines.mapView')
    });

    // Main line
    svg.appendChild(svgEl('line', { x1: PAD, y1: LINE_Y, x2: VIEW_W - PAD, y2: LINE_Y, class: 'map-line' }));
    // Station labels
    var startLabel = svgEl('text', { x: PAD, y: LINE_Y + 26, class: 'map-axis-label', 'text-anchor': 'middle' });
    startLabel.textContent = t('units.km') + ' ' + fmtNum(from, 1);
    svg.appendChild(startLabel);
    var endLabel = svgEl('text', { x: VIEW_W - PAD, y: LINE_Y + 26, class: 'map-axis-label', 'text-anchor': 'middle' });
    endLabel.textContent = t('units.km') + ' ' + fmtNum(to, 1);
    svg.appendChild(endLabel);
    // System name on the line
    var sysLabel = svgEl('text', { x: VIEW_W / 2, y: LINE_Y - 16, class: 'map-sys-label', 'text-anchor': 'middle' });
    sysLabel.textContent = system.name || system.id || '';
    svg.appendChild(sysLabel);

    var nodeGroups = [];
    var tooltip = el('div', { class: 'map-tooltip', attrs: { role: 'tooltip' } });
    tooltip.hidden = true;
    var detailPanel = el('div', { class: 'map-detail', attrs: { role: 'complementary', 'aria-label': t('pipelines.lineAssets') } });
    detailPanel.hidden = true;

    assets.forEach(function (a) {
      var sev = a.integritySeverity || '';
      var lastInsp = lastInspectionFor(a.id, inspections);
      var aria = t('pipelines.mapNodeAria') + ': ' + (a.code || '') + ' — ' + (a.name || '') +
        '. ' + t('common.severity') + ': ' + (sev ? t('severity.' + sev) : t('common.none')) +
        '. ' + t('pipelines.lastInspection') + ': ' + (lastInsp ? fmtDate(lastInsp) : t('common.none'));
      var g = svgEl('g', {
        class: 'map-node-group',
        transform: 'translate(' + xOf(a.stationKm) + ',' + yOf(a.side) + ')',
        role: 'button',
        tabindex: '0',
        'aria-label': aria
      });
      var title = svgEl('title');
      title.textContent = aria;
      g.appendChild(title);
      g.appendChild(buildShape(sev));

      g.addEventListener('mouseenter', function () { showTooltip(a, g, lastInsp); });
      g.addEventListener('mouseleave', function () { hideTooltip(); });
      g.addEventListener('focus', function () { showTooltip(a, g, lastInsp); });
      g.addEventListener('blur', function () { hideTooltip(); });
      g.addEventListener('click', function () { showDetail(a); });
      g.addEventListener('keydown', function (ev) {
        if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); showDetail(a); }
      });
      g.addEventListener('dblclick', function () {
        if (onRequestDetail) { onRequestDetail(a); }
        else { navigate('#/pipelines/' + system.id); }
      });

      svg.appendChild(g);
      nodeGroups.push({ group: g, asset: a });
    });

    wrap.appendChild(svg);
    wrap.appendChild(tooltip);
    wrap.appendChild(detailPanel);
    container.appendChild(wrap);

    function showTooltip(a, g, lastInsp) {
      tooltip.textContent = '';
      tooltip.appendChild(el('div', { class: 'map-tooltip__code', text: (a.code || '') + ' — ' + (a.name || '') }));
      tooltip.appendChild(el('div', { text: t('common.severity') + ': ' + (a.integritySeverity ? t('severity.' + a.integritySeverity) : t('common.none')) }));
      tooltip.appendChild(el('div', { text: t('pipelines.lastInspection') + ': ' + (lastInsp ? fmtDate(lastInsp) : t('common.none')) }));
      tooltip.hidden = false;
      positionTooltip(g);
    }

    function positionTooltip(g) {
      var wr = wrap.getBoundingClientRect();
      var gr = g.getBoundingClientRect();
      tooltip.style.setProperty('top', Math.max(0, gr.top - wr.top - 8) + 'px');
      tooltip.style.setProperty('left', Math.min(wr.width - 160, Math.max(0, gr.left - wr.left + 12)) + 'px');
    }

    function hideTooltip() {
      tooltip.hidden = true;
      tooltip.textContent = '';
    }

    function showDetail(a) {
      detailPanel.hidden = false;
      detailPanel.textContent = '';
      detailPanel.appendChild(el('h3', { text: (a.code || '') + ' — ' + (a.name || '') }));
      var lastInsp = lastInspectionFor(a.id, inspections);
      detailPanel.appendChild(u.keyValueTable([
        [t('pipelines.assetType'), document.createTextNode(t('pipelines.types.' + (a.type || 'sectionValve')))],
        [t('pipelines.stationKm'), el('span', { class: 'num', text: fmtNum(a.stationKm, 2) + ' ' + t('units.km') })],
        [t('pipelines.side'), document.createTextNode(t('pipelines.sides.' + (a.side || 'center')))],
        [t('common.severity'), a.integritySeverity ? u.severityBadge(a.integritySeverity) : document.createTextNode(t('common.none'))],
        [t('pipelines.lastInspection'), document.createTextNode(lastInsp ? fmtDate(lastInsp) : t('common.none'))],
        [t('pipelines.certExpiry'), document.createTextNode(a.certExpiryISO ? fmtDate(a.certExpiryISO) : t('common.none'))]
      ]));
      var openBtn = el('button', { class: 'btn btn-primary', text: t('pipelines.openAsset'), on: { click: function () {
        if (onRequestDetail) { onRequestDetail(a); }
        else { navigate('#/pipelines/' + system.id); }
      } } });
      detailPanel.appendChild(openBtn);
    }

    function setFilter(filter) {
      filter = filter || {};
      nodeGroups.forEach(function (entry) {
        var ok = matchesFilter(entry.asset, filter);
        if (ok) {
          entry.group.classList.remove('dimmed');
          entry.group.removeAttribute('aria-hidden');
          entry.group.setAttribute('tabindex', '0');
        } else {
          entry.group.classList.add('dimmed');
          entry.group.setAttribute('aria-hidden', 'true');
          entry.group.setAttribute('tabindex', '-1');
        }
      });
    }

    return {
      setFilter: setFilter,
      destroy: function () {
        hideTooltip();
        nodeGroups = [];
      }
    };
  }

  function render(container, ctx) {
    var u = ui();
    if (!u || typeof u.el !== 'function' || !container) { return; }
    teardown();
    _session = { active: true, container: container, offs: [], handle: null, filter: { type: '', severity: '' } };
    var t = (typeof ctx.i18n === 'function') ? ctx.i18n : function (k) { return k; };
    var repos = ctx.repos;
    var bus = ctx.bus;
    var navigate = ctx.navigate || function () {};
    var systemId = ctx.params && ctx.params.id;

    function el(tag, attrs) { return u.el.apply(u, arguments); }

    function draw() {
      container.textContent = '';
      container.appendChild(el('p', { class: 'empty-state', text: t('common.loading') }));
      Promise.all([repos.pipelineSystems.list(), repos.lineAssets.list(), repos.lineInspections.list()]).then(function (res) {
        if (!_session || !_session.active) { return; }
        var systems = res[0] || [];
        var allAssets = res[1] || [];
        var allInspections = res[2] || [];
        var system = null;
        if (systemId) { system = systems.find(function (s) { return s.id === systemId; }); }
        if (!system && systems.length) { system = systems[0]; }
        container.textContent = '';
        if (!system) {
          container.appendChild(el('p', { class: 'empty-state', text: t('pipelines.noSystems') }));
          return;
        }
        var assets = allAssets.filter(function (a) { return a.systemId === system.id; });
        var inspections = allInspections.filter(function (i) { return i.systemId === system.id; });
        if (systems.length > 1) {
          var sel = el('select', { class: 'select', attrs: { 'aria-label': t('pipelines.systemName') } });
          systems.forEach(function (s) {
            sel.appendChild(el('option', { attrs: { value: s.id }, text: s.name || s.id }));
          });
          sel.value = system.id;
          sel.addEventListener('change', function () { navigate('#/pipelines/' + sel.value); });
          container.appendChild(el('div', { class: 'field' }, sel));
        }
        // Filter toolbar
        var typeSel = el('select', { class: 'select', attrs: { 'aria-label': t('pipelines.filterType') } });
        typeSel.appendChild(el('option', { attrs: { value: '' }, text: t('pipelines.allTypes') }));
        ASSET_TYPES.forEach(function (ty) { typeSel.appendChild(el('option', { attrs: { value: ty }, text: t('pipelines.types.' + ty) })); });
        var sevSel = el('select', { class: 'select', attrs: { 'aria-label': t('pipelines.filterSeverity') } });
        sevSel.appendChild(el('option', { attrs: { value: '' }, text: t('pipelines.allSeverities') }));
        SEVERITIES.forEach(function (s) { sevSel.appendChild(el('option', { attrs: { value: s }, text: t('severity.' + s) })); });
        function apply() {
          _session.filter = { type: typeSel.value, severity: sevSel.value };
          if (_session.handle) { _session.handle.setFilter(_session.filter); }
        }
        typeSel.addEventListener('change', apply);
        sevSel.addEventListener('change', apply);
        container.appendChild(el('div', { class: 'row filter-bar' },
          el('span', { class: 'pill', text: t('common.filter') }), typeSel, sevSel));

        var host = el('div');
        container.appendChild(host);
        _session.handle = renderInto(host, {
          system: system, lineAssets: assets, inspections: inspections,
          t: t, navigate: navigate,
          onRequestDetail: function () { navigate('#/pipelines/' + system.id); }
        });
        _session.handle.setFilter(_session.filter);
      }).catch(function (err) {
        if (_session && _session.active) { container.textContent = ''; container.appendChild(el('div', { class: 'error-banner', attrs: { role: 'alert' }, text: t('common.error') + ': ' + String(err && err.message ? err.message : err) })); }
      });
    }

    subscribe(bus, ['data:changed:pipelineSystems', 'data:changed:lineAssets', 'data:changed:lineInspections'], draw);
    draw();
  }

  return {
    id: 'pipelineMap',
    titleKey: 'nav.pipelines',
    icon: 'pipeline',
    render: render,
    renderInto: renderInto
  };
});
