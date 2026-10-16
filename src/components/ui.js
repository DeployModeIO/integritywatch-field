/* IntegrityWatch Field — ui
   DOM helpers: elements, tables, dialogs, toasts, forms, badges, tabs and pager. */
(function (root, factory) {
  'use strict';
  var api = factory(root);
  root.IW = root.IW || {};
  var prev = root.IW.ui || {};
  root.IW.ui = api;
  for (var key in prev) {
    if (Object.prototype.hasOwnProperty.call(prev, key) && api[key] === undefined) { api[key] = prev[key]; }
  }
  if (typeof module === 'object' && module.exports) { module.exports = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  function tt(key) {
    var i18n = root.IW.i18n;
    return (i18n && typeof i18n.t === 'function') ? i18n.t(key) : key;
  }

  function icons() {
    return root.IW.ui && root.IW.ui.icons;
  }

  function appendChildren(node, children) {
    var arr = Array.isArray(children) ? children : [children];
    for (var i = 0; i < arr.length; i++) {
      var c = arr[i];
      if (c === null || c === undefined || c === false) { continue; }
      if (typeof c === 'string' || typeof c === 'number') {
        node.appendChild(document.createTextNode(String(c)));
      } else if (c instanceof Node) {
        node.appendChild(c);
      } else if (Array.isArray(c)) {
        appendChildren(node, c);
      }
    }
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
      if (attrs.on) {
        for (var e in attrs.on) {
          if (Object.prototype.hasOwnProperty.call(attrs.on, e)) { node.addEventListener(e, attrs.on[e]); }
        }
      }
      if (attrs.dataset) {
        for (var d in attrs.dataset) {
          if (Object.prototype.hasOwnProperty.call(attrs.dataset, d)) { node.dataset[d] = attrs.dataset[d]; }
        }
      }
    }
    for (var i = 2; i < arguments.length; i++) { appendChildren(node, arguments[i]); }
    return node;
  }

  function txt(s) {
    return document.createTextNode(String(s));
  }

  function icon(name, sizePx) {
    var set = icons();
    if (set && typeof set.svgNode === 'function') {
      var n = set.svgNode(name, sizePx);
      if (n) { return n; }
    }
    return document.createTextNode('');
  }

  function table(opts) {
    var columns = opts.columns || [];
    var wrap = el('div', { class: 'table-wrap' });
    var tbl = el('table', { class: 'data' });
    if (opts.captionKey) {
      tbl.appendChild(el('caption', { text: tt(opts.captionKey) }));
    }
    var thead = el('thead');
    var htr = el('tr');
    columns.forEach(function (col) {
      var th = el('th', { attrs: { scope: 'col' }, text: tt(col.labelKey) });
      if (col.align) { th.className = 'num'; }
      htr.appendChild(th);
    });
    thead.appendChild(htr);
    tbl.appendChild(thead);
    var tbody = el('tbody');
    var rows = opts.rows || [];
    if (rows.length === 0) {
      var emptyRow = el('tr', null,
        el('td', { class: 'empty-state', attrs: { colspan: String(columns.length || 1) }, text: tt(opts.emptyKey || 'common.empty') }));
      tbody.appendChild(emptyRow);
    } else {
      rows.forEach(function (row) {
        var tr = el('tr');
        columns.forEach(function (col) {
          var td = el('td');
          if (col.render) {
            appendChildren(td, col.render(row[col.key], row));
          } else {
            var v = row[col.key];
            td.textContent = (v === undefined || v === null) ? '' : String(v);
          }
          tr.appendChild(td);
        });
        tbody.appendChild(tr);
      });
    }
    tbl.appendChild(tbody);
    wrap.appendChild(tbl);
    return wrap;
  }

  var _dialogSeq = 0;

  function dialog(opts) {
    var titleId = 'dlg-title-' + (++_dialogSeq);
    var overlay = el('div', { class: 'dialog', attrs: { role: 'dialog', 'aria-modal': 'true', tabindex: '-1', 'aria-labelledby': titleId } });

    var header = el('div', { class: 'dialog-header' },
      el('h2', { class: 'dialog-title', attrs: { id: titleId }, text: tt(opts.titleKey) }),
      el('button', { class: 'btn btn-ghost', attrs: { 'aria-label': tt('a11y.closeDialog') }, on: { click: function () { close(); } } }, icon('close', 20))
    );
    overlay.appendChild(header);

    var body = el('div', { class: 'dialog-body' });
    if (opts.bodyNode) { body.appendChild(opts.bodyNode); }
    overlay.appendChild(body);

    if (opts.actions && opts.actions.length) {
      var actionsWrap = el('div', { class: 'dialog-actions' });
      opts.actions.forEach(function (a) {
        var btn = el('button', {
          class: 'btn ' + (a.kind === 'primary' ? 'btn-primary' : a.kind === 'danger' ? 'btn-danger' : 'btn-ghost'),
          text: tt(a.labelKey),
          on: {
            click: function (ev) {
              var res = a.onClick ? a.onClick(ev) : undefined;
              if (res !== false) { close(); }
            }
          }
        });
        actionsWrap.appendChild(btn);
      });
      overlay.appendChild(actionsWrap);
    }

    document.body.appendChild(overlay);

    var previouslyFocused = document.activeElement;
    var closed = false;

    function focusables() {
      return overlay.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
    }

    function onKeyDown(e) {
      if (e.key === 'Escape') { e.preventDefault(); close(); return; }
      if (e.key === 'Tab') {
        var list = focusables();
        if (list.length === 0) { e.preventDefault(); overlay.focus(); return; }
        var first = list[0];
        var last = list[list.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    }

    function close() {
      if (closed) { return; }
      closed = true;
      document.removeEventListener('keydown', onKeyDown, true);
      if (overlay.parentNode) { overlay.parentNode.removeChild(overlay); }
      if (opts.onClose) { opts.onClose(); }
      if (previouslyFocused && typeof previouslyFocused.focus === 'function') { previouslyFocused.focus(); }
    }

    document.addEventListener('keydown', onKeyDown, true);
    var first = focusables()[0];
    if (first) { first.focus(); } else { overlay.focus(); }

    return { close: close, node: overlay };
  }

  function toast(message, opts) {
    opts = opts || {};
    var sev = opts.severity || 'info';
    var region = document.getElementById('toast-region');
    if (!region) {
      region = el('div', { class: 'toast-region', attrs: { id: 'toast-region' } });
      document.body.appendChild(region);
    }
    var isCritical = sev === 'critical' || sev === 'severe' || sev === 'high';
    var toastEl = el('div', {
      class: 'toast toast-' + sev,
      attrs: { role: 'status', 'aria-live': isCritical ? 'assertive' : 'polite' }
    });
    var iconName = sev === 'critical' || sev === 'severe' || sev === 'high' ? 'alert-critical' : sev === 'warning' ? 'alert-warning' : 'alert-info';
    toastEl.appendChild(icon(iconName, 20));
    toastEl.appendChild(el('span', { class: 'toast-text', text: tt(message) }));
    toastEl.appendChild(el('button', { class: 'btn btn-ghost', attrs: { 'aria-label': tt('common.close') }, on: { click: function () { removeToast(); } } }, icon('close', 16)));
    if (opts.action) {
      toastEl.appendChild(el('button', {
        class: 'btn btn-ghost',
        text: tt(opts.action.labelKey),
        on: { click: function () { if (opts.action.onClick) { opts.action.onClick(); } removeToast(); } }
      }));
    }
    region.appendChild(toastEl);

    var timer = null;
    function removeToast() {
      if (timer) { clearTimeout(timer); }
      if (toastEl.parentNode) { toastEl.parentNode.removeChild(toastEl); }
    }
    var ms = opts.timeoutMs !== undefined && opts.timeoutMs !== null ? opts.timeoutMs : (isCritical ? 8000 : 5000);
    if (ms > 0) { timer = setTimeout(removeToast, ms); }
    return { close: removeToast, node: toastEl };
  }

  function confirmDialog(opts) {
    return new Promise(function (resolve) {
      dialog({
        titleKey: opts.titleKey,
        bodyNode: el('p', { text: tt(opts.bodyKey) }),
        actions: [
          { labelKey: 'common.cancel', kind: 'ghost', onClick: function () { resolve(false); } },
          { labelKey: 'common.confirm', kind: opts.danger ? 'danger' : 'primary', onClick: function () { resolve(true); } }
        ],
        onClose: function () { resolve(false); }
      });
    });
  }

  function form(fields, values) {
    values = values || {};
    var node = el('form', { class: 'form', attrs: { novalidate: '' } });
    var state = {};

    function validateField(name) {
      var s = state[name];
      if (!s) { return true; }
      var f = s.field;
      var ctrl = s.control;
      var err = null;
      if (f.type === 'checkbox') {
        if (f.required && !ctrl.checked) { err = 'common.required'; }
      } else {
        var val = ctrl.value;
        var empty = (typeof val === 'string' && val.trim() === '');
        if (f.required && empty) { err = 'common.required'; }
        else if (!empty && f.type === 'number') {
          var n = Number(val);
          if (isNaN(n)) { err = 'common.error'; }
          else if (f.min !== undefined && f.min !== null && n < f.min) { err = 'common.min'; }
          else if (f.max !== undefined && f.max !== null && n > f.max) { err = 'common.max'; }
        }
      }
      if (err) {
        ctrl.setAttribute('aria-invalid', 'true');
        if (ctrl.id) { ctrl.setAttribute('aria-describedby', ctrl.id + '-error'); }
        s.errorNode.textContent = tt(err);
        s.errorNode.hidden = false;
        return false;
      }
      ctrl.removeAttribute('aria-invalid');
      ctrl.removeAttribute('aria-describedby');
      s.errorNode.textContent = '';
      s.errorNode.hidden = true;
      return true;
    }

    (fields || []).forEach(function (f) {
      var value = values[f.name] !== undefined && values[f.name] !== null ? values[f.name] : (f.value !== undefined && f.value !== null ? f.value : '');
      var fieldId = 'fld-' + f.name;
      var control;
      var fieldDiv = el('div', { class: 'field' });

      if (f.type === 'textarea') {
        control = el('textarea', { class: 'input', attrs: { id: fieldId, name: f.name } });
        control.value = String(value);
      } else if (f.type === 'select') {
        control = el('select', { class: 'select', attrs: { id: fieldId, name: f.name } });
        (f.options || []).forEach(function (o) {
          control.appendChild(el('option', { attrs: { value: o.value }, text: tt(o.labelKey) }));
        });
        control.value = String(value);
      } else if (f.type === 'checkbox') {
        control = el('input', { attrs: { id: fieldId, name: f.name, type: 'checkbox' } });
        control.checked = !!value;
        var label = el('label', { class: 'field-label', attrs: { for: fieldId } }, control, el('span', { text: tt(f.labelKey) }));
        fieldDiv.appendChild(label);
      } else {
        var inputType = f.type || 'text';
        control = el('input', { class: 'input', attrs: { id: fieldId, name: f.name, type: inputType } });
        if (f.required) { control.setAttribute('required', 'required'); }
        if (f.min !== undefined && f.min !== null) { control.setAttribute('min', String(f.min)); }
        if (f.max !== undefined && f.max !== null) { control.setAttribute('max', String(f.max)); }
        if (f.step !== undefined && f.step !== null) { control.setAttribute('step', String(f.step)); }
        control.value = String(value);
      }

      if (f.type !== 'checkbox') {
        fieldDiv.appendChild(el('label', { class: 'field-label', attrs: { for: fieldId }, text: tt(f.labelKey) }));
        fieldDiv.appendChild(control);
      }

      var errorNode = el('span', { class: 'field-error', attrs: { id: fieldId + '-error', role: 'alert' } });
      errorNode.hidden = true;
      fieldDiv.appendChild(errorNode);
      node.appendChild(fieldDiv);

      state[f.name] = { field: f, control: control, errorNode: errorNode, fieldDiv: fieldDiv };

      var evt = f.type === 'checkbox' ? 'change' : 'input';
      control.addEventListener(evt, function () { validateField(f.name); });
      control.addEventListener('blur', function () { validateField(f.name); });
    });

    function getValues() {
      var out = {};
      Object.keys(state).forEach(function (name) {
        var s = state[name];
        var f = s.field;
        if (f.type === 'checkbox') { out[name] = s.control.checked; }
        else if (f.type === 'number') { out[name] = s.control.value === '' ? null : Number(s.control.value); }
        else { out[name] = s.control.value; }
      });
      return out;
    }

    function validate() {
      var ok = true;
      Object.keys(state).forEach(function (name) { if (!validateField(name)) { ok = false; } });
      return ok;
    }

    return { node: node, getValues: getValues, validate: validate };
  }

  function keyValueTable(pairs) {
    var tbl = el('table', { class: 'data kv' });
    var tbody = el('tbody');
    (pairs || []).forEach(function (p) {
      var tr = el('tr');
      tr.appendChild(el('th', { attrs: { scope: 'row' }, text: tt(p[0]) }));
      var td = el('td');
      appendChildren(td, p[1]);
      tr.appendChild(td);
      tbody.appendChild(tr);
    });
    tbl.appendChild(tbody);
    return tbl;
  }

  function severityBadge(level) {
    var lv = level || 'low';
    // The shape channel is the icon SVG only. The `shape-<lv>` classes are a
    // swatch layer (see .shape in components.css) and must NOT be applied to
    // the badge itself: their background/border rules would repaint the whole
    // pill in the solid severity colour, hiding the label text.
    var badge = el('span', { class: 'badge badge-' + lv });
    badge.appendChild(icon('shape-' + lv, 16));
    badge.appendChild(el('span', { text: tt('severity.' + lv) }));
    return badge;
  }

  function tabs(items) {
    var wrap = el('div', { class: 'tabs' });
    var nav = el('div', { class: 'tabs-nav', attrs: { role: 'tablist', 'aria-orientation': 'horizontal' } });
    var panels = el('div', { class: 'tabs-panels' });
    var tabNodes = [];
    var panelNodes = [];
    var activeIdx = 0;

    (items || []).forEach(function (item, idx) {
      var tab = el('button', {
        class: 'tab',
        attrs: {
          role: 'tab',
          id: 'tab-' + item.id,
          'aria-controls': 'panel-' + item.id,
          'aria-selected': idx === 0 ? 'true' : 'false',
          tabindex: idx === 0 ? '0' : '-1'
        },
        text: tt(item.labelKey),
        on: { click: function () { select(idx); } }
      });
      nav.appendChild(tab);
      var panel = el('div', {
        class: 'tab-panel',
        attrs: { role: 'tabpanel', id: 'panel-' + item.id, 'aria-labelledby': 'tab-' + item.id }
      });
      if (idx !== 0) { panel.hidden = true; }
      if (item.render) { appendChildren(panel, item.render()); }
      panels.appendChild(panel);
      tabNodes.push(tab);
      panelNodes.push(panel);
    });

    function select(idx) {
      activeIdx = idx;
      tabNodes.forEach(function (t, i) {
        var active = i === idx;
        t.setAttribute('aria-selected', active ? 'true' : 'false');
        t.setAttribute('tabindex', active ? '0' : '-1');
        if (panelNodes[i]) { panelNodes[i].hidden = !active; }
      });
      if (tabNodes[idx]) { tabNodes[idx].focus(); }
    }

    function isRtl() {
      return !!(typeof document !== 'undefined' && document.documentElement && document.documentElement.dir === 'rtl');
    }

    nav.addEventListener('keydown', function (e) {
      if (tabNodes.length === 0) { return; }
      var rtl = isRtl();
      var delta = 0;
      var home = false;
      var end = false;
      if (e.key === 'ArrowRight') { delta = rtl ? -1 : 1; }
      else if (e.key === 'ArrowLeft') { delta = rtl ? 1 : -1; }
      else if (e.key === 'Home') { home = true; }
      else if (e.key === 'End') { end = true; }
      else { return; }

      e.preventDefault();
      var len = tabNodes.length;
      var nextIdx = home ? 0 : end ? len - 1 : (activeIdx + delta + len) % len;
      select(nextIdx);
    });

    wrap.appendChild(nav);
    wrap.appendChild(panels);
    return wrap;
  }

  function pager(opts) {
    opts = opts || {};
    var page = opts.page || 1;
    var pageCount = opts.pageCount || 1;
    var onChange = opts.onChange || function () {};
    var nav = el('nav', { class: 'pager' });
    var prev = el('button', { class: 'btn btn-ghost', text: tt('common.back'), on: { click: function () { if (page > 1) { onChange(page - 1); } } } });
    prev.disabled = page <= 1;
    var info = el('span', { class: 'pager-info', text: String(page) + ' / ' + String(pageCount) });
    var next = el('button', { class: 'btn btn-ghost', text: tt('common.next'), on: { click: function () { if (page < pageCount) { onChange(page + 1); } } } });
    next.disabled = page >= pageCount;
    nav.appendChild(prev);
    nav.appendChild(info);
    nav.appendChild(next);
    return nav;
  }

  // ---- SVG symbols (CSP-safe: built via DOM, no inline markup) ---------------

  var SVG_NS = 'http://www.w3.org/2000/svg';
  var DAY_MS = 86400000;

  function svgEl(tag, attrs, children) {
    var n = document.createElementNS(SVG_NS, tag);
    if (attrs) {
      for (var k in attrs) {
        if (Object.prototype.hasOwnProperty.call(attrs, k) && attrs[k] !== null && attrs[k] !== undefined) {
          n.setAttribute(k, String(attrs[k]));
        }
      }
    }
    if (children) {
      var arr = Array.isArray(children) ? children : [children];
      for (var i = 0; i < arr.length; i++) {
        var c = arr[i];
        if (c === null || c === undefined || c === false) { continue; }
        if (typeof c === 'string' || typeof c === 'number') { n.appendChild(document.createTextNode(String(c))); }
        else if (c instanceof Node) { n.appendChild(c); }
      }
    }
    return n;
  }

  function fmtNumI18n(v, d) {
    var i18n = root.IW && root.IW.i18n;
    if (i18n && typeof i18n.formatNumber === 'function') {
      try { return i18n.formatNumber(v, { maximumFractionDigits: d }); } catch (e) { /* fall through */ }
    }
    return String(Number(v.toFixed(d)));
  }

  function fmtDateI18n(iso) {
    var i18n = root.IW && root.IW.i18n;
    if (i18n && typeof i18n.formatDate === 'function') {
      try { return i18n.formatDate(iso, { day: '2-digit', month: 'short' }); } catch (e) { /* fall through */ }
    }
    return String(iso).slice(0, 10);
  }

  function classifySp0775(v) {
    var calc = root.IW && root.IW.calc && root.IW.calc.corrosion;
    if (calc && typeof calc.classifySp0775 === 'function') { return calc.classifySp0775(v); }
    if (v < 1) { return 'low'; }
    if (v < 5) { return 'moderate'; }
    if (v < 10) { return 'high'; }
    return 'severe';
  }

  // PI Vision "Trend": responsive SVG with grid, thresholds, range selector,
  // pointer/keyboard crosshair and severity tooltip.
  function trendChart(opts) {
    opts = opts || {};
    var width = opts.width || 960;
    var height = opts.height || 180;
    var thresholds = opts.thresholds || [{ v: 5, label: 'aceptable' }, { v: 10, label: 'severo' }];
    var titleKey = opts.titleKey || 'corrosion.trend';

    var allPoints = (opts.points || []).map(function (p) {
      var t = Date.parse(p.date);
      return {
        date: p.date,
        time: isNaN(t) ? 0 : t,
        crMpy: (typeof p.crMpy === 'number' && isFinite(p.crMpy)) ? p.crMpy : 0
      };
    }).sort(function (a, b) { return a.time - b.time; });

    var ranges = [
      { key: '24h', label: '24 h', ms: DAY_MS },
      { key: '7d', label: '7 d', ms: 7 * DAY_MS },
      { key: '30d', label: '30 d', ms: 30 * DAY_MS },
      { key: '90d', label: '90 d', ms: 90 * DAY_MS },
      { key: 'all', label: null, ms: null }
    ];
    var active = '30d';

    var container = el('div', { class: 'trend-chart' });
    var rangeBar = el('div', { class: 'trend-range', attrs: { role: 'group', 'aria-label': tt(titleKey) } });
    var buttons = {};
    ranges.forEach(function (r) {
      var btn = el('button', {
        class: 'trend-range__btn', text: r.label || tt('common.all'),
        on: { click: function () { setRange(r.key); } }
      });
      buttons[r.key] = btn;
      rangeBar.appendChild(btn);
    });
    container.appendChild(rangeBar);

    var stage = el('div', { class: 'trend-chart__stage' });
    var figure = el('div', { class: 'trend-chart__figure' });
    var tooltip = el('div', { class: 'trend-tooltip', attrs: { role: 'status' } });
    tooltip.hidden = true;
    stage.appendChild(figure);
    stage.appendChild(tooltip);
    container.appendChild(stage);

    var state = null;
    var destroyed = false;

    // Range windows are measured from the newest sample so historical data
    // (offline field logs) still resolves to a meaningful "last N" slice.
    var anchor = allPoints.length ? allPoints[allPoints.length - 1].time : Date.now();

    function pointsForRange() {
      if (active === 'all') { return allPoints.slice(); }
      var r = null;
      for (var i = 0; i < ranges.length; i++) { if (ranges[i].key === active) { r = ranges[i]; } }
      if (!r || r.ms === null) { return allPoints.slice(); }
      var cutoff = anchor - r.ms;
      return allPoints.filter(function (p) { return p.time >= cutoff; });
    }

    function niceStep(x) {
      if (!(x > 0)) { return 1; }
      var exp = Math.floor(Math.log10(x));
      var base = Math.pow(10, exp);
      var n = x / base;
      var m = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
      return m * base;
    }

    function hideCursor() {
      tooltip.hidden = true;
      if (state) {
        if (state.cursorLine) { state.cursorLine.setAttribute('visibility', 'hidden'); }
        if (state.dot) { state.dot.setAttribute('visibility', 'hidden'); }
      }
    }

    function placeTooltip(svgX) {
      var rect = state.svg.getBoundingClientRect();
      if (rect.width <= 0) { return; }
      var cssX = (svgX / width) * rect.width;
      var minEdge = 48;
      var maxEdge = rect.width - 48;
      if (cssX < minEdge) { cssX = minEdge; }
      if (cssX > maxEdge) { cssX = maxEdge; }
      tooltip.style.left = cssX + 'px';
    }

    function showIndex(i) {
      if (!state || !state.pts.length) { return; }
      if (i < 0) { i = 0; }
      if (i > state.pts.length - 1) { i = state.pts.length - 1; }
      state.idx = i;
      var p = state.pts[i];
      var svgX = state.xFor(i);
      var svgY = state.yFor(p.crMpy);
      state.cursorLine.setAttribute('x1', String(svgX));
      state.cursorLine.setAttribute('x2', String(svgX));
      state.cursorLine.setAttribute('y1', String(state.y0));
      state.cursorLine.setAttribute('y2', String(state.y1));
      state.cursorLine.setAttribute('visibility', 'visible');
      state.dot.setAttribute('cx', String(svgX));
      state.dot.setAttribute('cy', String(svgY));
      state.dot.setAttribute('visibility', 'visible');

      tooltip.textContent = '';
      tooltip.appendChild(el('span', { class: 'trend-tooltip__date', text: fmtDateI18n(p.date) }));
      tooltip.appendChild(el('span', { class: 'trend-tooltip__value num', text: fmtNumI18n(p.crMpy, 2) + ' ' + tt('units.mpy') }));
      tooltip.appendChild(severityBadge(classifySp0775(p.crMpy)));
      tooltip.hidden = false;
      placeTooltip(svgX);
    }

    function onPointerMove(evt) {
      if (!state || !state.pts.length) { return; }
      var rect = state.svg.getBoundingClientRect();
      if (rect.width <= 0) { return; }
      var svgX = (evt.clientX - rect.left) * (width / rect.width);
      var n = state.pts.length;
      var i = n > 1 ? Math.round((svgX - state.x0) / (state.x1 - state.x0) * (n - 1)) : 0;
      showIndex(i);
    }

    function onKeyDown(evt) {
      if (!state || !state.pts.length) { return; }
      if (evt.key === 'ArrowRight' || evt.key === 'ArrowLeft' || evt.key === 'Home' || evt.key === 'End') {
        evt.preventDefault();
        var i = state.idx < 0 ? 0 : state.idx;
        if (evt.key === 'ArrowRight') { i += 1; }
        else if (evt.key === 'ArrowLeft') { i -= 1; }
        else if (evt.key === 'Home') { i = 0; }
        else if (evt.key === 'End') { i = state.pts.length - 1; }
        showIndex(i);
      } else if (evt.key === 'Escape') {
        hideCursor();
      }
    }

    function render() {
      if (destroyed) { return; }
      figure.textContent = '';
      hideCursor();
      state = null;
      var pts = pointsForRange();
      if (pts.length <= 1) {
        figure.appendChild(el('p', { class: 'trend-chart__empty empty-state', text: tt('common.empty') }));
        return;
      }

      var padL = 46, padR = 16, padT = 10, padB = 26;
      var x0 = padL, x1 = width - padR, y0 = padT, y1 = height - padB;

      var dataMax = 0;
      pts.forEach(function (p) { if (p.crMpy > dataMax) { dataMax = p.crMpy; } });
      thresholds.forEach(function (th) { if (th.v > dataMax) { dataMax = th.v; } });
      if (dataMax <= 0) { dataMax = 1; }
      var step = niceStep(dataMax / 3);
      var yMax = step * Math.max(1, Math.ceil(dataMax / step));

      var n = pts.length;
      function xFor(i) { return x0 + (x1 - x0) * (n > 1 ? i / (n - 1) : 0); }
      function yFor(v) { var c = Math.min(Math.max(v, 0), yMax); return y1 - (y1 - y0) * (c / yMax); }

      var svg = svgEl('svg', {
        class: 'trend-chart__svg', role: 'img', tabindex: '0',
        viewBox: '0 0 ' + width + ' ' + height, preserveAspectRatio: 'xMidYMid meet',
        'aria-label': tt(titleKey)
      });
      svg.appendChild(svgEl('title', null, tt(titleKey)));
      svg.appendChild(svgEl('desc', null, tt('a11y.chartDataTable')));

      var gv;
      for (gv = 0; gv <= yMax + 1e-9; gv += step) {
        var gy = yFor(gv);
        svg.appendChild(svgEl('line', { x1: x0, x2: x1, y1: gy, y2: gy, class: 'trend-grid' }));
        svg.appendChild(svgEl('text', { x: x0 - 6, y: gy + 3, class: 'trend-axis-label', 'text-anchor': 'end' },
          fmtNumI18n(gv, gv % 1 === 0 ? 0 : 1)));
      }

      var labelCount = Math.min(5, n);
      var seen = {};
      for (var li = 0; li < labelCount; li++) {
        var idx = labelCount > 1 ? Math.round(li * (n - 1) / (labelCount - 1)) : 0;
        if (seen[idx]) { continue; }
        seen[idx] = true;
        svg.appendChild(svgEl('text', { x: xFor(idx), y: height - 8, class: 'trend-axis-label', 'text-anchor': 'middle' },
          fmtDateI18n(pts[idx].date)));
      }

      thresholds.forEach(function (th) {
        if (th.v > yMax) { return; }
        var ty = yFor(th.v);
        var sev = classifySp0775(th.v);
        svg.appendChild(svgEl('line', { x1: x0, x2: x1, y1: ty, y2: ty, class: 'trend-threshold trend-threshold--' + sev }));
        if (th.label) {
          svg.appendChild(svgEl('text', { x: x1, y: ty - 3, class: 'trend-threshold-label trend-threshold-label--' + sev, 'text-anchor': 'end' }, th.label));
        }
      });

      var coords = pts.map(function (p, i) { return xFor(i).toFixed(1) + ',' + yFor(p.crMpy).toFixed(1); });
      svg.appendChild(svgEl('polyline', { points: coords.join(' '), class: 'trend-line' }));

      var cursorLine = svgEl('line', { class: 'trend-cursor', visibility: 'hidden', 'aria-hidden': 'true' });
      var dot = svgEl('circle', { class: 'trend-cursor-dot', r: '4', visibility: 'hidden', 'aria-hidden': 'true' });
      svg.appendChild(cursorLine);
      svg.appendChild(dot);
      svg.setAttribute('data-points', String(n));

      figure.appendChild(svg);

      state = {
        svg: svg, pts: pts, x0: x0, x1: x1, y0: y0, y1: y1, yMax: yMax, idx: -1,
        xFor: xFor, yFor: yFor, cursorLine: cursorLine, dot: dot
      };

      svg.addEventListener('mousemove', onPointerMove);
      svg.addEventListener('pointermove', onPointerMove);
      svg.addEventListener('click', onPointerMove);
      svg.addEventListener('mouseleave', hideCursor);
      svg.addEventListener('keydown', onKeyDown);
      svg.addEventListener('blur', hideCursor);
    }

    function setRange(key) {
      active = key;
      for (var k in buttons) {
        if (Object.prototype.hasOwnProperty.call(buttons, k)) {
          var isActive = k === key;
          buttons[k].classList.toggle('is-active', isActive);
          buttons[k].setAttribute('aria-pressed', isActive ? 'true' : 'false');
        }
      }
      render();
    }

    setRange('30d');

    function destroy() {
      destroyed = true;
      hideCursor();
      if (container.parentNode) { container.parentNode.removeChild(container); }
      container.textContent = '';
    }

    return { node: container, destroy: destroy, setRange: setRange };
  }

  // ISA-101 analogue gauge: 240-degree arc, severity zones, needle, title.
  function gauge(opts) {
    opts = opts || {};
    var value = (typeof opts.value === 'number' && isFinite(opts.value)) ? opts.value : 0;
    var min = (opts.min !== undefined && opts.min !== null) ? opts.min : 0;
    var max = (opts.max !== undefined && opts.max !== null) ? opts.max : 20;
    var unit = opts.unit || 'mpy';
    var size = opts.size || 96;
    // showValue:false keeps arc, severity zones and needle but drops the in-dial
    // value/unit text (for compact gauges that sit next to an explicit number).
    var showValue = opts.showValue !== false;
    var zones = opts.zones || [{ to: 5, sev: 'low' }, { to: 10, sev: 'moderate' }, { to: 20, sev: 'high' }];

    var over = value > max;
    var clamped = Math.min(Math.max(value, min), max);
    var frac = (max > min) ? (clamped - min) / (max - min) : 0;

    var cx = size / 2, cy = size / 2 + size * 0.06, r = size * 0.40;
    var sw = Math.max(4, size * 0.11);
    var span = 240, start = 210;

    function pt(t, rad) {
      var ang = (start - t * span) * Math.PI / 180;
      return { x: cx + rad * Math.cos(ang), y: cy - rad * Math.sin(ang) };
    }
    function arc(t1, t2, rad) {
      var a = pt(t1, rad), b = pt(t2, rad);
      var large = ((t2 - t1) * span) > 180 ? 1 : 0;
      return 'M ' + a.x.toFixed(2) + ' ' + a.y.toFixed(2) +
        ' A ' + rad.toFixed(2) + ' ' + rad.toFixed(2) + ' 0 ' + large + ' 1 ' + b.x.toFixed(2) + ' ' + b.y.toFixed(2);
    }

    var wrap = el('span', { class: 'gauge' });
    var svg = svgEl('svg', { class: 'gauge__svg', role: 'img', width: size, height: size, viewBox: '0 0 ' + size + ' ' + size });
    var valueText = fmtNumI18n(value, 2);
    svg.appendChild(svgEl('title', null, tt('dashboard.kpiAvgCr') + ': ' + valueText + ' ' + unit));
    svg.appendChild(svgEl('desc', null, unit));

    svg.appendChild(svgEl('path', { d: arc(0, 1, r), class: 'gauge-track', fill: 'none', 'stroke-width': sw }));

    var prev = min;
    zones.forEach(function (z) {
      var to = Math.min(z.to, max);
      if (to <= prev) { return; }
      var t1 = (prev - min) / (max - min);
      var t2 = (to - min) / (max - min);
      svg.appendChild(svgEl('path', { d: arc(t1, t2, r), class: 'gauge-zone gauge-zone--' + (z.sev || 'low'), fill: 'none', 'stroke-width': sw }));
      prev = z.to;
    });

    var np = pt(frac, r * 0.86);
    svg.appendChild(svgEl('line', { x1: cx, y1: cy, x2: np.x.toFixed(2), y2: np.y.toFixed(2), class: 'gauge-needle', 'stroke-width': Math.max(2, size * 0.03) }));
    svg.appendChild(svgEl('circle', { cx: cx, cy: cy, r: Math.max(2.5, size * 0.045), class: 'gauge-hub' }));

    if (showValue) {
      svg.appendChild(svgEl('text', { x: cx, y: cy + size * 0.02, class: over ? 'gauge-value num gauge-value--over' : 'gauge-value num', 'text-anchor': 'middle' }, valueText));
      svg.appendChild(svgEl('text', { x: cx, y: cy + size * 0.17, class: 'gauge-unit', 'text-anchor': 'middle' }, unit));
    }

    wrap.appendChild(svg);
    return wrap;
  }

  // Minimal inline trend for tables: polyline, 1.5px, accent colour.
  // Size is pinned three ways so a viewBox-only SVG can never stretch to the
  // width of its table cell: explicit width/height presentation attributes,
  // and the .sparkline rule in components.css (fixed logical inline/block size,
  // flex:0 0 auto, vertical-align:middle, overflow:hidden). Inline styles are
  // deliberately avoided because the app ships a strict `style-src 'self'` CSP.
  function sparkline(values, opts) {
    opts = opts || {};
    var width = opts.width || 72;
    var height = opts.height || 16;
    var svg = svgEl('svg', {
      class: 'sparkline',
      viewBox: '0 0 ' + width + ' ' + height,
      width: width,
      height: height,
      preserveAspectRatio: 'none', role: 'img', focusable: 'false', 'aria-hidden': 'true'
    });
    var vals = [];
    (values || []).forEach(function (v) { if (typeof v === 'number' && isFinite(v)) { vals.push(v); } });
    if (vals.length < 2) { return svg; }
    var max = Math.max.apply(null, vals);
    var min = Math.min.apply(null, vals);
    var span = (max - min) || 1;
    var pad = 1.5;
    var pts = vals.map(function (v, i) {
      var x = pad + (width - 2 * pad) * (i / (vals.length - 1));
      var y = height - pad - (height - 2 * pad) * ((v - min) / span);
      return x.toFixed(1) + ',' + y.toFixed(1);
    });
    svg.appendChild(svgEl('polyline', { points: pts.join(' '), class: 'sparkline__line', fill: 'none' }));
    return svg;
  }

  // Loading placeholders: shimmer bars announced to assistive tech.
  function skeleton(n, opts) {
    opts = opts || {};
    var count = (typeof n === 'number' && n > 0) ? Math.floor(n) : 3;
    var box = el('div', {
      class: 'skeleton-stack' + (opts.class ? ' ' + opts.class : ''),
      attrs: { role: 'status', 'aria-busy': 'true' }
    });
    box.appendChild(el('span', { class: 'visually-hidden', text: tt('common.loading') }));
    for (var i = 0; i < count; i++) {
      box.appendChild(el('div', { class: 'skeleton', attrs: { 'aria-hidden': 'true' } }));
    }
    return box;
  }

  return {
    el: el,
    txt: txt,
    icon: icon,
    table: table,
    dialog: dialog,
    toast: toast,
    confirmDialog: confirmDialog,
    form: form,
    keyValueTable: keyValueTable,
    severityBadge: severityBadge,
    tabs: tabs,
    pager: pager,
    svgEl: svgEl,
    trendChart: trendChart,
    gauge: gauge,
    sparkline: sparkline,
    skeleton: skeleton
  };
});
