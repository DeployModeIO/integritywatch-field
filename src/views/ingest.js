/* IntegrityWatch Field — ingest view (v2)
   Ingesta masiva multi-archivo: cola con drag&drop, deteccion de formato
   (csv/tsv/xlsx/json/jsonl/xml/witsml) via IW.ingest.formats, mapeo
   columna->campo via IW.ingest.mapping, preview y commit reanudable via
   IW.ingest.commit, historial con rollback por diario, topes configurables
   y respaldo/restauracion JSON + .iwf (IW.core.exportImport/caseFile). */
(function (root, factory) {
  'use strict';
  var api = factory(root);
  root.IW = root.IW || {};
  root.IW.views = root.IW.views || {};
  root.IW.views.ingest = api;
  if (typeof module === 'object' && module.exports) { module.exports = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  var LIMITS_KEY = 'ingest.limits';
  var DEFAULT_MAX_MB = 100;
  var DEFAULT_MAX_ROWS = 500000;
  var MB = 1048576;
  var SAMPLE_ROWS = 200;
  var SAMPLE_COLS = 8;
  var MAX_JSON_BYTES = 5000000;
  var QUEUE_ACCEPT = '.csv,.tsv,.txt,.xlsx,.xlsm,.json,.jsonl,.ndjson,.xml';

  var CONF_CLASS = {
    exact: 'badge badge-low',
    alias: 'badge badge-moderate',
    fuzzy: 'badge badge-high',
    none: 'badge badge-neutral',
    manual: 'badge badge-low',
    ambiguous: 'badge badge-high'
  };

  function ui() { return root.IW.ui; }
  function formats() { return root.IW.ingest ? root.IW.ingest.formats : null; }
  function mappingApi() { return root.IW.ingest ? root.IW.ingest.mapping : null; }
  function schemasApi() { return root.IW.ingest ? root.IW.ingest.schemas : null; }
  function commitApi() { return root.IW.ingest ? root.IW.ingest.commit : null; }
  function exportImport() { return root.IW.core ? root.IW.core.exportImport : null; }
  function syncQueue() { return root.IW.core ? root.IW.core.syncQueue : null; }
  function caseFile() { return root.IW.core ? root.IW.core.caseFile : null; }
  function permissions() { return root.IW.security ? root.IW.security.permissions : null; }
  function lockApi() { return root.IW.security ? root.IW.security.lock : null; }
  function engineReady() { return !!(formats() && mappingApi() && schemasApi() && commitApi()); }

  function collectRows(iterable, cap) {
    var out = [];
    var it = iterable[Symbol.asyncIterator]();
    function stop() {
      if (typeof it.return === 'function') { try { it.return(); } catch (e) { /* cierre tolerado */ } }
      return out;
    }
    function step() {
      if (out.length >= cap) { return Promise.resolve(stop()); }
      return it.next().then(function (r) {
        if (r.done) { return out; }
        var rec = r.value;
        if (rec && rec.row !== undefined && rec.row !== null) { out.push(rec.row); }
        return step();
      });
    }
    return step();
  }

  function getv(obj, path) {
    var parts = String(path).split('.');
    var cur = obj;
    for (var i = 0; i < parts.length && cur !== null && cur !== undefined; i++) { cur = cur[parts[i]]; }
    return cur;
  }

  function fingerprintOf(file) {
    return file.name + ':' + file.size + ':' + (file.lastModified || 0);
  }

  return {
    id: 'ingest',
    titleKey: 'nav.ingest',
    icon: 'ingest',
    render: function (container, ctx) {
      var t = ctx.i18n || function (k) { return k; };
      var repos = ctx.repos || {};
      var bus = ctx.bus;
      var i18n = root.IW.i18n;

      var guard = (permissions() && typeof permissions().guard === 'function') ? permissions().guard(repos.meta) : null;
      function requirePerm(action) {
        return guard ? guard.require(action) : Promise.resolve(true);
      }
      function isForbidden(err) {
        return !!(err && err.code === 'E_FORBIDDEN');
      }
      function forbiddenToast(err) {
        ui().toast(isForbidden(err) ? 'security.forbidden' : 'common.error', { severity: isForbidden(err) ? 'warning' : 'critical' });
      }

      function fmtDate(iso) { return (i18n && i18n.formatDate) ? i18n.formatDate(iso, { dateStyle: 'short', timeStyle: 'short' }) : String(iso); }
      function fmtNum(v, dec) {
        return (i18n && i18n.formatNumber) ? i18n.formatNumber(v, { maximumFractionDigits: dec === undefined ? 2 : dec }) : String(v);
      }
      function fmtBytes(bytes) {
        if (i18n && typeof i18n.formatNumber === 'function') {
          var s = i18n.formatNumber(bytes, { style: 'unit', unit: 'byte', unitDisplay: 'narrow', notation: 'compact' });
          if (s && s !== String(bytes)) { return s; }
        }
        return fmtNum(bytes, 0);
      }
      function fmtSeconds(ms) {
        var s = Math.max(0, ms) / 1000;
        if (i18n && typeof i18n.formatNumber === 'function') {
          var txt = i18n.formatNumber(s, { style: 'unit', unit: 'second', unitDisplay: 'short', maximumFractionDigits: 1 });
          if (txt) { return txt; }
        }
        return fmtNum(s, 1) + ' s';
      }

      function el(tag, attrs) {
        return ui().el.apply(ui(), arguments);
      }
      function icon(name, size) {
        var u = ui();
        if (u && typeof u.icon === 'function') {
          var n = u.icon(name, size);
          if (n && n.nodeType) { return n; }
        }
        return document.createTextNode('');
      }

      function readFileAsText(file) {
        return new Promise(function (resolve, reject) {
          var reader = new FileReader();
          reader.onload = function () { resolve(String(reader.result || '')); };
          reader.onerror = function () { reject(reader.error || new Error('read failed')); };
          reader.readAsText(file);
        });
      }

      var state = {
        files: [],
        seq: 0,
        limits: { maxBytesMb: DEFAULT_MAX_MB, maxRows: DEFAULT_MAX_ROWS },
        limitsLoaded: false,
        sessionNotice: null,
        sessions: []
      };

      function limitBytes() { return state.limits.maxBytesMb * MB; }
      function limitRows() { return state.limits.maxRows; }

      function entityList() {
        var S = schemasApi();
        return (S && typeof S.entityList === 'function') ? S.entityList() : [];
      }
      function defaultEntity() {
        var list = entityList();
        return list.length ? list[0].store : 'readings';
      }
      function visibleFields(store) {
        var S = schemasApi();
        if (!S || !S.SCHEMAS[store]) { return []; }
        return S.SCHEMAS[store].fields.filter(function (f) { return !f.derived; });
      }

      function describeError(err) {
        var F = formats();
        var C = commitApi();
        if (F && err && err.code === F.JSON_TOO_LARGE) { return t('ingest2.jsonTooBig'); }
        var msg = err && err.message ? err.message : String(err);
        var code = err && err.code ? err.code + ' — ' : '';
        if (C && err && err.code === C.LIMIT_ROWS) {
          return t('ingest2.maxRows') + ' · ' + msg;
        }
        return t('common.error') + ': ' + code + msg;
      }

      function actorPromise() {
        var lk = lockApi();
        if (!lk || typeof lk.currentSession !== 'function' || !repos.meta) { return Promise.resolve(null); }
        return Promise.resolve(lk.currentSession(repos.meta)).catch(function () { return null; });
      }

      var view = el('div', { class: 'view view-ingest' });
      view.appendChild(el('div', { class: 'page-header' }, el('h1', { text: t('ingest.title') })));

      // --- 1) Intro + zona drag & drop ---------------------------------------
      var introCard = el('section', { class: 'card' });
      introCard.appendChild(el('h2', { text: t('ingest2.title') }));
      introCard.appendChild(el('p', { class: 'section-hint', text: t('ingest2.subtitle') }));
      if (!engineReady()) {
        introCard.appendChild(el('p', { class: 'notice', attrs: { role: 'status' }, text: t('common.moduleLoading') }));
      }
      var queueInput = el('input', {
        class: 'visually-hidden',
        attrs: { type: 'file', id: 'ingest-files', multiple: '', accept: QUEUE_ACCEPT }
      });
      var dropZone = el('div', {
        class: 'drop-zone',
        attrs: { role: 'button', tabindex: '0', 'aria-label': t('ingest2.pickFiles') }
      },
        icon('upload', 24),
        el('p', { text: t('ingest2.dropHere') }));
      var pickBtn = el('button', { class: 'btn btn-primary', on: { click: function () { queueInput.click(); } } },
        icon('upload', 18), el('span', { text: t('ingest2.pickFiles') }));
      dropZone.addEventListener('click', function () { queueInput.click(); });
      dropZone.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); queueInput.click(); }
      });
      dropZone.addEventListener('dragover', function (e) { e.preventDefault(); dropZone.classList.add('drop-zone--over'); });
      dropZone.addEventListener('dragleave', function () { dropZone.classList.remove('drop-zone--over'); });
      dropZone.addEventListener('drop', function (e) {
        e.preventDefault();
        dropZone.classList.remove('drop-zone--over');
        if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length) { addFiles(e.dataTransfer.files); }
      });
      queueInput.addEventListener('change', function () {
        if (queueInput.files && queueInput.files.length) { addFiles(queueInput.files); }
        queueInput.value = '';
      });
      introCard.appendChild(el('div', { class: 'row' }, pickBtn));
      introCard.appendChild(dropZone);
      introCard.appendChild(queueInput);
      view.appendChild(introCard);

      // --- 2) Cola de archivos -------------------------------------------------
      var queueCard = el('section', { class: 'card' });
      queueCard.appendChild(el('h2', { text: t('ingest2.queue') }));
      var queueWrap = el('div', { class: 'stack' });
      queueCard.appendChild(queueWrap);
      view.appendChild(queueCard);

      // --- 5) Topes ------------------------------------------------------------
      var limitsCard = el('section', { class: 'card' });
      limitsCard.appendChild(el('h2', { text: t('ingest2.limitsTitle') }));
      var maxBytesInput = el('input', { class: 'input', attrs: { type: 'number', min: '1', step: '1', 'aria-label': t('ingest2.maxBytes') } });
      var maxRowsInput = el('input', { class: 'input', attrs: { type: 'number', min: '1', step: '1', 'aria-label': t('ingest2.maxRows') } });
      var limitsError = el('p', { class: 'field-error', attrs: { role: 'alert' } });
      limitsError.hidden = true;
      var limitsSaveBtn = el('button', { class: 'btn btn-primary', attrs: { 'data-perm': 'admin' }, on: { click: onSaveLimits } },
        icon('check', 18), el('span', { text: t('common.save') }));
      limitsCard.appendChild(el('div', { class: 'form-grid' },
        el('div', { class: 'field' }, el('label', { class: 'field-label', text: t('ingest2.maxBytes') }), maxBytesInput),
        el('div', { class: 'field' }, el('label', { class: 'field-label', text: t('ingest2.maxRows') }), maxRowsInput)));
      limitsCard.appendChild(limitsError);
      limitsCard.appendChild(el('div', { class: 'row' }, limitsSaveBtn));
      view.appendChild(limitsCard);

      // --- 6) Historial --------------------------------------------------------
      var sessionsCard = el('section', { class: 'card' });
      sessionsCard.appendChild(el('h2', { text: t('ingest2.sessionsTitle') }));
      var sessionsWrap = el('div', { class: 'import-history' });
      sessionsCard.appendChild(sessionsWrap);
      view.appendChild(sessionsCard);

      // --- 7) Backup / restaurar (funcionalidad preservada de v1) ---------------
      view.appendChild(buildBackupCard());

      function paintLimits() {
        maxBytesInput.value = String(state.limits.maxBytesMb);
        maxRowsInput.value = String(state.limits.maxRows);
      }

      function loadLimits() {
        if (!repos.meta || typeof repos.meta.get !== 'function') {
          state.limitsLoaded = true;
          paintLimits();
          return Promise.resolve();
        }
        return repos.meta.get(LIMITS_KEY).then(function (v) {
          if (v && typeof v === 'object') {
            var mb = typeof v.maxBytesMb === 'number' && v.maxBytesMb > 0 ? v.maxBytesMb
              : (typeof v.maxBytes === 'number' && v.maxBytes > 0 ? (v.maxBytes > 2000 ? v.maxBytes / MB : v.maxBytes) : DEFAULT_MAX_MB);
            var rows = typeof v.maxRows === 'number' && v.maxRows > 0 ? v.maxRows : DEFAULT_MAX_ROWS;
            state.limits = { maxBytesMb: Math.floor(mb), maxRows: Math.floor(rows) };
          }
          state.limitsLoaded = true;
          paintLimits();
          state.files.forEach(paint);
        }).catch(function () {
          state.limitsLoaded = true;
          paintLimits();
        });
      }

      function onSaveLimits() {
        var mb = Number(maxBytesInput.value);
        var rows = Number(maxRowsInput.value);
        if (!isFinite(mb) || mb < 1 || !isFinite(rows) || rows < 1) {
          limitsError.textContent = t('common.required');
          limitsError.hidden = false;
          return;
        }
        limitsError.hidden = true;
        requirePerm('admin').then(function () {
          return repos.meta.set(LIMITS_KEY, { maxBytesMb: Math.floor(mb), maxRows: Math.floor(rows) });
        }).then(function () {
          state.limits = { maxBytesMb: Math.floor(mb), maxRows: Math.floor(rows) };
          ui().toast('ingest2.limitsSaved', { severity: 'info' });
          state.files.forEach(paint);
        }).catch(function (err) {
          if (isForbidden(err)) { forbiddenToast(err); return; }
          ui().toast(t('common.error') + ': ' + (err && err.message ? err.message : err), { severity: 'critical' });
        });
      }

      // --- archivos ------------------------------------------------------------
      function newFileState(file) {
        return {
          id: 'f' + (++state.seq),
          file: file,
          entity: defaultEntity(),
          format: null,
          sheet: null,
          meta: null,
          assignments: [],
          validation: null,
          sample: [],
          preview: null,
          run: null,
          processed: false,
          busy: false,
          op: null,
          cancelRequested: false,
          elapsed: null,
          errorText: null,
          progress: null,
          refs: {}
        };
      }

      function addFiles(fileList) {
        Array.prototype.slice.call(fileList).forEach(function (file) {
          var st = newFileState(file);
          state.files.push(st);
          queueWrap.appendChild(buildCard(st));
          detectAndShow(st);
        });
      }

      function detectAndShow(st) {
        var F = formats();
        if (!F || typeof F.detectFormat !== 'function') { return; }
        F.detectFormat(st.file).then(function (fmt) {
          st.format = fmt;
          paint(st);
        }).catch(function (err) {
          st.errorText = describeError(err);
          paint(st);
        });
      }

      function buildCard(st) {
        var card = el('section', { class: 'card' });
        card.appendChild(el('h2', { text: st.file.name }));
        st.refs.metaRow = el('div', { class: 'row' });
        card.appendChild(st.refs.metaRow);

        st.refs.entitySelect = el('select', { class: 'select', attrs: { 'aria-label': t('ingest2.entity') } });
        entityList().forEach(function (e) {
          st.refs.entitySelect.appendChild(el('option', { attrs: { value: e.store }, text: e.labelEs }));
        });
        st.refs.entitySelect.value = st.entity;
        if (!entityList().length) { st.refs.entitySelect.disabled = true; }
        st.refs.entitySelect.addEventListener('change', function () { changeEntity(st, st.refs.entitySelect.value); });
        st.refs.entityHint = el('p', { class: 'field-hint' });
        st.refs.entityHint.hidden = true;
        card.appendChild(el('div', { class: 'field' },
          el('label', { class: 'field-label', text: t('ingest2.entity') }),
          st.refs.entitySelect,
          st.refs.entityHint));

        st.refs.errorBox = el('div', { class: 'error-banner', attrs: { role: 'alert' } });
        st.refs.errorBox.hidden = true;
        card.appendChild(st.refs.errorBox);

        st.body = el('div', { class: 'stack' });
        card.appendChild(st.body);
        return card;
      }

      function syncMetaRow(st) {
        var row = st.refs.metaRow;
        row.textContent = '';
        row.appendChild(el('span', { class: 'pill', text: fmtBytes(st.file.size) }));
        row.appendChild(el('span', { class: 'pill', text: t('ingest2.detectedFormat') + ': ' + (st.format || '…') }));
        var forced = !!(st.meta && st.meta.targetStore);
        st.refs.entitySelect.disabled = forced || !entityList().length || st.busy;
        if (forced) {
          st.refs.entitySelect.value = st.entity;
          st.refs.entityHint.textContent = t('ingest.witsmlNote');
          st.refs.entityHint.hidden = false;
        } else {
          st.refs.entityHint.hidden = true;
        }
      }

      function readOptsFor(st, maxRows) {
        var o = { maxRows: maxRows };
        if (st.format) { o.format = st.format; }
        if (st.sheet) { o.sheet = st.sheet; }
        else if (st.meta && st.meta.format === 'xlsx' && st.meta.sheetName) { o.sheet = st.meta.sheetName; }
        return o;
      }

      function paint(st) {
        syncMetaRow(st);
        st.refs.errorBox.hidden = !st.errorText;
        st.refs.errorBox.textContent = st.errorText || '';
        var body = st.body;
        body.textContent = '';

        if (st.busy && st.op === 'process') {
          body.appendChild(el('div', { class: 'row' }, el('span', { class: 'spinner' }), el('span', { text: t('common.loading') })));
          return;
        }
        if (st.file.size > limitBytes()) {
          body.appendChild(el('p', {
            class: 'notice',
            attrs: { role: 'status' },
            text: t('ingest2.fileTooBig') + ' · ' + t('ingest2.maxBytes') + ': ' + fmtNum(state.limits.maxBytesMb, 0)
          }));
        }
        if (st.file.size <= limitBytes() && !st.processed && !st.busy) {
          body.appendChild(el('div', { class: 'row' }, buildProcessBtn(st)));
        }
        if (st.processed) {
          paintSheetSelect(st, body);
          paintMapping(st, body);
          if (st.busy && st.op === 'preview') {
            body.appendChild(el('div', { class: 'row' }, el('span', { class: 'spinner' }), el('span', { text: t('common.loading') })));
          }
          if (st.preview) { paintPreview(st, body); }
          if (st.busy && st.op === 'import') { paintProgress(st, body); }
          if (st.run) { paintRunResult(st, body); }
          body.appendChild(paintActions(st));
        }
      }

      function buildProcessBtn(st) {
        var btn = el('button', { class: 'btn btn-primary', on: { click: function () { process(st); } } },
          icon('refresh', 18), el('span', { text: t('common.run') }));
        btn.disabled = !engineReady();
        return btn;
      }

      function process(st) {
        var F = formats();
        var M = mappingApi();
        if (!F || !M || st.busy) { return Promise.resolve(); }
        if (st.file.size > limitBytes()) { paint(st); return Promise.resolve(); }
        st.busy = true;
        st.op = 'process';
        st.errorText = null;
        paint(st);
        return F.readRows(st.file, readOptsFor(st, SAMPLE_ROWS)).then(function (out) {
          st.meta = out.meta;
          st.format = out.meta.format;
          return collectRows(out.rows, SAMPLE_ROWS);
        }).then(function (samples) {
          st.sample = samples;
          var S = schemasApi();
          if (st.meta.targetStore && S && S.SCHEMAS[st.meta.targetStore]) { st.entity = st.meta.targetStore; }
          st.assignments = M.autoMap(st.entity, st.meta.headers);
          st.validation = M.validateMapping(st.entity, st.assignments);
          st.processed = true;
          st.preview = null;
          st.run = null;
          st.elapsed = null;
        }).catch(function (err) {
          st.errorText = describeError(err);
          st.processed = false;
        }).then(function () {
          st.busy = false;
          st.op = null;
          paint(st);
        });
      }

      function changeEntity(st, value) {
        if (!st.entity || st.entity === value) { return; }
        st.entity = value;
        if (st.processed) {
          var M = mappingApi();
          st.assignments = M.autoMap(st.entity, st.meta.headers);
          st.validation = M.validateMapping(st.entity, st.assignments);
          st.preview = null;
          st.run = null;
        }
        paint(st);
      }

      function paintSheetSelect(st, body) {
        if (!st.meta || st.meta.format !== 'xlsx' || !st.meta.sheets || st.meta.sheets.length === 0) { return; }
        var sel = el('select', { class: 'select', attrs: { 'aria-label': t('ingest2.sheet') } });
        st.meta.sheets.forEach(function (name) {
          sel.appendChild(el('option', { attrs: { value: name }, text: name }));
        });
        sel.value = st.sheet || st.meta.sheetName || st.meta.sheets[0];
        sel.addEventListener('change', function () {
          st.sheet = sel.value;
          process(st);
        });
        var field = el('div', { class: 'field' },
          el('label', { class: 'field-label', text: t('ingest2.sheet') }), sel);
        if (st.meta.sheets.length > 1) {
          field.appendChild(el('p', { class: 'field-hint', text: t('ingest2.sheetWarn') }));
        }
        body.appendChild(field);
      }

      function confidenceBadge(a) {
        var cls = CONF_CLASS[a.confidence] || CONF_CLASS.none;
        return el('span', { class: cls, text: String(a.confidence) });
      }

      function paintMapping(st, body) {
        var M = mappingApi();
        var wrap = el('div', { class: 'stack' });
        wrap.appendChild(el('h3', { text: t('ingest2.mappingTitle') }));
        wrap.appendChild(el('div', { class: 'row' }, el('button', {
          class: 'btn',
          attrs: { disabled: st.busy ? '' : null },
          on: { click: function () { reAutoMap(st); } }
        }, icon('refresh', 18), el('span', { text: t('ingest2.autoMapBtn') }))));

        var table = el('table', { class: 'data' });
        table.appendChild(el('caption', { text: t('ingest2.mappingTitle') }));
        table.appendChild(el('thead', null, el('tr', null,
          el('th', { attrs: { scope: 'col' }, text: t('ingest2.column') }),
          el('th', { attrs: { scope: 'col' }, text: t('ingest2.confidence') }),
          el('th', { attrs: { scope: 'col' }, text: t('ingest2.field') }))));
        var tbody = el('tbody');
        st.assignments.forEach(function (a) {
          var tr = el('tr');
          tr.appendChild(el('th', { attrs: { scope: 'row' }, text: a.header }));
          var tdConf = el('td');
          tdConf.appendChild(confidenceBadge(a));
          tr.appendChild(tdConf);
          var tdField = el('td');
          var sel = el('select', { class: 'select', attrs: { 'aria-label': t('ingest2.field') } });
          sel.appendChild(el('option', { attrs: { value: '' }, text: t('ingest2.notMapped') }));
          visibleFields(st.entity).forEach(function (f) {
            sel.appendChild(el('option', { attrs: { value: f.name }, text: f.name + (f.required ? ' *' : '') }));
          });
          sel.value = a.field || '';
          sel.addEventListener('change', function () {
            st.assignments = M.applyOverrides(st.assignments, [{ header: a.header, field: sel.value || null }]);
            st.validation = M.validateMapping(st.entity, st.assignments);
            st.preview = null;
            st.run = null;
            paint(st);
          });
          tdField.appendChild(sel);
          tr.appendChild(tdField);
          tbody.appendChild(tr);
        });
        table.appendChild(tbody);
        wrap.appendChild(el('div', { class: 'table-wrap' }, table));

        if (st.validation && !st.validation.ok) {
          wrap.appendChild(el('p', { class: 'notice', attrs: { role: 'status' }, text: t('ingest2.needMapping') }));
          var problems = [];
          st.validation.missingRequired.forEach(function (f) { problems.push(t('ingest2.field') + ' · ' + f); });
          st.validation.duplicates.forEach(function (d) { problems.push(t('ingest2.field') + ' · ' + d.field + ' · ' + d.headers.join(', ')); });
          st.validation.unknown.forEach(function (u) { problems.push(t('ingest2.field') + ' · ' + u); });
          if (problems.length) {
            wrap.appendChild(el('ul', { class: 'plain-list' }, problems.map(function (p) { return el('li', { text: p }); })));
          }
        }
        body.appendChild(wrap);
      }

      function reAutoMap(st) {
        var M = mappingApi();
        if (!M || !st.processed) { return; }
        var unresolved = st.assignments.filter(function (a) { return !a.field || a.reason === 'ambiguous'; });
        if (!unresolved.length) { return; }
        var pickByHeader = {};
        var fresh = M.autoMap(st.entity, unresolved.map(function (a) { return a.header; }));
        fresh.forEach(function (f) {
          if (f.field && f.reason !== 'ambiguous') { pickByHeader[f.header] = f.field; }
        });
        var still = {};
        unresolved.forEach(function (a) { if (!pickByHeader[a.header]) { still[a.header] = true; } });
        if (Object.keys(still).length) {
          var proposals = M.suggestFromSample(st.entity, st.meta.headers, st.sample);
          proposals.forEach(function (p) {
            if (still[p.header] && !pickByHeader[p.header]) { pickByHeader[p.header] = p.field; }
          });
        }
        var overrides = Object.keys(pickByHeader).map(function (h) { return { header: h, field: pickByHeader[h] }; });
        if (!overrides.length) { return; }
        st.assignments = M.applyOverrides(st.assignments, overrides);
        st.validation = M.validateMapping(st.entity, st.assignments);
        st.preview = null;
        st.run = null;
        paint(st);
      }

      function paintActions(st) {
        var canMap = !!(st.validation && st.validation.ok);
        var previewBtn = el('button', { class: 'btn', on: { click: function () { runPreview(st); } } },
          icon('search', 18), el('span', { text: t('ingest2.previewBtn') }));
        previewBtn.disabled = !canMap || st.busy || !engineReady();
        var commitBtn = el('button', { class: 'btn btn-primary', attrs: { 'data-perm': 'assetWrite' }, on: { click: function () { runCommit(st, false); } } },
          icon('download', 18), el('span', { text: t('ingest2.commitBtn') }));
        commitBtn.disabled = !canMap || !st.preview || st.busy || !engineReady();
        return el('div', { class: 'row row--end' }, previewBtn, commitBtn);
      }

      function kpiBox(label, value) {
        return el('div', { class: 'kpi' }, el('span', { class: 'kpi__label', text: label }), el('span', { class: 'kpi__value num', text: value }));
      }

      function runPreview(st) {
        var F = formats();
        var C = commitApi();
        var M = mappingApi();
        if (!F || !C || !M || st.busy) { return Promise.resolve(); }
        if (st.file.size > limitBytes()) { paint(st); return Promise.resolve(); }
        if (!st.validation || !st.validation.ok) { return Promise.resolve(); }
        st.busy = true;
        st.op = 'preview';
        st.errorText = null;
        paint(st);
        var out;
        return F.readRows(st.file, readOptsFor(st, limitRows())).then(function (r) {
          out = r;
          return C.preview({
            storeName: st.entity,
            columnPlan: M.toColumnPlan(st.assignments),
            rowIterable: r.rows,
            repo: repos[st.entity],
            limits: { maxRows: limitRows() },
            sourceFile: st.file.name
          });
        }).then(function (res) {
          st.preview = res;
          st.previewWarnings = (out.meta && out.meta.warnings) ? out.meta.warnings.slice() : [];
          st.run = null;
        }).catch(function (err) {
          st.errorText = describeError(err);
        }).then(function () {
          st.busy = false;
          st.op = null;
          paint(st);
        });
      }

      function paintPreview(st, body) {
        var p = st.preview;
        var wrap = el('div', { class: 'stack' });
        wrap.appendChild(el('h3', { text: t('ingest2.previewTitle') }));
        wrap.appendChild(el('div', { class: 'grid-bento result-summary' },
          kpiBox(t('ingest.rowsTotal'), fmtNum(p.counts.total, 0)),
          kpiBox(t('ingest2.willInsert'), fmtNum(p.counts.nuevos, 0)),
          kpiBox(t('ingest2.willUpdate'), fmtNum(p.counts.cambios, 0)),
          kpiBox(t('ingest2.willUnchanged'), fmtNum(p.counts.sinCambios, 0)),
          kpiBox(t('ingest2.invalidRows'), fmtNum(p.counts.invalid, 0)),
          kpiBox(t('ingest2.dupInFile'), fmtNum(p.counts.dupEnArchivo, 0))));
        if (p.truncado) {
          wrap.appendChild(el('p', { class: 'notice', text: t('ingest2.maxRows') + ': ' + fmtNum(limitRows(), 0) }));
        }

        var plan = mappingApi().toColumnPlan(st.assignments).slice(0, SAMPLE_COLS);
        var muestras = p.muestras.filter(function (m) { return m.record; });
        if (muestras.length) {
          wrap.appendChild(el('h3', { text: t('ingest2.sampleRows') }));
          var tbl = el('table', { class: 'data' });
          tbl.appendChild(el('caption', { text: t('ingest2.sampleRows') }));
          var headCells = [el('th', { attrs: { scope: 'col' }, text: '#' })];
          plan.forEach(function (pl) { headCells.push(el('th', { attrs: { scope: 'col' }, text: pl.field })); });
          tbl.appendChild(el('thead', null, el('tr', null, headCells)));
          var tbody = el('tbody');
          muestras.forEach(function (m) {
            var cells = [el('td', { text: String(m.rowNo) })];
            plan.forEach(function (pl) {
              var v = getv(m.record, pl.field);
              cells.push(el('td', { text: (v === undefined || v === null) ? '' : String(v) }));
            });
            tbody.appendChild(el('tr', null, cells));
          });
          tbl.appendChild(tbody);
          wrap.appendChild(el('div', { class: 'table-wrap' }, tbl));
        }

        if (p.errores && p.errores.length) {
          wrap.appendChild(el('h3', { text: t('ingest2.errorsList') }));
          wrap.appendChild(el('ul', { class: 'plain-list' }, p.errores.map(function (e) {
            return el('li', { text: '#' + e.rowNo + ' · ' + e.code + ' · ' + e.message });
          })));
        }

        var warns = (st.previewWarnings || []).concat(p.advertencias || []);
        if (warns.length) {
          wrap.appendChild(el('h3', { text: t('ingest2.warningsList') }));
          wrap.appendChild(el('ul', { class: 'plain-list' }, warns.map(function (w) {
            if (typeof w === 'string') { return el('li', { text: w }); }
            return el('li', { text: (w.rowNo ? '#' + w.rowNo + ' · ' : '') + w.code + ' · ' + w.message });
          })));
        }
        body.appendChild(wrap);
      }

      function paintProgress(st, body) {
        var total = st.progress && st.progress.rowsTotal ? st.progress.rowsTotal : (st.preview && st.preview.counts ? st.preview.counts.total : null);
        var bar = el('progress', { attrs: { max: String(total || 0), 'aria-label': t('ingest2.importing') } });
        if (st.progress) { bar.value = st.progress.rowsDone; }
        var text = el('p', { class: 'field-hint', attrs: { role: 'status', 'aria-live': 'polite' }, text: progressText(st, total) });
        var cancelBtn = el('button', { class: 'btn btn-danger', on: { click: function () {
          st.cancelRequested = true;
          cancelBtn.disabled = true;
        } } }, icon('x', 18), el('span', { text: t('ingest2.cancelBtn') }));
        if (st.cancelRequested) { cancelBtn.disabled = true; }
        st.refs.progress = bar;
        st.refs.progressTotal = total;
        st.refs.progressText = text;
        body.appendChild(el('div', { class: 'stack' },
          el('div', { class: 'row' }, el('span', { class: 'spinner' }), el('span', { text: t('ingest2.importing') })),
          bar, text, cancelBtn));
      }

      function progressText(st, total) {
        var done = st.progress ? st.progress.rowsDone : 0;
        if (!total) { return t('ingest2.importing') + ' · ' + fmtNum(done, 0); }
        var pct = Math.floor((done * 100) / total);
        return t('ingest2.progressOf', { done: fmtNum(done, 0), total: fmtNum(total, 0), pct: fmtNum(pct, 0) });
      }

      function updateProgress(st, p) {
        st.progress = p;
        if (st.refs.progress) {
          st.refs.progress.value = p.rowsDone;
          if (st.refs.progressText) { st.refs.progressText.textContent = progressText(st, st.refs.progressTotal); }
        }
      }

      function xlsxSheetFor(st) {
        return (st.meta && st.meta.format === 'xlsx') ? (st.sheet || st.meta.sheetName || undefined) : undefined;
      }

      function runCommit(st, resume) {
        var C = commitApi();
        var M = mappingApi();
        if (!C || !M || st.busy || !st.preview || !st.validation || !st.validation.ok) { return Promise.resolve(); }
        if (st.file.size > limitBytes()) { paint(st); return Promise.resolve(); }
        requirePerm('assetWrite').then(function () {
          st.busy = true;
          st.op = 'import';
          st.cancelRequested = false;
          st.errorText = null;
          st.progress = null;
          st.startedAt = Date.now();
          paint(st);
          var opts = {
            storeName: st.entity,
            columnPlan: M.toColumnPlan(st.assignments),
            source: st.file,
            format: st.format || undefined,
            sheet: xlsxSheetFor(st),
            sourceFile: st.file.name,
            repo: repos[st.entity],
            metaRepo: repos.meta,
            importLogRepo: repos.importLog,
            limits: { maxBytes: limitBytes(), maxRows: limitRows() },
            rowsTotal: st.preview && st.preview.counts ? st.preview.counts.total : null,
            fingerprint: fingerprintOf(st.file),
            resume: !!resume,
            isCanceled: function () { return st.cancelRequested; },
            onProgress: function (p) { updateProgress(st, p); }
          };
          return actorPromise().then(function (s) {
            if (s) { opts.actor = { user: s.username || s.role, role: s.role }; }
            return C.run(opts);
          });
        }).then(function (res) {
          st.run = res;
          st.elapsed = Date.now() - st.startedAt;
        }).catch(function (err) {
          if (isForbidden(err)) { forbiddenToast(err); }
          else { st.errorText = describeError(err); }
          st.run = null;
        }).then(function () {
          st.busy = false;
          st.op = null;
          st.progress = null;
          paint(st);
        });
      }

      function paintRunResult(st, body) {
        var r = st.run;
        if (r.status === 'done') {
          body.appendChild(el('h3', { text: t('ingest2.doneMsg') }));
          body.appendChild(el('div', { class: 'grid-bento result-summary' },
            kpiBox(t('ingest2.willInsert'), fmtNum(r.counts.inserts, 0)),
            kpiBox(t('ingest2.willUpdate'), fmtNum(r.counts.updates, 0)),
            kpiBox(t('ingest2.willUnchanged'), fmtNum(r.counts.unchanged, 0)),
            kpiBox(t('ingest2.invalidRows'), fmtNum(r.counts.invalid, 0)),
            kpiBox(t('ingest2.dupInFile'), fmtNum(r.counts.dupEnArchivo, 0))));
          body.appendChild(el('p', { class: 'field-hint', text: t('ingest2.elapsed') + ': ' + fmtSeconds(st.elapsed || 0) }));
          if (r.errores && r.errores.length) {
            body.appendChild(el('h3', { text: t('ingest2.errorsList') }));
            body.appendChild(el('ul', { class: 'plain-list' }, r.errores.map(function (e) {
              return el('li', { text: '#' + e.rowNo + ' · ' + e.code + ' · ' + e.message });
            })));
          }
        } else {
          body.appendChild(el('p', { class: 'notice', attrs: { role: 'status' }, text: t('ingest2.pausedMsg') }));
          body.appendChild(el('div', { class: 'row' }, el('button', { class: 'btn', on: { click: function () { runCommit(st, true); } } },
            icon('play', 18), el('span', { text: t('ingest2.resumeBtn') }))));
        }
      }

      // --- 6) Historial de sesiones --------------------------------------------
      function sessionStatusInfo(s) {
        if (s.status === 'done') { return { label: t('ingest2.statusDone'), cls: 'badge badge-low' }; }
        if (s.status === 'partial') { return { label: t('ingest2.statusPartial'), cls: 'badge badge-moderate' }; }
        if (s.status === 'rolled-back' || s.rolledBack) { return { label: t('ingest2.rollbackDone'), cls: 'badge badge-neutral' }; }
        return { label: (s.status && s.status !== 'unknown') ? s.status : '—', cls: 'badge badge-neutral' };
      }

      function refreshSessions() {
        var C = commitApi();
        if (!C || typeof C.importSessions !== 'function' || !repos.importLog) { return Promise.resolve(); }
        return C.importSessions({ importLogRepo: repos.importLog, metaRepo: repos.meta }).then(function (rows) {
          state.sessions = rows || [];
          paintSessions();
        }).catch(function () {
          state.sessions = [];
          paintSessions();
        });
      }

      function paintSessions() {
        var wrap = sessionsWrap;
        wrap.textContent = '';
        if (!state.sessions.length) {
          wrap.appendChild(el('p', { class: 'empty-state', text: t('ingest2.noSessions') }));
          if (state.sessionNotice) { wrap.appendChild(el('p', { class: 'notice', attrs: { role: 'status' }, text: state.sessionNotice })); }
          return;
        }
        wrap.appendChild(ui().table({
          captionKey: 'ingest2.sessionsTitle',
          emptyKey: 'ingest2.noSessions',
          columns: [
            {
              key: 'importId', labelKey: 'ingest.fileName', render: function (v, s) {
                var info = sessionStatusInfo(s);
                return el('span', { text: t('ingest2.sessionRow', { file: v, store: s.storeName || '—', status: info.label }) });
              }
            },
            {
              key: 'startedAt', labelKey: 'common.date', render: function (v) { return el('span', { text: v ? fmtDate(v) : '—' }); }
            },
            {
              key: 'inserts', labelKey: 'ingest.rowsOk', align: 'num', render: function (v, s) {
                return el('span', { class: 'num', text: fmtNum(s.inserts || 0, 0) + ' + ' + fmtNum(s.updates || 0, 0) });
              }
            },
            {
              key: 'status', labelKey: 'common.status', render: function (v, s) {
                var info = sessionStatusInfo(s);
                return el('span', { class: info.cls, text: info.label });
              }
            },
            {
              key: 'importId', labelKey: 'common.actions', render: function (v, s) {
                var nodes = [];
                if (s.status === 'partial') {
                  nodes.push(el('button', { class: 'btn', on: { click: function () {
                    state.sessionNotice = t('ingest2.pausedMsg') + ' · ' + t('ingest2.pickFiles');
                    paintSessions();
                  } } }, icon('play', 18), el('span', { text: t('ingest2.resumeBtn') })));
                }
                if (!(s.rolledBack && s.status !== 'partial')) {
                  var btn = el('button', { class: 'btn btn-danger', attrs: { 'data-perm': 'delete' }, on: { click: function () { doRollback(s); } } },
                    icon('trash', 18), el('span', { text: t('ingest2.rollbackBtn') }));
                  if (!s.storeName || !repos[s.storeName]) { btn.disabled = true; }
                  nodes.push(btn);
                } else {
                  nodes.push(el('span', { class: 'badge badge-neutral', text: t('ingest2.rollbackDone') }));
                }
                return nodes;
              }
            }
          ],
          rows: state.sessions
        }));
        if (state.sessionNotice) {
          wrap.appendChild(el('p', { class: 'notice', attrs: { role: 'status' }, text: state.sessionNotice }));
        }
      }

      function doRollback(s) {
        var C = commitApi();
        var repo = s.storeName ? repos[s.storeName] : null;
        if (!C || !repo || typeof repo.remove !== 'function') {
          ui().toast('common.error', { severity: 'critical' });
          return;
        }
        requirePerm('delete').then(function () {
          return ui().confirmDialog({ titleKey: 'ingest2.rollbackBtn', bodyKey: 'ingest2.rollbackConfirm', danger: true });
        }).then(function (ok) {
          if (!ok) { return null; }
          return C.rollback({
            journalId: s.importId,
            repo: repo,
            importLogRepo: repos.importLog,
            metaRepo: repos.meta
          }).then(function () {
            state.sessionNotice = null;
            ui().toast('ingest2.rollbackDone', { severity: 'info' });
            return refreshSessions();
          });
        }).catch(function (err) {
          if (isForbidden(err)) { forbiddenToast(err); return; }
          ui().toast(t('common.error') + ': ' + (err && err.message ? err.message : err), { severity: 'critical' });
        });
      }

      // --- 7) Backup / restaurar + cola de sincronizacion (preservado de v1) ----
      var queueStatus;

      function buildBackupCard() {
        var card = el('section', { class: 'card' });
        queueStatus = el('p', { class: 'queue-status', attrs: { role: 'status', 'aria-live': 'polite' } });
        card.appendChild(el('h2', { text: t('ingest.jsonExport') }));

        var exportBtn = el('button', { class: 'btn', on: { click: onExport } }, icon('download', 18), el('span', { text: t('ingest.jsonExport') }));
        card.appendChild(el('div', { class: 'row' }, exportBtn));

        var modeSelect = el('select', { class: 'select', attrs: { 'aria-label': t('ingest.jsonImport') } });
        modeSelect.appendChild(el('option', { attrs: { value: 'merge' }, text: t('ingest.modeMerge') }));
        modeSelect.appendChild(el('option', { attrs: { value: 'replace' }, text: t('ingest.modeReplace') }));
        var jsonInput = el('input', { class: 'visually-hidden', attrs: { type: 'file', id: 'json-file', accept: '.json,application/json' } });
        var jsonImportBtn = el('button', { class: 'btn', on: { click: function () { jsonInput.click(); } } }, icon('upload', 18), el('span', { text: t('ingest.jsonImport') }));
        jsonInput.addEventListener('change', function () {
          if (jsonInput.files && jsonInput.files.length) { onJsonImport(jsonInput.files[0], modeSelect.value); }
        });
        card.appendChild(el('div', { class: 'row' }, modeSelect, jsonImportBtn, jsonInput));

        card.appendChild(el('div', { class: 'json-result', attrs: { 'aria-live': 'polite' } }));

        card.appendChild(el('h3', { text: t('ingest.queueTitle') }));
        var endpointInput = el('input', { class: 'input', attrs: { type: 'url', 'aria-label': t('ingest.syncEndpoint') } });
        endpointInput.setAttribute('id', 'fld-sync-endpoint');
        card.appendChild(el('div', { class: 'field' },
          el('label', { class: 'field-label', attrs: { for: 'fld-sync-endpoint' }, text: t('ingest.syncEndpoint') }),
          endpointInput,
          el('p', { class: 'field-hint', text: t('ingest.endpointNote') })));
        card.appendChild(queueStatus);
        var flushBtn = el('button', { class: 'btn btn-primary', on: { click: onFlush } }, icon('refresh', 18), el('span', { text: t('ingest.flush') }));
        card.appendChild(el('div', { class: 'row' }, flushBtn));
        return card;
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

      function onJsonImport(file, mode) {
        if (file && typeof file.size === 'number' && file.size > MAX_JSON_BYTES) {
          ui().toast(t('ingest.tooLarge', { limit: String(MAX_JSON_BYTES / 1000000) }), { severity: 'critical' });
          return Promise.resolve(null);
        }
        var permit = function () {
          return requirePerm('assetWrite').then(function () {
            if (mode === 'replace') { return requirePerm('delete'); }
            return true;
          });
        };
        var proceed = function () {
          return permit().then(function () {
            return readFileAsText(file).then(function (text) {
              var payload;
              try { payload = JSON.parse(text); } catch (e) {
                return Promise.resolve({ errors: [{ code: 'E_PARSE', message: 'invalid json' }] });
              }
              var ei = exportImport();
              if (!ei) { return Promise.resolve({ errors: [] }); }
              if (payload && typeof payload === 'object' && payload.format === 'iwf') {
                var cf = caseFile();
                if (!cf) { return Promise.resolve({ errors: [{ code: 'E_CHECKSUM', message: 'case file module unavailable' }] }); }
                var parseP = (typeof cf.parseCaseFileAsync === 'function')
                  ? cf.parseCaseFileAsync(text)
                  : Promise.resolve(cf.parseCaseFile(text));
                return parseP.then(function (res) {
                  if (!res.ok) { return { errors: [{ code: res.error, message: res.error }] }; }
                  return ei.importAll(repos, { data: res.payload.data }, { mode: mode });
                });
              }
              return ei.importAll(repos, payload, { mode: mode });
            }).then(function (summary) {
              var region = view.querySelector('.json-result');
              if (region) {
                region.textContent = '';
                region.appendChild(el('p', { text: t('ingest.jsonResult', { created: String(summary.created || 0), updated: String(summary.updated || 0), deleted: String(summary.deleted || 0) }) }));
              }
              refreshSessions();
              return summary;
            });
          }).catch(function (err) {
            if (isForbidden(err)) { forbiddenToast(err); return null; }
            ui().toast(t('common.error') + ': ' + (err && err.message ? err.message : err), { severity: 'critical' });
            return null;
          });
        };

        if (mode === 'replace') {
          return ui().confirmDialog({
            titleKey: 'ingest.jsonImport',
            bodyKey: 'ingest.importConfirmReplace',
            danger: true
          }).then(function (ok) { if (ok) { return proceed(); } return null; });
        }
        return proceed();
      }

      function refreshQueueStatus() {
        if (!queueStatus) { return Promise.resolve(); }
        var sq = syncQueue();
        var pendingPromise = (repos.mutationQueue && repos.mutationQueue.list) ? repos.mutationQueue.list() : Promise.resolve([]);
        return pendingPromise.then(function (rows) {
          var pending = 0, dead = 0;
          (rows || []).forEach(function (r) {
            if (!r.sentISO && !r.dead) { pending++; }
            if (r.dead) { dead++; }
          });
          if (sq && typeof sq.pending === 'function') { pending = sq.pending(); }
          if (queueStatus) { queueStatus.textContent = t('ingest.queuePending') + ': ' + pending + ' · ' + t('ingest.deadCount') + ': ' + dead; }
        }).catch(function () {
          if (queueStatus) { queueStatus.textContent = ''; }
        });
      }

      function onFlush() {
        var sq = syncQueue();
        if (!sq || typeof sq.flush !== 'function') { return; }
        return sq.flush().then(function () {
          refreshQueueStatus();
        });
      }

      // --- suscripciones + arranque ---------------------------------------------
      var offImportLog = bus && typeof bus.on === 'function' ? bus.on('data:changed:importLog', function () { refreshSessions(); }) : null;
      var offQueue = bus && typeof bus.on === 'function' ? bus.on('data:changed:mutationQueue', function () { refreshQueueStatus(); }) : null;

      paintLimits();
      loadLimits();
      refreshSessions();
      refreshQueueStatus();

      container.appendChild(view);
    }
  };
});
