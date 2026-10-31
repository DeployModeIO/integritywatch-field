/* IntegrityWatch Field — psv view
   PSV registry, detail fichas and API 520/526 sizing panels (gas + liquid). */
(function (root, factory) {
  'use strict';
  var api = factory(root);
  root.IW = root.IW || {};
  root.IW.views = root.IW.views || {};
  root.IW.views.psv = api;
  if (typeof module === 'object' && module.exports) { module.exports = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  function i18nApi() { return root.IW.i18n; }
  function psvApi() { return root.IW.calc && root.IW.calc.psv; }
  function unitsApi() { return root.IW.calc && root.IW.calc.units; }
  function fluids() { return root.IW.data && root.IW.data.fluids; }
  function lock() { return root.IW.security && root.IW.security.lock; }

  function fmtNum(v, digits) {
    var d = (digits === undefined || digits === null) ? 2 : digits;
    if (v === null || v === undefined || typeof v !== 'number' || !isFinite(v)) { return ''; }
    var i18n = i18nApi();
    if (i18n && typeof i18n.formatNumber === 'function') {
      return i18n.formatNumber(v, { maximumFractionDigits: d });
    }
    return String(Number(v.toFixed(d)));
  }

  function fmtDate(iso, opts) {
    if (!iso) { return ''; }
    var i18n = i18nApi();
    if (i18n && typeof i18n.formatDate === 'function') { return i18n.formatDate(iso, opts); }
    return String(iso);
  }

  function copy(o) {
    var out = {};
    for (var k in o) { if (Object.prototype.hasOwnProperty.call(o, k)) { out[k] = o[k]; } }
    return out;
  }

  function numOrUndef(v) { return (v === null || v === undefined || v === '') ? undefined : v; }

  function fluidList() {
    var f = fluids();
    return (f && typeof f.list === 'function') ? f.list() : [];
  }

  // Custom form builder (same contract as the corrosion view): per-field
  // validators, reactive inline errors and aria-invalid wiring.
  function buildForm(h, fields, values) {
    values = values || {};
    var node = h.ui.el('form', { class: 'form', attrs: { novalidate: '' } });
    var state = {};

    fields.forEach(function (f) {
      var value = values[f.name] !== undefined && values[f.name] !== null ? values[f.name] : (f.value !== undefined && f.value !== null ? f.value : '');
      var fieldId = 'cf-' + String(f.name).replace(/[^A-Za-z0-9_-]/g, '_');
      var control;
      var wrap = h.ui.el('div', { class: 'field' });

      if (f.type === 'select') {
        control = h.ui.el('select', { class: 'select', attrs: { id: fieldId, name: f.name } });
        (f.options || []).forEach(function (o) {
          var opt = h.ui.el('option', { attrs: { value: o.value } });
          opt.textContent = o.labelKey ? h.t(o.labelKey) : (o.label !== undefined ? o.label : String(o.value));
          control.appendChild(opt);
        });
        control.value = String(value);
      } else if (f.type === 'textarea') {
        control = h.ui.el('textarea', { class: 'input', attrs: { id: fieldId, name: f.name } });
        control.value = String(value);
      } else if (f.type === 'checkbox') {
        control = h.ui.el('input', { attrs: { id: fieldId, name: f.name, type: 'checkbox' } });
        control.checked = !!value;
        wrap.appendChild(h.ui.el('label', { class: 'field-label', attrs: { for: fieldId } }, control, h.ui.el('span', { text: h.t(f.labelKey) })));
      } else {
        var inputType = f.type || 'text';
        control = h.ui.el('input', { class: 'input', attrs: { id: fieldId, name: f.name, type: inputType } });
        if (f.min !== undefined && f.min !== null) { control.setAttribute('min', String(f.min)); }
        if (f.max !== undefined && f.max !== null) { control.setAttribute('max', String(f.max)); }
        if (f.step !== undefined && f.step !== null) { control.setAttribute('step', String(f.step)); }
        control.value = String(value);
      }

      if (f.type !== 'checkbox') {
        wrap.appendChild(h.ui.el('label', { class: 'field-label', attrs: { for: fieldId }, text: h.t(f.labelKey) }));
        wrap.appendChild(control);
      }
      if (f.hint) {
        wrap.appendChild(h.ui.el('span', { class: 'field-hint', text: h.t(f.hint) }));
      }

      var errorNode = h.ui.el('span', { class: 'field-error', attrs: { id: fieldId + '-error', role: 'alert' } });
      errorNode.hidden = true;
      wrap.appendChild(errorNode);
      node.appendChild(wrap);

      state[f.name] = { field: f, control: control, errorNode: errorNode, wrap: wrap };

      var evt = f.type === 'checkbox' ? 'change' : 'input';
      control.addEventListener(evt, function () {
        validateOne(f.name);
        if (f.onInput) { f.onInput(currentValue(f.name), allValues()); }
      });
      control.addEventListener('blur', function () { validateOne(f.name); });
    });

    function currentValue(name) {
      var s = state[name];
      if (!s) { return undefined; }
      var f = s.field;
      if (f.type === 'checkbox') { return s.control.checked; }
      if (f.type === 'number') { return s.control.value === '' ? null : Number(s.control.value); }
      return s.control.value;
    }

    function allValues() {
      var out = {};
      Object.keys(state).forEach(function (name) { out[name] = currentValue(name); });
      return out;
    }

    function validateOne(name) {
      var s = state[name];
      if (!s) { return true; }
      var f = s.field;
      var ctrl = s.control;
      var val = currentValue(name);
      var err = null;
      var empty = val === null || val === undefined || (typeof val === 'string' && val.trim() === '');

      if (f.required && empty) { err = 'common.required'; }
      else if (!empty && f.type === 'number') {
        var n = Number(val);
        if (isNaN(n)) { err = 'common.error'; }
        else if (f.min !== undefined && f.min !== null && n < f.min) { err = 'common.min'; }
        else if (f.max !== undefined && f.max !== null && n > f.max) { err = 'common.max'; }
      }
      if (!err && f.validate) { err = f.validate(val, allValues()); }

      if (err) {
        ctrl.setAttribute('aria-invalid', 'true');
        if (ctrl.id) { ctrl.setAttribute('aria-describedby', ctrl.id + '-error'); }
        s.errorNode.textContent = h.t(err);
        s.errorNode.hidden = false;
        return false;
      }
      ctrl.removeAttribute('aria-invalid');
      ctrl.removeAttribute('aria-describedby');
      s.errorNode.textContent = '';
      s.errorNode.hidden = true;
      return true;
    }

    function validate() {
      var ok = true;
      Object.keys(state).forEach(function (name) { if (!validateOne(name)) { ok = false; } });
      return ok;
    }

    return { node: node, getValues: allValues, validate: validate, getControl: function (name) { return state[name] && state[name].control; } };
  }

  function card(h, titleKey) {
    var c = h.ui.el('section', { class: 'card' });
    c.appendChild(h.ui.el('h2', { class: 'section-title', text: h.t(titleKey) }));
    return c;
  }

  function buildInspHistory(h, psv) {
    var panel = card(h, 'psv.inspHistory');
    var nowMs = Date.now();
    var inspNextMs = psv.inspNext ? Date.parse(psv.inspNext) : NaN;
    var overdue = !isNaN(inspNextMs) && inspNextMs < nowMs;

    // LED status
    var ledCls = 'led led-warn';
    var ledLabel = h.t('psv.inspMissing');
    if (psv.inspNext) {
      ledCls = overdue ? 'led led-crit' : 'led led-ok';
      ledLabel = overdue ? h.t('psv.inspOverdue') : h.t('psv.inspOk');
    }

    var ledNode = h.ui.el('span', { class: ledCls, attrs: { 'data-led': overdue ? 'crit' : (psv.inspNext ? 'ok' : 'warn') } });
    ledNode.appendChild(h.ui.el('span', { text: ledLabel }));

    // Faceplate table
    var pairs = [
      ['psv.lastInsp', h.ui.el('span', { text: psv.inspLast ? fmtDate(psv.inspLast, { dateStyle: 'short' }) : '—' })],
      ['psv.nextInspDue', h.ui.el('span', { text: psv.inspNext ? fmtDate(psv.inspNext, { dateStyle: 'short' }) : '—' })],
      ['psv.inspResult', h.ui.el('span', { class: 'badge ' + (psv.inspResult === 'fail' ? 'badge-severe' : psv.inspResult === 'pass' ? 'badge-low' : 'badge-neutral'), text: psv.inspResult ? h.t('common.' + psv.inspResult) : '—' })],
      ['common.status', ledNode]
    ];
    panel.appendChild(h.ui.keyValueTable(pairs));
    return panel;
  }

  function emptyState(h, key) {
    return h.ui.el('p', { class: 'empty-state', text: h.t(key || 'common.empty') });
  }

  function loadingNode(h) {
    return h.ui.el('div', { class: 'empty-state', attrs: { role: 'status' } },
      h.ui.el('span', { class: 'spinner', attrs: { 'aria-hidden': 'true' } }),
      h.ui.el('span', { text: h.t('common.loading') }));
  }

  function errorNode(h, err) {
    return h.ui.el('div', { class: 'empty-state', attrs: { role: 'alert' } },
      h.ui.el('span', { class: 'alert-item__icon', attrs: { 'aria-hidden': 'true' } }, h.ui.icon('alert-critical', 24)),
      h.ui.el('span', { text: h.t('common.error') + ': ' + (err && err.message ? err.message : String(err)) }));
  }

  function statusBadge(h, status) {
    var st = status || 'ok';
    var cls = st === 'overdue' ? 'badge-severe' : (st === 'due' ? 'badge-moderate' : 'badge-low');
    return h.ui.el('span', { class: 'badge ' + cls, text: h.t('common.' + st) });
  }

  function fluidName(h, psv) {
    var f = psv.fluid || {};
    if (f.name) { return f.name; }
    if (psv.fluidId) {
      var fl = fluids();
      var ref = fl && fl.byId ? fl.byId(psv.fluidId) : null;
      if (ref) { return h.t(ref.nameKey); }
    }
    return '—';
  }

  // ---- Registry form -----------------------------------------------------------

  function psvForm(h, existing, existingTags) {
    var fluidOptions = fluidList().map(function (f) { return { value: f.id, labelKey: f.nameKey }; });
    var f = (existing && existing.fluid) || {};
    var fields = [
      { name: 'tag', labelKey: 'psv.tag', type: 'text', required: true,
        validate: function (val) {
          if (val && String(val).trim()) {
            var tag = String(val).trim();
            var self = existing ? existing.tag : '';
            if (tag !== self && existingTags.indexOf(tag) !== -1) { return 'psv.tagDuplicate'; }
          }
          return null;
        } },
      { name: 'valveType', labelKey: 'psv.valveType', type: 'select', required: true,
        options: [
          { value: 'conventional', labelKey: 'psv.types.conventional' },
          { value: 'balanced', labelKey: 'psv.types.balanced' },
          { value: 'pilot', labelKey: 'psv.types.pilot' }
        ] },
      { name: 'fluidId', labelKey: 'psv.fluid', type: 'select', options: fluidOptions },
      { name: 'fluidName', labelKey: 'psv.fluidName', type: 'text' },
      { name: 'fluidPhase', labelKey: 'psv.phase', type: 'select',
        options: [{ value: 'gas', labelKey: 'psv.gasVapor' }, { value: 'liquid', labelKey: 'psv.liquid' }] },
      { name: 'M', labelKey: 'psv.molarMass', type: 'number' },
      { name: 'Z', labelKey: 'psv.compressibility', type: 'number' },
      { name: 'k', labelKey: 'psv.k', type: 'number' },
      { name: 'G', labelKey: 'psv.specificGravity', type: 'number' },
      { name: 'viscCp', labelKey: 'psv.viscosity', type: 'number' },
      { name: 'location', labelKey: 'psv.location', type: 'text' },
      { name: 'setPressurePsig', labelKey: 'psv.setPressure', type: 'number', required: true, min: 0 },
      { name: 'operatingTempF', labelKey: 'psv.temperature', type: 'number' },
      { name: 'backPressurePsig', labelKey: 'psv.backPressure', type: 'number', min: 0 },
      { name: 'lastTestDate', labelKey: 'psv.lastTest', type: 'date' },
      { name: 'nextTestDate', labelKey: 'psv.nextTest', type: 'date' },
      { name: 'certifiedCapacity', labelKey: 'psv.certified', type: 'number', min: 0 },
      { name: 'inspLast', labelKey: 'psv.lastInsp', type: 'date' },
      { name: 'inspNext', labelKey: 'psv.nextInspDue', type: 'date' },
      { name: 'inspResult', labelKey: 'psv.inspResult', type: 'select', options: [
        { value: '', labelKey: 'common.none' },
        { value: 'pass', labelKey: 'common.pass' },
        { value: 'fail', labelKey: 'common.fail' },
        { value: 'na', labelKey: 'common.na' }
      ] },
      { name: 'notes', labelKey: 'common.notes', type: 'textarea' }
    ];
    var values = {
      tag: existing ? existing.tag : '',
      valveType: existing ? existing.valveType : 'conventional',
      fluidId: existing ? existing.fluidId : '',
      fluidName: f.name || '',
      fluidPhase: f.phase || 'gas',
      M: f.M != null ? f.M : '',
      Z: f.Z != null ? f.Z : '',
      k: f.k != null ? f.k : '',
      G: f.G != null ? f.G : '',
      viscCp: f.viscCp != null ? f.viscCp : '',
      location: existing ? existing.location : '',
      setPressurePsig: existing && existing.setPressurePsig != null ? existing.setPressurePsig : '',
      operatingTempF: existing && existing.operatingTempF != null ? existing.operatingTempF : '',
      backPressurePsig: existing && existing.backPressurePsig != null ? existing.backPressurePsig : '',
      lastTestDate: existing && existing.lastTestDate ? existing.lastTestDate.slice(0, 10) : '',
      nextTestDate: existing && existing.nextTestDate ? existing.nextTestDate.slice(0, 10) : '',
      certifiedCapacity: existing && existing.certifiedCapacity != null ? existing.certifiedCapacity : '',
      inspLast: existing && existing.inspLast ? existing.inspLast.slice(0, 10) : '',
      inspNext: existing && existing.inspNext ? existing.inspNext.slice(0, 10) : '',
      inspResult: existing && existing.inspResult ? existing.inspResult : '',
      notes: existing ? existing.notes : ''
    };
    return { fields: fields, values: values };
  }

  function assemblePsv(existing, vals) {
    var rec = existing ? copy(existing) : {};
    rec.tag = String(vals.tag || '').trim();
    rec.location = vals.location ? String(vals.location).trim() : undefined;
    rec.valveType = vals.valveType;
    rec.fluidId = vals.fluidId || undefined;
    rec.fluid = {
      name: vals.fluidName ? String(vals.fluidName).trim() : '',
      phase: vals.fluidPhase || 'gas',
      M: numOrUndef(vals.M),
      Z: numOrUndef(vals.Z),
      k: numOrUndef(vals.k),
      G: numOrUndef(vals.G),
      viscCp: numOrUndef(vals.viscCp)
    };
    rec.setPressurePsig = numOrUndef(vals.setPressurePsig);
    rec.operatingTempF = numOrUndef(vals.operatingTempF);
    rec.backPressurePsig = numOrUndef(vals.backPressurePsig);
    rec.lastTestDate = vals.lastTestDate || undefined;
    rec.nextTestDate = vals.nextTestDate || undefined;
    rec.certifiedCapacity = numOrUndef(vals.certifiedCapacity);
    rec.inspLast = vals.inspLast || undefined;
    rec.inspNext = vals.inspNext || undefined;
    rec.inspResult = vals.inspResult || undefined;
    rec.notes = vals.notes ? String(vals.notes).trim() : undefined;
    if (!existing) { rec.id = rec.tag; }
    return rec;
  }

  function openPsvForm(h, existing, existingTags, onDone) {
    var def = psvForm(h, existing, existingTags);
    var form = buildForm(h, def.fields, def.values);
    var dlg = h.ui.dialog({
      titleKey: existing ? 'common.edit' : 'psv.newPsv',
      bodyNode: form.node,
      actions: [
        { labelKey: 'common.cancel', kind: 'ghost', onClick: function () { return true; } },
        { labelKey: 'common.save', kind: 'primary', onClick: function () {
            if (!form.validate()) { return false; }
            var vals = form.getValues();
            var rec = assemblePsv(existing, vals);
            var saveP = (existing && existing.id && existing.id !== rec.tag)
              ? h.repos.psvs.remove(existing.id).then(function () { rec.id = rec.tag; return h.repos.psvs.save(rec); })
              : h.repos.psvs.save(rec);
            saveP.then(function () {
              dlg.close();
              if (onDone) { onDone(rec); }
            }).catch(function () {
              if (h.ui && typeof h.ui.toast === 'function') { h.ui.toast(h.t('common.error'), { severity: 'critical' }); }
            });
            return false;
          } }
      ]
    });

    // Inline fluid editor: copying the reference fluid into the editable fields.
    var fluidSel = form.getControl('fluidId');
    if (fluidSel) {
      fluidSel.addEventListener('change', function () {
        var fl = fluids();
        var ref = fl && fl.byId ? fl.byId(fluidSel.value) : null;
        if (!ref) { return; }
        if (ref.nameKey) { form.getControl('fluidName').value = h.t(ref.nameKey); }
        if (ref.phase) { form.getControl('fluidPhase').value = ref.phase; }
        if (ref.M != null) { form.getControl('M').value = String(ref.M); }
        if (ref.Z != null) { form.getControl('Z').value = String(ref.Z); }
        if (ref.k != null) { form.getControl('k').value = String(ref.k); }
        if (ref.G != null) { form.getControl('G').value = String(ref.G); }
        if (ref.viscCp != null) { form.getControl('viscCp').value = String(ref.viscCp); }
      });
    }
  }

  function deletePsv(h, psv, onDeleted) {
    h.ui.confirmDialog({ titleKey: 'common.delete', bodyKey: 'psv.deletePsvConfirm', danger: true }).then(function (ok) {
      if (!ok) { return; }
      var lk = lock();
      var check = Promise.resolve(false);
      if (lk && typeof lk.isEnabled === 'function') { check = lk.isEnabled(h.repos.meta); }
      check.then(function (enabled) {
        if (enabled && lk && lk.currentRole && lk.currentRole() === 'operator') {
          if (h.ui && typeof h.ui.toast === 'function') { h.ui.toast(h.t('psv.deleteDisabled'), { severity: 'warning' }); }
          return;
        }
        h.repos.psvs.remove(psv.id).then(function () {
          if (onDeleted) { onDeleted(); }
        }).catch(function () {
          if (h.ui && typeof h.ui.toast === 'function') { h.ui.toast(h.t('common.error'), { severity: 'critical' }); }
        });
      });
    });
  }

  // ---- Sizing -------------------------------------------------------------------

  function p1p2(v) {
    var op = v.overpressurePct != null ? v.overpressurePct : 10;
    var set = v.setPressurePsig;
    var back = v.backPressurePsig != null ? v.backPressurePsig : 0;
    return { P1psia: set * (1 + op / 100) + 14.7, P2psia: back + 14.7, op: op, set: set, back: back };
  }

  function gasFields(h) {
    return [
      { name: 'Wlbh', labelKey: 'psv.flowW', type: 'number', validate: function (v) { if (v == null || v === '') { return 'psv.err.negflow'; } if (Number(v) <= 0) { return 'psv.err.negflow'; } return null; } },
      { name: 'setPressurePsig', labelKey: 'psv.setPressure', type: 'number', validate: function (v) { if (v == null || v === '') { return 'psv.err.empty'; } if (Number(v) <= 0) { return 'psv.err.set'; } return null; } },
      { name: 'overpressurePct', labelKey: 'psv.overpressure', type: 'number' },
      { name: 'backPressurePsig', labelKey: 'psv.backPressure', type: 'number' },
      { name: 'operatingTempF', labelKey: 'psv.temperature', type: 'number', validate: function (v) { if (v == null || v === '') { return 'psv.err.empty'; } if (Number(v) + 459.67 <= 0) { return 'psv.err.t'; } return null; } },
      { name: 'Z', labelKey: 'psv.compressibility', type: 'number', validate: function (v) { if (v == null || v === '') { return 'psv.err.empty'; } if (Number(v) <= 0) { return 'psv.err.z'; } return null; } },
      { name: 'M', labelKey: 'psv.molarMass', type: 'number', validate: function (v) { if (v == null || v === '') { return 'psv.err.empty'; } if (Number(v) <= 0) { return 'psv.err.m'; } return null; } },
      { name: 'k', labelKey: 'psv.k', type: 'number', validate: function (v) { if (v == null || v === '') { return 'psv.err.empty'; } if (Number(v) <= 1.0) { return 'psv.err.k'; } return null; } },
      { name: 'Kd', labelKey: 'psv.kd', type: 'number' },
      { name: 'Kc', labelKey: 'psv.kc', type: 'number' }
    ];
  }

  function liquidFields(h) {
    return [
      { name: 'Qgpm', labelKey: 'psv.flowQ', type: 'number', validate: function (v) { if (v == null || v === '') { return 'psv.err.negflow'; } if (Number(v) <= 0) { return 'psv.err.negflow'; } return null; } },
      { name: 'G', labelKey: 'psv.specificGravity', type: 'number', validate: function (v) { if (v == null || v === '') { return 'psv.err.empty'; } if (Number(v) <= 0) { return 'psv.err.g'; } return null; } },
      { name: 'setPressurePsig', labelKey: 'psv.setPressure', type: 'number', validate: function (v) { if (v == null || v === '') { return 'psv.err.empty'; } if (Number(v) <= 0) { return 'psv.err.set'; } return null; } },
      { name: 'overpressurePct', labelKey: 'psv.overpressure', type: 'number' },
      { name: 'backPressurePsig', labelKey: 'psv.backPressure', type: 'number' },
      { name: 'Kd', labelKey: 'psv.kd', type: 'number' },
      { name: 'Kc', labelKey: 'psv.kc', type: 'number' },
      { name: 'viscCp', labelKey: 'psv.viscosity', type: 'number' }
    ];
  }

  function gasValues(psv) {
    var f = psv.fluid || {};
    return {
      Wlbh: psv.Wlbh != null ? psv.Wlbh : '',
      setPressurePsig: psv.setPressurePsig != null ? psv.setPressurePsig : '',
      overpressurePct: 10,
      backPressurePsig: psv.backPressurePsig != null ? psv.backPressurePsig : 0,
      operatingTempF: psv.operatingTempF != null ? psv.operatingTempF : '',
      Z: f.Z != null ? f.Z : (f.phase === 'gas' ? 1 : ''),
      M: f.M != null ? f.M : '',
      k: f.k != null ? f.k : '',
      Kd: psv.Kd != null ? psv.Kd : 0.975,
      Kc: psv.Kc != null ? psv.Kc : 1
    };
  }

  function liquidValues(psv) {
    var f = psv.fluid || {};
    return {
      Qgpm: psv.Qgpm != null ? psv.Qgpm : '',
      G: f.G != null ? f.G : '',
      setPressurePsig: psv.setPressurePsig != null ? psv.setPressurePsig : '',
      overpressurePct: 10,
      backPressurePsig: psv.backPressurePsig != null ? psv.backPressurePsig : 0,
      Kd: psv.Kd != null ? psv.Kd : 0.65,
      Kc: psv.Kc != null ? psv.Kc : 1,
      viscCp: f.viscCp != null ? f.viscCp : ''
    };
  }

  function computeGas(h, psv, v) {
    var api = psvApi();
    var units = unitsApi();
    var pp = p1p2(v);
    var Kb = api.kbBackpressure({ valveType: psv.valveType || 'conventional', backPressurePsig: pp.back, setPressurePsig: pp.set, overpressurePct: pp.op });
    var TR = units && typeof units.fToR === 'function' ? units.fToR(v.operatingTempF) : (v.operatingTempF + 459.67);
    var res = api.sizeGasVapor({
      Wlbh: v.Wlbh, P1psia: pp.P1psia, P2psia: pp.P2psia, TR: TR,
      Z: v.Z, M: v.M, k: v.k, Kd: v.Kd != null ? v.Kd : 0.975, Kb: Kb, Kc: v.Kc != null ? v.Kc : 1
    });
    var orifice = api.selectOrifice(res.AreqIn2);
    var selArea = orifice && !orifice.error ? orifice.areaIn2 : res.AreqIn2;
    var cap = api.realCapacity({ orificeAreaIn2: selArea, AreqIn2: res.AreqIn2, Wlbh: v.Wlbh });
    return {
      kind: 'gas',
      AreqIn2: res.AreqIn2,
      AreqCm2: res.AreqCm2,
      critical: res.critical,
      C: res.C,
      F2: res.F2,
      Kb: Kb,
      orifice: orifice,
      WrealLbh: cap.WrealLbh,
      marginPct: cap.marginPct,
      usagePct: (res.AreqIn2 / selArea) * 100
    };
  }

  function computeLiquid(h, psv, v) {
    var api = psvApi();
    var pp = p1p2(v);
    var Kw = api.kwBackpressureLiquid({ backPressurePsig: pp.back, setPressurePsig: pp.set, valveType: psv.valveType || 'conventional' });
    var res = api.sizeLiquid({
      Qgpm: v.Qgpm, G: v.G, setPressurePsig: v.setPressurePsig, overpressurePct: pp.op,
      backPressurePsig: v.backPressurePsig, Kd: v.Kd != null ? v.Kd : 0.65,
      Kw: Kw, Kc: v.Kc != null ? v.Kc : 1, viscCp: numOrUndef(v.viscCp)
    });
    var orifice = api.selectOrifice(res.AreqIn2);
    var selArea = orifice && !orifice.error ? orifice.areaIn2 : res.AreqIn2;
    var cap = api.realCapacity({ orificeAreaIn2: selArea, AreqIn2: res.AreqIn2, Qgpm: v.Qgpm });
    return {
      kind: 'liquid',
      AreqIn2: res.AreqIn2,
      AreqCm2: res.AreqCm2,
      Kv: res.Kv,
      Re: res.Re,
      iterations: res.iterations,
      reRangeWarning: res.reRangeWarning,
      Kw: Kw,
      orifice: orifice,
      QrealGpm: cap.QrealGpm,
      marginPct: cap.marginPct,
      usagePct: (res.AreqIn2 / selArea) * 100
    };
  }

  function areaText(h, r) {
    return fmtNum(r.AreqIn2, 4) + ' ' + h.t('units.in2') + ' · ' + fmtNum(r.AreqCm2, 2) + ' ' + h.t('units.cm2');
  }

  function orificeText(h, r) {
    if (!r.orifice || r.orifice.error) { return h.t('psv.exceedsT'); }
    return r.orifice.letter + ' (' + fmtNum(r.orifice.areaIn2, 3) + ' ' + h.t('units.in2') + ')';
  }

  function resultTable(h, r) {
    var pairs = [];
    pairs.push(['psv.requiredArea', h.ui.el('span', { class: 'num', text: areaText(h, r) })]);
    if (r.kind === 'gas') {
      pairs.push([r.critical ? 'psv.flowCritical' : 'psv.flowSubcritical', h.ui.el('span', { class: 'pill', text: h.t(r.critical ? 'psv.flowCritical' : 'psv.flowSubcritical') })]);
      pairs.push(['psv.c', h.ui.el('span', { class: 'num', text: fmtNum(r.C, 2) })]);
      if (!r.critical && r.F2 != null) { pairs.push(['psv.f2', h.ui.el('span', { class: 'num', text: fmtNum(r.F2, 4) })]); }
      pairs.push(['psv.kb', h.ui.el('span', { class: 'num', text: fmtNum(r.Kb, 3) })]);
    } else {
      pairs.push(['psv.kv', h.ui.el('span', { class: 'num', text: fmtNum(r.Kv, 3) })]);
      if (r.Re != null) { pairs.push(['psv.re', h.ui.el('span', { class: 'num', text: fmtNum(r.Re, 0) })]); }
      pairs.push(['psv.iterations', h.ui.el('span', { class: 'num', text: String(r.iterations) })]);
      pairs.push(['psv.kw', h.ui.el('span', { class: 'num', text: fmtNum(r.Kw, 3) })]);
    }
    pairs.push(['psv.selectedOrifice', h.ui.el('span', { class: 'num', text: orificeText(h, r) })]);
    if (r.orifice && !r.orifice.error) { pairs.push(['psv.selectedArea', h.ui.el('span', { class: 'num', text: fmtNum(r.orifice.areaIn2, 3) + ' ' + h.t('units.in2') })]); }
    pairs.push(['psv.margin', h.ui.el('span', { class: 'num', text: fmtNum(r.marginPct, 1) + ' %' })]);
    if (r.WrealLbh != null) { pairs.push(['psv.realCapacity', h.ui.el('span', { class: 'num', text: fmtNum(r.WrealLbh, 1) + ' ' + h.t('units.lbH') })]); }
    if (r.QrealGpm != null) { pairs.push(['psv.realCapacity', h.ui.el('span', { class: 'num', text: fmtNum(r.QrealGpm, 1) + ' ' + h.t('units.gpm') })]); }
    pairs.push(['psv.usage', h.ui.el('span', { class: 'num', text: fmtNum(r.usagePct, 1) + ' %' })]);
    var table = h.ui.keyValueTable(pairs);
    if (r.reRangeWarning) {
      var warn = h.ui.el('div', { class: 'field-error', attrs: { role: 'alert' } });
      warn.textContent = h.t('psv.warn.reRange');
      table.appendChild(warn);
    }
    return table;
  }

  function sizingTab(h, psv, fields, values, computeFn) {
    var node = h.ui.el('div', { class: 'stack' });
    var form = buildForm(h, fields, values);
    var formError = h.ui.el('div', { class: 'field-error', attrs: { role: 'alert' } });
    formError.hidden = true;
    var resultHost = h.ui.el('div', { class: 'sizing-result' });
    var lastResult = null;

    node.appendChild(form.node);
    node.appendChild(h.ui.el('div', { class: 'row' },
      h.ui.el('button', { class: 'btn btn-primary', on: { click: recalc } }, h.ui.icon('refresh', 18), h.ui.el('span', { text: h.t('psv.recalculate') })),
      h.ui.el('button', { class: 'btn', on: { click: saveSizing } }, h.ui.icon('check', 18), h.ui.el('span', { text: h.t('common.save') }))
    ));
    node.appendChild(formError);
    node.appendChild(resultHost);

    function recalc() {
      formError.hidden = true;
      if (!form.validate()) { resultHost.textContent = ''; return; }
      var v = form.getValues();
      var pp = p1p2(v);
      if (pp.P1psia <= pp.P2psia) {
        formError.textContent = h.t('psv.err.p1lep2');
        formError.hidden = false;
        resultHost.textContent = '';
        return;
      }
      try {
        var r = computeFn(h, psv, v);
        lastResult = r;
        resultHost.textContent = '';
        resultHost.appendChild(resultTable(h, r));
      } catch (e) {
        formError.textContent = h.t('common.error') + ': ' + (e && e.message ? e.message : String(e));
        formError.hidden = false;
        resultHost.textContent = '';
      }
    }

    function saveSizing() {
      if (!lastResult) { return; }
      var sizing = {
        AreqIn2: lastResult.AreqIn2,
        AreqCm2: lastResult.AreqCm2,
        critical: lastResult.critical,
        Kv: lastResult.Kv,
        Re: lastResult.Re,
        Kb: lastResult.Kb,
        Kw: lastResult.Kw,
        selectedAreaIn2: lastResult.orifice && !lastResult.orifice.error ? lastResult.orifice.areaIn2 : undefined,
        marginPct: lastResult.marginPct,
        computedAtISO: new Date().toISOString()
      };
      if (lastResult.WrealLbh != null) { sizing.WrealLbh = lastResult.WrealLbh; }
      if (lastResult.QrealGpm != null) { sizing.QrealGpm = lastResult.QrealGpm; }
      var updated = copy(psv);
      updated.sizing = sizing;
      if (lastResult.orifice && !lastResult.orifice.error) { updated.orificeLetter = lastResult.orifice.letter; }
      h.repos.psvs.save(updated).then(function () {
        if (h.ui && typeof h.ui.toast === 'function') { h.ui.toast(h.t('common.ok'), { severity: 'info' }); }
      }).catch(function () {
        if (h.ui && typeof h.ui.toast === 'function') { h.ui.toast(h.t('common.error'), { severity: 'critical' }); }
      });
    }

    return node;
  }

  function buildSizing(h, psv) {
    var tabsNode = h.ui.tabs([
      { id: 'gas', labelKey: 'psv.gasSizing', render: function () { return sizingTab(h, psv, gasFields(h), gasValues(psv), computeGas); } },
      { id: 'liquid', labelKey: 'psv.liquidSizing', render: function () { return sizingTab(h, psv, liquidFields(h), liquidValues(psv), computeLiquid); } }
    ]);
    return tabsNode;
  }

  // ---- Detail -------------------------------------------------------------------

  function renderDetail(h, container, id) {
    Promise.all([h.repos.psvs.get(id), h.repos.psvs.list()]).then(function (d) {
      if (!container.isConnected) { return; }
      var psv = d[0];
      if (!psv) {
        container.textContent = '';
        container.appendChild(errorNode(h, new Error('not found: ' + id)));
        return;
      }
      var existingTags = (d[1] || []).filter(function (p) { return p.id !== id; }).map(function (p) { return p.tag; });
      container.textContent = '';
      container.appendChild(buildDetail(h, psv, existingTags));
    }).catch(function (err) {
      container.textContent = '';
      container.appendChild(errorNode(h, err));
    });
  }

  function buildDetail(h, psv, existingTags) {
    var frag = document.createDocumentFragment();

    var header = h.ui.el('div', { class: 'page-header' });
    header.appendChild(h.ui.el('a', { class: 'btn btn-ghost', attrs: { href: '#/psv' }, on: { click: function (ev) { ev.preventDefault(); h.navigate('#/psv'); } } }, h.ui.icon('chevron-right', 18), h.ui.el('span', { text: h.t('common.back') })));
    header.appendChild(h.ui.el('h1', { text: psv.tag }));
    var actions = h.ui.el('div', { class: 'actions' });
    actions.appendChild(h.ui.el('button', { class: 'btn', on: { click: function () { openPsvForm(h, psv, existingTags, function (rec) { h.navigate('#/psv/' + encodeURIComponent(rec.id)); }); } } }, h.ui.icon('edit', 18), h.ui.el('span', { text: h.t('common.edit') })));
    actions.appendChild(h.ui.el('button', { class: 'btn btn-danger', on: { click: function () { deletePsv(h, psv, function () { h.navigate('#/psv'); }); } } }, h.ui.icon('trash', 18), h.ui.el('span', { text: h.t('common.delete') })));
    actions.appendChild(h.ui.el('a', { class: 'btn', attrs: { href: '#/reports/datasheet/' + encodeURIComponent(psv.id) }, on: { click: function (ev) { ev.preventDefault(); h.navigate('#/reports/datasheet/' + encodeURIComponent(psv.id)); } } }, h.ui.icon('reports', 18), h.ui.el('span', { text: h.t('psv.datasheet') })));
    header.appendChild(actions);
    frag.appendChild(header);

    // Summary.
    var summary = card(h, 'psv.title');
    summary.appendChild(h.ui.keyValueTable([
      ['psv.tag', h.ui.el('span', { class: 'num', text: psv.tag })],
      ['psv.location', h.ui.el('span', { text: psv.location || '—' })],
      ['psv.valveType', h.ui.el('span', { text: psv.valveType ? h.t('psv.types.' + psv.valveType) : '—' })],
      ['psv.fluid', h.ui.el('span', { text: fluidName(h, psv) })],
      ['psv.phase', h.ui.el('span', { text: (psv.fluid && psv.fluid.phase === 'liquid') ? h.t('psv.liquid') : h.t('psv.gasVapor') })],
      ['psv.setPressure', h.ui.el('span', { class: 'num', text: psv.setPressurePsig != null ? fmtNum(psv.setPressurePsig, 1) + ' ' + h.t('units.psig') : '—' })],
      ['psv.temperature', h.ui.el('span', { class: 'num', text: psv.operatingTempF != null ? fmtNum(psv.operatingTempF, 1) + ' ' + h.t('units.degF') : '—' })],
      ['psv.backPressure', h.ui.el('span', { class: 'num', text: psv.backPressurePsig != null ? fmtNum(psv.backPressurePsig, 1) + ' ' + h.t('units.psig') : '—' })],
      ['psv.lastTest', h.ui.el('span', { text: psv.lastTestDate ? fmtDate(psv.lastTestDate, { dateStyle: 'short' }) : '—' })],
      ['psv.nextTest', h.ui.el('span', { text: psv.nextTestDate ? fmtDate(psv.nextTestDate, { dateStyle: 'short' }) : '—' })],
      ['psv.statusOk', statusBadge(h, psv.status)],
      ['psv.certified', h.ui.el('span', { class: 'num', text: psv.certifiedCapacity != null ? fmtNum(psv.certifiedCapacity, 1) : '—' })]
    ]));
    if (psv.notes) { summary.appendChild(h.ui.el('p', { text: psv.notes })); }
    frag.appendChild(summary);

    // API 576 Inspection history (faceplate panel)
    var inspPanel = buildInspHistory(h, psv);
    frag.appendChild(inspPanel);

    // Sizing.
    var sizing = card(h, 'psv.sizingTitle');
    sizing.appendChild(buildSizing(h, psv));
    frag.appendChild(sizing);

    return frag;
  }

  // ---- Registry -----------------------------------------------------------------

  function renderList(h, container) {
    h.repos.psvs.list().then(function (psvs) {
      if (!container.isConnected) { return; }
      var existingTags = (psvs || []).map(function (p) { return p.tag; });
      container.textContent = '';
      container.appendChild(buildList(h, psvs, existingTags));
    }).catch(function (err) {
      container.textContent = '';
      container.appendChild(errorNode(h, err));
    });
  }

  function buildList(h, psvs, existingTags) {
    var frag = document.createDocumentFragment();

    var header = h.ui.el('div', { class: 'page-header' });
    header.appendChild(h.ui.el('h1', { text: h.t('psv.title') }));
    var actions = h.ui.el('div', { class: 'actions' });
    actions.appendChild(h.ui.el('button', { class: 'btn btn-primary', on: { click: function () { openPsvForm(h, null, existingTags, null); } } }, h.ui.icon('plus', 18), h.ui.el('span', { text: h.t('psv.newPsv') })));
    header.appendChild(actions);
    frag.appendChild(header);

    var state = { q: '', type: '', status: '' };

    var filters = h.ui.el('div', { class: 'filter-bar' });
    var searchId = 'psv-search';
    var searchWrap = h.ui.el('div', { class: 'field filter-field' });
    searchWrap.appendChild(h.ui.el('label', { class: 'visually-hidden', attrs: { for: searchId }, text: h.t('common.search') }));
    var searchInput = h.ui.el('input', { class: 'input', attrs: { id: searchId, type: 'search', placeholder: h.t('common.search') } });
    searchWrap.appendChild(searchInput);
    filters.appendChild(searchWrap);

    function makeSelect(labelKey, options, onValue) {
      var wrap = h.ui.el('div', { class: 'field filter-field' });
      var selId = 'psv-filter-' + labelKey.replace(/[^A-Za-z0-9]/g, '');
      wrap.appendChild(h.ui.el('label', { class: 'field-label', attrs: { for: selId }, text: h.t(labelKey) }));
      var sel = h.ui.el('select', { class: 'select', attrs: { id: selId }, on: { change: function () { onValue(sel.value); } } });
      options.forEach(function (o) {
        var opt = h.ui.el('option', { attrs: { value: o.value } });
        opt.textContent = o.labelKey ? h.t(o.labelKey) : (o.label !== undefined ? o.label : String(o.value));
        sel.appendChild(opt);
      });
      wrap.appendChild(sel);
      return wrap;
    }

    var typeSel = makeSelect('psv.valveType', [
      { value: '', labelKey: 'common.all' },
      { value: 'conventional', labelKey: 'psv.types.conventional' },
      { value: 'balanced', labelKey: 'psv.types.balanced' },
      { value: 'pilot', labelKey: 'psv.types.pilot' }
    ], function (v) { state.type = v; redraw(); });
    filters.appendChild(typeSel);

    var statusSel = makeSelect('common.status', [
      { value: '', labelKey: 'common.all' },
      { value: 'ok', labelKey: 'common.ok' },
      { value: 'due', labelKey: 'common.due' },
      { value: 'overdue', labelKey: 'common.overdue' }
    ], function (v) { state.status = v; redraw(); });
    filters.appendChild(statusSel);

    filters.appendChild(h.ui.el('button', { class: 'btn btn-ghost', on: { click: function () { state.q = ''; state.type = ''; state.status = ''; searchInput.value = ''; typeSel.querySelector('select').value = ''; statusSel.querySelector('select').value = ''; redraw(); } } }, h.ui.icon('close', 18), h.ui.el('span', { text: h.t('common.clear') })));

    frag.appendChild(filters);

    var tableHost = h.ui.el('div');
    frag.appendChild(tableHost);

    searchInput.addEventListener('input', function () { state.q = searchInput.value; redraw(); });

    function filtered() {
      return (psvs || []).filter(function (p) {
        if (state.type && p.valveType !== state.type) { return false; }
        if (state.status && p.status !== state.status) { return false; }
        if (state.q) {
          var q = state.q.toLowerCase();
          var hay = ((p.tag || '') + ' ' + (p.location || '')).toLowerCase();
          if (hay.indexOf(q) === -1) { return false; }
        }
        return true;
      });
    }

    function rowActions(p) {
      var wrap = h.ui.el('div', { class: 'row' });
      wrap.appendChild(h.ui.el('a', { class: 'btn btn-ghost touch', attrs: { href: '#/psv/' + encodeURIComponent(p.id), 'aria-label': h.t('common.edit') }, on: { click: function (ev) { ev.preventDefault(); h.navigate('#/psv/' + encodeURIComponent(p.id)); } } }, h.ui.icon('edit', 18)));
      wrap.appendChild(h.ui.el('button', { class: 'btn btn-ghost touch', attrs: { 'aria-label': h.t('common.delete') }, on: { click: function () { deletePsv(h, p); } } }, h.ui.icon('trash', 18)));
      return wrap;
    }

    function redraw() {
      tableHost.textContent = '';
      var rows = filtered().map(function (p) {
        return {
          id: p.id, tag: p.tag, valveType: p.valveType, fluid: fluidName(h, p),
          setPressurePsig: p.setPressurePsig, status: p.status,
          orifice: p.orificeLetter || '', nextTest: p.nextTestDate, _p: p
        };
      });
      tableHost.appendChild(h.ui.table({
        captionKey: 'psv.registry',
        emptyKey: 'common.empty',
        columns: [
          { key: 'tag', labelKey: 'psv.tag', render: function (v, row) {
              var S = root.IW && root.IW.symbols;
              var state = row.status === 'overdue' || row.status === 'expired' ? 'crit'
                        : row.status === 'dueSoon' ? 'warn' : 'ok';
              var sym = (S && typeof S.node === 'function')
                ? S.node('psv', { size: 18, state: state, title: v })
                : null;
              var link = h.ui.el('a', { class: 'row-link', attrs: { href: '#/psv/' + encodeURIComponent(row.id) }, on: { click: function (ev) { ev.preventDefault(); h.navigate('#/psv/' + encodeURIComponent(row.id)); } }, text: v });
              return h.ui.el('span', { class: 'sym-cell' }, sym || document.createTextNode(''), link);
            } },
          { key: 'valveType', labelKey: 'psv.valveType', render: function (v) { return v ? h.t('psv.types.' + v) : ''; } },
          { key: 'fluid', labelKey: 'psv.fluid' },
          { key: 'setPressurePsig', labelKey: 'psv.setPressure', align: 'num', render: function (v) { return v != null ? fmtNum(v, 1) : '—'; } },
          { key: 'status', labelKey: 'common.status', render: function (v) { return statusBadge(h, v); } },
          { key: 'orifice', labelKey: 'psv.selectedOrifice', render: function (v) { return v || '—'; } },
          { key: 'nextTest', labelKey: 'psv.nextTest', render: function (v) { return v ? fmtDate(v, { dateStyle: 'short' }) : '—'; } },
          { key: '_actions', labelKey: 'common.actions', render: function (v, row) { return rowActions(row._p); } }
        ],
        rows: rows
      }));
    }

    redraw();
    return frag;
  }

  // ---- Live subscriptions -------------------------------------------------------

  var _live = null;

  function disposeLive() {
    if (_live) {
      _live.dead = true;
      (_live.offs || []).forEach(function (off) { try { off(); } catch (e) { /* ignore */ } });
      _live.offs = [];
      _live = null;
    }
  }

  function subscribe(h, live, evt, fn) {
    if (!h.bus || typeof h.bus.on !== 'function') { return; }
    var off = h.bus.on(evt, function (payload) {
      if (live.dead) { return; }
      fn(payload);
    });
    live.offs.push(off);
  }

  return {
    id: 'psv',
    titleKey: 'nav.psv',
    icon: 'valve',
    render: function (container, ctx) {
      if (typeof document === 'undefined' || !container) { return Promise.resolve(); }
      var ui = root.IW.ui;
      var t = ctx.i18n || function (k) { return k; };
      var repos = ctx.repos;
      var bus = ctx.bus;
      var navigate = ctx.navigate || function (hash) { if (typeof location !== 'undefined') { location.hash = hash; } };
      var id = ctx.params && ctx.params.id ? decodeURIComponent(ctx.params.id) : null;

      var h = { t: t, ui: ui, repos: repos, bus: bus, navigate: navigate, container: container };

      disposeLive();
      var live = { dead: false, offs: [] };
      _live = live;

      container.textContent = '';
      container.appendChild(loadingNode(h));

      function reload() {
        if (live.dead || !container.isConnected) { return Promise.resolve(); }
        var currentId = ctx.params && ctx.params.id ? decodeURIComponent(ctx.params.id) : null;
        container.textContent = '';
        container.appendChild(loadingNode(h));
        if (currentId) { return renderDetail(h, container, currentId); }
        return renderList(h, container);
      }

      subscribe(h, live, 'route:changed', function (d) {
        if (!d || d.viewId !== 'psv') { disposeLive(); }
      });
      subscribe(h, live, 'data:changed:psvs', reload);

      if (id) { return renderDetail(h, container, id); }
      return renderList(h, container);
    }
  };
});
