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
    var badge = el('span', { class: 'badge badge-' + lv + ' shape-' + lv });
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
    pager: pager
  };
});
