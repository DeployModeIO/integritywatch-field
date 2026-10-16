/* IntegrityWatch Field — recommendations view
   Rule recommendations list with filters, acknowledge/resolve and history. */
(function (root, factory) {
  'use strict';
  var api = factory(root);
  root.IW = root.IW || {};
  root.IW.views = root.IW.views || {};
  root.IW.views.recommendations = api;
  if (typeof module === 'object' && module.exports) { module.exports = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  function ui() { return root.IW.ui; }
  function lock() { return root.IW.security ? root.IW.security.lock : null; }
  function engine() { return root.IW.rules ? root.IW.rules.engine : null; }

  function labelOf(entityStore, entityId, map) {
    var list = map[entityStore] || [];
    var found = null;
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === entityId) { found = list[i]; break; }
    }
    if (!found) { return entityId; }
    if (entityStore === 'psvs') { return found.tag || found.id; }
    return found.code || found.name || found.id;
  }

  function findBy(list, id) {
    for (var i = 0; i < (list || []).length; i++) {
      if (list[i].id === id) { return list[i]; }
    }
    return null;
  }

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

  return {
    id: 'recommendations',
    titleKey: 'nav.recommendations',
    icon: 'recs',
    render: function (container, ctx) {
      var t = ctx.i18n || function (k) { return k; };
      var repos = ctx.repos || {};
      var bus = ctx.bus;
      var navigate = ctx.navigate || function () {};
      var i18n = root.IW.i18n;

      function fmtDate(iso) { return (i18n && i18n.formatDate) ? i18n.formatDate(iso, { dateStyle: 'short', timeStyle: 'short' }) : iso; }
      function fmtNum(v, dec) { return (i18n && i18n.formatNumber) ? i18n.formatNumber(v, { maximumFractionDigits: dec === undefined ? 1 : dec }) : String(v); }

      var state = { status: 'all', severity: 'all', recs: [], entities: {} };

      var view = el('div', { class: 'view view-recommendations' });
      view.appendChild(el('div', { class: 'page-header' }, el('h1', { text: t('rules.title') })));

      // Toolbar: filters + run now.
      var statusSelect = el('select', { class: 'select', attrs: { 'aria-label': t('rules.filterStatus') } });
      [['all', 'common.all'], ['open', 'rules.open'], ['acked', 'rules.acked'], ['resolved', 'rules.resolved']].forEach(function (p) {
        statusSelect.appendChild(el('option', { attrs: { value: p[0] }, text: t(p[1]) }));
      });
      statusSelect.addEventListener('change', function () { state.status = statusSelect.value; renderList(); });

      var sevSelect = el('select', { class: 'select', attrs: { 'aria-label': t('common.severity') } });
      [['all', 'common.all'], ['critical', 'severity.critical'], ['warning', 'severity.warning'], ['info', 'severity.info']].forEach(function (p) {
        sevSelect.appendChild(el('option', { attrs: { value: p[0] }, text: t(p[1]) }));
      });
      sevSelect.addEventListener('change', function () { state.severity = sevSelect.value; renderList(); });

      var runBtn = el('button', { class: 'btn btn-primary', on: { click: onRun } }, icon('play', 18), el('span', { text: t('rules.runNow') }));
      var lastRunEl = el('span', { class: 'rules-status', text: t('rules.lastRun') + ': ' + t('common.none') });
      var intervalEl = el('span', { class: 'pill' });

      view.appendChild(el('div', { class: 'row toolbar' }, statusSelect, sevSelect, runBtn));
      view.appendChild(el('div', { class: 'row meta-row' }, lastRunEl, intervalEl));

      var listWrap = el('div', { class: 'recs-list' });
      view.appendChild(listWrap);

      function actor() {
        var l = lock();
        return (l && l.currentRole && l.currentRole()) ? l.currentRole() : 'local';
      }

      function filtered() {
        return state.recs.filter(function (r) {
          if (state.status !== 'all' && r.status !== state.status) { return false; }
          if (state.severity !== 'all' && r.severity !== state.severity) { return false; }
          return true;
        });
      }

      function pushHistory(rec, entry) {
        if (!Array.isArray(rec.history)) { rec.history = []; }
        rec.history.push(entry);
        if (rec.history.length > 50) { rec.history = rec.history.slice(rec.history.length - 50); }
      }

      function onAcknowledge(rec) {
        var now = new Date().toISOString();
        var copy = {};
        for (var k in rec) { copy[k] = rec[k]; }
        copy.status = 'acked';
        copy.ackedAt = now;
        copy.ackedBy = actor();
        pushHistory(copy, { action: 'acked', at: now, by: copy.ackedBy });
        return repos.recommendations.save(copy, now).then(function () { loadData(); });
      }

      function onResolve(rec) {
        var textarea = el('textarea', { class: 'input', attrs: { rows: '3', placeholder: t('rules.resolveNotePlaceholder') } });
        var body = el('div', { class: 'stack' }, textarea);
        ui().dialog({
          titleKey: 'rules.resolve',
          bodyNode: body,
          actions: [
            { labelKey: 'common.cancel', kind: 'ghost', onClick: function () {} },
            {
              labelKey: 'common.confirm', kind: 'primary', onClick: function () {
                var now = new Date().toISOString();
                var copy = {};
                for (var k2 in rec) { copy[k2] = rec[k2]; }
                copy.status = 'resolved';
                copy.resolvedAt = now;
                copy.resolvedBy = actor();
                copy.resolveNote = textarea.value || undefined;
                pushHistory(copy, { action: 'resolved', at: now, by: copy.resolvedBy, note: copy.resolveNote });
                return repos.recommendations.save(copy, now).then(function () { loadData(); });
              }
            }
          ]
        });
      }

      function renderList() {
        listWrap.textContent = '';
        var list = filtered();
        if (list.length === 0) {
          listWrap.appendChild(el('p', { class: 'empty-state', text: t('rules.noRecs') }));
          return;
        }
        list.forEach(function (rec) {
          listWrap.appendChild(buildCard(rec));
        });
      }

      function entityHref(rec) {
        var store = rec.entityStore;
        var enc = encodeURIComponent;
        if (store === 'monitoringPoints') { return '#/corrosion/mp/' + enc(rec.entityId); }
        if (store === 'apmAssets') { return '#/apm/' + enc(rec.entityId); }
        if (store === 'psvs') { return '#/psv/' + enc(rec.entityId); }
        if (store === 'coupons') {
          var c = findBy(state.entities.coupons, rec.entityId);
          return '#/corrosion/mp/' + enc(c ? c.mpId : rec.entityId);
        }
        if (store === 'lineAssets') {
          var la = findBy(state.entities.lineAssets, rec.entityId);
          return '#/pipelines/' + enc(la ? la.systemId : rec.entityId);
        }
        return '#/dashboard';
      }

      function buildCard(rec) {
        var href = entityHref(rec);
        var entityLabel = rec.entityLabel || labelOf(rec.entityStore, rec.entityId, state.entities);

        var card = el('article', { class: 'card rec-card' });
        var head = el('div', { class: 'row rec-card-head' },
          ui().severityBadge(rec.severity),
          el('strong', { text: t('rules.name.' + rec.ruleId) }),
          el('span', { class: 'pill', text: t('rules.' + rec.status) }));
        card.appendChild(head);

        card.appendChild(el('p', { class: 'rec-card-msg', text: t(rec.messageKey || 'rules.msg.' + rec.ruleId, rec.params || {}) }));

        var meta = el('div', { class: 'rec-card-meta' },
          el('span', { text: t('rules.entity') + ': ' },
            el('a', { class: 'rec-entity-link', attrs: { href: href }, text: entityLabel }),
            ' · '),
          el('span', { text: t('rules.lastTriggered') + ': ' + fmtDate(rec.lastTriggeredAt) + ' · ' }),
          el('span', { text: t('rules.triggerCount') + ': ' + fmtNum(rec.triggerCount || 0, 0) }));
        card.appendChild(meta);

        var actions = el('div', { class: 'row rec-card-actions' });
        if (rec.status === 'open') {
          actions.appendChild(el('button', { class: 'btn', on: { click: function () { onAcknowledge(rec); } } }, icon('check', 18), el('span', { text: t('rules.acknowledge') })));
        }
        if (rec.status === 'open' || rec.status === 'acked') {
          actions.appendChild(el('button', { class: 'btn', on: { click: function () { onResolve(rec); } } }, icon('check', 18), el('span', { text: t('rules.resolve') })));
        }
        card.appendChild(actions);

        // Expandable history.
        var histToggle = el('button', { class: 'btn btn-ghost', attrs: { 'aria-expanded': 'false' }, text: t('rules.history') });
        var histPanel = el('div', { class: 'rec-history', attrs: { hidden: '' } });
        histToggle.addEventListener('click', function () {
          var open = histPanel.hidden !== true;
          histPanel.hidden = !histPanel.hidden;
          histToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
        });
        card.appendChild(el('div', { class: 'stack' }, histToggle, histPanel));

        var histRows = (rec.history || []).slice().reverse();
        if (histRows.length === 0) {
          histPanel.appendChild(el('p', { class: 'field-hint', text: t('common.empty') }));
        } else {
          var tbl = el('table', { class: 'data' });
          tbl.appendChild(el('caption', { text: t('rules.history') }));
          var thead = el('thead', null, el('tr', null,
            el('th', { attrs: { scope: 'col' }, text: t('common.actions') }),
            el('th', { attrs: { scope: 'col' }, text: t('rules.actor') }),
            el('th', { attrs: { scope: 'col' }, text: t('common.date') })));
          var tbody = el('tbody');
          histRows.forEach(function (h) {
            tbody.appendChild(el('tr', null,
              el('td', { text: t('rules.histActions.' + h.action) }),
              el('td', { text: h.by || '—' }),
              el('td', { text: fmtDate(h.at) })));
          });
          tbl.appendChild(thead);
          tbl.appendChild(tbody);
          histPanel.appendChild(el('div', { class: 'table-wrap' }, tbl));
        }

        return card;
      }

      function loadData() {
        return Promise.all([
          repos.recommendations.list(),
          repos.monitoringPoints.list(),
          repos.apmAssets.list(),
          repos.psvs.list(),
          repos.coupons.list(),
          repos.lineAssets.list()
        ]).then(function (data) {
          state.recs = data[0];
          state.entities = {
            monitoringPoints: data[1],
            apmAssets: data[2],
            psvs: data[3],
            coupons: data[4],
            lineAssets: data[5]
          };
          renderList();
          loadMeta();
        });
      }

      function loadMeta() {
        var keys = ['lastRulesRunISO', 'rulesIntervalSec', 'residualBandPct', 'availabilityThresholdPct', 'stuckSensorCount', 'zScoreThreshold'];
        return Promise.all(keys.map(function (k) { return repos.meta.get(k).catch(function () { return undefined; }); })).then(function (vals) {
          lastRunEl.textContent = t('rules.lastRun') + ': ' + (vals[0] ? fmtDate(vals[0]) : t('common.none'));
          var interval = vals[1] !== undefined && vals[1] !== null ? vals[1] : 60;
          intervalEl.textContent = t('rules.sweepInterval') + ': ' + interval + ' s';
          state.settings = {
            residualBandPct: vals[2] !== undefined && vals[2] !== null ? vals[2] : 20,
            availabilityThresholdPct: vals[3] !== undefined && vals[3] !== null ? vals[3] : 90,
            stuckSensorCount: vals[4] !== undefined && vals[4] !== null ? vals[4] : 10,
            zScoreThreshold: vals[5] !== undefined && vals[5] !== null ? vals[5] : 3
          };
        });
      }

      function onRun() {
        var eng = engine();
        if (!eng || typeof eng.sweep !== 'function') { return; }
        var settings = state.settings || { residualBandPct: 20, availabilityThresholdPct: 90, stuckSensorCount: 10, zScoreThreshold: 3 };
        return eng.sweep(repos, settings, actor()).then(function (summary) {
          summary = summary || {};
          if (summary.criticals > 0) { ui().toast('rules.newCriticalToast', { severity: 'critical' }); }
          return loadData();
        }).catch(function (err) {
          ui().toast(t('common.error') + ': ' + (err && err.message ? err.message : err), { severity: 'critical' });
        });
      }

      // Re-render on recommendation changes while the view is still mounted.
      var off = null;
      if (bus && typeof bus.on === 'function') {
        off = bus.on('data:changed:recommendations', function () {
          if (container.isConnected) { loadData(); }
        });
      }

      container.appendChild(view);
      return loadData();
    }
  };
});
