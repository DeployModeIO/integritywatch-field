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
  var ANOMALY_TYPES = ['metalLoss', 'crack', 'dent'];
  var DAY_MS = 86400000;
  var PAGE_SIZE = 50;

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
  function guardApi() { return root.IW.security && root.IW.security.permissions; }
  function stampRec(meta, rec, existing) {
    var perm = guardApi();
    return (perm && typeof perm.stamp === 'function') ? perm.stamp(meta, rec, existing) : Promise.resolve(rec);
  }

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

  function isDeleteLocked(meta) {
    var perm = guardApi();
    if (!perm || typeof perm.guard !== 'function') { return Promise.resolve(false); }
    return perm.guard(meta).can('delete').then(function (allowed) { return !allowed; });
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

  function anomalyTypeOptions() {
    return ANOMALY_TYPES.map(function (s) { return { value: s, labelKey: 'pipelines.' + s }; });
  }

  function pipelineAssessmentApi() { return (root.IW && root.IW.calc) ? root.IW.calc.pipelineAssessment : null; }

  // ------------------------------------------------------------- export (tarjeta)
  // Native: los campos que la propia vista y seed.js manejan. La cabecera de
  // columna es el NOMBRE CRUDO del campo — misma convención de 'ids crudos' de
  // src/export/templates.js y cero claves i18n nuevas (t('code') devuelve la
  // propia clave por passthrough). PHMSA/B31.8S: solo via
  // IW.export.templates.phmsa.performance; el B31G nunca se recalcula en la
  // plantilla: llega precomputado por buildAssessmentMap con los MISMOS
  // parametros de renderIliPanel (Su catalogo/414, D=dnIn*25.4, t, 0.72, op).
  var EXPORT_ROW_GUARD = 50000; // mas filas: xlsx/docx/pdf se bloquean (csv/json/xml pasan)
  var EXPORT_BASENAME = { pipelineSystems: 'ducto', lineAssets: 'activos', lineInspections: 'insp', iliAnomalies: 'ili' };
  var EXPORT_ENTITIES = ['pipelineSystems', 'lineAssets', 'lineInspections', 'iliAnomalies'];
  var EXPORT_ENTITY_LABEL_KEYS = {
    pipelineSystems: 'pipelines.systems', lineAssets: 'pipelines.lineAssets',
    lineInspections: 'pipelines.inspections', iliAnomalies: 'pipelines.iliAnomalies'
  };
  var NATIVE_FIELDS = {
    pipelineSystems: ['id', 'name', 'operator', 'product', 'dnIn', 'wallThicknessMm', 'material',
      'coating', 'lengthKm', 'stationFromKm', 'stationToKm', 'opPressureMpa', 'notes'],
    lineAssets: ['id', 'systemId', 'code', 'name', 'type', 'stationKm', 'side', 'certExpiryISO', 'notes'],
    lineInspections: ['id', 'systemId', 'type', 'date', 'lineAssetId', 'fromKm', 'toKm', 'severity',
      'findings', 'reportRef'],
    iliAnomalies: ['id', 'assetId', 'systemId', 'stationKm', 'depthPct', 'lengthMm', 'widthMm', 'type',
      'inspectionId', 'date']
  };

  // Puro: modelo de hoja unica con las columnas nativas de la entidad.
  function nativeTableModel(entity, records) {
    var fields = NATIVE_FIELDS[entity] || [];
    return {
      sections: [{
        type: 'table',
        titleKey: EXPORT_ENTITY_LABEL_KEYS[entity] || entity,
        columns: fields.map(function (f) { return { key: f, labelKey: f }; }),
        rows: (records || []).map(function (rec) {
          var row = {};
          fields.forEach(function (f) {
            row[f] = rec && rec[f] !== undefined && rec[f] !== null ? rec[f] : '';
          });
          return row;
        })
      }]
    };
  }

  // Puro: {sheets:[{sheetName,headers,rows:[array]}]} de templates → modelo de
  // DOS secciones table (una por hoja). titleKey = sheetName crudo; celdas c0..cN.
  function phmsaTableModel(phmsaOut) {
    var sheets = (phmsaOut && phmsaOut.sheets) || [];
    return {
      sections: sheets.map(function (sh) {
        var headers = (sh && sh.headers) || [];
        return {
          type: 'table',
          titleKey: (sh && sh.sheetName) || 'tabla',
          columns: headers.map(function (h, i) { return { key: 'c' + i, labelKey: String(h) }; }),
          rows: ((sh && sh.rows) || []).map(function (r) {
            var row = {};
            headers.forEach(function (h, i) {
              row['c' + i] = r[i] === undefined || r[i] === null ? '' : r[i];
            });
            return row;
          })
        };
      })
    };
  }

  // Puro-con-dependencias: id→{pAllow,exceeds} para PRES_ADMISIBLE_B31G,
  // reusando IW.calc.pipelineAssessment. Sin el modulo devuelve null (la
  // columna queda '' segun el contrato de templates).
  function buildAssessmentMap(systems, anomalies) {
    var pa = pipelineAssessmentApi();
    if (!pa || typeof pa.assessAnomalies !== 'function') { return null; }
    var mats = root.IW.data && root.IW.data.materials;
    var map = {};
    (systems || []).forEach(function (sys) {
      if (!sys || sys.dnIn == null || sys.wallThicknessMm == null || !sys.material) { return; }
      var Su = 414;
      if (mats && mats.byId) {
        var m = mats.byId(sys.material);
        if (m && m.smysMpa) { Su = m.smysMpa; }
      }
      var sysAnoms = (anomalies || []).filter(function (a) { return a && a.systemId === sys.id; });
      if (!sysAnoms.length) { return; }
      pa.assessAnomalies([], sysAnoms, {
        Su: Su, D: sys.dnIn * 25.4, t: sys.wallThicknessMm, designFactor: 0.72,
        opPressure: sys.opPressureMpa != null ? sys.opPressureMpa : 0
      }).forEach(function (r) {
        map[r.id] = { pAllow: r.pAllow, exceeds: r.exceeds };
      });
    });
    return map;
  }

  // IW.components.scan es OPCIONAL (mismo criterio que signaturePad/mapa): sin
  // el módulo los botones de GPS y foto con EXIF no se crean y el flujo de
  // inspección sigue funcionando igual.
  function scanApi() { return (root.IW && root.IW.components) ? root.IW.components.scan : null; }
  function hasGpsCapture() {
    var s = scanApi();
    return !!(s && typeof s.captureGps === 'function');
  }
  function hasPhotoExifReader() {
    var s = scanApi();
    return !!(s && typeof s.readPhotoExif === 'function');
  }

  // Campos de identidad/autoría/ingesta que NO viajan al duplicar un activo
  // (mismo criterio que views/apm.js).
  var COPY_DROP_FIELDS = ['id', 'createdAt', 'updatedAt', 'createdBy', 'updatedBy', 'quality', '__quality'];

  // Puro: copia superficial del activo menos los campos de identidad, con
  // code='' (el código es la clave de negocio y debe quedar libre para el
  // alta) y certExpiryISO en formato de input date. Devuelve solo los valores
  // que el formulario de línea conoce.
  function duplicatePresetValues(asset) {
    var shallow = {};
    Object.keys(asset || {}).forEach(function (k) {
      if (COPY_DROP_FIELDS.indexOf(k) === -1) { shallow[k] = asset[k]; }
    });
    shallow.code = '';
    return {
      code: '',
      name: shallow.name,
      type: shallow.type,
      stationKm: shallow.stationKm,
      side: shallow.side,
      certExpiryISO: toDateInput(shallow.certExpiryISO),
      notes: shallow.notes
    };
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

    var guard = (guardApi() && typeof guardApi().guard === 'function') ? guardApi().guard(repos.meta) : null;
    function requirePerm(action) {
      return guard ? guard.require(action) : Promise.resolve(true);
    }
    function isForbidden(err) {
      return !!(err && err.code === 'E_FORBIDDEN');
    }
    function forbiddenToast(err) {
      u.toast(isForbidden(err) ? 'security.forbidden' : 'common.error', { severity: isForbidden(err) ? 'warning' : 'critical' });
    }

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
      Promise.all([repos.pipelineSystems.list(), isDeleteLocked(repos.meta)]).then(function (res) {
        if (!_session || !_session.active) { return; }
        var systems = res[0] || [];
        var locked = res[1];
        container.textContent = '';
        var header = el('div', { class: 'page-header' },
          el('h1', { text: t('pipelines.title') }),
          el('div', { class: 'actions' },
            el('button', { class: 'btn btn-primary', attrs: { 'data-perm': 'assetWrite' }, on: { click: function () { openSystemForm(null); } } },
              icon('plus', 18), el('span', { text: t('pipelines.newSystem') }))));
        container.appendChild(header);

        var search = el('input', { class: 'input', attrs: { type: 'search', placeholder: t('common.search'), 'aria-label': t('common.search') } });
        search.value = _session.search || '';
        search.addEventListener('input', function () {
          _session.search = search.value;
          renderSystemsTable(systems, locked);
        });
        var searchWrap = el('div', { class: 'field' }, search);
        container.appendChild(searchWrap);

        var tableHost = el('div');
        container.appendChild(tableHost);
        renderSystemsTable(systems, locked);

        function renderSystemsTable(all, locked) {
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
            { key: 'actions', labelKey: 'common.actions', render: function (v, row) { return systemActions(row, locked); } }
          ];
          tableHost.appendChild(u.table({ columns: columns, rows: rows, captionKey: 'pipelines.systems', emptyKey: 'pipelines.noSystems' }));
        }

        renderExportCard();
      }).catch(function (err) {
        if (_session && _session.active) { container.textContent = ''; container.appendChild(banner(err)); }
      });
    }

    // Tarjeta de exportacion (misma familia que la barra de la vista Informes):
    // entidad × plantilla × alcance × formato. Guard de modulo ausente: si
    // IW.export.reportFormats no está cargado la tarjeta sencillamente no se
    // crea. La opcion PHMSA exige ademas IW.export.templates.phmsa.performance
    // y solo aparece con Sistemas o Anomalías ILI (las dos entidades que nutren
    // las hojas 'medidas_desempeno' y 'hallazgos_ili').
    function renderExportCard() {
      var fmts = root.IW.export && root.IW.export.reportFormats;
      if (!fmts || typeof fmts.produce !== 'function') { return; }
      var csvMod = root.IW.export && root.IW.export.csvWriter;
      var tpls = root.IW.export && root.IW.export.templates;
      var hasPhmsa = !!(tpls && tpls.phmsa && typeof tpls.phmsa.performance === 'function');

      var entitySel = el('select', { class: 'select', attrs: { 'aria-label': t('pipelines.title') } });
      EXPORT_ENTITIES.forEach(function (e) {
        entitySel.appendChild(el('option', { attrs: { value: e }, text: t(EXPORT_ENTITY_LABEL_KEYS[e]) }));
      });
      entitySel.value = 'pipelineSystems';

      var targetSel = el('select', { class: 'select', attrs: { 'aria-label': t('export.target') } });
      function paintTargetOptions() {
        var phmsaAllowed = hasPhmsa && (entitySel.value === 'iliAnomalies' || entitySel.value === 'pipelineSystems');
        targetSel.textContent = '';
        targetSel.appendChild(el('option', { attrs: { value: 'native' }, text: t('export.targetNative') }));
        if (phmsaAllowed) {
          targetSel.appendChild(el('option', { attrs: { value: 'phmsa' }, text: t('export.targetPhmsa') }));
        }
        targetSel.value = 'native';
      }
      entitySel.addEventListener('change', paintTargetOptions);
      paintTargetOptions();

      var scopeSel = el('select', { class: 'select', attrs: { 'aria-label': t('export.scope') } });
      scopeSel.appendChild(el('option', { attrs: { value: 'filtered' }, text: t('export.scopeFiltered') }));
      scopeSel.appendChild(el('option', { attrs: { value: 'all' }, text: t('export.scopeAll') }));
      scopeSel.value = 'filtered';

      var fmtSel = el('select', { class: 'select', attrs: { 'aria-label': t('export.format') } });
      (typeof fmts.formatsFor === 'function' ? fmts.formatsFor() : fmts.FORMATS).forEach(function (f) {
        fmtSel.appendChild(el('option', { attrs: { value: f }, text: String(f).toUpperCase() }));
      });
      fmtSel.value = 'csv';

      var genBtn = el('button', { class: 'btn btn-primary', attrs: { 'data-perm': 'export' }, on: { click: function () { doExport(); } } },
        icon('download', 18), el('span', { text: t('export.generate') }));

      var card = el('section', { class: 'card' });
      card.appendChild(el('h2', { class: 'section-title', text: t('export.title') }));
      card.appendChild(el('div', { class: 'page-toolbar' }, entitySel, targetSel, scopeSel, fmtSel, genBtn));
      container.appendChild(card);

      // produce('pdf') no trae bytes: se monta el modelo en pantalla con el
      // renderer de informes y se lanza el print propio (precedente
      // views/reports.js: host print-host dentro del contenedor de la vista).
      function printModel(model) {
        var rend = root.IW.reports && root.IW.reports.renderer;
        if (!rend || typeof rend.render !== 'function' ||
          typeof window === 'undefined' || typeof window.print !== 'function') { return false; }
        var host = el('div', { attrs: { id: 'print-host' } });
        container.appendChild(host);
        host.appendChild(rend.render(model, t));
        if (document.body && document.body.classList) { document.body.classList.add('print-mode'); }
        var cleanup = function () {
          if (document.body && document.body.classList) { document.body.classList.remove('print-mode'); }
          if (host.parentNode) { host.parentNode.removeChild(host); }
        };
        if (typeof window.addEventListener === 'function') {
          window.addEventListener('afterprint', cleanup, { once: true });
        }
        window.print();
        setTimeout(cleanup, 1500);
        return true;
      }

      function deliver(res, model) {
        if (!res) { return false; }
        if (res.action === 'print') { return printModel(model); }
        if (!csvMod) { return false; }
        if (typeof res.data === 'string') { return !!(csvMod.downloadText && csvMod.downloadText(res.filename, res.data, res.mime)); }
        return !!(csvMod.downloadBytes && csvMod.downloadBytes(res.filename, res.data, res.mime));
      }

      function doExport() {
        requirePerm('export').then(function () {
          var entity = entitySel.value;
          var target = targetSel.value === 'phmsa' && hasPhmsa ? 'phmsa' : 'native';
          var fmt = fmtSel.value;
          var scopeAll = scopeSel.value === 'all';
          u.toast('export.generating', { severity: 'info' });
          Promise.all([
            repos.pipelineSystems.list(), repos.lineAssets.list(),
            repos.lineInspections.list(), repos.iliAnomalies.list()
          ]).then(function (res) {
            var systems = res[0] || [];
            var pools = { pipelineSystems: systems, lineAssets: res[1] || [], lineInspections: res[2] || [], iliAnomalies: res[3] || [] };
            var q = (_session.search || '').trim().toLowerCase();
            var selSystems = scopeAll ? systems : systems.filter(function (s) {
              if (!q) { return true; }
              return (String(s.name || '').toLowerCase().indexOf(q) !== -1) ||
                (String(s.operator || '').toLowerCase().indexOf(q) !== -1);
            });
            var inSel = {};
            selSystems.forEach(function (s) { inSel[s.id] = true; });
            function withinSys(r) { return scopeAll || (r && inSel[r.systemId]); }

            var model;
            var rowCount;
            var base;
            var out;
            if (target === 'phmsa') {
              var phAnoms = pools.iliAnomalies.filter(withinSys);
              var phInsps = pools.lineInspections.filter(withinSys);
              var map = buildAssessmentMap(selSystems, phAnoms);
              out = tpls.phmsa.performance(selSystems, phInsps, phAnoms, map ? { assessmentByAnomalyId: map } : undefined);
              model = phmsaTableModel(out);
              rowCount = model.sections.reduce(function (n, sh) { return n + sh.rows.length; }, 0);
              base = 'phmsa';
            } else {
              var records = entity === 'pipelineSystems' ? selSystems : pools[entity].filter(withinSys);
              model = nativeTableModel(entity, records);
              rowCount = records.length;
              base = EXPORT_BASENAME[entity] || 'export';
            }

            if (rowCount > EXPORT_ROW_GUARD && fmt !== 'csv' && fmt !== 'json' && fmt !== 'xml') {
              u.toast('export.tooManyRows', { severity: 'warning' });
              return null;
            }
            var fecha = new Date().toISOString().slice(0, 10);
            var locale = (root.IW.i18n && typeof root.IW.i18n.getLocale === 'function') ? root.IW.i18n.getLocale() : 'es';
            return fmts.produce(model, fmt, { t: t, locale: locale, filename: base + '_' + fecha })
              .then(function (r) { return { res: r, model: model }; });
          }).then(function (outPair) {
            if (!outPair) { return null; }
            return deliver(outPair.res, outPair.model);
          }).then(function (ok) {
            if (ok === null) { return; }
            u.toast(ok ? 'export.done' : 'export.failed', { severity: ok ? 'info' : 'critical' });
          }).catch(function () {
            u.toast('export.failed', { severity: 'critical' });
          });
        }).catch(function (err) {
          if (isForbidden(err)) { forbiddenToast(err); return; }
          consoleError(err);
        });
      }
    }

    function systemActions(system, locked) {
      var editBtn = el('button', { class: 'btn btn-ghost touch', attrs: { 'aria-label': t('common.edit') }, on: { click: function () { openSystemForm(system); } } }, icon('edit', 18));
      var delBtn = el('button', { class: 'btn btn-ghost touch', attrs: { 'aria-label': t('common.delete') }, on: { click: function () { deleteSystem(system); } } }, icon('trash', 18));
      delBtn.disabled = locked;
      return el('div', { class: 'row' }, editBtn, delBtn);
    }

    function deleteSystem(system) {
      u.confirmDialog({ titleKey: 'common.confirm', bodyKey: 'pipelines.deleteSystemConfirm', danger: true }).then(function (ok) {
        if (!ok) { return; }
        requirePerm('delete').then(function () {
          var jobs = [];
          return repos.lineAssets.list().then(function (assets) {
            (assets || []).forEach(function (a) { if (a.systemId === system.id) { jobs.push(repos.lineAssets.remove(a.id)); } });
          }).then(function () {
            return repos.lineInspections.list().then(function (insps) {
              (insps || []).forEach(function (i) { if (i.systemId === system.id) { jobs.push(repos.lineInspections.remove(i.id)); } });
            });
          }).then(function () {
            return Promise.all(jobs).then(function () { return repos.pipelineSystems.remove(system.id); });
          });
        }).catch(function (err) {
          if (isForbidden(err)) { forbiddenToast(err); return; }
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
        repos.lineInspections.list(),
        repos.iliAnomalies.list(),
        isDeleteLocked(repos.meta)
      ]).then(function (res) {
        if (!_session || !_session.active) { return; }
        var system = res[0];
        var allAssets = res[1] || [];
        var allInspections = res[2] || [];
        var allAnomalies = res[3] || [];
        var locked = res[4];
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
        var anomalies = allAnomalies.filter(function (a) { return a.systemId === system.id; });
        container.textContent = '';
        renderDetail(system, assets, inspections, anomalies, locked);
      }).catch(function (err) {
        if (_session && _session.active) { container.textContent = ''; container.appendChild(banner(err)); }
      });
    }

    function renderDetail(system, assets, inspections, anomalies, locked) {
      var nowMs = Date.now();

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
          [t('pipelines.opPressure'), el('span', { class: 'num', text: system.opPressureMpa != null ? fmtNum(system.opPressureMpa, 2) + ' MPa' : '—' })],
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
          el('button', { class: 'btn btn-primary', attrs: { 'data-perm': 'assetWrite' }, on: { click: function () { openAssetForm(system, null, assets); } } }, icon('plus', 18), el('span', { text: t('pipelines.newLineAsset') }))),
        assetsHost));
      renderAssetsTable(system, assets, inspections, assetsHost, locked);

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
          el('button', { class: 'btn btn-primary', attrs: { 'data-perm': 'assetWrite' }, on: { click: function () { openInspectionForm(system, assets, null); } } }, icon('plus', 18), el('span', { text: t('pipelines.newInspection') }))),
        inspHost));
      renderInspections(system, assets, inspections, inspHost, locked);

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

      // ILI Anomalies panel (Experion)
      renderIliPanel(system, anomalies);
      // FFS faceplate (API 579-1 L1)
      renderFfsFaceplate(system);

      if (_pendingScrollAsset) {
        var target = _pendingScrollAsset;
        _pendingScrollAsset = null;
        setTimeout(function () {
          var row = container.querySelector('[data-asset-code="' + target + '"]');
          if (row && typeof row.scrollIntoView === 'function') { row.scrollIntoView({ block: 'center' }); }
        }, 0);
      }
    }

    function ffsApi() { return (root.IW && root.IW.calc) ? root.IW.calc.ffs : null; }

    function renderFfsFaceplate(system) {
      var panel = el('section', { class: 'card' });
      panel.appendChild(el('h2', { class: 'section-title', text: t('ffs.title') }));

      // Check required fields.
      if (system.dnIn == null || system.wallThicknessMm == null || system.opPressureMpa == null) {
        panel.appendChild(el('p', { class: 'field-hint', text: t('ffs.needFields') }));
        container.appendChild(panel);
        return;
      }

      var ffsMod = ffsApi();
      if (!ffsMod || typeof ffsMod.assessLineSystem !== 'function') {
        panel.appendChild(el('p', { class: 'muted', text: t('common.none') }));
        container.appendChild(panel);
        return;
      }

      var mats = root.IW && root.IW.data && root.IW.data.materials;
      var result = ffsMod.assessLineSystem(system, mats);
      if (!result) {
        panel.appendChild(el('p', { class: 'muted', text: t('common.none') }));
        container.appendChild(panel);
        return;
      }

      // LED status
      var ledClass = 'led';
      var ledLabel;
      if (!result.pass) {
        ledClass += ' led--crit';
        ledLabel = t('ffs.fail');
      } else if (result.utilization > 0.9) {
        ledClass += ' led--warn';
        ledLabel = t('ffs.pass') + ' · ' + t('ffs.utilization') + ' ' + fmtNum(result.utilization * 100, 0) + '%';
      } else {
        ledClass += ' led--ok';
        ledLabel = t('ffs.pass') + ' · ' + t('ffs.utilization') + ' ' + fmtNum(result.utilization * 100, 0) + '%';
      }

      // Faceplate key-value table (dense, Experion style)
      var pairs = [
        [t('ffs.tRequired'), el('span', { class: 'num', text: fmtNum(result.tRequired, 2) + ' mm' })],
        [t('ffs.mawpAllowed'), el('span', { class: 'num', text: fmtNum(result.opPressureMpa, 2) + ' MPa' })],
        [t('ffs.mawpAssessed'), el('span', { class: 'num', text: fmtNum(result.mawpAssessed, 2) + ' MPa' })],
        [t('ffs.corrosionAllowance'), el('span', { class: 'num', text: fmtNum(result.CA, 1) + ' mm' })],
        [t('ffs.jointEfficiency'), el('span', { class: 'num', text: fmtNum(result.E, 2) })],
        [t('ffs.allowableStress'), el('span', { class: 'num', text: fmtNum(result.S, 0) + ' MPa' })],
        [t('common.status'), el('span', { class: ledClass, attrs: { 'data-led': result.pass ? (result.utilization > 0.9 ? 'warn' : 'ok') : 'crit' } }, el('span', { text: ledLabel }))]
      ];
      panel.appendChild(u.keyValueTable(pairs));
      container.appendChild(panel);
    }

    function renderIliPanel(system, anomalies) {
      var pa = pipelineAssessmentApi();
      var hasOpPressure = system.opPressureMpa != null && system.opPressureMpa > 0;
      var hasWallData = system.wallThicknessMm != null && system.dnIn != null && system.material;

      // Chip summary
      var exceedCount = 0;
      var assessed = [];

      if (pa && hasWallData && anomalies.length > 0) {
        var Su = 414; // default X52 SMYS; override if material in catalogue
        var mats = root.IW.data && root.IW.data.materials;
        if (mats && mats.byId) {
          var mat = mats.byId(system.material);
          if (mat && mat.smysMpa) { Su = mat.smysMpa; }
        }
        assessed = pa.assessAnomalies([], anomalies, {
          Su: Su,
          D: system.dnIn * 25.4, // inches to mm
          t: system.wallThicknessMm,
          designFactor: 0.72,
          opPressure: hasOpPressure ? system.opPressureMpa : 0
        });
      }

      var anomalyItems = anomalies.map(function (a, idx) {
        var r = assessed[idx] || {};
        if (r.exceeds) { exceedCount++; }
        return {
          stationKm: a.stationKm,
          type: a.type || 'metalLoss',
          depthPct: a.depthPct,
          Pf: r.Pf,
          pAllow: r.pAllow,
          exceeds: r.exceeds
        };
      });

      var headerChip = '';
      if (anomalies.length > 0) {
        headerChip = anomalies.length + ' ' + t('pipelines.iliAnomalies');
        if (exceedCount > 0) {
          headerChip += ' · ' + exceedCount + ' ' + t('pipelines.exceeds');
        }
      }

      // Panel
      var panel = el('section', { class: 'card' });

      // Header row
      var hdrRow = el('div', { class: 'row' });
      hdrRow.appendChild(el('h2', { class: 'section-title', text: t('pipelines.iliAnomalies') }));
      if (headerChip) {
        hdrRow.appendChild(el('span', { class: 'pill', text: headerChip }));
      }

      // Import button
      var importBtn = el('button', { class: 'btn', on: { click: function () { importIliCsv(system); } } },
        el('span', { text: t('pipelines.iliImport') }));
      hdrRow.appendChild(el('div', { class: 'actions' }, importBtn));
      panel.appendChild(hdrRow);

      if (anomalies.length === 0) {
        panel.appendChild(el('p', { class: 'empty-state', text: t('pipelines.noIli') }));
      } else {
        // Paginacion (P2e): anomalyItems y assessed se conservan COMPLETOS
        // (chip de resumen y recuento de excedencias sobre todas las
        // anomalías, que pueden ser decenas de miles); solo se pagina el
        // render de filas, ya filtradas por sistema en drawDetail.
        var tableHost = el('div');
        panel.appendChild(tableHost);
        var page = 1;
        function paintTable() {
          tableHost.textContent = '';
          var p = u.paginate(anomalyItems, page, PAGE_SIZE);
          page = p.page;
          var wrap = el('div', { class: 'table-wrap' });
          var tbl = el('table', { class: 'data' });
          var thead = el('thead');
          var htr = el('tr');
          htr.appendChild(el('th', { attrs: { scope: 'col' }, text: t('pipelines.stationKm') }));
          htr.appendChild(el('th', { attrs: { scope: 'col' }, text: t('pipelines.anomalyType') }));
          htr.appendChild(el('th', { attrs: { scope: 'col' }, text: t('pipelines.depthPct') }));
          htr.appendChild(el('th', { attrs: { scope: 'col' }, text: t('pipelines.failurePressure') }));
          htr.appendChild(el('th', { attrs: { scope: 'col' }, text: t('pipelines.safePressure') }));
          htr.appendChild(el('th', { attrs: { scope: 'col' }, text: t('common.status') }));
          thead.appendChild(htr);
          tbl.appendChild(thead);
          var tbody = el('tbody');

          p.items.forEach(function (item) {
            var tr = el('tr');
            tr.appendChild(el('td', null, el('span', { class: 'num', text: fmtNum(item.stationKm, 2) })));

            // Type badge with LED style
            var typeClass = 'badge badge-neutral';
            if (item.type === 'metalLoss') { typeClass = 'badge badge-moderate'; }
            else if (item.type === 'crack') { typeClass = 'badge badge-severe'; }
            var typeTd = el('td');
            typeTd.appendChild(el('span', { class: typeClass, text: t('pipelines.' + item.type) }));
            tr.appendChild(typeTd);

            tr.appendChild(el('td', null, el('span', { class: 'num', text: fmtNum(item.depthPct, 1) + ' %' })));

            var pfText = item.Pf != null && item.Pf > 0 ? fmtNum(item.Pf, 1) + ' MPa' : '—';
            tr.appendChild(el('td', null, el('span', { class: 'num', text: pfText })));

            var safeText = item.pAllow != null && item.pAllow > 0 ? fmtNum(item.pAllow, 1) + ' MPa' : '—';
            if (hasOpPressure && item.exceeds) {
              tr.appendChild(el('td', null, el('span', { class: 'badge badge-severe', text: safeText })));
            } else {
              tr.appendChild(el('td', null, el('span', { class: 'num', text: safeText })));
            }

            var statusTd = el('td');
            if (hasOpPressure && item.exceeds) {
              statusTd.appendChild(el('span', { class: 'led led-crit', attrs: { 'aria-label': t('pipelines.exceeds'), 'data-led': 'crit' } }));
              statusTd.appendChild(el('span', { class: 'badge badge-severe', text: 'EXCEEDS' }));
            } else if (assessed.length > 0) {
              statusTd.appendChild(el('span', { class: 'led led-ok', attrs: { 'aria-label': t('common.ok'), 'data-led': 'ok' } }));
              statusTd.appendChild(el('span', { class: 'pill', text: t('common.ok') }));
            } else {
              statusTd.appendChild(el('span', { class: 'muted', text: '—' }));
            }
            tr.appendChild(statusTd);
            tbody.appendChild(tr);
          });

          tbl.appendChild(tbody);
          wrap.appendChild(tbl);
          tableHost.appendChild(wrap);
          if (p.pages > 1) {
            tableHost.appendChild(u.pager({ total: p.total, page: p.page, size: PAGE_SIZE, onGoto: function (next) { page = next; paintTable(); } }));
          }
        }
        paintTable();
      }
      container.appendChild(panel);
    }

    function importIliCsv(system) {
      var fileInput = el('input', { attrs: { type: 'file', accept: '.csv,.txt,text/csv' } });
      fileInput.addEventListener('change', function () {
        var file = fileInput.files && fileInput.files[0];
        if (!file) { return; }
        var reader = new FileReader();
        reader.onload = function () {
          var csvMod = root.IW.ingest && root.IW.ingest.csv;
          if (!csvMod) { return; }
          var parsed = csvMod.parse(reader.result);
          var cols = csvMod.mapColumns(parsed.headers);
          var anomalyRows = parsed.rows.map(function (row) {
            var obj = {};
            Object.keys(cols.mapping).forEach(function (h) {
              var idx = parsed.headers.indexOf(h);
              obj[cols.mapping[h]] = idx >= 0 ? (row[idx] || '') : '';
            });
            return obj;
          }).filter(function (r) { return r.station_km || r.depth_pct; });

          var imported = anomalyRows.map(function (r, idx) {
            return {
              id: 'ILI-IMP-' + Date.now().toString(36) + '-' + idx,
              assetId: '',
              systemId: system.id,
              stationKm: Number(r.station_km) || 0,
              depthPct: Number(r.depth_pct) || 0,
              lengthMm: Number(r.length_mm) || 0,
              widthMm: Number(r.width_mm) || 0,
              type: (r.type === 'metalLoss' || r.type === 'crack' || r.type === 'dent') ? r.type : 'metalLoss',
              inspectionId: 'import',
              date: new Date().toISOString()
            };
          });

          var ok = 0;
          var jobs = imported.map(function (rec) { ok++; return repos.iliAnomalies.save(rec); });
          requirePerm('assetWrite').then(function () {
            return Promise.all(jobs);
          }).then(function () {
            if (u && typeof u.toast === 'function') {
              var msg = t('pipelines.imported').replace('{{n}}', String(imported.length)).replace('{{ok}}', String(ok));
              u.toast(msg, { severity: 'info' });
            }
          }).catch(function (err) {
            if (isForbidden(err)) { forbiddenToast(err); return; }
            if (u && typeof u.toast === 'function') { u.toast(t('common.error'), { severity: 'critical' }); }
          });
        };
        reader.readAsText(file);
      });
      fileInput.click();
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

    function renderAssetsTable(system, assets, inspections, host, locked) {
      var sorted = assets.slice().sort(function (a, b) {
        var ka = (typeof a.stationKm === 'number') ? a.stationKm : Number(a.stationKm) || 0;
        var kb = (typeof b.stationKm === 'number') ? b.stationKm : Number(b.stationKm) || 0;
        return _session.sortDir === 'asc' ? ka - kb : kb - ka;
      });
      // Paginacion (P2e): solo el render de filas; orden, filtros de mapa,
      // KPIs y certificados siguen operando sobre la lista completa. Si el
      // salto viene del mapa, la pagina inicial es la que contiene el activo
      // buscado (sin eso el scroll a data-asset-code no tendria fila).
      var page = 1;
      if (_pendingScrollAsset) {
        for (var pi = 0; pi < sorted.length; pi++) {
          if ((sorted[pi].code || '') === _pendingScrollAsset) { page = Math.floor(pi / PAGE_SIZE) + 1; break; }
        }
      }
      function paint() {
        host.textContent = '';
        var p = u.paginate(sorted, page, PAGE_SIZE);
        page = p.page;
        var wrap = el('div', { class: 'table-wrap' });
        var tbl = el('table', { class: 'data' });
        tbl.appendChild(el('caption', { text: t('pipelines.lineAssets') }));
        var thead = el('thead');
        var htr = el('tr');
        var thKm = el('th', { attrs: { scope: 'col' } }, el('button', { class: 'sortable-th', text: t('pipelines.stationKm') + (_session.sortDir === 'asc' ? ' ↑' : ' ↓'), on: { click: function () { _session.sortDir = _session.sortDir === 'asc' ? 'desc' : 'asc'; renderAssetsTable(system, assets, inspections, host, locked); } } }));
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
        if (p.total === 0) {
          tbody.appendChild(el('tr', null, el('td', { class: 'empty-state', attrs: { colspan: '8' }, text: t('pipelines.noAssets') })));
        } else {
          p.items.forEach(function (a) {
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
            // icons.js no trae 'copy': el duplicado es botón de texto con el
            // mismo guardián (data-perm assetWrite) que el alta de línea.
            var actTd = el('td', null, el('div', { class: 'row' },
              el('button', { class: 'btn btn-ghost touch', attrs: { 'data-perm': 'assetWrite', 'aria-label': t('duplo2.duplicateBtn') }, on: { click: function () { duplicateAsset(system, a, assets); } } }, el('span', { text: t('duplo2.duplicateBtn') })),
              el('button', { class: 'btn btn-ghost touch', attrs: { 'aria-label': t('common.edit') }, on: { click: function () { openAssetForm(system, a, assets); } } }, icon('edit', 18)),
              (function () { var b = el('button', { class: 'btn btn-ghost touch', attrs: { 'aria-label': t('common.delete') }, on: { click: function () { deleteAsset(a); } } }, icon('trash', 18)); b.disabled = locked; return b; })()));
            tr.appendChild(actTd);
            tbody.appendChild(tr);
          });
        }
        tbl.appendChild(tbody);
        wrap.appendChild(tbl);
        host.appendChild(wrap);
        if (p.pages > 1) {
          host.appendChild(u.pager({ total: p.total, page: p.page, size: PAGE_SIZE, onGoto: function (next) { page = next; paint(); } }));
        }
      }
      paint();
    }

    function renderInspections(system, assets, inspections, host, locked) {
      var sorted = inspections.slice().sort(function (a, b) { return (a.date < b.date) ? 1 : -1; });
      var page = 1;
      function paint() {
        host.textContent = '';
        var p = u.paginate(sorted, page, PAGE_SIZE);
        page = p.page;
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
        if (p.total === 0) {
          tbody.appendChild(el('tr', null, el('td', { class: 'empty-state', attrs: { colspan: '7' }, text: t('pipelines.noInspections') })));
        } else {
          p.items.forEach(function (i) {
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
              el('button', { class: 'btn btn-ghost touch', attrs: { 'aria-label': t('common.edit') }, on: { click: function () { openInspectionForm(system, assets, i); } } }, icon('edit', 18)),
              (function () { var b = el('button', { class: 'btn btn-ghost touch', attrs: { 'aria-label': t('common.delete') }, on: { click: function () { deleteInspection(i); } } }, icon('trash', 18)); b.disabled = locked; return b; })())));
            tbody.appendChild(tr);
          });
        }
        tbl.appendChild(tbody);
        wrap.appendChild(tbl);
        host.appendChild(wrap);
        if (p.pages > 1) {
          host.appendChild(u.pager({ total: p.total, page: p.page, size: PAGE_SIZE, onGoto: function (next) { page = next; paint(); } }));
        }
      }
      paint();
    }

    function deleteAsset(asset) {
      u.confirmDialog({ titleKey: 'common.confirm', bodyKey: 'pipelines.deleteLineAssetConfirm', danger: true }).then(function (ok) {
        if (!ok) { return; }
        requirePerm('delete').then(function () {
          return repos.lineAssets.remove(asset.id);
        }).catch(function (err) {
          if (isForbidden(err)) { forbiddenToast(err); return; }
          consoleError(err);
        });
      });
    }

    function deleteInspection(insp) {
      u.confirmDialog({ titleKey: 'common.confirm', bodyKey: 'pipelines.deleteInspectionConfirm', danger: true }).then(function (ok) {
        if (!ok) { return; }
        requirePerm('delete').then(function () {
          return repos.lineInspections.remove(insp.id);
        }).catch(function (err) {
          if (isForbidden(err)) { forbiddenToast(err); return; }
          consoleError(err);
        });
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
        { name: 'opPressureMpa', labelKey: 'pipelines.opPressure', type: 'number', min: 0 },
        { name: 'notes', labelKey: 'common.notes', type: 'textarea' }
      ];
      var values = system ? {
        name: system.name, operator: system.operator, product: system.product, dnIn: system.dnIn,
        wallThicknessMm: system.wallThicknessMm, material: system.material, coating: system.coating,
        lengthKm: system.lengthKm, stationFromKm: system.stationFromKm, stationToKm: system.stationToKm,
        opPressureMpa: system.opPressureMpa, notes: system.notes
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
                stationFromKm: from, stationToKm: to,
                opPressureMpa: v.opPressureMpa != null && v.opPressureMpa !== '' ? Number(v.opPressureMpa) : undefined,
                notes: v.notes || undefined
              };
              requirePerm('assetWrite').then(function () {
                return stampRec(repos.meta, rec, system);
              }).then(function (stamped) {
                return repos.pipelineSystems.save(stamped);
              }).then(function () { dlg.close(); }).catch(function (err) {
                if (isForbidden(err)) { forbiddenToast(err); return; }
                consoleError(err); u.toast('common.error', { severity: 'critical' });
              });
              return false;
            }
          }
        ]
      });
    }

    // opts (opcional, aditivo): { values: prellenado del formulario,
    // duplicate: true } — con duplicate el formulario es de ALTA (id nuevo,
    // sello de autoría nuevo) y se avisa de que los campos son copia.
    function openAssetForm(system, asset, assets, opts) {
      opts = opts || {};
      var fields = [
        { name: 'code', labelKey: 'pipelines.assetCode', type: 'text', required: true },
        { name: 'name', labelKey: 'pipelines.assetName', type: 'text' },
        { name: 'type', labelKey: 'pipelines.assetType', type: 'select', options: typeOptions() },
        { name: 'stationKm', labelKey: 'pipelines.stationKm', type: 'number', required: true },
        { name: 'side', labelKey: 'pipelines.side', type: 'select', options: sideOptions() },
        { name: 'certExpiryISO', labelKey: 'pipelines.certExpiry', type: 'date' },
        { name: 'notes', labelKey: 'common.notes', type: 'textarea' }
      ];
      var values = opts.values || (asset ? {
        code: asset.code, name: asset.name, type: asset.type, stationKm: asset.stationKm,
        side: asset.side, certExpiryISO: toDateInput(asset.certExpiryISO), notes: asset.notes
      } : { type: 'sectionValve', side: 'center' });
      var f = u.form(fields, values);
      // QR nameplate button next to the code field. Guarded: without
      // IW.components.scan the button is hidden (display:none) with an
      // unsupported caption instead of crashing; the field stays editable.
      var scan = scanApi();
      var hasScan = !!(scan && typeof scan.scanNameplate === 'function');
      var codeInput = f.node.querySelector('#fld-code');
      if (codeInput && codeInput.parentNode) {
        var qrBtn = el('button', { class: 'btn btn-ghost', attrs: { type: 'button', 'aria-label': t('scan2.qrBtn') } }, icon('search', 16), el('span', { text: t('scan2.qrBtn') }));
        if (hasScan) {
          qrBtn.addEventListener('click', function () {
            Promise.resolve(scan.scanNameplate({})).then(function (res) {
              if (!res || res.value == null) { return; }
              codeInput.value = scan.qrTextToValue(res.value);
              u.toast('scan2.qrManual', { severity: 'info' });
            }, function (err) {
              var code = err && err.code;
              if (code === 'SCAN_TIMEOUT' || code === 'SCAN_CANCELLED') { return; }
              u.toast('scan2.qrUnsupported', { severity: 'warning' });
            });
          });
        } else {
          qrBtn.setAttribute('style', 'display:none');
        }
        codeInput.parentNode.appendChild(qrBtn);
        if (!hasScan) {
          codeInput.parentNode.appendChild(el('span', { class: 'muted', text: t('scan2.qrUnsupported') }));
        }
      }
      var dupNote = opts.duplicate ? el('p', { class: 'muted', text: t('duplo2.copiedMsg') }) : null;
      var dlg = u.dialog({
        titleKey: opts.duplicate ? 'duplo2.fromTemplate' : (asset ? 'pipelines.editLineAsset' : 'pipelines.newLineAsset'),
        bodyNode: dupNote ? el('div', null, dupNote, f.node) : f.node,
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
              requirePerm('assetWrite').then(function () {
                return stampRec(repos.meta, rec, asset);
              }).then(function (stamped) {
                return repos.lineAssets.save(stamped);
              }).then(function () { dlg.close(); }).catch(function (err) {
                if (isForbidden(err)) { forbiddenToast(err); return; }
                consoleError(err); u.toast('common.error', { severity: 'critical' });
              });
              return false;
            }
          }
        ]
      });
    }

    // Duplicar un activo de línea: abre el alta prellenada con la copia
    // superficial (sin id/autoría/quality y con code vacío). Usa el MISMO
    // guardián que 'nuevo activo de línea' (data-perm assetWrite + requirePerm
    // en el guardado de openAssetForm).
    function duplicateAsset(system, asset, assets) {
      openAssetForm(system, null, assets, { duplicate: true, values: duplicatePresetValues(asset) });
    }

    function openInspectionForm(system, assets, inspection) {
      var isEdit = !!inspection;
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

      // --- Evidence section (optional) ---
      var bodyWrap = el('div');
      bodyWrap.appendChild(f.node);

      var evidenceSection = el('section', { class: 'field-group' });
      evidenceSection.appendChild(el('h3', { class: 'section-title', text: t('evidence.sectionTitle') }));

      // Signature
      var sigContainer = el('div');
      evidenceSection.appendChild(sigContainer);
      var sigPad = null;
      var sigModule = root.IW.components && root.IW.components.signaturePad;
      if (sigModule && typeof sigModule.createSignaturePad === 'function') {
        sigPad = sigModule.createSignaturePad(sigContainer, { width: 300, height: 120, labelKey: 'evidence.signature.label' });
      }

      // Photos
      var photoInput = el('input', { attrs: { type: 'file', accept: 'image/jpeg', multiple: '' } });
      var photoHint = el('p', { class: 'field-hint', text: t('evidence.photos.hint') });
      var photoPreview = el('div', { class: 'photo-grid' });
      var photoLabel = el('label', { class: 'field-label', text: t('evidence.photos.label') });
      evidenceSection.appendChild(photoLabel);
      evidenceSection.appendChild(photoHint);
      evidenceSection.appendChild(photoInput);
      evidenceSection.appendChild(photoPreview);

      var pendingPhotos = [];
      var existingPhotos = (inspection && inspection.photos) ? inspection.photos.slice() : [];

      function updatePhotoPreview() {
        photoPreview.textContent = '';
        var all = existingPhotos.concat(pendingPhotos);
        all.forEach(function (p) {
          var img = el('img', { class: 'evidence-thumb', attrs: { src: p.dataUrl, alt: t('evidence.photos.label') } });
          var item = el('div', { class: 'photo-grid__item' }, img);
          photoPreview.appendChild(item);
        });
      }
      if (existingPhotos.length > 0) { updatePhotoPreview(); }

      // Ruta ÚNICA de fotos del formulario (dataURL recortado + EXIF de
      // IW.calc.exif): la consume tanto el input clásico de evidencia como el
      // botón de foto de IW.components.scan. true = aceptadas, false = tope 6.
      function ingestPhotoFiles(files) {
        var total = existingPhotos.length + pendingPhotos.length + files.length;
        if (total > 6) {
          u.toast('evidence.photos.tooMany', { severity: 'warning' });
          return false;
        }
        var exifMod = root.IW.calc && root.IW.calc.exif;
        var spMod = root.IW.components && root.IW.components.signaturePad;
        Array.prototype.forEach.call(files, function (file) {
          var reader = new FileReader();
          reader.onload = function (evt) {
            var arrayBuf = evt.target.result;
            var photo = { dataUrl: '', capturedAt: null, gps: null };
            // Downscale
            var blob = new Blob([arrayBuf], { type: file.type });
            var url = URL.createObjectURL(blob);
            var img = new Image();
            img.onload = function () {
              URL.revokeObjectURL(url);
              var c = document.createElement('canvas');
              var maxDim = 1024;
              var scale = maxDim / Math.max(img.width, img.height);
              if (scale < 1) { c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale); }
              else { c.width = img.width; c.height = img.height; }
              var cx = c.getContext('2d');
              cx.drawImage(img, 0, 0, c.width, c.height);
              photo.dataUrl = c.toDataURL('image/jpeg', 0.85);
              // EXIF
              if (exifMod && typeof exifMod.parseExif === 'function') {
                try {
                  var bytes = new Uint8Array(arrayBuf);
                  var exifData = exifMod.parseExif(bytes);
                  if (exifData) {
                    photo.capturedAt = exifData.capturedAt || null;
                    photo.gps = exifData.gps || null;
                  }
                } catch (_) { /* ignore EXIF errors */ }
              }
              pendingPhotos.push(photo);
              updatePhotoPreview();
            };
            img.onerror = function () {
              URL.revokeObjectURL(url);
              pendingPhotos.push(photo);
              updatePhotoPreview();
            };
            img.src = url;
          };
          reader.readAsArrayBuffer(file);
        });
        return true;
      }

      photoInput.addEventListener('change', function () {
        var files = photoInput.files;
        if (!files || files.length === 0) { return; }
        ingestPhotoFiles(files);
        photoInput.value = '';
      });

      // --- Evidencia aditiva (IW.components.scan): GPS y foto con EXIF ---
      // rec.gps / rec.photoMeta son campos NUEVOS que ninguna vista lee hoy.
      var capturedGps = (isEdit && inspection.gps) ? inspection.gps : null;
      var existingPhotoMeta = (isEdit && inspection.photoMeta) ? inspection.photoMeta.slice() : [];
      var pendingPhotoMeta = [];
      var gpsCaption = null;

      function setGpsCaption(g) {
        if (!gpsCaption) { return; }
        var acc = (g && typeof g.accuracyM === 'number') ? Math.round(g.accuracyM) : '—';
        gpsCaption.textContent = t('scan2.gpsOk', { acc: acc });
        gpsCaption.hidden = false;
      }

      if (hasGpsCapture()) {
        var gpsBtn = el('button', { class: 'btn', on: { click: function () { captureGpsIntoForm(); } } },
          el('span', { text: t('scan2.gpsBtn') }));
        gpsCaption = el('p', { class: 'field-hint', text: '' });
        gpsCaption.hidden = true;
        evidenceSection.appendChild(el('div', { class: 'row' }, gpsBtn));
        evidenceSection.appendChild(gpsCaption);
      }

      function captureGpsIntoForm() {
        var s = scanApi();
        if (!s || typeof s.captureGps !== 'function') { return; }
        var p;
        try { p = s.captureGps(); } catch (e) { p = Promise.reject(e); }
        Promise.resolve(p).then(function (g) {
          capturedGps = { lat: g.lat, lon: g.lon, accuracyM: g.accuracyM, tsIso: g.tsIso };
          setGpsCaption(g);
        }, function () {
          // SCAN_UNSUPPORTED / SCAN_GPS_DENIED / timeout: el GPS de la placa
          // no llegó; la inspección se puede guardar igual.
          u.toast('scan2.gpsFail', { severity: 'warning' });
        });
      }

      if (hasPhotoExifReader()) {
        var scanPhotoInput = el('input', { attrs: { type: 'file', accept: 'image/*', capture: 'environment', hidden: '' } });
        var scanPhotoCaption = el('div', { class: 'field-hint' });
        scanPhotoCaption.hidden = true;
        var scanPhotoBtn = el('button', { class: 'btn', on: { click: function () { scanPhotoInput.click(); } } },
          el('span', { text: t('scan2.photoBtn') }));
        evidenceSection.appendChild(el('div', { class: 'row' }, scanPhotoBtn));
        evidenceSection.appendChild(scanPhotoCaption);
        evidenceSection.appendChild(scanPhotoInput);
        scanPhotoInput.addEventListener('change', function () {
          var files = scanPhotoInput.files;
          if (!files || files.length === 0) { return; }
          var accepted = ingestPhotoFiles(files);
          scanPhotoInput.value = '';
          if (!accepted) { return; }
          var s = scanApi();
          Array.prototype.forEach.call(files, function (file) {
            var p;
            try { p = s.readPhotoExif(file); } catch (e) { p = Promise.reject(e); }
            Promise.resolve(p).then(function (res) {
              var ok = !!(res && res.ok);
              var line = ok
                ? t('scan2.photoExif', { date: res.dateIso ? fmtDate(res.dateIso) : '—', camera: res.camera || '—' })
                : t('scan2.photoNoExif');
              scanPhotoCaption.hidden = false;
              scanPhotoCaption.appendChild(el('p', { class: 'field-hint', text: file.name + ': ' + line }));
              pendingPhotoMeta.push({
                file: file.name,
                exif: ok ? {
                  camera: res.camera || null,
                  dateIso: res.dateIso || null,
                  lat: (res.lat === undefined || res.lat === null) ? null : res.lat,
                  lon: (res.lon === undefined || res.lon === null) ? null : res.lon
                } : null
              });
            }, function () {
              scanPhotoCaption.hidden = false;
              scanPhotoCaption.appendChild(el('p', { class: 'field-hint', text: file.name + ': ' + t('scan2.photoNoExif') }));
              pendingPhotoMeta.push({ file: file.name, exif: null });
            });
          });
        });
      }

      // Sketch (croquis)
      var sketchContainer = el('div');
      evidenceSection.appendChild(sketchContainer);
      var sketchPad = null;
      if (sigModule && typeof sigModule.createSignaturePad === 'function') {
        sketchPad = sigModule.createSignaturePad(sketchContainer, { width: 300, height: 120, labelKey: 'evidence.sketch.label', hintKey: 'evidence.sketch.hint' });
      }

      bodyWrap.appendChild(evidenceSection);

      // Show existing evidence if editing
      if (isEdit) {
        var evMod = root.IW.components && root.IW.components.inspectionEvidence;
        if (evMod && typeof evMod.renderEvidenceRows === 'function') {
          var evidenceRows = evMod.renderEvidenceRows(inspection);
          if (evidenceRows.length > 0) {
            var existingSection = el('section', { class: 'field-group' });
            existingSection.appendChild(el('h3', { class: 'section-title', text: t('evidence.sectionTitle') + ' (' + t('common.saved') + ')' }));
            existingSection.appendChild(u.keyValueTable(evidenceRows));
            bodyWrap.appendChild(existingSection);
          }
        }
      }

      var dlg = u.dialog({
        titleKey: isEdit ? 'pipelines.editInspection' : 'pipelines.newInspection',
        bodyNode: bodyWrap,
        actions: [
          { labelKey: 'common.cancel', kind: 'ghost', onClick: function () { return true; } },
          {
            labelKey: 'common.save', kind: 'primary', onClick: function () {
              if (!f.validate()) { return false; }
              var v = f.getValues();
              var rec = {
                id: inspection ? inspection.id : newId('insp'),
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
              // Evidence
              if (sigPad && !sigPad.isEmpty()) { rec.signature = sigPad.toDataURL(); }
              else if (isEdit && inspection.signature) { rec.signature = inspection.signature; }
              if (pendingPhotos.length > 0 || existingPhotos.length > 0) {
                rec.photos = existingPhotos.concat(pendingPhotos);
              } else if (isEdit && inspection.photos) { rec.photos = inspection.photos; }
              // Captura del escáner (aditivo: estas claves no estaban en el
              // registro y ninguna vista las lee hoy).
              if (capturedGps) { rec.gps = capturedGps; }
              if (pendingPhotoMeta.length > 0 || existingPhotoMeta.length > 0) {
                rec.photoMeta = existingPhotoMeta.concat(pendingPhotoMeta);
              }
              if (sketchPad && !sketchPad.isEmpty()) { rec.sketch = sketchPad.toDataURL(); }
              else if (isEdit && inspection.sketch) { rec.sketch = inspection.sketch; }
              // Clean up signature/sketch if cleared
              if (sigPad && sigPad.isEmpty() && isEdit && !inspection.signature) { rec.signature = undefined; }
              if (sketchPad && sketchPad.isEmpty() && isEdit && !inspection.sketch) { rec.sketch = undefined; }

              requirePerm('assetWrite').then(function () {
                return stampRec(repos.meta, rec, inspection);
              }).then(function (stamped) {
                return repos.lineInspections.save(stamped);
              }).then(function () { dlg.close(); }).catch(function (err) {
                if (isForbidden(err)) { forbiddenToast(err); return; }
                consoleError(err); u.toast('common.error', { severity: 'critical' });
              });
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
    groupCampaigns: groupCampaigns,
    duplicatePresetValues: duplicatePresetValues,
    nativeTableModel: nativeTableModel,
    phmsaTableModel: phmsaTableModel,
    buildAssessmentMap: buildAssessmentMap
  };
});
