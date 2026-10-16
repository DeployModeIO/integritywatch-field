/* IntegrityWatch Field — dossier report
   Monitoring point dossier (print-first A4) with ASTM G4/G1, SP0775, MR0175, DWM. */
(function (root, factory) {
  'use strict';
  var api = factory(root);
  root.IW = root.IW || {};
  root.IW.reports = root.IW.reports || {};
  root.IW.reports.dossier = api;
  if (typeof module === 'object' && module.exports) { module.exports = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  function corrosion() { return root.IW && root.IW.calc ? root.IW.calc.corrosion : null; }
  function i18nApi() { return root.IW && root.IW.i18n; }

  function fmtNum(v, dec) {
    if (v === null || v === undefined || (typeof v === 'number' && isNaN(v))) { return '—'; }
    var api = i18nApi();
    if (api && typeof api.formatNumber === 'function') { return api.formatNumber(v, { maximumFractionDigits: dec === undefined ? 2 : dec }); }
    return (dec === undefined) ? String(v) : Number(v).toFixed(dec);
  }

  function fmtDate(iso) {
    if (!iso) { return '—'; }
    var api = i18nApi();
    if (api && typeof api.formatDate === 'function') { return api.formatDate(iso, { dateStyle: 'medium' }); }
    return String(iso);
  }

  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      if (attrs.class) { node.className = attrs.class; }
      if (attrs.text !== undefined && attrs.text !== null) { node.textContent = attrs.text; }
      if (attrs.attrs) {
        for (var k in attrs.attrs) {
          if (Object.prototype.hasOwnProperty.call(attrs.attrs, k) && attrs.attrs[k] !== null && attrs.attrs[k] !== undefined) {
            node.setAttribute(k, attrs.attrs[k]);
          }
        }
      }
    }
    for (var i = 2; i < arguments.length; i++) { append(node, arguments[i]); }
    return node;
  }

  function append(node, children) {
    var arr = Array.isArray(children) ? children : [children];
    for (var i = 0; i < arr.length; i++) {
      var c = arr[i];
      if (c === null || c === undefined || c === false) { continue; }
      if (typeof c === 'string' || typeof c === 'number') { node.appendChild(document.createTextNode(String(c))); }
      else if (c instanceof Node) { node.appendChild(c); }
      else if (Array.isArray(c)) { append(node, c); }
    }
  }

  function section(t, titleKey, bodyNodes) {
    var sec = el('section', { class: 'report-section' });
    sec.appendChild(el('h2', { text: t(titleKey) }));
    append(sec, bodyNodes);
    return sec;
  }

  function table(t, opts) {
    var wrap = el('div', { class: 'table-wrap report-table' });
    var tbl = el('table', { class: 'data' });
    if (opts.captionKey) { tbl.appendChild(el('caption', { text: t(opts.captionKey) })); }
    var thead = el('thead');
    var htr = el('tr');
    (opts.columns || []).forEach(function (c) {
      var th = el('th', { attrs: { scope: 'col' }, text: t(c.labelKey) });
      if (c.align) { th.className = 'num'; }
      htr.appendChild(th);
    });
    thead.appendChild(htr);
    tbl.appendChild(thead);
    var tbody = el('tbody');
    var rows = opts.rows || [];
    if (rows.length === 0) {
      tbody.appendChild(el('tr', null, el('td', { class: 'empty-state', attrs: { colspan: String((opts.columns || []).length || 1) }, text: t(opts.emptyKey || 'reports.noData') })));
    } else {
      rows.forEach(function (row) {
        var tr = el('tr');
        (opts.columns || []).forEach(function (c) {
          var td = el('td');
          if (c.render) { append(td, c.render(row)); }
          else {
            var v = row[c.key];
            td.textContent = (v === undefined || v === null) ? '' : String(v);
          }
          if (c.align) { td.className = 'num'; }
          tr.appendChild(td);
        });
        tbody.appendChild(tr);
      });
    }
    tbl.appendChild(tbody);
    wrap.appendChild(tbl);
    return wrap;
  }

  function kvTable(t, pairs) {
    var tbl = el('table', { class: 'data kv report-kv' });
    var tbody = el('tbody');
    (pairs || []).forEach(function (p) {
      var tr = el('tr');
      tr.appendChild(el('th', { attrs: { scope: 'row' }, text: t(p[0]) }));
      var td = el('td');
      append(td, p[1]);
      tr.appendChild(td);
      tbody.appendChild(tr);
    });
    tbl.appendChild(tbody);
    return tbl;
  }

  function severityBadge(t, level) {
    return el('span', { class: 'badge badge-' + (level || 'low'), text: t('severity.' + (level || 'low')) });
  }

  function statusLabel(t, status) {
    if (status === 'due') { return t('common.due'); }
    if (status === 'overdue') { return t('common.overdue'); }
    return t('common.ok');
  }

  function materialName(id) {
    var cat = root.IW && root.IW.data && root.IW.data.materials;
    if (cat && typeof cat.byId === 'function') {
      var m = cat.byId(id);
      return m ? m.name : (id || '—');
    }
    return id || '—';
  }

  function buildPointInfo(t, mp) {
    var proc = mp.process || {};
    return kvTable(t, [
      ['corrosion.pointCode', mp.code || mp.id || '—'],
      ['common.sector', t('common.' + (mp.sector || 'upstream'))],
      ['corrosion.line', mp.line || '—'],
      ['corrosion.material', materialName(mp.material)],
      ['corrosion.sensorType', t('corrosion.sensorTypes.' + (mp.sensorType || 'visual'))],
      ['corrosion.h2s', proc.h2sPpm == null ? '—' : fmtNum(proc.h2sPpm, 1) + ' ' + t('units.ppm')],
      ['corrosion.co2', proc.co2Ppm == null ? '—' : fmtNum(proc.co2Ppm, 1) + ' ' + t('units.ppm')],
      ['corrosion.totalPressure', proc.totalPressureKpa == null ? '—' : fmtNum(proc.totalPressureKpa, 1) + ' ' + t('units.kPa')],
      ['corrosion.temperature', proc.tempC == null ? '—' : fmtNum(proc.tempC, 1) + ' ' + t('units.degC')],
      ['corrosion.inhibitorTarget', proc.inhibitorTargetPpm == null ? '—' : fmtNum(proc.inhibitorTargetPpm, 1) + ' ' + t('units.ppm')],
      ['corrosion.inhibitorResidual', proc.inhibitorResidualPpm == null ? '—' : fmtNum(proc.inhibitorResidualPpm, 1) + ' ' + t('units.ppm')]
    ]);
  }

  function buildReadingsHistory(t, readings) {
    var sorted = (readings || []).slice().sort(function (a, b) { return (a.date < b.date) ? -1 : (a.date > b.date ? 1 : 0); });
    var corr = corrosion();
    return table(t, {
      captionKey: 'corrosion.readings',
      columns: [
        { key: 'date', labelKey: 'common.date' },
        { key: 'cr', labelKey: 'reports.cr', align: true },
        { key: 'level', labelKey: 'corrosion.classification', render: function (row) { return severityBadge(t, row.level); } },
        { key: 'source', labelKey: 'reports.source' }
      ],
      rows: sorted.map(function (r) {
        return {
          date: fmtDate(r.date),
          cr: fmtNum(r.crMpy, 3),
          level: corr ? corr.classifySp0775(r.crMpy) : 'low',
          source: r.source || '—'
        };
      })
    });
  }

  // ASTM G4/G1 per coupon: formula + substitution + result.
  function buildCouponsCalc(t, coupons, density) {
    var corr = corrosion();
    var items = (coupons || []).map(function (c) {
      var deltaW = (typeof c.wiMg === 'number' && typeof c.wfMg === 'number') ? c.wiMg - c.wfMg : null;
      var dens = (typeof c.densityGcm3 === 'number') ? c.densityGcm3 : density;
      var hours = (typeof c.exposedHours === 'number') ? c.exposedHours : (typeof c.days === 'number' ? c.days * 24 : null);
      var result = null;
      if (deltaW !== null && dens && c.areaIn2 && hours) {
        try {
          result = corr.crFromWeightLoss({ deltaWmg: deltaW, densityGcm3: dens, areaIn2: c.areaIn2, hours: hours });
        } catch (e) { result = null; }
      }
      return { c: c, deltaW: deltaW, dens: dens, hours: hours, result: result };
    });

    if (items.length === 0) {
      return el('p', { class: 'empty-state', text: t('reports.noData') });
    }

    var list = el('div', { class: 'report-coupons' });
    items.forEach(function (it) {
      var c = it.c;
      var card = el('div', { class: 'report-coupon' });
      card.appendChild(el('h3', { text: (c.pairId || c.id || '') + ' · ' + t('corrosion.' + (c.role === 'inhibited' ? 'inhibited' : 'blank')) }));
      var formula = el('p', { class: 'report-formula num' });
      formula.textContent = 'mpy = 534 · ΔW / (ρ · A · t)';
      card.appendChild(formula);
      if (it.result) {
        var subst = el('p', { class: 'report-substitution num' });
        subst.textContent = '534 · ' + fmtNum(it.deltaW, 1) + ' / (' + fmtNum(it.dens, 2) + ' · ' + fmtNum(c.areaIn2, 2) + ' · ' + fmtNum(it.hours, 0) + ') = ' + fmtNum(it.result.mpy, 3) + ' ' + t('units.mpy');
        card.appendChild(subst);
        var level = corr.classifySp0775(it.result.mpy);
        card.appendChild(el('p', null, severityBadge(t, level)));
      } else {
        card.appendChild(el('p', { class: 'empty-state', text: t('reports.noData') }));
      }
      list.appendChild(card);
    });
    return list;
  }

  function buildScreening(t, mp) {
    var corr = corrosion();
    var proc = mp.process || {};
    var rows = [];
    var hasSour = typeof proc.h2sPpm === 'number' && proc.h2sPpm > 0 && typeof proc.totalPressureKpa === 'number' && proc.totalPressureKpa > 0;
    var ph2sKpa = null;
    if (hasSour && corr) {
      var pp = corr.partialPressureH2S({ totalPressureKpa: proc.totalPressureKpa, h2sPpm: proc.h2sPpm });
      ph2sKpa = pp.kpa;
      rows.push({
        title: t('corrosion.sourScreening'),
        value: fmtNum(ph2sKpa, 3) + ' ' + t('units.kPa') + ' — ' + t('corrosion.mr0175.' + corr.classifyMr0175(ph2sKpa))
      });
    }

    var hasDwm = typeof proc.co2Ppm === 'number' && proc.co2Ppm > 0 && typeof proc.totalPressureKpa === 'number' && proc.totalPressureKpa > 0;
    if (hasDwm && corr) {
      var pCo2Kpa = proc.totalPressureKpa * (proc.co2Ppm / 1e6);
      var pCo2Bar = pCo2Kpa / 100;
      var dwm = corr.deWaardMilliams({ tempC: proc.tempC || 25, pCo2Bar: pCo2Bar });
      rows.push({
        title: t('corrosion.dwmTitle'),
        value: fmtNum(dwm.mpy, 2) + ' ' + t('units.mpy')
      });
    }

    if (rows.length === 0) {
      return el('p', { class: 'empty-state', text: t('reports.noData') });
    }
    return kvTable(t, rows.map(function (r) { return [r.title, r.value]; }));
  }

  // Associated PSVs: same assetId or systemId; otherwise all (documented criterion).
  function buildAssociatedPsvs(t, psvs, mp) {
    var linked = (psvs || []).filter(function (p) {
      return (mp.id && p.assetId === mp.id) || (mp.systemId && p.assetId === mp.systemId);
    });
    var chosen = linked.length > 0 ? linked : (psvs || []);
    var note = linked.length > 0 ? '' : t('reports.associationCriterion');
    var noteEl = note ? el('p', { class: 'report-note', text: note }) : null;
    var body = table(t, {
      captionKey: 'reports.associatedPsvs',
      columns: [
        { key: 'tag', labelKey: 'psv.tag' },
        { key: 'type', labelKey: 'psv.valveType' },
        { key: 'set', labelKey: 'psv.setPressure', align: true },
        { key: 'status', labelKey: 'common.status', render: function (row) { return el('span', { class: 'pill', text: statusLabel(t, row.status) }); } }
      ],
      rows: chosen.map(function (p) {
        return {
          tag: p.tag || p.id || '—',
          type: t('psv.types.' + (p.valveType || 'conventional')),
          set: fmtNum(p.setPressurePsig, 1) + ' ' + t('units.psig'),
          status: p.status || 'ok'
        };
      })
    });
    return el('div', null, noteEl, body);
  }

  function buildStandards(t) {
    var list = (root.IW && root.IW.data && root.IW.data.standards && root.IW.data.standards.standards) || [];
    var used = list.filter(function (s) { return !s.usedIn || s.usedIn.indexOf('corrosion') !== -1; });
    if (used.length === 0) { return el('p', { class: 'empty-state', text: t('reports.noData') }); }
    return table(t, {
      captionKey: 'reports.standardsApplied',
      columns: [
        { key: 'code', labelKey: 'glossary.reference' },
        { key: 'edition', labelKey: 'admin.version' }
      ],
      rows: used.map(function (s) { return { code: s.code || s.id, edition: s.edition || '—' }; })
    });
  }

  function build(opts) {
    opts = opts || {};
    if (typeof document === 'undefined') { return Promise.resolve(null); }
    var store = opts.repos || opts.store || {};
    var mpId = opts.mpId;
    var t = opts.t || function (k) { return k; };

    if (!mpId) {
      var empty = el('div', { class: 'print-root report' });
      empty.appendChild(el('p', { class: 'empty-state', text: t('reports.noData') }));
      return Promise.resolve(empty);
    }

    function list(repo) { return (store[repo] && typeof store[repo].list === 'function') ? store[repo].list() : Promise.resolve([]); }
    function get(repo, id) { return (store[repo] && typeof store[repo].get === 'function') ? store[repo].get(id) : Promise.resolve(null); }

    return Promise.all([
      get('monitoringPoints', mpId),
      list('readings'),
      list('coupons'),
      list('psvs')
    ]).then(function (data) {
      var mp = data[0];
      var readings = data[1].filter(function (r) { return r.mpId === mpId; });
      var coupons = data[2].filter(function (c) { return c.mpId === mpId; });
      var psvs = data[3];

      var doc = el('div', { class: 'print-root report report-dossier' });
      doc.appendChild(el('header', { class: 'report-cover' },
        el('h1', { text: t('reports.dossierTitle') }),
        el('p', { class: 'report-cover-subtitle', text: mp ? (mp.code || mp.id) : mpId }),
        el('p', { class: 'report-cover-generated', text: t('reports.generatedAt') + ': ' + fmtDate(new Date().toISOString()) })));

      if (!mp) {
        doc.appendChild(el('p', { class: 'empty-state', text: t('reports.noData') }));
        return doc;
      }

      var density = null;
      if (mp.material) {
        var cat = root.IW && root.IW.data && root.IW.data.materials;
        if (cat && typeof cat.byId === 'function') {
          var m = cat.byId(mp.material);
          if (m) { density = m.densityGcm3; }
        }
      }

      doc.appendChild(section(t, 'reports.pointInfo', [buildPointInfo(t, mp)]));
      doc.appendChild(section(t, 'corrosion.readings', [buildReadingsHistory(t, readings)]));
      doc.appendChild(section(t, 'reports.astmCalc', [buildCouponsCalc(t, coupons, density)]));
      doc.appendChild(section(t, 'reports.screening', [buildScreening(t, mp)]));
      doc.appendChild(section(t, 'reports.associatedPsvs', [buildAssociatedPsvs(t, psvs, mp)]));
      doc.appendChild(section(t, 'reports.standardsApplied', [buildStandards(t)]));

      var disclaimer = el('div', { class: 'report-disclaimer', attrs: { role: 'note' } },
        el('strong', { text: t('reports.disclaimer') }));
      doc.appendChild(disclaimer);

      doc.appendChild(el('footer', { class: 'report-footer', text: t('reports.pageFooter') + ' · ' + t('reports.generatedAt') + ' ' + fmtDate(new Date().toISOString()) }));
      return doc;
    });
  }

  return { build: build };
});
