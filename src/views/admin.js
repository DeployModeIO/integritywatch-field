/* IntegrityWatch Field — admin view
   App settings: about, appearance, rules config, data, security, storage, sync, SW, standards. */
(function (root, factory) {
  'use strict';
  var api = factory(root);
  root.IW = root.IW || {};
  root.IW.views = root.IW.views || {};
  root.IW.views.admin = api;
  if (typeof module === 'object' && module.exports) { module.exports = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  var DATA_STORES = ['monitoringPoints', 'readings', 'coupons', 'psvs', 'pipelineSystems', 'lineAssets', 'lineInspections', 'apmAssets', 'apmEvents', 'recommendations', 'importLog', 'mutationQueue'];
  var DEMO_RESET_STORES = ['monitoringPoints', 'readings', 'coupons', 'psvs', 'pipelineSystems', 'lineAssets', 'lineInspections', 'iliAnomalies', 'apmAssets', 'apmEvents', 'recommendations'];

  function ui() { return root.IW.ui; }
  function lock() { return root.IW.security ? root.IW.security.lock : null; }
  function permissions() { return root.IW.security ? root.IW.security.permissions : null; }
  function users() { return root.IW.security ? root.IW.security.users : null; }
  function exportImport() { return root.IW.core ? root.IW.core.exportImport : null; }
  function caseFile() { return root.IW.core ? root.IW.core.caseFile : null; }
  function syncQueue() { return root.IW.core ? root.IW.core.syncQueue : null; }
  function theme() { return root.IW.app ? root.IW.app.theme : null; }
  function i18n() { return root.IW.i18n; }

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

  function sectionCard(titleKey, bodyNodes) {
    return el('section', { class: 'card admin-section' },
      el('h2', { text: titleKey }),
      el('div', { class: 'stack' }, bodyNodes));
  }

  function fmtBytes(n) {
    if (typeof n !== 'number' || !isFinite(n)) { return '—'; }
    var units = ['B', 'KB', 'MB', 'GB'];
    var i = 0;
    while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
    return n.toFixed(i === 0 ? 0 : 1) + ' ' + units[i];
  }

  return {
    id: 'admin',
    titleKey: 'nav.admin',
    icon: 'admin',
    render: function (container, ctx) {
      var t = ctx.i18n || function (k) { return k; };
      var repos = ctx.repos || {};
      var bus = ctx.bus;

      var guard = (permissions() && typeof permissions().guard === 'function') ? permissions().guard(repos.meta) : null;
      function requirePerm(action) {
        return guard ? guard.require(action) : Promise.resolve(true);
      }
      function isForbidden(err) {
        return !!(err && err.code === 'E_FORBIDDEN');
      }
      function forbiddenToast(err) {
        toast(isForbidden(err) ? 'security.forbidden' : 'common.error', isForbidden(err) ? 'warning' : 'critical');
      }

      var view = el('div', { class: 'view view-admin' });
      view.appendChild(el('div', { class: 'page-header' }, el('h1', { text: t('admin.title') })));

      var grid = el('div', { class: 'admin-grid' });

      // --- About --------------------------------------------------------------
      var about = sectionCard(t('admin.about'), []);
      var cf = caseFile();
      var versionRow = el('p', { text: t('admin.version') + ': ' + (cf && cf.APP_VERSION ? cf.APP_VERSION : '1.4.1') });
      about.appendChild(versionRow);
      grid.appendChild(about);

      // --- Appearance -----------------------------------------------------------
      var appearance = sectionCard(t('admin.appearance'), []);
      var themeFieldset = el('fieldset', { class: 'stack' });
      themeFieldset.appendChild(el('legend', { text: t('common.theme') }));
      var themeRadios = {};
      ['light', 'dark', 'system'].forEach(function (th) {
        var radio = el('input', { attrs: { type: 'radio', name: 'admin-theme', value: th, id: 'admin-theme-' + th } });
        radio.addEventListener('change', function () {
          if (radio.checked && theme() && typeof theme().setTheme === 'function') { theme().setTheme(th); }
        });
        themeRadios[th] = radio;
        themeFieldset.appendChild(el('label', { class: 'field-label row' }, radio, el('span', { text: t('common.' + th) })));
      });
      appearance.appendChild(themeFieldset);

      var localeSelect = el('select', { class: 'select', attrs: { 'aria-label': t('admin.locale') } });
      var locales = (i18n() && typeof i18n().listLocales === 'function') ? i18n().listLocales() : [];
      locales.forEach(function (l) {
        localeSelect.appendChild(el('option', { attrs: { value: l.code }, text: l.nativeName || l.name || l.code }));
      });
      var currentLocale = (i18n() && typeof i18n().getLocale === 'function') ? i18n().getLocale() : 'en';
      localeSelect.value = currentLocale;
      localeSelect.addEventListener('change', function () {
        if (i18n() && typeof i18n().setLocale === 'function') { i18n().setLocale(localeSelect.value); }
      });
      appearance.appendChild(el('div', { class: 'field' },
        el('label', { class: 'field-label', text: t('admin.locale') }), localeSelect));
      grid.appendChild(appearance);

      // --- Rules config ----------------------------------------------------------
      var rulesCard = sectionCard(t('admin.rulesConfig'), []);
      var ruleFields = [
        ['rulesIntervalSec', t('admin.intervalSec'), 60, 'number'],
        ['residualBandPct', t('admin.residualBand'), 20, 'number'],
        ['availabilityThresholdPct', t('admin.availabilityThreshold'), 90, 'number'],
        ['stuckSensorCount', t('admin.stuckSensor'), 10, 'number'],
        ['zScoreThreshold', t('admin.zScore'), 3, 'number']
      ];
      var ruleInputs = {};
      ruleFields.forEach(function (f) {
        var input = el('input', { class: 'input', attrs: { type: f[3] } });
        input.value = String(f[2]);
        ruleInputs[f[0]] = input;
        rulesCard.appendChild(el('div', { class: 'field' },
          el('label', { class: 'field-label', text: f[1] }), input));
      });
      var saveRulesBtn = el('button', { class: 'btn btn-primary', on: { click: onSaveRules } }, icon('check', 18), el('span', { text: t('common.save') }));
      rulesCard.appendChild(saveRulesBtn);
      grid.appendChild(rulesCard);

      // --- Data management --------------------------------------------------------
      var dataCard = sectionCard(t('admin.dataManagement'), []);
      var exportBtn = el('button', { class: 'btn', on: { click: onExport } }, icon('download', 18), el('span', { text: t('admin.exportAll') }));
      var importFileInput = el('input', { class: 'visually-hidden', attrs: { type: 'file', id: 'admin-import-file', accept: '.json,application/json' } });
      var importBtn = el('button', { class: 'btn', on: { click: function () { importFileInput.click(); } } }, icon('upload', 18), el('span', { text: t('admin.importAll') }));
      importFileInput.addEventListener('change', function () {
        if (importFileInput.files && importFileInput.files.length) { onImport(importFileInput.files[0]); }
      });
      var resetBtn = el('button', { class: 'btn', on: { click: onResetDemo } }, icon('refresh', 18), el('span', { text: t('admin.resetDemo') }));
      var clearBtn = el('button', { class: 'btn btn-danger', on: { click: onClearAll } }, icon('trash', 18), el('span', { text: t('admin.clearAll') }));
      dataCard.appendChild(el('div', { class: 'row' }, exportBtn, importBtn, importFileInput, resetBtn));
      // .iwf expedition format export/import — F3a
      var iwfExportBtn = el('button', { class: 'btn', on: { click: onExportIwf } }, icon('download', 18), el('span', { text: t('caseFile.exportBtn') }));
      var iwfImportFileInput = el('input', { class: 'visually-hidden', attrs: { type: 'file', id: 'admin-iwf-import-file', accept: '.iwf,application/json' } });
      var iwfImportBtn = el('button', { class: 'btn', on: { click: function () { iwfImportFileInput.click(); } } }, icon('upload', 18), el('span', { text: t('caseFile.importBtn') }));
      iwfImportFileInput.addEventListener('change', function () {
        if (iwfImportFileInput.files && iwfImportFileInput.files.length) { onImportIwf(iwfImportFileInput.files[0]); }
      });
      dataCard.appendChild(el('div', { class: 'row' }, iwfExportBtn, iwfImportBtn, iwfImportFileInput));
      dataCard.appendChild(el('div', { class: 'row' }, clearBtn));
      grid.appendChild(dataCard);

      // --- Security -----------------------------------------------------------------
      var securityCard = sectionCard(t('admin.security'), []);
      var lockEnabledEl = el('p', {});
      securityCard.appendChild(lockEnabledEl);

      var pinInput = el('input', { class: 'input', attrs: { type: 'password', inputmode: 'numeric' } });
      var pinRepeatInput = el('input', { class: 'input', attrs: { type: 'password', inputmode: 'numeric' } });
      var roleSelect = el('select', { class: 'select' });
      roleSelect.appendChild(el('option', { attrs: { value: 'operator' }, text: t('admin.roles.operator') }));
      roleSelect.appendChild(el('option', { attrs: { value: 'engineer' }, text: t('admin.roles.engineer') }));
      roleSelect.appendChild(el('option', { attrs: { value: 'admin' }, text: t('admin.roles.admin') }));
      securityCard.appendChild(el('div', { class: 'field' }, el('label', { class: 'field-label', text: t('admin.pin') }), pinInput));
      securityCard.appendChild(el('div', { class: 'field' }, el('label', { class: 'field-label', text: t('admin.pinRepeat') }), pinRepeatInput));
      securityCard.appendChild(el('div', { class: 'field' }, el('label', { class: 'field-label', text: t('admin.role') }), roleSelect));
      var enableBtn = el('button', { class: 'btn btn-primary', on: { click: onEnableLock } }, icon('lock', 18), el('span', { text: t('admin.enableLock') }));
      var disableBtn = el('button', { class: 'btn', on: { click: onDisableLock } }, icon('unlock', 18), el('span', { text: t('admin.disableLock') }));
      var changePinBtn = el('button', { class: 'btn', on: { click: onChangePin } }, icon('keyboard', 18), el('span', { text: t('admin.changePin') }));
      securityCard.appendChild(el('div', { class: 'row' }, enableBtn, disableBtn, changePinBtn));
      grid.appendChild(securityCard);

      // --- Audit log (security.auditlog) ---------------------------------------
      // Sin IW.security.auditlog cargado la tarjeta no se pinta: el resto de la
      // vista queda intacto (guard best-effort, ítems 1–3 del módulo audit.title).
      var AUDIT_PAGE_MAX = 200;
      var auditlog = (root.IW.security && root.IW.security.auditlog) ? root.IW.security.auditlog : null;
      var auditCard = null;
      var auditBreaksEl = null;
      var auditTableWrap = null;
      var auditEmptyEl = null;
      var auditNoteEl = null;
      var auditFromInput = null;
      var auditToInput = null;
      var auditFmtSel = null;
      var auditLogsCache = [];
      if (auditlog) {
        auditCard = sectionCard(t('audit.title'), []);
        auditCard.hidden = true;
        var verifyAuditBtn = el('button', { class: 'btn', attrs: { 'data-perm': 'admin' }, on: { click: onAuditVerify } },
          icon('check', 18), el('span', { text: t('audit.verify') }));
        auditBreaksEl = el('div', { class: 'stack' });
        auditBreaksEl.hidden = true;
        auditCard.appendChild(el('div', { class: 'row' }, verifyAuditBtn));
        auditCard.appendChild(auditBreaksEl);

        auditFromInput = el('input', { class: 'input', attrs: { type: 'date', 'aria-label': 'desde' } });
        auditToInput = el('input', { class: 'input', attrs: { type: 'date', 'aria-label': 'hasta' } });
        auditFromInput.value = auditIsoDay(-30);
        auditToInput.value = auditIsoDay(0);
        var auditRangeBtn = el('button', { class: 'btn btn-primary', attrs: { 'data-perm': 'admin' }, on: { click: onAuditRange } },
          icon('search', 18), el('span', { text: t('export.generate') }));
        auditCard.appendChild(el('div', { class: 'row' },
          el('div', { class: 'field' }, el('label', { class: 'field-label', text: 'desde' }), auditFromInput),
          el('div', { class: 'field' }, el('label', { class: 'field-label', text: 'hasta' }), auditToInput),
          auditRangeBtn));

        auditEmptyEl = el('p', { class: 'empty-state', text: t('audit.empty') });
        auditEmptyEl.hidden = true;
        auditTableWrap = el('div', { class: 'table-wrap' });
        auditNoteEl = el('p', { class: 'field-hint' });
        auditCard.appendChild(auditEmptyEl);
        auditCard.appendChild(auditTableWrap);
        auditCard.appendChild(auditNoteEl);

        auditFmtSel = el('select', { class: 'select', attrs: { 'aria-label': t('export.format') } });
        ['csv', 'xlsx', 'json', 'docx', 'xml'].forEach(function (f) {
          auditFmtSel.appendChild(el('option', { attrs: { value: f }, text: f }));
        });
        auditFmtSel.value = 'csv';
        var exportAuditBtn = el('button', { class: 'btn', attrs: { 'data-perm': 'admin' }, on: { click: onAuditExport } },
          icon('download', 18), el('span', { text: t('audit.exportRange') }));
        auditCard.appendChild(el('div', { class: 'row' },
          el('div', { class: 'field' }, el('label', { class: 'field-label', text: t('export.format') }), auditFmtSel),
          exportAuditBtn));
        grid.appendChild(auditCard);
      }

      // --- Users & access ---------------------------------------------------------
      var usersCard = sectionCard(t('admin.users.title'), []);
      var usersListEl = el('div', { class: 'stack' });
      var usersHintEl = el('p', { class: 'field-hint', text: t('admin.users.hint') });
      var createForm = el('div', { class: 'stack' });

      var createUsername = el('input', { class: 'input', attrs: { id: 'admin-user-username', autocomplete: 'off' } });
      var createPass = el('input', { class: 'input', attrs: { id: 'admin-user-pass', type: 'password', autocomplete: 'new-password' } });
      var createRole = el('select', { class: 'select', attrs: { id: 'admin-user-role' } });
      ['operator', 'engineer', 'admin'].forEach(function (r) {
        createRole.appendChild(el('option', { attrs: { value: r }, text: t('admin.roles.' + r) }));
      });
      var createBtn = el('button', { class: 'btn btn-primary', on: { click: onCreateUser } }, icon('plus', 18), el('span', { text: t('admin.users.create') }));

      createForm.appendChild(el('h3', { text: t('admin.users.create') }));
      createForm.appendChild(el('div', { class: 'field' },
        el('label', { class: 'field-label', attrs: { for: 'admin-user-username' }, text: t('admin.users.username') }), createUsername));
      createForm.appendChild(el('div', { class: 'field' },
        el('label', { class: 'field-label', attrs: { for: 'admin-user-pass' }, text: t('admin.users.passphrase') }), createPass));
      createForm.appendChild(el('div', { class: 'field' },
        el('label', { class: 'field-label', attrs: { for: 'admin-user-role' }, text: t('admin.users.role') }), createRole));
      createForm.appendChild(createBtn);

      usersCard.appendChild(usersHintEl);
      usersCard.appendChild(usersListEl);
      usersCard.appendChild(createForm);
      usersCard.hidden = true;
      grid.appendChild(usersCard);

      // --- Storage -------------------------------------------------------------------
      var storageCard = sectionCard(t('admin.storageUsage'), []);
      var storageEl = el('p', { text: t('common.loading') });
      storageCard.appendChild(storageEl);
      var countsEl = el('div', { class: 'stack' });
      storageCard.appendChild(countsEl);
      grid.appendChild(storageCard);

      // --- Sync -----------------------------------------------------------------------
      var syncCard = sectionCard(t('ingest.queueTitle'), []);
      var syncEndpointInput = el('input', { class: 'input', attrs: { type: 'url', id: 'admin-sync-endpoint', 'aria-label': t('ingest.syncEndpoint') } });
      var syncTokenInput = el('input', { class: 'input', attrs: { type: 'password', id: 'admin-sync-token', 'aria-label': t('admin.syncToken'), autocomplete: 'off' } });
      var syncTokenCache = null;
      var syncStatusEl = el('p', { attrs: { role: 'status', 'aria-live': 'polite' } });
      var flushBtn = el('button', { class: 'btn', on: { click: onFlush } }, icon('refresh', 18), el('span', { text: t('ingest.flush') }));
      var deadListEl = el('div', { class: 'stack' });
      syncCard.appendChild(el('div', { class: 'field' },
        el('label', { class: 'field-label', text: t('ingest.syncEndpoint') }), syncEndpointInput));
      syncCard.appendChild(el('div', { class: 'field' },
        el('label', { class: 'field-label', text: t('admin.syncToken') }), syncTokenInput));
      syncCard.appendChild(syncStatusEl);
      syncCard.appendChild(el('div', { class: 'row' }, flushBtn));
      syncCard.appendChild(deadListEl);
      grid.appendChild(syncCard);

      // --- SW status ---------------------------------------------------------------------
      var swCard = sectionCard(t('admin.swStatus'), []);
      var swEl = el('p', { text: t('common.loading') });
      swCard.appendChild(swEl);
      var forceUpdateBtn = el('button', { class: 'btn', on: { click: onForceUpdate } },
        icon('refresh', 18), el('span', { text: t('admin.forceUpdate') }));
      var forceUpdateHint = el('p', { class: 'field-hint', text: t('admin.forceUpdateHint') });
      swCard.appendChild(forceUpdateBtn);
      swCard.appendChild(forceUpdateHint);
      grid.appendChild(swCard);

      // --- Standards reference -------------------------------------------------------------
      var standardsCard = sectionCard(t('admin.standardsRef'), []);
      var standardsEl = el('div', { class: 'stack' });
      standardsCard.appendChild(standardsEl);
      grid.appendChild(standardsCard);

      view.appendChild(grid);

      // --- Behaviour helpers ---------------------------------------------------------------
      function toast(key, severity) { ui().toast(key, { severity: severity || 'info' }); }

      function toastUserError(code) {
        if (!code) { toast('common.error', 'critical'); return; }
        toast('admin.users.errors.' + code, 'warning');
      }

      function effectiveRole() {
        var lk = lock();
        return lk.isEnabled(repos.meta).then(function (enabled) {
          if (!enabled) { return 'admin'; }
          return lk.role(repos.meta);
        });
      }

      function sessionUsername() {
        var lk = lock();
        if (lk && typeof lk.currentSession === 'function') {
          return lk.currentSession(repos.meta).then(function (s) {
            return (s && s.username) ? s.username : null;
          });
        }
        return Promise.resolve(null);
      }

      function buildUserRow(u) {
        var actionsTd = el('td', { class: 'row' });
        actionsTd.appendChild(el('button', { class: 'btn', on: { click: function () { onSetPass(u); } } },
          icon('keyboard', 18), el('span', { text: t('admin.users.setPass') })));
        actionsTd.appendChild(el('button', { class: 'btn', on: { click: function () { onChangeRole(u); } } },
          icon('edit', 18), el('span', { text: t('admin.users.changeRole') })));
        actionsTd.appendChild(el('button', { class: 'btn', on: { click: function () { onToggleActive(u); } } },
          icon(u.active === false ? 'check' : 'x', 18),
          el('span', { text: t(u.active === false ? 'admin.users.activate' : 'admin.users.deactivate') })));
        return el('tr', null,
          el('td', { text: u.username }),
          el('td', { text: t('admin.roles.' + (u.role || 'operator')) }),
          el('td', { text: u.active === false ? t('admin.users.inactive') : t('admin.users.active') }),
          actionsTd);
      }

      function refreshUserList() {
        var u = users();
        return u.listUsers(repos.meta).then(function (list) {
          usersListEl.textContent = '';
          var tbl = el('table', { class: 'data' });
          tbl.appendChild(el('caption', { text: t('admin.users.title') }));
          var thead = el('thead', null, el('tr', null,
            el('th', { attrs: { scope: 'col' }, text: t('admin.users.username') }),
            el('th', { attrs: { scope: 'col' }, text: t('admin.users.role') }),
            el('th', { attrs: { scope: 'col' }, text: t('common.status') }),
            el('th', { attrs: { scope: 'col' }, text: t('common.actions') })));
          var tbody = el('tbody');
          list.forEach(function (u) { tbody.appendChild(buildUserRow(u)); });
          tbl.appendChild(thead);
          tbl.appendChild(tbody);
          usersListEl.appendChild(el('div', { class: 'table-wrap' }, tbl));
        });
      }

      function renderUsers() {
        var u = users();
        if (!u || typeof u.hasUsers !== 'function') {
          usersCard.hidden = true;
          return Promise.resolve();
        }
        return u.hasUsers(repos.meta).then(function (hasUsers) {
          return effectiveRole().then(function (role) {
            if (role !== 'admin') {
              usersCard.hidden = true;
              return;
            }
            usersCard.hidden = false;
            if (!hasUsers) {
              usersHintEl.hidden = false;
              usersListEl.hidden = true;
              createForm.hidden = true;
              usersListEl.textContent = '';
              return;
            }
            usersHintEl.hidden = true;
            usersListEl.hidden = false;
            createForm.hidden = false;
            return refreshUserList();
          });
        });
      }

      function auditCell(v) {
        return (v === undefined || v === null) ? '' : String(v);
      }

      function auditIsoDay(offsetDays) {
        var d = new Date(Date.now() + offsetDays * 86400000);
        var m = String(d.getUTCMonth() + 1);
        var day = String(d.getUTCDate());
        if (m.length < 2) { m = '0' + m; }
        if (day.length < 2) { day = '0' + day; }
        return d.getUTCFullYear() + '-' + m + '-' + day;
      }

      function auditRangeOpts() {
        return {
          fromISO: auditFromInput.value ? auditFromInput.value + 'T00:00:00.000Z' : undefined,
          toISO: auditToInput.value ? auditToInput.value + 'T23:59:59.999Z' : undefined
        };
      }

      // Ítem 1: verifyChain → toast ok/fallo + tabla de breaks [{id,kind}].
      function onAuditVerify() {
        return requirePerm('admin').then(function () {
          return auditlog.verifyChain();
        }).then(function (res) {
          auditBreaksEl.textContent = '';
          if (res.ok) {
            auditBreaksEl.hidden = true;
            ui().toast(t('audit.verifyOk', { count: res.checked }), { severity: 'info' });
            return;
          }
          ui().toast(t('audit.verifyFail', { issues: res.breaks.length }), { severity: 'critical' });
          var tbl = el('table', { class: 'data' });
          tbl.appendChild(el('caption', { text: t('audit.verify') }));
          tbl.appendChild(el('thead', null, el('tr', null,
            el('th', { attrs: { scope: 'col' }, text: 'id' }),
            el('th', { attrs: { scope: 'col' }, text: 'kind' }))));
          var tbody = el('tbody');
          (res.breaks || []).forEach(function (b) {
            b = b || {};
            tbody.appendChild(el('tr', null,
              el('td', { text: auditCell(b.id) }),
              el('td', { text: auditCell(b.kind) })));
          });
          tbl.appendChild(tbody);
          auditBreaksEl.appendChild(el('div', { class: 'table-wrap' }, tbl));
          auditBreaksEl.hidden = false;
        }).catch(function (err) {
          if (isForbidden(err)) { forbiddenToast(err); }
        });
      }

      // Ítem 2: tabla UI paginada simple (primeros AUDIT_PAGE_MAX con nota).
      function renderAuditTable(logs) {
        auditTableWrap.textContent = '';
        if (!logs.length) {
          auditEmptyEl.hidden = false;
          auditNoteEl.textContent = '';
          return;
        }
        auditEmptyEl.hidden = true;
        var shown = logs.slice(0, AUDIT_PAGE_MAX);
        var heads = ['seq', 'at', 'user', 'role', 'action', 'store', 'entityId', 'count'];
        var tbl = el('table', { class: 'data' });
        tbl.appendChild(el('caption', { text: t('audit.title') }));
        tbl.appendChild(el('thead', null, el('tr', null, heads.map(function (h) {
          return el('th', { attrs: { scope: 'col' }, text: h });
        }))));
        var tbody = el('tbody');
        shown.forEach(function (d) {
          d = d || {};
          tbody.appendChild(el('tr', null,
            el('td', { text: auditCell(d.seq) }),
            el('td', { text: auditCell(d.at) }),
            el('td', { text: auditCell(d.user) }),
            el('td', { text: auditCell(d.role) }),
            el('td', { text: auditCell(d.action) }),
            el('td', { text: auditCell(d.store) }),
            el('td', { text: auditCell(d.entityId) }),
            el('td', { text: auditCell(d.count) })));
        });
        tbl.appendChild(tbody);
        auditTableWrap.appendChild(tbl);
        var note = t('audit.entries') + ': ' + shown.length;
        if (logs.length > shown.length) { note += ' / ' + logs.length; }
        auditNoteEl.textContent = note;
      }

      function onAuditRange() {
        return requirePerm('admin').then(function () {
          return auditlog.range(auditRangeOpts());
        }).then(function (logs) {
          auditLogsCache = logs || [];
          renderAuditTable(auditLogsCache);
        }).catch(function (err) {
          if (isForbidden(err)) { forbiddenToast(err); }
        });
      }

      function auditExportApis() {
        var exp = root.IW.export;
        var fmts = exp && exp.reportFormats;
        var csv = exp && exp.csvWriter;
        if (!fmts || typeof fmts.produce !== 'function' || !csv ||
            typeof csv.downloadText !== 'function' || typeof csv.downloadBytes !== 'function') {
          return null;
        }
        return { fmts: fmts, csv: csv };
      }

      // exportTabular → mini-modelo {sections:[table]}: cabeceras viajan como
      // labelKey crudo (tr() las devuelve literales) y celdas por clave k<i>.
      function auditExportModel(logs) {
        var out = auditlog.exportTabular(logs);
        var cols = (out.headers || []).map(function (hd, i) {
          return { key: 'k' + i, labelKey: String(hd) };
        });
        var rows = (out.rows || []).map(function (r) {
          var o = {};
          for (var i = 0; i < cols.length; i++) { o[cols[i].key] = r ? r[i] : ''; }
          return o;
        });
        return { sections: [{ type: 'table', title: out.sheetName, columns: cols, rows: rows }] };
      }

      function markAuditExported() {
        var headKey = auditlog.HEAD_KEY || 'audit.head';
        return repos.meta.get(headKey).catch(function () { return null; }).then(function (head) {
          if (head && head.hash && typeof auditlog.markExported === 'function') {
            return auditlog.markExported(head.hash).catch(function () { return null; });
          }
          return null;
        }).catch(function () { return null; });
      }

      // Ítem 3: csv/xlsx/json/docx/xml (pdf NO se ofrece) → produce → download.
      function onAuditExport() {
        var apis = auditExportApis();
        if (!apis) {
          ui().toast(t('export.failed'), { severity: 'critical' });
          return Promise.resolve(false);
        }
        var format = auditFmtSel.value || 'csv';
        return requirePerm('admin').then(function () {
          if (auditLogsCache.length) { return auditLogsCache; }
          return auditlog.range(auditRangeOpts());
        }).then(function (logs) {
          auditLogsCache = logs || [];
          if (!auditLogsCache.length) {
            ui().toast(t('audit.empty'), { severity: 'info' });
            return false;
          }
          ui().toast(t('export.generating'), { severity: 'info' });
          var locale = (i18n() && typeof i18n().getLocale === 'function') ? i18n().getLocale() : 'es';
          var fecha = new Date().toISOString().slice(0, 10);
          return apis.fmts.produce(auditExportModel(auditLogsCache), format, { t: t, locale: locale, filename: 'bitacora_' + fecha })
            .then(function (res) {
              if (!res) { return false; }
              var ok = typeof res.data === 'string'
                ? apis.csv.downloadText(res.filename, res.data, res.mime)
                : apis.csv.downloadBytes(res.filename, res.data, res.mime);
              if (!ok) { return false; }
              return markAuditExported().then(function () { return true; });
            });
        }).then(function (ok) {
          ui().toast(ok ? t('export.done') : t('export.failed'), { severity: ok ? 'info' : 'critical' });
          return ok;
        }).catch(function (err) {
          if (isForbidden(err)) { forbiddenToast(err); }
          else { ui().toast(t('export.failed'), { severity: 'critical' }); }
          return false;
        });
      }

      // Gate de visibilidad igual que 'Usuarios': solo rol admin efectivo.
      function renderAuditCard() {
        if (!auditCard) { return Promise.resolve(); }
        return effectiveRole().then(function (role) {
          auditCard.hidden = role !== 'admin';
        }, function () { auditCard.hidden = true; });
      }

      function onCreateUser() {
        return requirePerm('admin').then(function () {
          return sessionUsername().then(function (name) {
            return users().createUser(repos.meta, {
              username: createUsername.value.trim(),
              passphrase: createPass.value,
              role: createRole.value
            }, name || 'admin');
          });
        }).then(function (res) {
          if (res.ok) {
            createUsername.value = '';
            createPass.value = '';
            toast('common.saved', 'info');
            return refreshUserList();
          }
          toastUserError(res.error);
        }).catch(function (err) {
          if (isForbidden(err)) { forbiddenToast(err); }
        });
      }

      function onSetPass(u) {
        var passInput = el('input', { class: 'input', attrs: { type: 'password', autocomplete: 'new-password' } });
        ui().dialog({
          titleKey: 'admin.users.setPass',
          bodyNode: el('div', { class: 'stack' },
            el('div', { class: 'field' },
              el('label', { class: 'field-label', text: t('admin.users.passphrase') }), passInput)),
          actions: [
            { labelKey: 'common.cancel', kind: 'ghost', onClick: function () {} },
            {
              labelKey: 'common.save', kind: 'primary', onClick: function () {
                var newPass = passInput.value;
                if (!newPass || newPass.length < 6) { toastUserError('E_WEAK_PASSPHRASE'); return false; }
                return requirePerm('admin').then(function () {
                  return sessionUsername().then(function (name) {
                    return users().changePassphrase(repos.meta, name, u.username, undefined, newPass);
                  });
                }).then(function (res) {
                  if (res.ok) { toast('common.saved', 'info'); }
                  else { toastUserError(res.error); }
                }).catch(function (err) {
                  if (isForbidden(err)) { forbiddenToast(err); }
                });
              }
            }
          ]
        });
      }

      function onChangeRole(u) {
        var roleSel = el('select', { class: 'select' });
        ['operator', 'engineer', 'admin'].forEach(function (r) {
          roleSel.appendChild(el('option', { attrs: { value: r }, text: t('admin.roles.' + r) }));
        });
        roleSel.value = u.role;
        ui().dialog({
          titleKey: 'admin.users.changeRole',
          bodyNode: el('div', { class: 'stack' },
            el('div', { class: 'field' },
              el('label', { class: 'field-label', text: t('admin.users.role') }), roleSel)),
          actions: [
            { labelKey: 'common.cancel', kind: 'ghost', onClick: function () {} },
            {
              labelKey: 'common.save', kind: 'primary', onClick: function () {
                return requirePerm('admin').then(function () {
                  return sessionUsername().then(function (name) {
                    return users().setRole(repos.meta, u.username, roleSel.value, name || 'admin');
                  });
                }).then(function (res) {
                  if (res.ok) { refreshUserList(); }
                  else { toastUserError(res.error); }
                }).catch(function (err) {
                  if (isForbidden(err)) { forbiddenToast(err); }
                });
              }
            }
          ]
        });
      }

      function doToggleActive(u) {
        var activate = u.active === false;
        return requirePerm('admin').then(function () {
          return sessionUsername().then(function (name) {
            return users().setActive(repos.meta, u.username, activate, name || 'admin');
          });
        }).then(function (res) {
          if (res.ok) { refreshUserList(); }
          else { toastUserError(res.error); }
        }).catch(function (err) {
          if (isForbidden(err)) { forbiddenToast(err); }
        });
      }

      function onToggleActive(u) {
        if (u.active === false) { return doToggleActive(u); }
        return sessionUsername().then(function (me) {
          if (me && me.toLowerCase() === u.username.toLowerCase()) {
            toastUserError('E_SELF');
            return;
          }
          return doToggleActive(u);
        });
      }

      function isLockedOut() {
        return lock().isEnabled(repos.meta).then(function (enabled) {
          if (!enabled) { return false; }
          return lock().role(repos.meta).then(function (role) {
            return role !== 'admin';
          });
        });
      }

      function gateDestructive() {
        return isLockedOut().then(function (lockedOut) {
          [clearBtn, resetBtn, disableBtn, changePinBtn].forEach(function (b) {
            if (lockedOut) {
              b.disabled = true;
              b.setAttribute('title', t('admin.roles.admin'));
            } else {
              b.disabled = false;
              b.removeAttribute('title');
            }
          });
        });
      }

      function onSaveRules() {
        var writes = [];
        ruleFields.forEach(function (f) {
          var val = Number(ruleInputs[f[0]].value);
          if (isNaN(val)) { return; }
          writes.push(repos.meta.set(f[0], val));
        });
        return Promise.all(writes).then(function () { toast('common.save', 'info'); });
      }

      function onExport() {
        var ei = exportImport();
        if (!ei) { return; }
        return requirePerm('export').then(function () {
          return ei.exportAll(repos).then(function (payload) {
            var blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
            var url = URL.createObjectURL(blob);
            var a = document.createElement('a');
            var d = new Date();
            var stamp = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
            a.href = url;
            a.download = 'integritywatch-backup-' + stamp + '.json';
            a.style.position = 'fixed';
            a.style.insetInlineStart = '-9999px';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
          });
        }).catch(function (err) {
          if (isForbidden(err)) { forbiddenToast(err); }
        });
      }

      function onImport(file) {
        return isLockedOut().then(function (lockedOut) {
          if (lockedOut) { toast('admin.roles.admin', 'warning'); return; }
          var reader = new FileReader();
          reader.onload = function () {
            var payload;
            try { payload = JSON.parse(String(reader.result || '')); } catch (e) { toast('common.error', 'critical'); return; }
            var ei = exportImport();
            if (!ei) { return; }
            ei.importAll(repos, payload, { mode: 'merge' }).then(function () { toast('ingest.importDone', 'info'); });
          };
          reader.onerror = function () { toast('common.error', 'critical'); };
          reader.readAsText(file);
        });
      }

      // ---- .iwf expedition format (F3a) ----
      function onExportIwf() {
        var ei = exportImport();
        var cf = caseFile();
        if (!ei || !cf) { return; }
        return requirePerm('export').then(function () {
          var actorRoleP = (guard && typeof guard.role === 'function') ? guard.role() : Promise.resolve(null);
          return actorRoleP.then(function (actorRole) {
            return ei.exportAll(repos).then(function (payload) {
              return cf.buildCaseFileV2(payload.data, { sector: 'midstream' }, actorRole).then(function (envelope) {
                var blob = new Blob([JSON.stringify(envelope, null, 2)], { type: 'application/json' });
                var url = URL.createObjectURL(blob);
                var a = document.createElement('a');
                var d = new Date();
                var stamp = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
                a.href = url;
                a.download = 'integritywatch-case-file-' + stamp + '.iwf';
                a.style.position = 'fixed';
                a.style.insetInlineStart = '-9999px';
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
                toast('caseFile.exported', 'info');
              });
            });
          });
        }).catch(function (err) {
          if (isForbidden(err)) { forbiddenToast(err); }
        });
      }

      function onImportIwf(file) {
        return isLockedOut().then(function (lockedOut) {
          if (lockedOut) { toast('admin.roles.admin', 'warning'); return; }
          var reader = new FileReader();
          reader.onload = function () {
            var cf = caseFile();
            var ei = exportImport();
            if (!cf || !ei) { return; }
            var parseP = (typeof cf.parseCaseFileAsync === 'function')
              ? cf.parseCaseFileAsync(String(reader.result || ''))
              : Promise.resolve(cf.parseCaseFile(String(reader.result || '')));
            parseP.then(function (result) {
              if (!result.ok) {
                if (result.error === 'E_BAD_JSON') { toast('caseFile.badJson', 'critical'); }
                else if (result.error === 'E_BAD_FORMAT') { toast('caseFile.badFormat', 'critical'); }
                else if (result.error === 'E_VERSION') { toast('caseFile.badVersion', 'critical'); }
                else if (result.error === 'E_CHECKSUM' || result.error === 'E_CHECKSUM_SHA') { toast('caseFile.badChecksum', 'critical'); }
                else { toast('common.error', 'critical'); }
                return;
              }
              return ei.importAll(repos, { data: result.payload.data }, { mode: 'merge' }).then(function () {
                toast('caseFile.imported', 'info');
              });
            });
          };
          reader.onerror = function () { toast('common.error', 'critical'); };
          reader.readAsText(file);
        });
      }

      function onResetDemo() {
        return requirePerm('admin').then(function () {
          return ui().confirmDialog({ titleKey: 'admin.resetDemo', bodyKey: 'admin.resetDemoConfirm', danger: true }).then(function (ok) {
            if (!ok) { return; }
            var clears = DEMO_RESET_STORES.map(function (name) {
              return repos[name] && typeof repos[name].clear === 'function' ? repos[name].clear() : Promise.resolve();
            });
            return Promise.all(clears).then(function () {
              var seed = root.IW.data && root.IW.data.seed;
              var doSeed = (seed && typeof seed.demo === 'function') ? seed.demo(repos) : Promise.resolve({ counts: {} });
              return doSeed.then(function () {
                return repos.meta.set('demoLoaded', true);
              }).then(function () { toast('admin.demoLoaded', 'info'); });
            });
          });
        }).catch(function (err) {
          if (isForbidden(err)) { forbiddenToast(err); }
        });
      }

      function onClearAll() {
        return requirePerm('admin').then(function () {
          var input = el('input', { class: 'input', attrs: { type: 'text' } });
          var note = el('p', { class: 'field-hint', text: t('admin.typeDelete') });
          var body = el('div', { class: 'stack' }, note, input);
          ui().dialog({
            titleKey: 'admin.clearAll',
            bodyNode: body,
            actions: [
              { labelKey: 'common.cancel', kind: 'ghost', onClick: function () {} },
              {
                labelKey: 'admin.clearAll', kind: 'danger', onClick: function () {
                  if (input.value !== 'DELETE') { return false; }
                  var clears = DATA_STORES.map(function (name) {
                    return repos[name] && typeof repos[name].clear === 'function' ? repos[name].clear() : Promise.resolve();
                  });
                  return Promise.all(clears).then(function () { toast('common.ok', 'info'); });
                }
              }
            ]
          });
        }).catch(function (err) {
          if (isForbidden(err)) { forbiddenToast(err); }
        });
      }

      function onEnableLock() {
        var pin = pinInput.value;
        var repeat = pinRepeatInput.value;
        var lk = lock();
        var minPinLen = (lk && typeof lk.MIN_PIN_LENGTH === 'number') ? lk.MIN_PIN_LENGTH : 6;
        if (pin.length < minPinLen) { toast('admin.wrongPin', 'warning'); return; }
        if (pin !== repeat) { toast('admin.pinMismatch', 'warning'); return; }
        return lock().enable({ pin: pin, role: roleSelect.value }, repos.meta).then(function (res) {
          if (res.ok) { toast('admin.enableLock', 'info'); renderLockStatus(); gateDestructive(); }
          else { toast('admin.wrongPin', 'critical'); }
        });
      }

      function askPin(titleKey, submitKey, cb) {
        var pin = el('input', { class: 'input', attrs: { type: 'password', inputmode: 'numeric' } });
        ui().dialog({
          titleKey: titleKey,
          bodyNode: el('div', { class: 'stack' },
            el('div', { class: 'field' }, el('label', { class: 'field-label', text: t('admin.pin') }), pin)),
          actions: [
            { labelKey: 'common.cancel', kind: 'ghost', onClick: function () {} },
            { labelKey: submitKey, kind: 'primary', onClick: function () { cb(pin.value); } }
          ]
        });
      }

      function onDisableLock() {
        askPin('admin.disableLock', 'admin.disableLock', function (pin) {
          return requirePerm('admin').then(function () {
            return lock().disable(pin, repos.meta);
          }).then(function (res) {
            if (res.ok) { toast('admin.disableLock', 'info'); renderLockStatus(); gateDestructive(); }
            else { toast('admin.wrongPin', 'critical'); }
          }).catch(function (err) {
            if (isForbidden(err)) { forbiddenToast(err); }
          });
        });
      }

      function onChangePin() {
        askPin('admin.changePin', 'admin.changePin', function (oldPin) {
          askPin('admin.changePin', 'common.save', function (newPin) {
            return requirePerm('admin').then(function () {
              return lock().changePin(oldPin, newPin, repos.meta);
            }).then(function (res) {
              if (res.ok) { toast('admin.changePin', 'info'); }
              else { toast('admin.wrongPin', 'critical'); }
            }).catch(function (err) {
              if (isForbidden(err)) { forbiddenToast(err); }
            });
          });
        });
      }

      function renderLockStatus() {
        return lock().isEnabled(repos.meta).then(function (enabled) {
          var role = lock().currentRole && lock().currentRole();
          if (enabled) {
            lockEnabledEl.textContent = t('admin.lockTitle') + ': ' + t('common.active') + (role ? ' · ' + t('admin.role') + ': ' + t('admin.roles.' + role) : '');
          } else {
            lockEnabledEl.textContent = t('admin.lockTitle') + ': ' + t('common.none');
          }
        });
      }

      function renderStorage() {
        var estimate = (typeof navigator !== 'undefined' && navigator.storage && typeof navigator.storage.estimate === 'function')
          ? navigator.storage.estimate() : Promise.resolve(null);
        return estimate.then(function (est) {
          if (est && typeof est.usage === 'number' && typeof est.quota === 'number') {
            storageEl.textContent = fmtBytes(est.usage) + ' / ' + fmtBytes(est.quota);
          } else {
            storageEl.textContent = t('common.none');
          }
        }).catch(function () { storageEl.textContent = t('common.none'); }).then(function () {
          var jobs = DATA_STORES.map(function (name) {
            var p = (repos[name] && typeof repos[name].list === 'function') ? repos[name].list() : Promise.resolve([]);
            return p.then(function (rows) { return { name: name, count: rows.length }; }).catch(function () { return { name: name, count: 0 }; });
          });
          return Promise.all(jobs).then(function (counts) {
            countsEl.textContent = '';
            var tbl = el('table', { class: 'data' });
            tbl.appendChild(el('caption', { text: t('admin.storageUsage') }));
            var thead = el('thead', null, el('tr', null,
              el('th', { attrs: { scope: 'col' }, text: t('admin.about') }),
              el('th', { attrs: { scope: 'col' }, text: t('common.total'), class: 'num' })));
            var tbody = el('tbody');
            counts.forEach(function (c) {
              tbody.appendChild(el('tr', null, el('td', { text: c.name }), el('td', { class: 'num', text: String(c.count) })));
            });
            tbl.appendChild(thead);
            tbl.appendChild(tbody);
            countsEl.appendChild(el('div', { class: 'table-wrap' }, tbl));
          });
        });
      }

      function refreshSync() {
        var endpointPromise = repos.meta.get('syncEndpoint').catch(function () { return undefined; });
        var tokenPromise = repos.meta.get('syncToken').catch(function () { return undefined; });
        var listPromise = (repos.mutationQueue && typeof repos.mutationQueue.list === 'function') ? repos.mutationQueue.list() : Promise.resolve([]);
        return Promise.all([endpointPromise, tokenPromise, listPromise]).then(function (vals) {
          var endpoint = vals[0];
          var token = vals[1];
          var rows = vals[2] || [];
          if (endpoint !== undefined && endpoint !== null) { syncEndpointInput.value = endpoint; }
          if (token !== undefined && token !== null) { syncTokenInput.value = token; }
          syncTokenCache = (token !== undefined && token !== null && String(token).length > 0) ? String(token) : null;
          var sq = syncQueue();
          if (sq && typeof sq.__setGetToken === 'function') { sq.__setGetToken(function () { return syncTokenCache; }); }
          var pending = 0, dead = 0;
          var deadRows = [];
          rows.forEach(function (r) {
            if (!r.sentISO && !r.dead) { pending++; }
            if (r.dead) { dead++; deadRows.push(r); }
          });
          syncStatusEl.textContent = t('ingest.queuePending') + ': ' + pending + ' · ' + t('ingest.deadCount') + ': ' + dead;
          deadListEl.textContent = '';
          if (deadRows.length) {
            deadListEl.appendChild(el('p', { text: t('ingest.deadCount') + ': ' + dead }));
          }
        });
      }

      function onFlush() {
        var sq = syncQueue();
        if (sq && typeof sq.flush === 'function') { return sq.flush().then(function () { refreshSync(); }); }
        return Promise.resolve();
      }

      // Anti-cache self-service: unregister the service worker, drop every cache
      // and hard-reload, so operators can pull a fresh build without support.
      function onForceUpdate() {
        return ui().confirmDialog({ titleKey: 'admin.forceUpdate', bodyKey: 'admin.forceUpdateHint' }).then(function (ok) {
          if (!ok) { return undefined; }
          var sw = (typeof navigator !== 'undefined') ? navigator.serviceWorker : null;
          var unregister = (sw && typeof sw.getRegistrations === 'function')
            ? sw.getRegistrations().then(function (rs) { return Promise.all(rs.map(function (r) { return r.unregister(); })); })
            : Promise.resolve();
          var cacheApi = (typeof caches !== 'undefined') ? caches : null;
          return unregister
            .then(function () { return cacheApi ? cacheApi.keys() : []; })
            .then(function (ks) { return cacheApi ? Promise.all(ks.map(function (k) { return cacheApi.delete(k); })) : []; })
            .then(function () { if (typeof location !== 'undefined') { location.reload(); } })
            .catch(function () { if (typeof location !== 'undefined') { location.reload(); } });
        });
      }

      function endpointIsSecure(endpoint) {
        var sq = syncQueue();
        if (sq && typeof sq.validateEndpoint === 'function') { return sq.validateEndpoint(endpoint); }
        return true;
      }

      syncEndpointInput.addEventListener('change', function () {
        var value = syncEndpointInput.value;
        if (value && !endpointIsSecure(value)) {
          toast('admin.syncInsecure', 'warning');
          return;
        }
        repos.meta.set('syncEndpoint', value).catch(function () {});
      });

      syncTokenInput.addEventListener('change', function () {
        var value = syncTokenInput.value || '';
        syncTokenCache = value.length > 0 ? value : null;
        var sq = syncQueue();
        if (sq && typeof sq.__setGetToken === 'function') { sq.__setGetToken(function () { return syncTokenCache; }); }
        repos.meta.set('syncToken', value).catch(function () {});
      });

      function renderSw() {
        if (typeof navigator === 'undefined' || !navigator.serviceWorker) {
          swEl.textContent = t('common.none');
          return;
        }
        var ready = !!(navigator.serviceWorker.controller);
        swEl.textContent = ready ? t('admin.offlineReady') : t('common.none');
        if (bus && typeof bus.on === 'function') {
          bus.on('sw:update', function () { swEl.textContent = t('common.updateAvailable'); });
        }
      }

      function renderStandards() {
        var list = (root.IW.data && root.IW.data.standards && root.IW.data.standards.standards) || [];
        standardsEl.textContent = '';
        if (list.length === 0) {
          standardsEl.appendChild(el('p', { class: 'empty-state', text: t('common.empty') }));
          return;
        }
        var tbl = el('table', { class: 'data' });
        tbl.appendChild(el('caption', { text: t('admin.standardsRef') }));
        var thead = el('thead', null, el('tr', null,
          el('th', { attrs: { scope: 'col' }, text: t('glossary.reference') }),
          el('th', { attrs: { scope: 'col' }, text: t('admin.version') })));
        var tbody = el('tbody');
        list.forEach(function (s) {
          tbody.appendChild(el('tr', null, el('td', { text: s.code || s.id }), el('td', { text: s.edition || '—' })));
        });
        tbl.appendChild(thead);
        tbl.appendChild(tbody);
        standardsEl.appendChild(el('div', { class: 'table-wrap' }, tbl));
      }

      // Load current meta values into rule inputs.
      function loadRuleInputs() {
        return Promise.all(ruleFields.map(function (f) { return repos.meta.get(f[0]).catch(function () { return undefined; }); })).then(function (vals) {
          ruleFields.forEach(function (f, i) {
            if (vals[i] !== undefined && vals[i] !== null) { ruleInputs[f[0]].value = String(vals[i]); }
          });
          });
      }

      // Apply current theme to radios.
      function loadTheme() {
        var th = theme();
        var cur = th && typeof th.getTheme === 'function' ? th.getTheme() : 'system';
        if (themeRadios[cur]) { themeRadios[cur].checked = true; }
      }

      container.appendChild(view);

      var jobs = [loadRuleInputs(), renderLockStatus(), renderStorage(), refreshSync(), gateDestructive(), renderUsers(), renderAuditCard()];
      renderSw();
      renderStandards();
      loadTheme();

      return Promise.all(jobs).then(function () {});
    }
  };
});
