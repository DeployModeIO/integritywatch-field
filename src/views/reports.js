/* IntegrityWatch Field — reports view
   Report type selection and generation of quarterly / dossier / datasheet. */
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

  return {
    id: 'reports',
    titleKey: 'nav.reports',
    icon: 'reports',
    render: function (container, ctx) {
      var t = ctx.i18n || function (k) { return k; };
      var repos = ctx.repos || {};
      var params = ctx.params || {};

      var state = {
        type: params.mpId ? 'dossier' : (params.psvId ? 'datasheet' : 'quarterly'),
        mpId: params.mpId || null,
        psvId: params.psvId || null,
        points: [],
        psvs: []
      };

      var view = el('div', { class: 'view view-reports' });
      view.appendChild(el('div', { class: 'page-header' }, el('h1', { text: t('reports.title') })));

      var typeSelect = el('select', { class: 'select', attrs: { 'aria-label': t('reports.title') } });
      [['quarterly', 'reports.quarterly'], ['dossier', 'reports.dossier'], ['datasheet', 'reports.datasheet']].forEach(function (p) {
        typeSelect.appendChild(el('option', { attrs: { value: p[0] }, text: t(p[1]) }));
      });
      typeSelect.value = state.type;
      typeSelect.addEventListener('change', function () { state.type = typeSelect.value; renderControls(); });

      var controls = el('div', { class: 'card stack report-controls' });
      var generateArea = el('div', { class: 'stack' });

      view.appendChild(el('div', { class: 'stack' }, typeSelect, controls, generateArea));
      container.appendChild(view);

      function renderControls() {
        controls.textContent = '';
        if (state.type === 'quarterly') {
          var period = previousQuarterISO();
          var fromInput = el('input', { class: 'input', attrs: { type: 'date', id: 'report-from' } });
          var toInput = el('input', { class: 'input', attrs: { type: 'date', id: 'report-to' } });
          fromInput.value = period.fromISO;
          toInput.value = period.toISO;
          controls.appendChild(el('div', { class: 'row' },
            el('div', { class: 'field' }, el('label', { class: 'field-label', text: t('reports.periodFrom') }), fromInput),
            el('div', { class: 'field' }, el('label', { class: 'field-label', text: t('reports.periodTo') }), toInput)));
          controls.appendChild(el('button', { class: 'btn btn-primary', on: { click: function () { generateQuarterly(fromInput.value, toInput.value); } } }, icon('export', 18), el('span', { text: t('reports.generate') })));
        } else if (state.type === 'dossier') {
          var mpSelect = el('select', { class: 'select', attrs: { 'aria-label': t('reports.selectPoint') } });
          mpSelect.appendChild(el('option', { attrs: { value: '' }, text: t('common.none') }));
          state.points.forEach(function (p) {
            mpSelect.appendChild(el('option', { attrs: { value: p.id }, text: p.code || p.id }));
          });
          if (state.mpId) { mpSelect.value = state.mpId; }
          controls.appendChild(el('div', { class: 'field' }, el('label', { class: 'field-label', text: t('reports.selectPoint') }), mpSelect));
          controls.appendChild(el('button', { class: 'btn btn-primary', on: { click: function () { if (mpSelect.value) { generateDossier(mpSelect.value); } } } }, icon('export', 18), el('span', { text: t('reports.generate') })));
        } else {
          var psvSelect = el('select', { class: 'select', attrs: { 'aria-label': t('reports.selectPsv') } });
          psvSelect.appendChild(el('option', { attrs: { value: '' }, text: t('common.none') }));
          state.psvs.forEach(function (p) {
            psvSelect.appendChild(el('option', { attrs: { value: p.id }, text: p.tag || p.id }));
          });
          if (state.psvId) { psvSelect.value = state.psvId; }
          controls.appendChild(el('div', { class: 'field' }, el('label', { class: 'field-label', text: t('reports.selectPsv') }), psvSelect));
          controls.appendChild(el('button', { class: 'btn btn-primary', on: { click: function () { if (psvSelect.value) { generateDatasheet(psvSelect.value); } } } }, icon('export', 18), el('span', { text: t('reports.generate') })));
        }
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

      function generateQuarterly(from, to) {
        var q = reportsApi() && reportsApi().quarterly;
        if (!q) { return; }
        return q.build({ repos: repos, period: { fromISO: from, toISO: to }, t: t }).then(function (element) {
          if (element) { mountReport(element, []); }
        });
      }

      function generateDossier(mpId) {
        var d = reportsApi() && reportsApi().dossier;
        if (!d) { return; }
        return d.build({ repos: repos, mpId: mpId, t: t }).then(function (element) {
          if (element) { mountReport(element, []); }
        });
      }

      function generateDatasheet(psvId) {
        var ds = reportsApi() && reportsApi().datasheet;
        if (!ds) { return; }
        var psv = null;
        for (var i = 0; i < state.psvs.length; i++) { if (state.psvs[i].id === psvId) { psv = state.psvs[i]; break; } }
        return ds.build({ repos: repos, psvId: psvId, t: t }).then(function (element) {
          if (element) {
            var copyBtn = el('button', { class: 'btn', on: { click: function () { copyText(ds.toClipboardText(psv, t), t); } } }, icon('clipboard', 18), el('span', { text: t('common.copy') }));
            mountReport(element, [copyBtn]);
          }
        });
      }

      // Load selectors, then auto-generate when a route param is present.
      return Promise.all([
        repos.monitoringPoints.list(),
        repos.psvs.list()
      ]).then(function (data) {
        state.points = data[0] || [];
        state.psvs = data[1] || [];
        renderControls();
        if (params.mpId) { return generateDossier(params.mpId); }
        if (params.psvId) { return generateDatasheet(params.psvId); }
        return undefined;
      });
    }
  };
});
