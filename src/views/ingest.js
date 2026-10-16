/* IntegrityWatch Field — ingest view
   CSV / WITSML / JSON import, offline sync queue and import history. */
(function (root, factory) {
  'use strict';
  var api = factory(root);
  root.IW = root.IW || {};
  root.IW.views = root.IW.views || {};
  root.IW.views.ingest = api;
  if (typeof module === 'object' && module.exports) { module.exports = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  var CANONICAL_FIELDS = ['mpCode', 'date', 'crMpy', 'wiMg', 'wfMg', 'areaIn2', 'days', 'inhibitorResidualPpm', 'tempC', 'bswPct', 'category', 'note'];

  function ui() { return root.IW.ui; }
  function csv() { return root.IW.ingest ? root.IW.ingest.csv : null; }
  function witsml() { return root.IW.ingest ? root.IW.ingest.witsmlLite : null; }
  function exportImport() { return root.IW.core ? root.IW.core.exportImport : null; }
  function syncQueue() { return root.IW.core ? root.IW.core.syncQueue : null; }

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

  // Build canonical objects from parsed rows using the header -> field mapping.
  function buildRowObjects(headers, rows, mapping) {
    return (rows || []).map(function (cells) {
      var obj = {};
      (headers || []).forEach(function (h, i) {
        var field = mapping[h];
        if (field && cells[i] !== undefined) { obj[field] = String(cells[i]).trim(); }
      });
      return obj;
    });
  }

  function makeId(prefix, seq) {
    var rnd = Math.random().toString(36).slice(2, 6);
    return (prefix || 'id') + '-' + Date.now().toString(36) + '-' + String(seq) + '-' + rnd;
  }

  function readFileAsText(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () { resolve(String(reader.result || '')); };
      reader.onerror = function () { reject(reader.error || new Error('read failed')); };
      reader.readAsText(file);
    });
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

      function fmtDate(iso) { return (i18n && i18n.formatDate) ? i18n.formatDate(iso, { dateStyle: 'short', timeStyle: 'short' }) : iso; }
      function fmtNum(v, dec) { return (i18n && i18n.formatNumber) ? i18n.formatNumber(v, { maximumFractionDigits: dec === undefined ? 2 : dec }) : String(v); }

      var view = el('div', { class: 'view view-ingest' });
      view.appendChild(el('h1', { text: t('ingest.title') }));

      // --- Sync queue --------------------------------------------------------
      var queueCard = el('section', { class: 'card' });
      queueCard.appendChild(el('h2', { text: t('ingest.queueTitle') }));
      var endpointInput = el('input', { class: 'input', attrs: { type: 'url', 'aria-label': t('ingest.syncEndpoint') } });
      var endpointField = el('div', { class: 'field' },
        el('label', { class: 'field-label', attrs: { for: 'fld-sync-endpoint' }, text: t('ingest.syncEndpoint') }),
        endpointInput,
        el('p', { class: 'field-hint', text: t('ingest.endpointNote') }));
      endpointInput.setAttribute('id', 'fld-sync-endpoint');
      queueCard.appendChild(endpointField);

      var queueStatus = el('p', { class: 'queue-status', attrs: { role: 'status', 'aria-live': 'polite' } });
      queueCard.appendChild(queueStatus);
      var flushBtn = el('button', { class: 'btn btn-primary', on: { click: onFlush } }, icon('refresh', 18), el('span', { text: t('ingest.flush') }));
      queueCard.appendChild(el('div', { class: 'row' }, flushBtn));
      view.appendChild(queueCard);

      // --- CSV / WITSML / JSON tabs -----------------------------------------
      var tabs = ui().tabs([
        { id: 'csv', labelKey: 'ingest.csvImport', render: function () { return buildCsvPanel(); } },
        { id: 'witsml', labelKey: 'ingest.witsmlImport', render: function () { return buildWitsmlPanel(); } },
        { id: 'json', labelKey: 'ingest.jsonImport', render: function () { return buildJsonPanel(); } }
      ]);
      view.appendChild(tabs);

      // --- Import history ----------------------------------------------------
      var historyCard = el('section', { class: 'card' });
      historyCard.appendChild(el('h2', { text: t('ingest.importHistory') }));
      var historyWrap = el('div', { class: 'import-history' });
      historyCard.appendChild(historyWrap);
      view.appendChild(historyCard);

      // --- CSV panel ----------------------------------------------------------
      var csvState = { text: '', headers: [], rows: [], delimiter: null, autoMapping: {}, manualMapping: {}, unmapped: [], validation: null };

      function buildCsvPanel() {
        var panel = el('div', { class: 'stack' });

        var fileInput = el('input', { class: 'visually-hidden', attrs: { type: 'file', id: 'csv-file', accept: '.csv,.tsv' } });
        var dropZone = el('div', {
          class: 'drop-zone',
          attrs: { role: 'button', tabindex: '0', 'aria-label': t('ingest.chooseFile') }
        },
          icon('upload', 24),
          el('p', { text: t('ingest.chooseFile') + ' · ' + t('ingest.orDrop') }));
        dropZone.addEventListener('click', function () { fileInput.click(); });
        dropZone.addEventListener('keydown', function (e) {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput.click(); }
        });
        dropZone.addEventListener('dragover', function (e) { e.preventDefault(); dropZone.classList.add('drop-zone--over'); });
        dropZone.addEventListener('dragleave', function () { dropZone.classList.remove('drop-zone--over'); });
        dropZone.addEventListener('drop', function (e) {
          e.preventDefault();
          dropZone.classList.remove('drop-zone--over');
          if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length) {
            handleCsvFile(e.dataTransfer.files[0]);
          }
        });
        fileInput.addEventListener('change', function () {
          if (fileInput.files && fileInput.files.length) { handleCsvFile(fileInput.files[0]); }
        });

        panel.appendChild(dropZone);
        panel.appendChild(fileInput);

        var csvBody = el('div', { class: 'stack csv-body' });
        panel.appendChild(csvBody);
        return panel;
      }

      function handleCsvFile(file) {
        readFileAsText(file).then(function (text) {
          var c = csv();
          if (!c) { return; }
          csvState.text = text;
          csvState.delimiter = c.detectDelimiter(text);
          var parsed = c.parse(text, { delimiter: csvState.delimiter });
          csvState.headers = parsed.headers;
          csvState.rows = parsed.rows;
          var mapped = c.mapColumns(parsed.headers);
          csvState.autoMapping = mapped.mapping;
          csvState.unmapped = mapped.unmapped;
          csvState.manualMapping = {};
          csvState.validation = null;
          renderCsvBody(file.name);
        }).catch(function (err) {
          renderCsvError(err && err.message ? err.message : String(err));
        });
      }

      function renderCsvError(msg) {
        var body = view.querySelector('.csv-body');
        if (!body) { return; }
        body.textContent = '';
        body.appendChild(el('div', { class: 'error-banner', attrs: { role: 'alert' }, text: msg }));
      }

      function renderCsvBody(fileName) {
        var body = view.querySelector('.csv-body');
        if (!body) { return; }
        body.textContent = '';

        var delimText = csvState.delimiter === '\t' ? 'TAB' : csvState.delimiter;
        body.appendChild(el('p', { text: t('ingest.delimiterDetected') + ': ' + delimText + ' · ' + fileName }));

        // Column mapping: auto-mapped selects + manual overrides per column.
        var mappingWrap = el('div', { class: 'column-mapping' });
        mappingWrap.appendChild(el('h3', { text: t('ingest.columnMapping') }));
        var tableEl = el('table', { class: 'data' });
        tableEl.appendChild(el('caption', { text: t('ingest.columnMapping') }));
        var thead = el('thead', null, el('tr', null,
          el('th', { attrs: { scope: 'col' }, text: t('ingest.columnMapping') }),
          el('th', { attrs: { scope: 'col' }, text: t('ingest.mapTo') })));
        var tbody = el('tbody');
        csvState.headers.forEach(function (h) {
          var tr = el('tr');
          tr.appendChild(el('th', { attrs: { scope: 'row' }, text: h }));
          var td = el('td');
          var sel = el('select', { class: 'select' });
          sel.appendChild(el('option', { attrs: { value: '' }, text: t('common.none') }));
          CANONICAL_FIELDS.forEach(function (f) {
            sel.appendChild(el('option', { attrs: { value: f }, text: t('ingest.canonical.' + f) }));
          });
          var initial = csvState.autoMapping[h] || '';
          sel.value = initial;
          if (initial) { csvState.manualMapping[h] = initial; }
          sel.addEventListener('change', function () {
            if (sel.value) { csvState.manualMapping[h] = sel.value; }
            else { delete csvState.manualMapping[h]; }
          });
          td.appendChild(sel);
          tr.appendChild(td);
          tbody.appendChild(tr);
        });
        tableEl.appendChild(thead);
        tableEl.appendChild(tbody);
        mappingWrap.appendChild(tableEl);
        body.appendChild(mappingWrap);

        var createMissing = el('label', { class: 'field-label checkbox-row' },
          el('input', { attrs: { type: 'checkbox', id: 'csv-create-missing' } }),
          el('span', { text: t('ingest.createMissing') }));
        body.appendChild(createMissing);

        var validateBtn = el('button', { class: 'btn btn-primary', on: { click: onValidate } }, icon('check', 18), el('span', { text: t('ingest.runValidation') }));
        body.appendChild(el('div', { class: 'row' }, validateBtn));

        var resultRegion = el('div', { class: 'csv-result', attrs: { 'aria-live': 'polite' } });
        body.appendChild(resultRegion);
      }

      function currentMapping() {
        var mapping = {};
        csvState.headers.forEach(function (h) {
          var field = csvState.manualMapping[h] !== undefined ? csvState.manualMapping[h] : csvState.autoMapping[h];
          if (field) { mapping[h] = field; }
        });
        return mapping;
      }

      function onValidate() {
        var c = csv();
        if (!c) { return; }
        var createMissing = view.querySelector('#csv-create-missing');
        var autoCreate = !!(createMissing && createMissing.checked);
        var mapping = currentMapping();
        var objects = buildRowObjects(csvState.headers, csvState.rows, mapping);

        return repos.monitoringPoints.list().then(function (points) {
          var existingCodes = points.map(function (p) { return p.code || p.id; });
          var result = c.validateRows({
            rows: objects,
            existingPointIds: existingCodes,
            nowISO: new Date().toISOString(),
            autoCreatePoints: autoCreate
          });
          csvState.validation = { result: result, autoCreate: autoCreate, mapping: mapping };
          renderValidation();
        });
      }

      function renderValidation() {
        var region = view.querySelector('.csv-result');
        if (!region) { return; }
        region.textContent = '';
        if (!csvState.validation) { return; }
        var v = csvState.validation;
        var result = v.result;

        region.appendChild(el('h3', { text: t('ingest.resultSummary') }));
        var summary = el('div', { class: 'grid-bento result-summary' },
          kpiBox(t('ingest.rowsTotal'), String(csvState.rows.length)),
          kpiBox(t('ingest.rowsOk'), String(result.valid.length)),
          kpiBox(t('ingest.rowsSkipped'), String(result.duplicates.length)),
          kpiBox(t('ingest.rowsError'), String(result.invalid.length)));
        region.appendChild(summary);

        var importBtn = el('button', { class: 'btn btn-primary', on: { click: onImport } }, icon('download', 18), el('span', { text: t('ingest.importBtn') }));
        importBtn.disabled = result.valid.length === 0;
        region.appendChild(el('div', { class: 'row' }, importBtn));

        if (result.invalid.length > 0) {
          region.appendChild(el('h3', { text: t('ingest.rowsError') }));
          region.appendChild(buildErrorTable(result.invalid));
        }
      }

      function kpiBox(label, value) {
        return el('div', { class: 'kpi' }, el('span', { class: 'kpi__label', text: label }), el('span', { class: 'kpi__value num', text: value }));
      }

      function buildErrorTable(errors) {
        var tbl = el('table', { class: 'data' });
        tbl.appendChild(el('caption', { text: t('ingest.rowsError') }));
        var thead = el('thead', null, el('tr', null,
          el('th', { attrs: { scope: 'col' }, text: '#' }),
          el('th', { attrs: { scope: 'col' }, text: t('ingest.columnMapping') }),
          el('th', { attrs: { scope: 'col' }, text: t('common.error') })));
        var tbody = el('tbody');
        errors.forEach(function (e) {
          tbody.appendChild(el('tr', null,
            el('td', { text: String(e.rowNum) }),
            el('td', { text: e.field || '—' }),
            el('td', { text: t('ingest.errorCodes.' + e.code) })));
        });
        tbl.appendChild(thead);
        tbl.appendChild(tbody);
        var wrap = el('div', { class: 'table-wrap' }, tbl);
        return wrap;
      }

      function onImport() {
        var c = csv();
        if (!c || !csvState.validation) { return; }
        var v = csvState.validation;
        var result = v.result;
        var records = c.toRecords(result.valid, v.mapping);

        // Assign ids (IndexedDB keyPath requires them).
        var seq = 0;
        records.readings.forEach(function (r) { r.id = makeId('RD', ++seq); });
        records.coupons.forEach(function (r) { r.id = makeId('CP', ++seq); });

        var newPoints = result.newPoints.map(function (np) {
          return {
            id: np.id,
            code: np.code,
            name: np.code,
            sector: 'upstream',
            material: 'api5l-gr-b',
            sensorType: 'couponGravimetric',
            process: {}
          };
        });

        var writes = [];
        if (newPoints.length) { writes.push(repos.monitoringPoints.saveAll(newPoints)); }
        if (records.readings.length) { writes.push(repos.readings.saveAll(records.readings)); }
        if (records.coupons.length) { writes.push(repos.coupons.saveAll(records.coupons)); }

        var log = {
          id: makeId('IL', ++seq),
          fileName: (csvState.text && csvState.text.length) ? 'csv' : 'csv',
          at: new Date().toISOString(),
          kind: 'csv',
          rowsTotal: csvState.rows.length,
          rowsOk: result.valid.length,
          rowsSkipped: result.duplicates.length,
          rowsError: result.invalid.length,
          errors: result.invalid,
          createdPoints: result.newPoints.map(function (np) { return np.id; })
        };
        writes.push(repos.importLog.save(log));

        return Promise.all(writes).then(function () {
          var region = view.querySelector('.csv-result');
          if (region) {
            region.appendChild(el('p', { class: 'import-done', attrs: { role: 'status' }, text: t('ingest.importDone') }));
          }
          ui().toast('ingest.importDone', { severity: 'info' });
          refreshQueueStatus();
          refreshHistory();
        }).catch(function (err) {
          ui().toast(t('common.error') + ': ' + (err && err.message ? err.message : err), { severity: 'critical' });
        });
      }

      // --- WITSML panel --------------------------------------------------------
      var witsmlState = { parsed: null, fileName: '' };

      function buildWitsmlPanel() {
        var panel = el('div', { class: 'stack' });
        panel.appendChild(el('p', { text: t('ingest.witsmlNote') }));
        var fileInput = el('input', { class: 'visually-hidden', attrs: { type: 'file', id: 'witsml-file', accept: '.xml' } });
        var chooseBtn = el('button', { class: 'btn', on: { click: function () { fileInput.click(); } } }, icon('upload', 18), el('span', { text: t('ingest.chooseFile') }));
        fileInput.addEventListener('change', function () {
          if (fileInput.files && fileInput.files.length) { handleWitsmlFile(fileInput.files[0]); }
        });
        panel.appendChild(el('div', { class: 'row' }, chooseBtn, fileInput));
        var body = el('div', { class: 'stack witsml-body' });
        panel.appendChild(body);
        return panel;
      }

      function handleWitsmlFile(file) {
        readFileAsText(file).then(function (text) {
          var w = witsml();
          if (!w) { return; }
          witsmlState.parsed = w.parse(text);
          witsmlState.fileName = file.name;
          renderWitsmlBody();
        }).catch(function (err) {
          renderWitsmlError(err && err.message ? err.message : String(err));
        });
      }

      function renderWitsmlError(msg) {
        var body = view.querySelector('.witsml-body');
        if (!body) { return; }
        body.textContent = '';
        body.appendChild(el('div', { class: 'error-banner', attrs: { role: 'alert' }, text: msg }));
      }

      function renderWitsmlBody() {
        var body = view.querySelector('.witsml-body');
        if (!body) { return; }
        body.textContent = '';
        var p = witsmlState.parsed;
        if (!p) { return; }

        var summary = el('div', { class: 'grid-bento result-summary' },
          kpiBox(t('ingest.wells'), String(p.wells.length)),
          kpiBox(t('ingest.stations'), String(p.trajectoryStations.length)),
          kpiBox(t('ingest.channels'), String(p.channels.length)),
          kpiBox(t('ingest.witsmlErrors'), String(p.errors.length)));
        body.appendChild(summary);

        if (p.errors.length > 0) {
          var errList = el('div', { class: 'stack' });
          p.errors.forEach(function (e) {
            errList.appendChild(el('p', { class: 'field-hint', text: t('ingest.errorCodes.' + e.code) + (e.detail ? ' — ' + e.detail : '') }));
          });
          body.appendChild(errList);
        }

        var importBtn = el('button', { class: 'btn btn-primary', on: { click: onWitsmlImport } }, icon('download', 18), el('span', { text: t('ingest.importBtn') }));
        importBtn.disabled = p.wells.length === 0 && p.channels.length === 0;
        body.appendChild(el('div', { class: 'row' }, importBtn));
      }

      function onWitsmlImport() {
        var p = witsmlState.parsed;
        if (!p) { return; }
        var seq = 0;

        var assets = p.wells.map(function (w) {
          return {
            id: w.uid || makeId('APM', ++seq),
            code: w.uid || w.name,
            name: w.name || w.uid,
            sector: 'upstream',
            category: 'well',
            criticality: 'B',
            status: 'running',
            rbi: { pof: 2, cof: 2, inspectionBaseMonths: 24 }
          };
        });

        var readings = [];
        p.channels.forEach(function (ch) {
          if (!ch.mpCode) { return; }
          ch.points.forEach(function (pt) {
            if (pt.value === undefined || pt.value === null) { return; }
            readings.push({
              id: makeId('RD', ++seq),
              mpId: ch.mpCode,
              date: pt.time,
              crMpy: pt.value,
              source: 'import'
            });
          });
        });

        var log = {
          id: makeId('IL', ++seq),
          fileName: witsmlState.fileName || 'witsml',
          at: new Date().toISOString(),
          kind: 'witsml',
          rowsTotal: readings.length,
          rowsOk: readings.length,
          rowsSkipped: 0,
          rowsError: p.errors.length,
          errors: p.errors.map(function (e) { return { rowNum: 0, code: e.code, field: '', message: e.detail || '' }; }),
          createdPoints: assets.map(function (a) { return a.id; })
        };

        var writes = [];
        if (assets.length) { writes.push(repos.apmAssets.saveAll(assets)); }
        if (readings.length) { writes.push(repos.readings.saveAll(readings)); }
        writes.push(repos.importLog.save(log));

        return Promise.all(writes).then(function () {
          ui().toast('ingest.importDone', { severity: 'info' });
          refreshHistory();
        }).catch(function (err) {
          ui().toast(t('common.error') + ': ' + (err && err.message ? err.message : err), { severity: 'critical' });
        });
      }

      // --- JSON panel ----------------------------------------------------------
      function buildJsonPanel() {
        var panel = el('div', { class: 'stack' });

        var exportBtn = el('button', { class: 'btn', on: { click: onExport } }, icon('download', 18), el('span', { text: t('ingest.jsonExport') }));
        panel.appendChild(el('div', { class: 'row' }, exportBtn));

        var modeSelect = el('select', { class: 'select', attrs: { 'aria-label': t('ingest.jsonImport') } });
        modeSelect.appendChild(el('option', { attrs: { value: 'merge' }, text: t('ingest.modeMerge') }));
        modeSelect.appendChild(el('option', { attrs: { value: 'replace' }, text: t('ingest.modeReplace') }));
        var fileInput = el('input', { class: 'visually-hidden', attrs: { type: 'file', id: 'json-file', accept: '.json,application/json' } });
        var importBtn = el('button', { class: 'btn', on: { click: function () { fileInput.click(); } } }, icon('upload', 18), el('span', { text: t('ingest.jsonImport') }));
        fileInput.addEventListener('change', function () {
          if (fileInput.files && fileInput.files.length) { onJsonImport(fileInput.files[0], modeSelect.value); }
        });
        panel.appendChild(el('div', { class: 'row' }, modeSelect, importBtn, fileInput));

        var resultRegion = el('div', { class: 'json-result', attrs: { 'aria-live': 'polite' } });
        panel.appendChild(resultRegion);
        return panel;
      }

      function onExport() {
        var ei = exportImport();
        if (!ei) { return; }
        return ei.exportAll(repos).then(function (payload) {
          var blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
          var url = URL.createObjectURL(blob);
          var a = document.createElement('a');
          var d = new Date();
          var stamp = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
          a.href = url;
          a.download = 'integritywatch-backup-' + stamp + '.json';
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
        });
      }

      function onJsonImport(file, mode) {
        var proceed = function () {
          return readFileAsText(file).then(function (text) {
            var payload;
            try { payload = JSON.parse(text); } catch (e) {
              return Promise.resolve({ errors: [{ code: 'E_PARSE', message: 'invalid json' }] });
            }
            var ei = exportImport();
            if (!ei) { return Promise.resolve({ errors: [] }); }
            return ei.importAll(repos, payload, { mode: mode });
          }).then(function (summary) {
            var region = view.querySelector('.json-result');
            if (region) {
              region.textContent = '';
              region.appendChild(el('p', { text: t('ingest.jsonResult', { created: String(summary.created || 0), updated: String(summary.updated || 0), deleted: String(summary.deleted || 0) }) }));
            }
            refreshHistory();
            return summary;
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

      // --- Sync queue + history refresh ----------------------------------------
      function refreshQueueStatus() {
        var sq = syncQueue();
        var pendingPromise = (repos.mutationQueue && repos.mutationQueue.list) ? repos.mutationQueue.list() : Promise.resolve([]);
        return pendingPromise.then(function (rows) {
          var pending = 0, dead = 0;
          (rows || []).forEach(function (r) {
            if (!r.sentISO && !r.dead) { pending++; }
            if (r.dead) { dead++; }
          });
          if (sq && typeof sq.pending === 'function') { pending = sq.pending(); }
          queueStatus.textContent = t('ingest.queuePending') + ': ' + pending + ' · ' + t('ingest.deadCount') + ': ' + dead;
        }).catch(function () {
          queueStatus.textContent = '';
        });
      }

      function onFlush() {
        var sq = syncQueue();
        if (!sq || typeof sq.flush !== 'function') { return; }
        return sq.flush().then(function (res) {
          res = res || {};
          queueStatus.textContent = t('ingest.queuePending') + ': ' + ((sq.pending && sq.pending()) || 0);
          refreshQueueStatus();
        });
      }

      function refreshHistory() {
        return (repos.importLog && repos.importLog.list) ? repos.importLog.list().then(function (logs) {
          historyWrap.textContent = '';
          var sorted = (logs || []).slice().sort(function (a, b) { return (a.at < b.at) ? 1 : (a.at > b.at ? -1 : 0); }).slice(0, 20);
          if (sorted.length === 0) {
            historyWrap.appendChild(el('p', { class: 'empty-state', text: t('common.empty') }));
            return;
          }
          var tbl = el('table', { class: 'data' });
          tbl.appendChild(el('caption', { text: t('ingest.importHistory') }));
          var thead = el('thead', null, el('tr', null,
            el('th', { attrs: { scope: 'col' }, text: t('common.date') }),
            el('th', { attrs: { scope: 'col' }, text: t('ingest.fileName') }),
            el('th', { attrs: { scope: 'col' }, text: t('ingest.rowsOk') }),
            el('th', { attrs: { scope: 'col' }, text: t('ingest.rowsError') })));
          var tbody = el('tbody');
          sorted.forEach(function (l) {
            tbody.appendChild(el('tr', null,
              el('td', { text: fmtDate(l.at) }),
              el('td', { text: (l.fileName || l.kind || '—') }),
              el('td', { text: String(l.rowsOk === undefined ? '' : l.rowsOk) }),
              el('td', { text: String(l.rowsError === undefined ? '' : l.rowsError) })));
          });
          tbl.appendChild(thead);
          tbl.appendChild(tbody);
          historyWrap.appendChild(el('div', { class: 'table-wrap' }, tbl));
        }) : Promise.resolve();
      }

      // Subscribe to data changes to keep the queue/history fresh.
      var offHistory = bus && typeof bus.on === 'function' ? bus.on('data:changed:importLog', function () { refreshHistory(); }) : null;
      var offQueue = bus && typeof bus.on === 'function' ? bus.on('data:changed:mutationQueue', function () { refreshQueueStatus(); }) : null;

      refreshQueueStatus();
      refreshHistory();

      container.appendChild(view);
    }
  };
});
