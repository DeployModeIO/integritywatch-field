/* IntegrityWatch Field — reports view
   Dynamic template selector over IW.reports.registry.list() (quarterly / dossier
   / datasheet + T-01..T-12), on-screen rendering, file export through
   IW.export.reportFormats.produce, signed evidence packs through
   IW.export.evidencePack (with shift-close handover for T-12 including line
   inspection photos) and package verification via a local .zip picker.
   All buttons degrade gracefully when an export sibling is not loaded. */
(function (root, factory) {
  'use strict';
  var api = factory(root);
  root.IW = root.IW || {};
  root.IW.views = root.IW.views || {};
  root.IW.views.reports = api;
  if (typeof module === 'object' && module.exports) { module.exports = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  function ui() { return root.IW.ui; }
  function reportsApi() { return root.IW.reports; }
  function registryApi() { return root.IW.reports && root.IW.reports.registry; }
  function rendererApi() { return root.IW.reports && root.IW.reports.renderer; }
  function formatsApi() { return root.IW.export && root.IW.export.reportFormats; }
  function csvApi() { return root.IW.export && root.IW.export.csvWriter; }
  function packApi() { return root.IW.export && root.IW.export.evidencePack; }
  function lockApi() { return root.IW.security ? root.IW.security.lock : null; }
  function i18nApi() { return root.IW.i18n; }

  function el(tag, attrs) {
    var u = ui();
    return u.el.apply(u, arguments);
  }

  function icon(name, size) {
    var u = ui();
    if (u && typeof u.icon === 'function') {
      var n = u.icon(name, size);
      if (n && n.nodeType) { return n; }
    }
    return document.createTextNode('');
  }

  // Registry entries carry buildModel only when registered through
  // registry.register(); the three builtins are resolved by the same namespace
  // map the registry keeps internally (mirrored here read-only).
  var BUILTIN_BUILDERS = {
    quarterly: { ns: 'modelQuarterly', method: 'buildQuarterlyModel' },
    dossier: { ns: 'modelDossier', method: 'buildDossierModel' },
    datasheet: { ns: 'modelDatasheet', method: 'buildDatasheetModel' }
  };

  var LEGACY_TEMPLATES = [
    { id: 'quarterly', titleKey: 'reports.quarterly', needs: ['period'] },
    { id: 'dossier', titleKey: 'reports.dossier', needs: ['mpId'] },
    { id: 'datasheet', titleKey: 'reports.datasheet', needs: ['psvId'] }
  ];

  // needs -> store + how to label each option (label: code/tag/name + id).
  var NEED_CONTROLS = {
    mpId: { store: 'monitoringPoints', labelKey: 'reports.selectPoint', primary: function (r) { return r.code || r.id; } },
    psvId: { store: 'psvs', labelKey: 'reports.selectPsv', primary: function (r) { return r.tag || r.id; } },
    systemId: { store: 'pipelineSystems', labelKey: 'common.system', primary: function (r) { return r.name || r.id; } },
    inspectionId: { store: 'lineInspections', labelKey: 'pipelines.inspections', primary: function (r) { return (r.date || '') + ' · ' + (r.type || '') + ' · ' + r.id; } }
  };

  function previousQuarterISO() {
    var now = new Date();
    var y = now.getUTCFullYear();
    var q = Math.floor(now.getUTCMonth() / 3);
    var startMonth, endMonth;
    if (q === 0) { startMonth = 9; endMonth = 11; y = y - 1; }
    else { startMonth = (q - 1) * 3; endMonth = q * 3 - 1; }
    var from = new Date(Date.UTC(y, startMonth, 1));
    var to = new Date(Date.UTC(y, endMonth + 1, 0));
    return { fromISO: from.toISOString().slice(0, 10), toISO: to.toISOString().slice(0, 10) };
  }

  function doPrint() {
    if (typeof window === 'undefined') { return; }
    document.body.classList.add('print-mode');
    var cleanup = function () { document.body.classList.remove('print-mode'); };
    if (typeof window.addEventListener === 'function') {
      window.addEventListener('afterprint', cleanup, { once: true });
    }
    window.print();
    setTimeout(function () { document.body.classList.remove('print-mode'); }, 1500);
  }

  function copyText(text, t) {
    var fallback = function () {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.insetInlineStart = '-9999px';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); } catch (e) { /* ignore */ }
      document.body.removeChild(ta);
    };
    if (navigator && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      return navigator.clipboard.writeText(text).then(function () {
        ui().toast('common.copied', { severity: 'info' });
      }).catch(function () { fallback(); ui().toast('common.copied', { severity: 'info' }); });
    }
    fallback();
    ui().toast('common.copied', { severity: 'info' });
    return Promise.resolve();
  }

  // Mirror of csvWriter.downloadText for binary payloads (xlsx/docx/zip).
  // Returns false without a DOM/URL.createObjectURL, never throws.
  function downloadBytes(filename, bytes, mime) {
    if (typeof document === 'undefined' || !document.createElement) { return false; }
    if (typeof Blob === 'undefined' || typeof URL === 'undefined' ||
        typeof URL.createObjectURL !== 'function') { return false; }
    try {
      var blob = new Blob([bytes], { type: mime || 'application/octet-stream' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = String(filename || 'export.bin');
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(url); }, 0);
      return true;
    } catch (e) { return false; }
  }

  function fileBytes(file) {
    if (file && typeof file.arrayBuffer === 'function') {
      return file.arrayBuffer().then(function (ab) { return new Uint8Array(ab); });
    }
    return new Promise(function (resolve, reject) {
      if (typeof FileReader !== 'function' || !file) { reject(new Error('no FileReader')); return; }
      var r = new FileReader();
      r.onload = function () { resolve(new Uint8Array(r.result)); };
      r.onerror = function () { reject(r.error || new Error('read error')); };
      r.readAsArrayBuffer(file);
    });
  }

  return {
    id: 'reports',
    titleKey: 'nav.reports',
    icon: 'reports',
    render: function (container, ctx) {
      var t = ctx.i18n || function (k) { return k; };
      var repos = ctx.repos || {};
      var params = ctx.params || {};

      var reg = registryApi();
      var templates = (reg && typeof reg.list === 'function') ? reg.list() : LEGACY_TEMPLATES;

      var state = {
        type: params.mpId ? 'dossier' : (params.psvId ? 'datasheet' : 'quarterly'),
        mpId: params.mpId || null,
        psvId: params.psvId || null,
        lists: { monitoringPoints: [], psvs: [], pipelineSystems: [], lineInspections: [] },
        current: null
      };
      if (!templates.some(function (e) { return e.id === state.type; })) {
        state.type = templates.length ? templates[0].id : 'quarterly';
      }

      function templateById(id) {
        for (var i = 0; i < templates.length; i++) { if (templates[i].id === id) { return templates[i]; } }
        return null;
      }

      var view = el('div', { class: 'view view-reports' });
      view.appendChild(el('div', { class: 'page-header' }, el('h1', { text: t('reports.title') })));

      var typeSelect = el('select', { class: 'select', attrs: { 'aria-label': t('reports.title') } });
      templates.forEach(function (tmpl) {
        typeSelect.appendChild(el('option', { attrs: { value: tmpl.id }, text: t(tmpl.titleKey) }));
      });
      typeSelect.value = state.type;
      typeSelect.addEventListener('change', function () { state.type = typeSelect.value; renderControls(); });

      var controls = el('div', { class: 'card stack report-controls' });
      view.appendChild(el('div', { class: 'stack' }, typeSelect, controls));

      // Verificar paquete: independiente del informe montado (verifica zips
      // guardados, no el estado en memoria). Solo si evidencePack está cargado.
      if (packApi()) {
        var verifyInput = el('input', { class: 'input', attrs: { type: 'file', accept: '.zip' } });
        verifyInput.addEventListener('change', function () {
          var file = verifyInput.files && verifyInput.files[0];
          if (!file) { return; }
          fileBytes(file).then(function (bytes) {
            return packApi().verify(bytes);
          }).then(function (res) {
            ui().toast(res && res.ok ? 'export.verifyOk' : 'export.verifyFail',
              { severity: res && res.ok ? 'info' : 'warning' });
          }).catch(function () {
            ui().toast('export.verifyFail', { severity: 'warning' });
          });
        });
        view.appendChild(el('div', { class: 'card stack' },
          el('div', { class: 'field' }, el('label', { class: 'field-label', text: t('export.verify') }), verifyInput)));
      }

      container.appendChild(view);

      function builderFor(entry) {
        if (!entry) { return null; }
        if (typeof entry.buildModel === 'function') { return entry.buildModel; }
        var spec = BUILTIN_BUILDERS[entry.id];
        if (!spec) { return null; }
        var reports = reportsApi();
        var ns = reports ? reports[spec.ns] : null;
        return (ns && typeof ns[spec.method] === 'function') ? ns[spec.method] : null;
      }

      // Actor de la sesión (mismo patrón que views/ingest.js actorPromise).
      function actorPromise() {
        var lk = lockApi();
        if (!lk || typeof lk.currentSession !== 'function' || !repos.meta) { return Promise.resolve(null); }
        return Promise.resolve(lk.currentSession(repos.meta)).catch(function () { return null; });
      }

      function renderControls() {
        controls.textContent = '';
        var tmpl = templateById(state.type);
        var needs = (tmpl && Array.isArray(tmpl.needs)) ? tmpl.needs : [];
        var genBtn = el('button', { class: 'btn btn-primary', on: { click: function () { generate(); } } },
          icon('export', 18), el('span', { text: t('reports.generate') }));
        var inputs = {};

        needs.forEach(function (need) {
          if (need === 'period') {
            var period = previousQuarterISO();
            var fromInput = el('input', { class: 'input', attrs: { type: 'date', id: 'report-from' } });
            var toInput = el('input', { class: 'input', attrs: { type: 'date', id: 'report-to' } });
            fromInput.value = period.fromISO;
            toInput.value = period.toISO;
            inputs.period = { from: fromInput, to: toInput };
            controls.appendChild(el('div', { class: 'row' },
              el('div', { class: 'field' }, el('label', { class: 'field-label', text: t('reports.periodFrom') }), fromInput),
              el('div', { class: 'field' }, el('label', { class: 'field-label', text: t('reports.periodTo') }), toInput)));
            return;
          }
          var cfg = NEED_CONTROLS[need];
          if (!cfg) { return; }
          var sel = el('select', { class: 'select', attrs: { 'aria-label': t(cfg.labelKey) } });
          sel.appendChild(el('option', { attrs: { value: '' }, text: t('common.none') }));
          (state.lists[cfg.store] || []).forEach(function (r) {
            if (!r || !r.id) { return; }
            var base = cfg.primary(r);
            var label = (base && String(base) !== String(r.id)) ? (base + ' · ' + r.id) : String(r.id);
            sel.appendChild(el('option', { attrs: { value: r.id }, text: label }));
          });
          if (need === 'mpId' && state.mpId) { sel.value = state.mpId; }
          if (need === 'psvId' && state.psvId) { sel.value = state.psvId; }
          inputs[need] = sel;
          controls.appendChild(el('div', { class: 'field' }, el('label', { class: 'field-label', text: t(cfg.labelKey) }), sel));
        });

        function missingNeeds() {
          for (var i = 0; i < needs.length; i++) {
            var need = needs[i];
            if (need === 'period') {
              if (!inputs.period || !inputs.period.from.value || !inputs.period.to.value) { return true; }
            } else if (NEED_CONTROLS[need]) {
              if (!inputs[need] || !inputs[need].value) { return true; }
            }
          }
          return false;
        }
        var refreshDisabled = function () { genBtn.disabled = missingNeeds(); };
        Object.keys(inputs).forEach(function (k) {
          var node = k === 'period' ? [inputs.period.from, inputs.period.to] : [inputs[k]];
          node.forEach(function (n) { n.addEventListener('change', refreshDisabled); });
        });
        refreshDisabled();

        controls.appendChild(genBtn);
        state.lastInputs = inputs;
      }

      function currentOpts() {
        var opts = { repos: repos, t: t, now: new Date().toISOString() };
        var tmpl = templateById(state.type);
        var needs = (tmpl && Array.isArray(tmpl.needs)) ? tmpl.needs : [];
        var inputs = state.lastInputs || {};
        needs.forEach(function (need) {
          if (need === 'period' && inputs.period) {
            opts.period = { fromISO: inputs.period.from.value, toISO: inputs.period.to.value };
          } else if (NEED_CONTROLS[need] && inputs[need] && inputs[need].value) {
            opts[need] = inputs[need].value;
          }
        });
        return opts;
      }

      function printHost() {
        var host = document.getElementById('print-host');
        if (!host) {
          host = document.createElement('div');
          host.id = 'print-host';
          // Mount inside the view container (main.app-main), never on body: body is
          // a grid whose auto-placement would pin the host into the 240px sidebar cell.
          container.appendChild(host);
        }
        host.textContent = '';
        return host;
      }

      function mountReport(element, actions) {
        var host = printHost();
        var toolbar = el('div', { class: 'print-toolbar' });
        toolbar.appendChild(el('button', { class: 'btn btn-primary', on: { click: doPrint } }, icon('print', 18), el('span', { text: t('common.print') })));
        (actions || []).forEach(function (a) { toolbar.appendChild(a); });
        host.appendChild(toolbar);
        host.appendChild(element);
        host.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }

      // ------------------------------------------------------------- export
      function buildToolbarActions(cur) {
        var actions = [];

        if (cur.id === 'datasheet') {
          var ds = reportsApi() && reportsApi().datasheet;
          if (ds && typeof ds.toClipboardText === 'function') {
            var psv = null;
            (state.lists.psvs || []).forEach(function (p) { if (p && p.id === cur.opts.psvId) { psv = p; } });
            actions.push(el('button', { class: 'btn', on: { click: function () { copyText(ds.toClipboardText(psv, t), t); } } },
              icon('clipboard', 18), el('span', { text: t('common.copy') })));
          }
        }

        var fmts = formatsApi();
        if (fmts && typeof fmts.produce === 'function') {
          var fmtSelect = el('select', { class: 'select', attrs: { 'aria-label': t('export.format') } });
          (fmts.formatsFor ? fmts.formatsFor() : fmts.FORMATS).forEach(function (f) {
            fmtSelect.appendChild(el('option', { attrs: { value: f }, text: String(f).toUpperCase() }));
          });
          var fileBtn = el('button', { class: 'btn', on: { click: function () { generateFile(cur, fmtSelect.value); } } },
            icon('download', 18), el('span', { text: t('export.generate') }));
          actions.push(fmtSelect, fileBtn);
        }

        if (packApi()) {
          actions.push(el('button', { class: 'btn', on: { click: function () { packEvidence(cur, null); } } },
            icon('export', 18), el('span', { text: t('reports.evidencePackage') })));
          if (cur.id === 'T-12') {
            actions.push(el('button', { class: 'btn', on: { click: function () { handover(cur); } } },
              icon('download', 18), el('span', { text: t('reports.handover') })));
          }
        }
        return actions;
      }

      function generateFile(cur, format) {
        var fmts = formatsApi();
        if (!fmts) { return Promise.resolve(false); }
        ui().toast('export.generating', { severity: 'info' });
        var fecha = new Date().toISOString().slice(0, 10);
        var locale = (i18nApi() && typeof i18nApi().getLocale === 'function') ? i18nApi().getLocale() : 'es';
        return Promise.resolve().then(function () {
          return fmts.produce(cur.model, format, { t: t, locale: locale, filename: cur.id + '-' + fecha });
        }).then(function (res) {
          if (!res) { return false; }
          if (res.action === 'print') { doPrint(); return true; }
          if (typeof res.data === 'string') {
            var csv = csvApi();
            return !!(csv && csv.downloadText(res.filename, res.data, res.mime));
          }
          return downloadBytes(res.filename, res.data, res.mime);
        }).then(function (ok) {
          ui().toast(ok ? 'export.done' : 'export.failed', { severity: ok ? 'info' : 'critical' });
          return ok;
        }).catch(function () {
          ui().toast('export.failed', { severity: 'critical' });
          return false;
        });
      }

      // ------------------------------------------------------- evidence pack
      function flattenCsv(model) {
        var fmts = formatsApi();
        if (!fmts || typeof fmts.flatten !== 'function') { return null; }
        try { return fmts.flatten(model, t).csvText; } catch (e) { return null; }
      }

      function packEvidence(cur, photoFiles) {
        var pk = packApi();
        if (!pk) { return Promise.resolve(false); }
        ui().toast('export.packaging', { severity: 'info' });
        var files = [{ name: cur.id + '.json', content: JSON.stringify(cur.model) }];
        var csvText = flattenCsv(cur.model);
        if (csvText !== null) { files.push({ name: cur.id + '.csv', content: csvText }); }
        if (photoFiles && photoFiles.length) { files = files.concat(photoFiles); }
        return actorPromise().then(function (s) {
          var user = (s && (s.username || s.role)) || undefined;
          return pk.build(files, { reportId: cur.id, user: user, createdAtISO: new Date().toISOString() });
        }).then(function (res) {
          var ok = downloadBytes(cur.id + '-evidencia.zip', res.bytes, 'application/zip');
          if (pk.markMeta && repos.meta && typeof repos.meta.set === 'function') {
            return pk.markMeta(repos.meta, res).then(function () { return ok; });
          }
          return ok;
        }).then(function (ok) {
          ui().toast(ok ? 'export.packDone' : 'export.failed', { severity: ok ? 'info' : 'critical' });
          return ok;
        }).catch(function () {
          ui().toast('export.failed', { severity: 'critical' });
          return false;
        });
      }

      // --------------------------------------------- T-12 handover con fotos
      function photoExt(dataUrl) {
        var m = /^data:image\/([a-z+]+)/i.exec(dataUrl);
        var sub = m ? m[1].toLowerCase() : '';
        if (sub === 'png') { return 'png'; }
        if (sub === 'webp') { return 'webp'; }
        if (sub === 'gif') { return 'gif'; }
        return 'jpg';
      }

      // Best-effort: sin fetch o con dataURLs que el entorno no resuelve, la
      // foto se omite (try/catch por foto, nunca rompe el paquete).
      function decodePhoto(cur, p, idx) {
        var dataUrl = p && p.dataUrl;
        if (typeof dataUrl !== 'string' || dataUrl.indexOf('data:') !== 0 || typeof fetch !== 'function') {
          return Promise.resolve(null);
        }
        var pad = idx < 9 ? '0' + (idx + 1) : String(idx + 1);
        var name = cur.id + '-foto-' + pad + '.' + photoExt(dataUrl);
        return Promise.resolve().then(function () { return fetch(dataUrl); })
          .then(function (r) { return r && typeof r.arrayBuffer === 'function' ? r.arrayBuffer() : null; })
          .then(function (buf) { return buf ? { name: name, content: new Uint8Array(buf) } : null; })
          .catch(function () { return null; });
      }

      function collectPhotos(cur) {
        var insp = state.lists.lineInspections || [];
        var period = cur.opts && cur.opts.period;
        var fromMs = period && period.fromISO ? Date.parse(period.fromISO) : null;
        var toMs = period && period.toISO ? Date.parse(period.toISO) : null;
        var pool = [];
        insp.forEach(function (rec) {
          if (!rec || !Array.isArray(rec.photos) || !rec.photos.length) { return; }
          if (fromMs !== null && toMs !== null && !isNaN(fromMs) && !isNaN(toMs)) {
            var d = Date.parse(rec.date);
            if (isNaN(d) || d < fromMs || d >= toMs) { return; }
          }
          rec.photos.forEach(function (p) { pool.push(p); });
        });
        pool = pool.slice(0, 12);
        var chain = Promise.resolve([]);
        pool.forEach(function (p, i) {
          chain = chain.then(function (acc) {
            return decodePhoto(cur, p, i).then(function (f) {
              if (f) { acc.push(f); }
              return acc;
            });
          });
        });
        return chain;
      }

      // handover reutiliza el modelo T-12 YA generado (render + modelo viven en
      // cur); construirlo otra vez sería trabajo duplicado del mismo buildReport.
      function handover(cur) {
        return collectPhotos(cur).then(function (photoFiles) {
          return packEvidence(cur, photoFiles);
        });
      }

      // ------------------------------------------------------------- generar
      function generate() {
        var tmpl = templateById(state.type);
        var builder = builderFor(tmpl);
        var rend = rendererApi();
        if (!builder) {
          ui().toast('common.error', { severity: 'critical' });
          return Promise.resolve(false);
        }
        var opts = currentOpts();
        return Promise.resolve().then(function () { return builder(opts); }).then(function (model) {
          if (!model) { return false; }
          state.current = { id: state.type, opts: opts, model: model };
          var element = (rend && typeof rend.render === 'function') ? rend.render(model, t) : null;
          if (element) { mountReport(element, buildToolbarActions(state.current)); }
          return true;
        }).catch(function () {
          ui().toast('common.error', { severity: 'critical' });
          return false;
        });
      }

      function listP(name) {
        var repo = repos[name];
        if (repo && typeof repo.list === 'function') {
          return Promise.resolve(repo.list()).catch(function () { return []; });
        }
        return Promise.resolve([]);
      }

      // Carga los stores que cualquier plantilla puede necesitar, luego pinta
      // los controles y auto-genera cuando la ruta trae un id explícito.
      return Promise.all([
        listP('monitoringPoints'),
        listP('psvs'),
        listP('pipelineSystems'),
        listP('lineInspections')
      ]).then(function (data) {
        state.lists.monitoringPoints = data[0] || [];
        state.lists.psvs = data[1] || [];
        state.lists.pipelineSystems = data[2] || [];
        state.lists.lineInspections = data[3] || [];
        renderControls();
        if (params.mpId || params.psvId) { return generate(); }
        return undefined;
      });
    }
  };
});
