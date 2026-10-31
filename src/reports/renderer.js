/* IntegrityWatch Field — declarative report renderer
   Pure DOM renderer for root.IW.reports.model section shapes. No data access,
   no calculations, no fetching, no dependencies. */
(function (root, factory) {
  'use strict';
  var api = factory(root);
  root.IW = root.IW || {};
  root.IW.reports = root.IW.reports || {};
  root.IW.reports.renderer = api;
  if (typeof module === 'object' && module.exports) { module.exports = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  var warnedTypes = {};

  function i18nApi() { return root.IW && root.IW.i18n; }

  function fmtNum(v, dec) {
    if (v === null || v === undefined || (typeof v === 'number' && isNaN(v))) { return '—'; }
    var api = i18nApi();
    if (api && typeof api.formatNumber === 'function') {
      return api.formatNumber(v, { maximumFractionDigits: dec === undefined ? 2 : dec });
    }
    return (dec === undefined) ? String(v) : Number(v).toFixed(dec);
  }

  function fmtDate(iso) {
    if (!iso) { return '—'; }
    var api = i18nApi();
    if (api && typeof api.formatDate === 'function') {
      return api.formatDate(iso, { dateStyle: 'medium' });
    }
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

  function statusClass(status) {
    if (!status) { return ''; }
    var s = String(status);
    return s.indexOf('is-') === 0 ? s : 'is-' + s;
  }

  function fmtValue(v) {
    if (typeof v === 'number') { return fmtNum(v); }
    if (v === null || v === undefined) { return '—'; }
    return String(v);
  }

  function cellText(v) {
    if (v === null || v === undefined) { return ''; }
    if (typeof v === 'number') { return fmtNum(v); }
    return String(v);
  }

  function warnUnknown(type) {
    if (warnedTypes[type]) { return; }
    warnedTypes[type] = true;
    if (typeof console !== 'undefined' && typeof console.warn === 'function') {
      console.warn('IW reports renderer: unknown section type "' + type + '"');
    }
  }

  function renderCover(s, t) {
    var header = el('header', { class: 'report-cover' });
    header.appendChild(el('h1', { text: t(s.titleKey) }));
    if (s.subtitle !== undefined && s.subtitle !== null) {
      header.appendChild(el('p', { class: 'report-cover-subtitle', text: String(s.subtitle) }));
    } else if (s.subtitleKey) {
      header.appendChild(el('p', { class: 'report-cover-subtitle', text: t(s.subtitleKey) }));
    }
    var meta = s.meta || {};
    if (meta.period) {
      header.appendChild(el('p', {
        class: 'report-cover-period',
        text: t('reports.period') + ': ' + fmtDate(meta.period.fromISO) + ' — ' + fmtDate(meta.period.toISO)
      }));
    }
    if (meta.generatedAtISO) {
      header.appendChild(el('p', {
        class: 'report-cover-generated',
        text: t('reports.generatedAt') + ': ' + fmtDate(meta.generatedAtISO)
      }));
    }
    return header;
  }

  function renderKpi(it, t) {
    var status = statusClass(it.status);
    var block = el('div', { class: 'kpi report-kpi' + (status ? ' ' + status : '') });
    block.appendChild(el('span', { class: 'kpi__label', text: t(it.labelKey) }));
    var valueText = fmtValue(it.value);
    if (it.unit) { valueText += ' ' + t(it.unit); }
    block.appendChild(el('span', { class: 'kpi__value num', text: valueText }));
    return block;
  }

  function renderKpiRow(s, t) {
    var grid = el('div', { class: 'grid-bento report-kpis' });
    (s.items || []).forEach(function (it) { grid.appendChild(renderKpi(it, t)); });
    return section(t, s.titleKey, [grid]);
  }

  function isKvTable(s) {
    var cols = s.columns || [];
    if (cols.length === 0) { return true; }
    return cols.every(function (c) { return !c.labelKey; });
  }

  function kvLabelKey(row) {
    if (row.label !== undefined && row.label !== null) { return row.label; }
    return row.key;
  }

  function kvValueText(row, t) {
    var v = row.value;
    var text;
    if (typeof v === 'number') { text = fmtNum(v); }
    else if (v === null || v === undefined) { text = '—'; }
    else { text = String(v); }
    if (row.unit) { text += ' ' + t(row.unit); }
    return text;
  }

  function renderKvTable(s, t) {
    var tbl = el('table', { class: 'data kv report-kv' });
    var tbody = el('tbody');
    (s.rows || []).forEach(function (row) {
      var tr = el('tr');
      tr.appendChild(el('th', { attrs: { scope: 'row' }, text: t(kvLabelKey(row)) }));
      tr.appendChild(el('td', { text: kvValueText(row, t) }));
      tbody.appendChild(tr);
    });
    tbl.appendChild(tbody);
    return tbl;
  }

  function renderTable(s, t) {
    if (isKvTable(s)) { return section(t, s.titleKey, [renderKvTable(s, t)]); }
    var cols = s.columns || [];
    var wrap = el('div', { class: 'table-wrap report-table' });
    var tbl = el('table', { class: 'data' });
    var thead = el('thead');
    var htr = el('tr');
    cols.forEach(function (c) {
      var th = el('th', { attrs: { scope: 'col' }, text: t(c.labelKey) });
      if (c.align) { th.className = 'num'; }
      htr.appendChild(th);
    });
    thead.appendChild(htr);
    tbl.appendChild(thead);
    var tbody = el('tbody');
    var rows = s.rows || [];
    if (rows.length === 0) {
      tbody.appendChild(el('tr', null, el('td', {
        class: 'empty-state',
        attrs: { colspan: String(cols.length || 1) },
        text: t(s.emptyKey || 'reports.noData')
      })));
    } else {
      rows.forEach(function (row) {
        var tr = el('tr');
        cols.forEach(function (c) {
          var td = el('td', { text: cellText(row[c.key]) });
          if (c.align) { td.className = 'num'; }
          tr.appendChild(td);
        });
        tbody.appendChild(tr);
      });
    }
    tbl.appendChild(tbody);
    if (s.noteKey) {
      var tfoot = el('tfoot');
      tfoot.appendChild(el('tr', null, el('td', {
        class: 'report-note',
        attrs: { colspan: String(cols.length || 1) },
        text: t(s.noteKey)
      })));
      tbl.appendChild(tfoot);
    }
    wrap.appendChild(tbl);
    return section(t, s.titleKey, [wrap]);
  }

  function renderList(s, t) {
    var ul = el('ul', { class: 'report-list' });
    (s.items || []).forEach(function (it) {
      var status = statusClass(it.status);
      var text = it.textKey ? t(it.textKey) : (it.text !== undefined && it.text !== null ? String(it.text) : '');
      ul.appendChild(el('li', { class: status || null, text: text }));
    });
    return section(t, s.titleKey, [ul]);
  }

  function renderText(s, t) {
    var body = s.bodyKey ? t(s.bodyKey) : (s.body !== undefined && s.body !== null ? String(s.body) : '');
    var paras = [el('p', { class: 'report-text', text: body })];
    if (s.noteKey || s.note) {
      var noteText = s.noteKey ? t(s.noteKey) : (s.note !== undefined && s.note !== null ? String(s.note) : '');
      paras.push(el('p', { class: s.noteClass || 'report-text-note', text: noteText }));
    }
    return section(t, s.titleKey, paras);
  }

  function chartOptions(s, t) {
    var opts = {};
    if (s.data !== undefined && s.data !== null) {
      if (Array.isArray(s.data)) { opts.points = s.data; }
      else if (typeof s.data === 'object') {
        for (var k in s.data) {
          if (Object.prototype.hasOwnProperty.call(s.data, k)) { opts[k] = s.data[k]; }
        }
      }
    }
    if (Array.isArray(s.bands) && s.bands.length) { opts.bands = s.bands; }
    if (s.axis) {
      if (s.axis.y) { opts.yLabel = t(s.axis.y); }
      if (s.axis.x) { opts.xLabel = t(s.axis.x); }
    }
    if (s.titleKey) { opts.ariaLabel = t(s.titleKey); }
    return opts;
  }

  function renderChart(s, t) {
    var fig = el('figure', { class: 'report-chart-wrap' });
    var charts = root.IW && root.IW.reports ? root.IW.reports.charts : null;
    if (charts && s.kind && typeof charts[s.kind] === 'function') {
      fig.appendChild(charts[s.kind](chartOptions(s, t)));
    } else {
      warnUnknown('chart:' + (s.kind || 'undefined'));
    }
    if (s.titleKey) {
      fig.appendChild(el('figcaption', { text: t(s.titleKey) }));
    }
    return section(t, s.titleKey, [fig]);
  }

  function renderStandards(s, t) {
    var items = s.items || [];
    if (items.length === 0) {
      return section(t, s.titleKey, [el('p', { class: 'empty-state', text: t('reports.noData') })]);
    }
    var hasTitle = items.some(function (it) {
      return it && it.title !== undefined && it.title !== null && it.title !== '';
    });
    var wrap = el('div', { class: 'table-wrap report-table' });
    var tbl = el('table', { class: 'data' });
    tbl.appendChild(el('caption', { text: t(s.titleKey) }));
    var thead = el('thead');
    var htr = el('tr');
    htr.appendChild(el('th', { attrs: { scope: 'col' }, text: t('glossary.reference') }));
    if (hasTitle) {
      htr.appendChild(el('th', { attrs: { scope: 'col' }, text: t('reports.title') }));
    }
    htr.appendChild(el('th', { attrs: { scope: 'col' }, text: t('admin.version') }));
    thead.appendChild(htr);
    tbl.appendChild(thead);
    var tbody = el('tbody');
    items.forEach(function (it) {
      it = it || {};
      var code = it.code || it.id;
      var title = it.title || '—';
      var edition = it.edition || '—';
      var tr = el('tr');
      tr.appendChild(el('td', { text: code !== undefined && code !== null ? String(code) : '—' }));
      if (hasTitle) {
        tr.appendChild(el('td', { text: String(title) }));
      }
      tr.appendChild(el('td', { text: String(edition) }));
      tbody.appendChild(tr);
    });
    tbl.appendChild(tbody);
    wrap.appendChild(tbl);
    return section(t, s.titleKey, [wrap]);
  }

  function renderCouponCards(s, t) {
    var items = s.items || [];
    if (items.length === 0) {
      return section(t, s.titleKey, [el('p', { class: 'empty-state', text: t('reports.noData') })]);
    }
    var list = el('div', { class: 'report-coupons' });
    items.forEach(function (it) {
      it = it || {};
      var card = el('div', { class: 'report-coupon' });
      card.appendChild(el('h3', { text: (it.label || '') + ' · ' + t(it.roleKey) }));
      var formula = el('p', { class: 'report-formula num' });
      formula.textContent = 'mpy = 534 · ΔW / (ρ · A · t)';
      card.appendChild(formula);
      if (it.hasResult) {
        var subst = el('p', { class: 'report-substitution num' });
        subst.textContent = '534 · ' + fmtNum(it.deltaW, 1) + ' / (' + fmtNum(it.density, 2) + ' · ' + fmtNum(it.areaIn2, 2) + ' · ' + fmtNum(it.hours, 0) + ') = ' + fmtNum(it.mpy, 3) + ' ' + t('units.mpy');
        card.appendChild(subst);
        var level = it.level || 'low';
        card.appendChild(el('p', null, el('span', { class: 'badge badge-' + level, text: t('severity.' + level) })));
      } else {
        card.appendChild(el('p', { class: 'empty-state', text: t('reports.noData') }));
      }
      list.appendChild(card);
    });
    return section(t, s.titleKey, [list]);
  }

  function renderDisclaimer(s, t) {
    var div = el('div', { class: 'report-disclaimer', attrs: { role: 'note' } });
    div.appendChild(el('strong', { text: t(s.labelKey) }));
    if (s.textKey) {
      div.appendChild(document.createTextNode(' ' + t(s.textKey)));
    }
    return div;
  }

  function render(model, t) {
    t = t || function (k) { return k; };
    model = model || {};
    var doc = el('div', { class: 'print-root report report-' + (model.id || '') });

    (model.sections || []).forEach(function (s) {
      if (!s || !s.type) { return; }
      var rendered;
      switch (s.type) {
        case 'cover': rendered = renderCover(s, t); break;
        case 'kpiRow': rendered = renderKpiRow(s, t); break;
        case 'table': rendered = renderTable(s, t); break;
        case 'list': rendered = renderList(s, t); break;
        case 'text': rendered = renderText(s, t); break;
        case 'chart': rendered = renderChart(s, t); break;
        case 'standards': rendered = renderStandards(s, t); break;
        case 'couponCards': rendered = renderCouponCards(s, t); break;
        case 'disclaimer': rendered = renderDisclaimer(s, t); break;
        default: warnUnknown(s.type); rendered = null;
      }
      if (rendered) { doc.appendChild(rendered); }
    });

    if (model.disclaimer) { doc.appendChild(renderDisclaimer(model.disclaimer, t)); }

    if (model.meta && model.meta.footer) {
      var footer = model.meta.footer;
      doc.appendChild(el('footer', {
        class: 'report-footer',
        text: t(footer.textKey) + ' · ' + t(footer.generatedKey) + ' ' + fmtDate(model.meta.generatedAtISO)
      }));
    }

    return doc;
  }

  return { render: render };
});
