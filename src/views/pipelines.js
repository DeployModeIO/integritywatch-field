/* IntegrityWatch Field — pipelines view
   Pipeline systems list, system detail with embedded schematic map, and CRUD
   for line assets and inspections. */
(function (root, factory) {
  'use strict';
  var api = factory(root);
  root.IW = root.IW || {};
  root.IW.views = root.IW.views || {};
  root.IW.views.pipelines = api;
  if (typeof module === 'object' && module.exports) { module.exports = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  var ASSET_TYPES = ['sectionValve', 'blockValve', 'flange', 'fitting', 'pumpStation', 'compressorStation', 'tank', 'sump', 'valveChamber', 'crossing', 'row', 'meteringStation'];
  var INSP_TYPES = ['ild', 'externalCorrosion', 'visual', 'ut', 'repair', 'replacement'];
  var SEVERITIES = ['low', 'moderate', 'high', 'severe'];
  var PRODUCTS = ['crude', 'gas', 'products', 'water'];
  var SIDES = ['left', 'right', 'center'];
  var DAY_MS = 86400000;

  var _session = null;
  var _pendingScrollAsset = null;

  function teardown() {
    if (_session) {
      _session.active = false;
      (_session.offs || []).forEach(function (off) { if (typeof off === 'function') { off(); } });
      if (_session.mapHandle && typeof _session.mapHandle.destroy === 'function') { _session.mapHandle.destroy(); }
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
  function lockApi() { return root.IW.security && root.IW.security.lock; }

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
    var d = (digits === undefined || digits === null) ? 2 : digits;
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

  function materialOptions() {
    var mats = root.IW.data && root.IW.data.materials;
    var list = (mats && typeof mats.list === 'function') ? mats.list() : [];
    return list.map(function (m) { return { value: m.id, labelKey: m.name }; });
  }

  function productOptions() {
    return PRODUCTS.map(function (p) { return { value: p, labelKey: 'pipelines.products.' + p }; });
  }

  function typeOptions() {
    return ASSET_TYPES.map(function (t) { return { value: t, labelKey: 'pipelines.types.' + t }; });
  }

  function inspTypeOptions() {
    return INSP_TYPES.map(function (t) { return { value: t, labelKey: 'pipelines.inspTypes.' + t }; });
  }

  function severityOptions() {
    return SEVERITIES.map(function (s) { return { value: s, labelKey: 'severity.' + s }; });
  }

  function sideOptions() {
    return SIDES.map(function (s) { return { value: s, labelKey: 'pipelines.sides.' + s }; });
  }

  // Pure: group inspections into campaigns by type + month (YYYY-MM).
  function groupCampaigns(inspections) {
    var map = {};
    (inspections || []).forEach(function (insp) {
      var type = insp.type || 'unknown';
      var month = (insp.date || '').slice(0, 7);
      var key = type + '|' + month;
      if (!map[key]) { map[key] = { type: type, month: month, count: 0 }; }
      map[key].count += 1;
    });
    return Object.keys(map).map(function (k) { return map[k]; }).sort(function (a, b) {
      if (a.month !== b.month) { return a.month < b.month ? -1 : 1; }
      return a.type < b.type ? -1 : 1;
    });
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

  function matchesFilter(asset, filter) {
    filter = filter || {};
    var okType = !filter.type || (asset.type === filter.type);
    var okSev = !filter.severity || ((asset.integritySeverity || '') === filter.severity);
    return okType && okSev;
  }

  function certBadge(iso, t, nowMs) {
    if (!iso) { return el('span', { class: 'muted', text: t('common.none') }); }
    var d = Date.parse(iso);
    if (isNaN(d)) { return el('span', { class: 'muted', text: fmtDate(iso) }); }
    var days = (d - nowMs) / DAY_MS;
    if (days < 0) {
      return el('span', { class: 'badge badge-severe', text: t('common.overdue') });
    }
    if (days < 90) {
      return el('span', { class: 'badge badge-moderate', text: t('pipelines.certExpirySoon') + ' (' + Math.ceil(days) + ' ' + t('common.days') + ')' });
    }
    return el('span', { class: 'num', text: fmtDate(iso) });
  }

  function render(container, ctx) {
    var u = ui();
    if (!u || typeof u.el !== 'function' || !container) { return; }
    teardown();
    _session = {
      active: true,
      container: container,
      offs: [],
      mapHandle: null,
      filters: { type: '', severity: '' },
      sortDir: 'asc',
      params: ctx.params || {}
    };
    var t = (typeof ctx.i18n === 'function') ? ctx.i18n : function (k) { return k; };
    var repos = ctx.repos;
    var bus = ctx.bus;
    var navigate = ctx.navigate || function () {};
    var systemId = ctx.params && ctx.params.id;

    function reload() {
      if (!_session || !_session.active) { return; }
      var id = _session.params && _session.params.id;
      if (id) { drawDetail(id); } else { drawList(); }
    }

    subscribe(bus, ['data:changed:pipelineSystems', 'data:changed:lineAssets', 'data:changed:lineInspections'], reload);

    function banner(err) {
      return el('div', { class: 'error-banner', attrs: { role: 'alert' }, text: t('common.error') + ': ' + (err && err.message ? err.message : String(err)) });
    }

    function loading() {
      return el('p', { class: 'empty-state', text: t('common.loading') });
    }

    // ------------------------------------------------------------------ list

    function drawList() {
      container.textContent = '';
      container.appendChild(loading());
      Promise.all([repos.pipelineSystems.list()]).then(function (res) {
        if (!_session || !_session.active) { return; }
        var systems = res[0] || [];
        container.textContent = '';
        var header = el('div', { class: 'page-header' },
          el('h1', { text: t('pipelines.title') }),
          el('div', { class: 'actions' },
            el('button', { class: 'btn btn-primary', on: { click: function () { openSystemForm(null); } } },
              icon('plus', 18), el('span', { text: t('pipelines.newSystem') }))));
        container.appendChild(header);

        var search = el('input', { class: 'input', attrs: { type: 'search', placeholder: t('common.search'), 'aria-label': t('common.search') } });
        search.value = _session.search || '';
        search.addEventListener('input', function () {
          _session.search = search.value;
          renderSystemsTable(systems);
        });
        var searchWrap = el('div', { class: 'field' }, search);
        container.appendChild(searchWrap);

        var tableHost = el('div');
        container.appendChild(tableHost);
        renderSystemsTable(systems);

        function renderSystemsTable(all) {
          var q = (_session.search || '').trim().toLowerCase();
          var rows = all.filter(function (s) {
            if (!q) { return true; }
            return (String(s.name || '').toLowerCase().indexOf(q) !== -1) ||
              (String(s.operator || '').toLowerCase().indexOf(q) !== -1);
          });
          tableHost.textContent = '';
          var columns = [
            { key: 'name', labelKey: 'pipelines.systemName', render: function (v, row) { return el('button', { class: 'link', text: v, on: { click: function () { navigate('#/pipelines/' + row.id); } } }); } },
            { key: 'operator', labelKey: 'pipelines.operator' },
            { key: 'product', labelKey: 'pipelines.product', render: function (v) { return document.createTextNode(t('pipelines.products.' + (v || 'crude'))); } },
            { key: 'dnIn', labelKey: 'pipelines.diameter', align: 'num', render: function (v) { return document.createTextNode(v == null ? '' : fmtNum(v, 2) + ' in'); } },
            { key: 'lengthKm', labelKey: 'pipelines.length', align: 'num', render: function (v) { return document.createTextNode(v == null ? '' : fmtNum(v, 2) + ' ' + t('units.km')); } },
            { key: 'actions', labelKey: 'common.actions', render: function (v, row) { return systemActions(row); } }
          ];
          tableHost.appendChild(u.table({ columns: columns, rows: rows, captionKey: 'pipelines.systems', emptyKey: 'pipelines.noSystems' }));
        }
      }).catch(function (err) {
        if (_session && _session.active) { container.textContent = ''; container.appendChild(banner(err)); }
      });
    }

    function systemActions(system) {
      var locked = isOperatorLocked();
      var editBtn = el('button', { class: 'btn btn-ghost touch', attrs: { 'aria-label': t('common.edit') }, on: { click: function () { openSystemForm(system); } } }, icon('edit', 18));
      var delBtn = el('button', { class: 'btn btn-ghost touch', attrs: { 'aria-label': t('common.delete') }, on: { click: function () { deleteSystem(system); } } }, icon('trash', 18));
      delBtn.disabled = locked;
      return el('div', { class: 'row' }, editBtn, delBtn);
    }

    function deleteSystem(system) {
      u.confirmDialog({ titleKey: 'common.confirm', bodyKey: 'pipelines.deleteSystemConfirm', danger: true }).then(function (ok) {
        if (!ok) { return; }
        var jobs = [];
        repos.lineAssets.list().then(function (assets) {
          (assets || []).forEach(function (a) { if (a.systemId === system.id) { jobs.push(repos.lineAssets.remove(a.id)); } });
        }).then(function () {
          return repos.lineInspections.list().then(function (insps) {
            (insps || []).forEach(function (i) { if (i.systemId === system.id) { jobs.push(repos.lineInspections.remove(i.id)); } });
          });
        }).then(function () {
          return Promise.all(jobs).then(function () { return repos.pipelineSystems.remove(system.id); });
        }).catch(function (err) {
          if (typeof console !== 'undefined' && typeof console.error === 'function') { console.error(err); }
        });
      });
    }

    // ---------------------------------------------------------------- detail

    function drawDetail(systemId) {
      if (_session.mapHandle) { _session.mapHandle.destroy(); _session.mapHandle = null; }
      container.textContent = '';
      container.appendChild(loading());
      Promise.all([
        repos.pipelineSystems.get(systemId),
        repos.lineAssets.list(),
        repos.lineInspections.list()
      ]).then(function (res) {
        if (!_session || !_session.active) { return; }
        var system = res[0];
        var allAssets = res[1] || [];
        var allInspections = res[2] || [];
        if (!system) {
          container.textContent = '';
          container.appendChild(el('p', { class: 'empty-state', text: t('pipelines.noSystems') }));
          return;
        }
        var assets = allAssets.filter(function (a) { return a.systemId === system.id; });
        var inspections = allInspections.filter(function (i) { return i.systemId === system.id || i.lineAssetId; });
        inspections = inspections.filter(function (i) {
          if (i.systemId === system.id) { return true; }
          return assets.some(function (a) { return a.id === i.lineAssetId; });
        });
        container.textContent = '';
        renderDetail(system, assets, inspections);
      }).catch(function (err) {
        if (_session && _session.active) { container.textContent = ''; container.appendChild(banner(err)); }
      });
    }

    function renderDetail(system, assets, inspections) {
      var nowMs = Date.now();
      var locked = isOperatorLocked();

      var backBtn = el('button', { class: 'btn btn-ghost', on: { click: function () { navigate('#/pipelines'); } } }, icon('chevron-right', 18), el('span', { text: t('common.back') }));
      var editSysBtn = el('button', { class: 'btn btn-ghost', on: { click: function () { openSystemForm(system); } } }, icon('edit', 18), el('span', { text: t('common.edit') }));
      var delSysBtn = el('button', { class: 'btn btn-ghost', on: { click: function () { deleteSystem(system); } } }, icon('trash', 18), el('span', { text: t('common.delete') }));
      delSysBtn.disabled = locked;
      container.appendChild(el('div', { class: 'page-header' },
        backBtn,
        el('h1', { text: system.name || system.id }),
        el('div', { class: 'actions' }, editSysBtn, delSysBtn)));

      // Ficha
      var mat = (root.IW.data && root.IW.data.materials && root.IW.data.materials.byId) ? root.IW.data.materials.byId(system.material) : null;
      container.appendChild(el('section', { class: 'card' },
        el('h2', { class: 'section-title', text: t('pipelines.systemName') }),
        u.keyValueTable([
          [t('pipelines.operator'), document.createTextNode(system.operator || t('common.unknown'))],
          [t('pipelines.product'), document.createTextNode(t('pipelines.products.' + (system.product || 'crude')))],
          [t('pipelines.diameter'), el('span', { class: 'num', text: fmtNum(system.dnIn, 2) + ' in' })],
          [t('pipelines.wallThickness'), el('span', { class: 'num', text: fmtNum(system.wallThicknessMm, 2) + ' mm' })],
          [t('corrosion.material'), document.createTextNode(mat ? mat.name : (system.material || t('common.unknown')))],
          [t('pipelines.coating'), document.createTextNode(system.coating || t('common.none'))],
          [t('pipelines.length'), el('span', { class: 'num', text: fmtNum(system.lengthKm, 2) + ' ' + t('units.km') })],
          [t('pipelines.stationRange'), el('span', { class: 'num', text: fmtNum(system.stationFromKm, 2) + ' – ' + fmtNum(system.stationToKm, 2) + ' ' + t('units.km') })],
          [t('common.notes'), document.createTextNode(system.notes || t('common.none'))]
        ])));

      // Filters (dim map nodes and table rows)
      var filterBar = buildFilterBar(assets);
      container.appendChild(filterBar);

      // Embedded schematic map
      var mapHost = el('div');
      container.appendChild(el('section', { class: 'card map-card' },
        el('h2', { class: 'section-title', text: t('pipelines.mapView') }),
        mapHost));
      var mapModule = root.IW.views && root.IW.views.pipelineMap;
      if (mapModule && typeof mapModule.renderInto === 'function') {
        _session.mapHandle = mapModule.renderInto(mapHost, {
          system: system,
          lineAssets: assets,
          inspections: inspections,
          t: t,
          navigate: navigate,
          onRequestDetail: function (asset) {
            _pendingScrollAsset = asset && asset.code;
            navigate('#/pipelines/' + system.id);
          }
        });
        _session.mapHandle.setFilter(_session.filters);
      }

      // Assets table (sortable by stationKm)
      var assetsHost = el('div');
      container.appendChild(el('section', { class: 'card' },
        el('div', { class: 'row' },
          el('h2', { class: 'section-title', text: t('pipelines.lineAssets') }),
          el('button', { class: 'btn btn-primary', on: { click: function () { openAssetForm(system, null, assets); } } }, icon('plus', 18), el('span', { text: t('pipelines.newLineAsset') }))),
        assetsHost));
      renderAssetsTable(system, assets, inspections, assetsHost);

      // Certificates expiring soon
      var expiring = assets.filter(function (a) {
        if (!a.certExpiryISO) { return false; }
        var d = Date.parse(a.certExpiryISO);
        return !isNaN(d) && (d - nowMs) >= 0 && (d - nowMs) < 90 * DAY_MS;
      });
      if (expiring.length) {
        container.appendChild(el('div', { class: 'row notice', attrs: { role: 'note' } },
          icon('alert-warning', 18),
          el('span', { text: t('pipelines.certExpirySoon') + ': ' + expiring.map(function (a) { return a.code || a.name; }).join(', ') })));
      }

      // Inspections
      var inspHost = el('div');
      container.appendChild(el('section', { class: 'card' },
        el('div', { class: 'row' },
          el('h2', { class: 'section-title', text: t('pipelines.inspections') }),
          el('button', { class: 'btn btn-primary', on: { click: function () { openInspectionForm(system, assets, null); } } }, icon('plus', 18), el('span', { text: t('pipelines.newInspection') }))),
        inspHost));
      renderInspections(assets, inspections, inspHost);

      // Campaigns
      var campaigns = groupCampaigns(inspections);
      if (campaigns.length) {
        container.appendChild(el('section', { class: 'card' },
          el('h2', { class: 'section-title', text: t('pipelines.campaigns') }),
          el('ul', { class: 'campaign-list' }, campaigns.map(function (c) {
            return el('li', null,
              el('span', { text: t('pipelines.inspTypes.' + c.type) }),
              el('span', { class: 'pill', text: c.month }),
              el('span', { class: 'num', text: String(c.count) }));
          }))));
      }

      if (_pendingScrollAsset) {
        var target = _pendingScrollAsset;
        _pendingScrollAsset = null;
        setTimeout(function () {
          var row = container.querySelector('[data-asset-code="' + target + '"]');
          if (row && typeof row.scrollIntoView === 'function') { row.scrollIntoView({ block: 'center' }); }
        }, 0);
      }
    }

    function buildFilterBar(assets) {
      var typeSel = el('select', { class: 'select', attrs: { 'aria-label': t('pipelines.filterType') } });
      typeSel.appendChild(el('option', { attrs: { value: '' }, text: t('pipelines.allTypes') }));
      ASSET_TYPES.forEach(function (ty) {
        typeSel.appendChild(el('option', { attrs: { value: ty }, text: t('pipelines.types.' + ty) }));
      });
      typeSel.value = _session.filters.type || '';

      var sevSel = el('select', { class: 'select', attrs: { 'aria-label': t('pipelines.filterSeverity') } });
      sevSel.appendChild(el('option', { attrs: { value: '' }, text: t('pipelines.allSeverities') }));
      SEVERITIES.forEach(function (s) {
        sevSel.appendChild(el('option', { attrs: { value: s }, text: t('severity.' + s) }));
      });
      sevSel.value = _session.filters.severity || '';

      function applyFilters() {
        _session.filters = { type: typeSel.value, severity: sevSel.value };
        if (_session.mapHandle && typeof _session.mapHandle.setFilter === 'function') { _session.mapHandle.setFilter(_session.filters); }
        // Re-render table rows with dimming.
        var allRows = container.querySelectorAll('[data-asset-row]');
        Array.prototype.forEach.call(allRows, function (row) {
          var a = assets.find(function (x) { return x.id === row.getAttribute('data-asset-row'); });
          if (!a) { return; }
          if (matchesFilter(a, _session.filters)) { row.classList.remove('dimmed'); }
          else { row.classList.add('dimmed'); }
        });
      }

      typeSel.addEventListener('change', applyFilters);
      sevSel.addEventListener('change', applyFilters);

      return el('div', { class: 'page-toolbar' },
        el('span', { class: 'pill', text: t('common.filter') }), typeSel, sevSel);
    }

    function renderAssetsTable(system, assets, inspections, host) {
      var sorted = assets.slice().sort(function (a, b) {
        var ka = (typeof a.stationKm === 'number') ? a.stationKm : Number(a.stationKm) || 0;
        var kb = (typeof b.stationKm === 'number') ? b.stationKm : Number(b.stationKm) || 0;
        return _session.sortDir === 'asc' ? ka - kb : kb - ka;
      });
      host.textContent = '';
      var wrap = el('div', { class: 'table-wrap' });
      var tbl = el('table', { class: 'data' });
      tbl.appendChild(el('caption', { text: t('pipelines.lineAssets') }));
      var thead = el('thead');
      var htr = el('tr');
      var thKm = el('th', { attrs: { scope: 'col' } }, el('button', { class: 'sortable-th', text: t('pipelines.stationKm') + (_session.sortDir === 'asc' ? ' ↑' : ' ↓'), on: { click: function () { _session.sortDir = _session.sortDir === 'asc' ? 'desc' : 'asc'; renderAssetsTable(system, assets, inspections, host); } } }));
      htr.appendChild(thKm);
      htr.appendChild(el('th', { attrs: { scope: 'col' }, text: t('pipelines.assetCode') }));
      htr.appendChild(el('th', { attrs: { scope: 'col' }, text: t('pipelines.assetName') }));
      htr.appendChild(el('th', { attrs: { scope: 'col' }, text: t('pipelines.assetType') }));
      htr.appendChild(el('th', { attrs: { scope: 'col' }, text: t('pipelines.side') }));
      htr.appendChild(el('th', { attrs: { scope: 'col' }, text: t('common.severity') }));
      htr.appendChild(el('th', { attrs: { scope: 'col' }, text: t('pipelines.lastInspection') }));
      htr.appendChild(el('th', { attrs: { scope: 'col' }, text: t('pipelines.certExpiry') }));
      htr.appendChild(el('th', { attrs: { scope: 'col' }, text: t('common.actions') }));
      thead.appendChild(htr);
      tbl.appendChild(thead);
      var tbody = el('tbody');
      if (sorted.length === 0) {
        tbody.appendChild(el('tr', null, el('td', { class: 'empty-state', attrs: { colspan: '8' }, text: t('pipelines.noAssets') })));
      } else {
        sorted.forEach(function (a) {
          var dim = !matchesFilter(a, _session.filters);
          var tr = el('tr', { dataset: { assetRow: a.id, assetCode: a.code || '' } });
          if (dim) { tr.classList.add('dimmed'); }
          tr.appendChild(el('td', null, el('span', { class: 'num', text: fmtNum(a.stationKm, 2) })));
          tr.appendChild(el('td', { text: a.code || '' }));
          tr.appendChild(el('td', { text: a.name || '' }));
          tr.appendChild(el('td', { text: t('pipelines.types.' + (a.type || 'sectionValve')) }));
          tr.appendChild(el('td', { text: t('pipelines.sides.' + (a.side || 'center')) }));
          var sevTd = el('td');
          if (a.integritySeverity) { sevTd.appendChild(u.severityBadge(a.integritySeverity)); }
          else { sevTd.appendChild(el('span', { class: 'badge badge-neutral', text: t('common.none') })); }
          tr.appendChild(sevTd);
          var li = lastInspectionFor(a.id, inspections);
          tr.appendChild(el('td', { text: li ? fmtDate(li) : t('common.none') }));
          tr.appendChild(el('td', null, certBadge(a.certExpiryISO, t, Date.now())));
          var actTd = el('td', null, el('div', { class: 'row' },
            el('button', { class: 'btn btn-ghost touch', attrs: { 'aria-label': t('common.edit') }, on: { click: function () { openAssetForm(system, a, assets); } } }, icon('edit', 18)),
            (function () { var b = el('button', { class: 'btn btn-ghost touch', attrs: { 'aria-label': t('common.delete') }, on: { click: function () { deleteAsset(a); } } }, icon('trash', 18)); b.disabled = isOperatorLocked(); return b; })()));
          tr.appendChild(actTd);
          tbody.appendChild(tr);
        });
      }
      tbl.appendChild(tbody);
      wrap.appendChild(tbl);
      host.appendChild(wrap);
    }

    function renderInspections(assets, inspections, host) {
      var sorted = inspections.slice().sort(function (a, b) { return (a.date < b.date) ? 1 : -1; });
      host.textContent = '';
      var wrap = el('div', { class: 'table-wrap' });
      var tbl = el('table', { class: 'data' });
      tbl.appendChild(el('caption', { text: t('pipelines.inspections') }));
      var thead = el('thead');
      var htr = el('tr');
      ['pipelines.inspectionType', 'common.date', 'pipelines.fromKm', 'pipelines.toKm', 'common.severity', 'pipelines.findings', 'common.actions'].forEach(function (k) {
        htr.appendChild(el('th', { attrs: { scope: 'col' }, text: t(k) }));
      });
      thead.appendChild(htr);
      tbl.appendChild(thead);
      var tbody = el('tbody');
      if (sorted.length === 0) {
        tbody.appendChild(el('tr', null, el('td', { class: 'empty-state', attrs: { colspan: '7' }, text: t('pipelines.noInspections') })));
      } else {
        sorted.forEach(function (i) {
          var tr = el('tr');
          tr.appendChild(el('td', { text: t('pipelines.inspTypes.' + (i.type || 'visual')) }));
          tr.appendChild(el('td', { text: fmtDate(i.date) }));
          tr.appendChild(el('td', null, el('span', { class: 'num', text: i.fromKm == null ? '—' : fmtNum(i.fromKm, 2) })));
          tr.appendChild(el('td', null, el('span', { class: 'num', text: i.toKm == null ? '—' : fmtNum(i.toKm, 2) })));
          var sevTd = el('td');
          if (i.severity) { sevTd.appendChild(u.severityBadge(i.severity)); }
          else { sevTd.appendChild(el('span', { class: 'muted', text: t('common.none') })); }
          tr.appendChild(sevTd);
          tr.appendChild(el('td', { text: i.findings || '' }));
          tr.appendChild(el('td', null, el('div', { class: 'row' },
            (function () { var b = el('button', { class: 'btn btn-ghost touch', attrs: { 'aria-label': t('common.delete') }, on: { click: function () { deleteInspection(i); } } }, icon('trash', 18)); b.disabled = isOperatorLocked(); return b; })())));
          tbody.appendChild(tr);
        });
      }
      tbl.appendChild(tbody);
      wrap.appendChild(tbl);
      host.appendChild(wrap);
    }

    function deleteAsset(asset) {
      u.confirmDialog({ titleKey: 'common.confirm', bodyKey: 'pipelines.deleteLineAssetConfirm', danger: true }).then(function (ok) {
        if (ok) { repos.lineAssets.remove(asset.id).catch(function (err) { consoleError(err); }); }
      });
    }

    function deleteInspection(insp) {
      u.confirmDialog({ titleKey: 'common.confirm', bodyKey: 'pipelines.deleteInspectionConfirm', danger: true }).then(function (ok) {
        if (ok) { repos.lineInspections.remove(insp.id).catch(function (err) { consoleError(err); }); }
      });
    }

    function consoleError(err) {
      if (typeof console !== 'undefined' && typeof console.error === 'function') { console.error(err); }
    }

    // ---------------------------------------------------------------- forms

    function openSystemForm(system) {
      var fields = [
        { name: 'name', labelKey: 'pipelines.systemName', type: 'text', required: true },
        { name: 'operator', labelKey: 'pipelines.operator', type: 'text', required: true },
        { name: 'product', labelKey: 'pipelines.product', type: 'select', options: productOptions() },
        { name: 'dnIn', labelKey: 'pipelines.diameter', type: 'number', min: 0, required: true },
        { name: 'wallThicknessMm', labelKey: 'pipelines.wallThickness', type: 'number', min: 0, required: true },
        { name: 'material', labelKey: 'corrosion.material', type: 'select', options: materialOptions() },
        { name: 'coating', labelKey: 'pipelines.coating', type: 'text' },
        { name: 'lengthKm', labelKey: 'pipelines.length', type: 'number', min: 0, required: true },
        { name: 'stationFromKm', labelKey: 'pipelines.stationFromKm', type: 'number', min: 0, required: true },
        { name: 'stationToKm', labelKey: 'pipelines.stationToKm', type: 'number', min: 0, required: true },
        { name: 'notes', labelKey: 'common.notes', type: 'textarea' }
      ];
      var values = system ? {
        name: system.name, operator: system.operator, product: system.product, dnIn: system.dnIn,
        wallThicknessMm: system.wallThicknessMm, material: system.material, coating: system.coating,
        lengthKm: system.lengthKm, stationFromKm: system.stationFromKm, stationToKm: system.stationToKm, notes: system.notes
      } : { product: 'crude', material: (materialOptions()[0] && materialOptions()[0].value) };
      var f = u.form(fields, values);
      var dlg = u.dialog({
        titleKey: system ? 'pipelines.editSystem' : 'pipelines.newSystem',
        bodyNode: f.node,
        actions: [
          { labelKey: 'common.cancel', kind: 'ghost', onClick: function () { return true; } },
          {
            labelKey: 'common.save', kind: 'primary', onClick: function () {
              if (!f.validate()) { return false; }
              var v = f.getValues();
              var from = Number(v.stationFromKm);
              var to = Number(v.stationToKm);
              if (from >= to) {
                u.toast('pipelines.stationRangeError', { severity: 'warning' });
                return false;
              }
              var rec = {
                id: system ? system.id : newId('sys'),
                name: v.name, operator: v.operator, product: v.product || 'crude',
                dnIn: v.dnIn, wallThicknessMm: v.wallThicknessMm, material: v.material,
                coating: v.coating || undefined, lengthKm: v.lengthKm,
                stationFromKm: from, stationToKm: to, notes: v.notes || undefined
              };
              repos.pipelineSystems.save(rec).then(function () { dlg.close(); }).catch(function (err) { consoleError(err); u.toast('common.error', { severity: 'critical' }); });
              return false;
            }
          }
        ]
      });
    }

    function openAssetForm(system, asset, assets) {
      var fields = [
        { name: 'code', labelKey: 'pipelines.assetCode', type: 'text', required: true },
        { name: 'name', labelKey: 'pipelines.assetName', type: 'text' },
        { name: 'type', labelKey: 'pipelines.assetType', type: 'select', options: typeOptions() },
        { name: 'stationKm', labelKey: 'pipelines.stationKm', type: 'number', required: true },
        { name: 'side', labelKey: 'pipelines.side', type: 'select', options: sideOptions() },
        { name: 'certExpiryISO', labelKey: 'pipelines.certExpiry', type: 'date' },
        { name: 'notes', labelKey: 'common.notes', type: 'textarea' }
      ];
      var values = asset ? {
        code: asset.code, name: asset.name, type: asset.type, stationKm: asset.stationKm,
        side: asset.side, certExpiryISO: toDateInput(asset.certExpiryISO), notes: asset.notes
      } : { type: 'sectionValve', side: 'center' };
      var f = u.form(fields, values);
      var dlg = u.dialog({
        titleKey: asset ? 'pipelines.editLineAsset' : 'pipelines.newLineAsset',
        bodyNode: f.node,
        actions: [
          { labelKey: 'common.cancel', kind: 'ghost', onClick: function () { return true; } },
          {
            labelKey: 'common.save', kind: 'primary', onClick: function () {
              if (!f.validate()) { return false; }
              var v = f.getValues();
              var km = Number(v.stationKm);
              var from = Number(system.stationFromKm);
              var to = Number(system.stationToKm);
              if (!(to > from) || km < from || km > to) {
                u.toast('pipelines.stationKmRangeError', { severity: 'warning' });
                return false;
              }
              var rec = {
                id: asset ? asset.id : newId('la'),
                systemId: system.id,
                code: v.code, name: v.name || '', type: v.type || 'sectionValve',
                stationKm: km, side: v.side || 'center',
                certExpiryISO: v.certExpiryISO ? fromDateInput(v.certExpiryISO) : undefined,
                notes: v.notes || undefined
              };
              repos.lineAssets.save(rec).then(function () { dlg.close(); }).catch(function (err) { consoleError(err); u.toast('common.error', { severity: 'critical' }); });
              return false;
            }
          }
        ]
      });
    }

    function openInspectionForm(system, assets, inspection) {
      var assetOptions = [{ value: '', labelKey: 'common.none' }].concat(assets.map(function (a) {
        return { value: a.id, labelKey: (a.code || a.name || a.id) };
      }));
      var fields = [
        { name: 'type', labelKey: 'pipelines.inspectionType', type: 'select', options: inspTypeOptions() },
        { name: 'date', labelKey: 'common.date', type: 'date', required: true },
        { name: 'lineAssetId', labelKey: 'pipelines.assetType', type: 'select', options: assetOptions },
        { name: 'fromKm', labelKey: 'pipelines.fromKm', type: 'number' },
        { name: 'toKm', labelKey: 'pipelines.toKm', type: 'number' },
        { name: 'severity', labelKey: 'common.severity', type: 'select', options: severityOptions() },
        { name: 'findings', labelKey: 'pipelines.findings', type: 'textarea' },
        { name: 'reportRef', labelKey: 'pipelines.reportRef', type: 'text' }
      ];
      var values = inspection ? {
        type: inspection.type, date: toDateInput(inspection.date), lineAssetId: inspection.lineAssetId || '',
        fromKm: inspection.fromKm, toKm: inspection.toKm, severity: inspection.severity,
        findings: inspection.findings, reportRef: inspection.reportRef
      } : { type: 'visual', date: new Date().toISOString().slice(0, 10) };
      var f = u.form(fields, values);
      var dlg = u.dialog({
        titleKey: 'pipelines.newInspection',
        bodyNode: f.node,
        actions: [
          { labelKey: 'common.cancel', kind: 'ghost', onClick: function () { return true; } },
          {
            labelKey: 'common.save', kind: 'primary', onClick: function () {
              if (!f.validate()) { return false; }
              var v = f.getValues();
              var rec = {
                id: newId('insp'),
                systemId: system.id,
                type: v.type || 'visual',
                date: v.date ? fromDateInput(v.date) : new Date().toISOString(),
                lineAssetId: v.lineAssetId || undefined,
                fromKm: v.fromKm == null ? undefined : Number(v.fromKm),
                toKm: v.toKm == null ? undefined : Number(v.toKm),
                severity: v.severity || undefined,
                findings: v.findings || undefined,
                reportRef: v.reportRef || undefined
              };
              repos.lineInspections.save(rec).then(function () { dlg.close(); }).catch(function (err) { consoleError(err); u.toast('common.error', { severity: 'critical' }); });
              return false;
            }
          }
        ]
      });
    }

    if (systemId) { drawDetail(systemId); } else { drawList(); }
  }

  return {
    id: 'pipelines',
    titleKey: 'nav.pipelines',
    icon: 'pipeline',
    render: render,
    groupCampaigns: groupCampaigns
  };
});
