/* IntegrityWatch Field — corrosion view
   Monitoring point registry, detail fichas, readings, coupons and screening panels. */
(function (root, factory) {
  'use strict';
  var api = factory(root);
  root.IW = root.IW || {};
  root.IW.views = root.IW.views || {};
  root.IW.views.corrosion = api;
  if (typeof module === 'object' && module.exports) { module.exports = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  function i18nApi() { return root.IW.i18n; }
  function corrosion() { return root.IW.calc && root.IW.calc.corrosion; }
  function remainingLife() { return root.IW.calc && root.IW.calc.remainingLife; }
  function spc() { return root.IW.calc && root.IW.calc.spc; }
  function materials() { return root.IW.data && root.IW.data.materials; }
  function lock() { return root.IW.security && root.IW.security.lock; }
  function permissions() { return root.IW.security && root.IW.security.permissions; }
  function guardFor(meta) {
    var perm = permissions();
    return (perm && typeof perm.guard === 'function') ? perm.guard(meta) : null;
  }
  function requirePerm(meta, action) {
    var g = guardFor(meta);
    return g ? g.require(action) : Promise.resolve(true);
  }
  function stampRec(meta, rec, existing) {
    var perm = permissions();
    return (perm && typeof perm.stamp === 'function') ? perm.stamp(meta, rec, existing) : Promise.resolve(rec);
  }
  function isForbidden(err) {
    return !!(err && err.code === 'E_FORBIDDEN');
  }

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

  function materialById(id) {
    var m = materials();
    return (m && typeof m.byId === 'function') ? m.byId(id) : null;
  }

  function materialsList() {
    var m = materials();
    return (m && typeof m.list === 'function') ? m.list() : [];
  }

  function numOrUndef(v) { return (v === null || v === undefined || v === '') ? undefined : v; }

  // Custom form builder with per-field validators, reactive inline errors and
  // aria-invalid wiring (superset of IW.ui.form for engineering validation).
  function buildForm(h, fields, values, idPrefix) {
    values = values || {};
    var prefix = idPrefix ? String(idPrefix) + '-' : 'cf-';
    var node = h.ui.el('form', { class: 'form', attrs: { novalidate: '' } });
    var state = {};

    fields.forEach(function (f) {
      var value = values[f.name] !== undefined && values[f.name] !== null ? values[f.name] : (f.value !== undefined && f.value !== null ? f.value : '');
      var fieldId = prefix + String(f.name).replace(/[^A-Za-z0-9_-]/g, '_');
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

  function sevBadge(h, level) { return h.ui.severityBadge(level); }

  function classifyMpy(v) {
    var c = corrosion();
    if (c && typeof c.classifySp0775 === 'function') { return c.classifySp0775(v); }
    if (v == null) { return 'low'; }
    if (v < 1) { return 'low'; }
    if (v < 5) { return 'moderate'; }
    if (v < 10) { return 'high'; }
    return 'severe';
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

  // ---- Monitoring point form --------------------------------------------------

  function mpForm(h, existing, existingCodes) {
    var sensorOptions = ['couponGravimetric', 'erProbe', 'lprProbe', 'h2Probe', 'utInspection', 'visual'].map(function (s) {
      return { value: s, labelKey: 'corrosion.sensorTypes.' + s };
    });
    var materialOptions = materialsList().map(function (m) { return { value: m.id, label: m.name }; });
    var sectorOptions = ['upstream', 'midstream', 'downstream'].map(function (s) { return { value: s, labelKey: 'common.' + s }; });

    var p = (existing && existing.process) || {};
    var cp = (existing && existing.cp) || {};
    var cui = (existing && existing.cui) || {};

    var fields = [
      { name: 'code', labelKey: 'corrosion.pointCode', type: 'text', required: true,
        validate: function (val) {
          if (val && String(val).trim()) {
            var code = String(val).trim();
            var self = existing ? existing.code : '';
            if (code !== self && existingCodes.indexOf(code) !== -1) { return 'corrosion.codeDuplicate'; }
          }
          return null;
        } },
      { name: 'name', labelKey: 'corrosion.pointName', type: 'text' },
      { name: 'sector', labelKey: 'common.sector', type: 'select', options: sectorOptions, required: true },
      { name: 'systemId', labelKey: 'corrosion.system', type: 'text' },
      { name: 'line', labelKey: 'corrosion.line', type: 'text' },
      { name: 'material', labelKey: 'corrosion.material', type: 'select', options: materialOptions, required: true },
      { name: 'sensorType', labelKey: 'corrosion.sensorType', type: 'select', options: sensorOptions, required: true },
      { name: 'tNom', labelKey: 'corrosion.tNom', type: 'number', min: 0 },
      { name: 'tMin', labelKey: 'corrosion.tMin', hint: 'corrosion.tMinHint', type: 'number', min: 0 },
      { name: 'h2sPpm', labelKey: 'corrosion.h2s', type: 'number', min: 0 },
      { name: 'co2Ppm', labelKey: 'corrosion.co2', type: 'number', min: 0 },
      { name: 'totalPressureKpa', labelKey: 'corrosion.totalPressure', type: 'number', min: 0 },
      { name: 'tempC', labelKey: 'corrosion.temperature', type: 'number' },
      { name: 'bswPct', labelKey: 'corrosion.bsw', type: 'number', min: 0, max: 100 },
      { name: 'velocityMs', labelKey: 'corrosion.velocity', type: 'number', min: 0 },
      { name: 'inhibitorTargetPpm', labelKey: 'corrosion.inhibitorTarget', type: 'number', min: 0 },
      { name: 'inhibitorResidualPpm', labelKey: 'corrosion.inhibitorResidual', type: 'number', min: 0 },
      { name: 'cpEnabled', labelKey: 'corrosion.cpTitle', type: 'checkbox' },
      { name: 'cpPotential', labelKey: 'corrosion.cpPotential', type: 'number' },
      { name: 'cpPolarization', labelKey: 'corrosion.cpPolarization', type: 'number' },
      { name: 'cuiInsulated', labelKey: 'corrosion.insulated', type: 'checkbox' },
      { name: 'cuiJacketType', labelKey: 'corrosion.jacketType', type: 'text' },
      { name: 'cuiLastInsp', labelKey: 'corrosion.lastCuiInspection', type: 'date' },
      { name: 'stationKm', labelKey: 'corrosion.stationKm', type: 'number', min: 0 },
      { name: 'location', labelKey: 'corrosion.location', type: 'text' },
      { name: 'notes', labelKey: 'common.notes', type: 'textarea' }
    ];

    var values = {
      code: existing ? existing.code : '',
      name: existing ? existing.name : '',
      sector: existing ? existing.sector : (h.sector && h.sector !== 'all' ? h.sector : 'upstream'),
      systemId: existing ? existing.systemId : '',
      line: existing ? existing.line : '',
      material: existing ? existing.material : '',
      sensorType: existing ? existing.sensorType : 'couponGravimetric',
      tNom: existing && existing.tNom != null ? existing.tNom : '',
      tMin: existing && existing.tMin != null ? existing.tMin : '',
      h2sPpm: p.h2sPpm != null ? p.h2sPpm : '',
      co2Ppm: p.co2Ppm != null ? p.co2Ppm : '',
      totalPressureKpa: p.totalPressureKpa != null ? p.totalPressureKpa : '',
      tempC: p.tempC != null ? p.tempC : '',
      bswPct: p.bswPct != null ? p.bswPct : '',
      velocityMs: p.velocityMs != null ? p.velocityMs : '',
      inhibitorTargetPpm: p.inhibitorTargetPpm != null ? p.inhibitorTargetPpm : '',
      inhibitorResidualPpm: p.inhibitorResidualPpm != null ? p.inhibitorResidualPpm : '',
      cpEnabled: !!cp.enabled,
      cpPotential: cp.potentialMvCse != null ? cp.potentialMvCse : '',
      cpPolarization: cp.polarizationMv != null ? cp.polarizationMv : '',
      cuiInsulated: !!cui.insulated,
      cuiJacketType: cui.jacketType || '',
      cuiLastInsp: cui.lastInspISO ? cui.lastInspISO.slice(0, 10) : '',
      stationKm: existing && existing.stationKm != null ? existing.stationKm : '',
      location: existing ? existing.location : '',
      notes: existing ? existing.notes : ''
    };

    return { fields: fields, values: values };
  }

  function assembleMp(existing, vals) {
    var rec = existing ? copy(existing) : {};
    rec.code = String(vals.code || '').trim();
    rec.name = vals.name || rec.code;
    rec.sector = vals.sector;
    rec.systemId = vals.systemId ? String(vals.systemId).trim() : undefined;
    rec.line = vals.line ? String(vals.line).trim() : undefined;
    rec.material = vals.material;
    rec.sensorType = vals.sensorType;
    rec.tNom = numOrUndef(vals.tNom);
    rec.tMin = numOrUndef(vals.tMin);
    rec.process = {
      h2sPpm: numOrUndef(vals.h2sPpm),
      co2Ppm: numOrUndef(vals.co2Ppm),
      totalPressureKpa: numOrUndef(vals.totalPressureKpa),
      tempC: numOrUndef(vals.tempC),
      bswPct: numOrUndef(vals.bswPct),
      velocityMs: numOrUndef(vals.velocityMs),
      inhibitorTargetPpm: numOrUndef(vals.inhibitorTargetPpm),
      inhibitorResidualPpm: numOrUndef(vals.inhibitorResidualPpm)
    };
    rec.cp = {
      enabled: !!vals.cpEnabled,
      potentialMvCse: numOrUndef(vals.cpPotential),
      polarizationMv: numOrUndef(vals.cpPolarization)
    };
    rec.cui = { insulated: !!vals.cuiInsulated };
    if (vals.cuiJacketType) { rec.cui.jacketType = String(vals.cuiJacketType).trim(); }
    if (vals.cuiLastInsp) { rec.cui.lastInspISO = new Date(vals.cuiLastInsp + 'T00:00:00Z').toISOString(); }
    rec.stationKm = numOrUndef(vals.stationKm);
    rec.location = vals.location ? String(vals.location).trim() : undefined;
    rec.notes = vals.notes ? String(vals.notes).trim() : undefined;
    if (!existing) { rec.id = rec.code; }
    return rec;
  }

  function openMpForm(h, existing, existingCodes, onDone) {
    var def = mpForm(h, existing, existingCodes);
    var form = buildForm(h, def.fields, def.values);
    var dlg = h.ui.dialog({
      titleKey: existing ? 'corrosion.editPoint' : 'corrosion.newPoint',
      bodyNode: form.node,
      actions: [
        { labelKey: 'common.cancel', kind: 'ghost', onClick: function () { return true; } },
        { labelKey: 'common.save', kind: 'primary', onClick: function () {
            if (!form.validate()) { return false; }
            var rec = assembleMp(existing, form.getValues());
            requirePerm(h.repos.meta, 'assetWrite').then(function () {
              return stampRec(h.repos.meta, rec, existing);
            }).then(function (stamped) {
              return h.repos.monitoringPoints.save(stamped);
            }).then(function () {
              dlg.close();
              if (onDone) { onDone(rec); }
            }).catch(function (err) {
              if (h.ui && typeof h.ui.toast === 'function') {
                h.ui.toast(h.t(isForbidden(err) ? 'security.forbidden' : 'common.error'), { severity: isForbidden(err) ? 'warning' : 'critical' });
              }
            });
            return false;
          } }
      ]
    });
  }

  function deleteMp(h, mp, onDeleted) {
    h.ui.confirmDialog({ titleKey: 'common.delete', bodyKey: 'corrosion.deletePointConfirm', danger: true }).then(function (ok) {
      if (!ok) { return; }
      requirePerm(h.repos.meta, 'delete').then(function () {
        return doRemove();
      }).catch(function (err) {
        if (h.ui && typeof h.ui.toast === 'function') {
          h.ui.toast(h.t(isForbidden(err) ? 'security.forbidden' : 'common.error'), { severity: isForbidden(err) ? 'warning' : 'critical' });
        }
      });

      function doRemove() {
        return h.repos.monitoringPoints.remove(mp.id).then(function () {
          if (onDeleted) { onDeleted(); }
        }).catch(function (err) {
          if (h.ui && typeof h.ui.toast === 'function') { h.ui.toast(h.t('common.error'), { severity: 'critical' }); }
        });
      }
    });
  }

  // ---- Readings ---------------------------------------------------------------

  function readingForm(h, mpId, onDone) {
    var today = new Date().toISOString().slice(0, 10);
    var fields = [
      { name: 'date', labelKey: 'common.date', type: 'date', required: true },
      { name: 'crMpy', labelKey: 'corrosion.crMpy', type: 'number', required: true, min: 0 },
      { name: 'note', labelKey: 'common.note', type: 'text' }
    ];
    var form = buildForm(h, fields, { date: today, crMpy: '', note: '' });
    var dlg = h.ui.dialog({
      titleKey: 'corrosion.newReading',
      bodyNode: form.node,
      actions: [
        { labelKey: 'common.cancel', kind: 'ghost', onClick: function () { return true; } },
        { labelKey: 'common.save', kind: 'primary', onClick: function () {
            if (!form.validate()) { return false; }
            var v = form.getValues();
            var rec = {
              id: 'R-' + Date.now().toString(36).toUpperCase(),
              mpId: mpId,
              date: v.date ? new Date(v.date + 'T00:00:00Z').toISOString() : new Date().toISOString(),
              crMpy: Number(v.crMpy),
              source: 'manual',
              note: v.note || undefined
            };
            requirePerm(h.repos.meta, 'fieldEntry').then(function () {
              return stampRec(h.repos.meta, rec, null);
            }).then(function (stamped) {
              return h.repos.readings.save(stamped);
            }).then(function () {
              dlg.close();
              if (onDone) { onDone(); }
            }).catch(function (err) {
              if (h.ui && typeof h.ui.toast === 'function') {
                h.ui.toast(h.t(isForbidden(err) ? 'security.forbidden' : 'common.error'), { severity: isForbidden(err) ? 'warning' : 'critical' });
              }
            });
            return false;
          } }
      ]
    });
  }

  function trendChartNode(h, readings) {
    return h.ui.trendChart({
      points: readings.map(function (r) { return { date: r.date, crMpy: r.crMpy }; }),
      width: 960,
      height: 180,
      thresholds: [
        { v: 5, label: h.t('corrosion.eiBands.acceptable') },
        { v: 10, label: h.t('severity.severe') }
      ],
      titleKey: 'corrosion.trend'
    }).node;
  }

  // ---- Coupons ------------------------------------------------------------------

  function couponFields(h) {
    var materialOptions = materialsList().map(function (m) { return { value: m.id, label: m.name }; });
    return [
      { name: 'role', labelKey: 'corrosion.couponRole', type: 'select', required: true,
        options: [{ value: 'blank', labelKey: 'corrosion.blank' }, { value: 'inhibited', labelKey: 'corrosion.inhibited' }] },
      { name: 'pairId', labelKey: 'corrosion.pair', type: 'text' },
      { name: 'material', labelKey: 'corrosion.material', type: 'select', options: materialOptions, required: true },
      { name: 'densityGcm3', labelKey: 'corrosion.density', type: 'number', required: true, min: 0 },
      { name: 'wiMg', labelKey: 'corrosion.initialWeight', type: 'number', required: true, min: 0 },
      { name: 'wfMg', labelKey: 'corrosion.finalWeight', type: 'number', required: true, min: 0,
        validate: function (val, all) {
          if (val != null && all.wiMg != null && val > all.wiMg) { return 'corrosion.wfGtWi'; }
          return null;
        } },
      { name: 'areaIn2', labelKey: 'corrosion.area', type: 'number', required: true, min: 0 },
      { name: 'days', labelKey: 'corrosion.exposureDays', type: 'number', required: true, min: 0 },
      { name: 'startDate', labelKey: 'corrosion.startDate', type: 'date' },
      { name: 'endDate', labelKey: 'corrosion.endDate', type: 'date' }
    ];
  }

  function openCouponForm(h, mpId, onDone, existing) {
    var corr = corrosion();
    var values = { role: 'blank' };
    if (existing) {
      var materialOk = existing.material && materialById(existing.material);
      values = {
        role: existing.role || 'blank',
        pairId: existing.pairId || '',
        material: materialOk ? existing.material : 'api5l-gr-b',
        densityGcm3: existing.densityGcm3,
        wiMg: existing.wiMg,
        wfMg: existing.wfMg,
        areaIn2: existing.areaIn2,
        days: existing.days,
        startDate: existing.startDate || '',
        endDate: existing.endDate || ''
      };
    }
    var form = buildForm(h, couponFields(h), values);
    var resultWrap = h.ui.el('div', { class: 'coupon-live' });

    function updateLive() {
      resultWrap.textContent = '';
      var v = form.getValues();
      if (v.material) {
        var m = materialById(v.material);
        var densityCtrl = form.getControl('densityGcm3');
        if (m && densityCtrl && (v.densityGcm3 == null || isNaN(Number(v.densityGcm3)))) {
          densityCtrl.value = String(m.densityGcm3);
          v.densityGcm3 = m.densityGcm3;
        }
      }
      if (v.wiMg != null && v.wfMg != null && v.areaIn2 != null && v.days != null && v.densityGcm3 != null && corr) {
        try {
          var r = corr.crFromWeightLoss({ deltaWmg: v.wiMg - v.wfMg, densityGcm3: Number(v.densityGcm3), areaIn2: Number(v.areaIn2), days: Number(v.days) });
          var sev = corr.classifySp0775(r.mpy);
          resultWrap.appendChild(h.ui.el('span', { class: 'field-label', text: h.t('corrosion.crResult') + ': ' }));
          resultWrap.appendChild(h.ui.el('span', { class: 'num', text: fmtNum(r.mpy, 3) + ' ' + h.t('units.mpy') }));
          resultWrap.appendChild(h.ui.el('span', { text: ' ' }));
          resultWrap.appendChild(sevBadge(h, sev));
        } catch (e) { /* incomplete input */ }
      }
    }

    ['material', 'densityGcm3', 'wiMg', 'wfMg', 'areaIn2', 'days'].forEach(function (name) {
      var c = form.getControl(name);
      if (c) { c.addEventListener('input', updateLive); }
    });

    var body = h.ui.el('div', { class: 'stack' }, form.node, resultWrap);
    var dlg = h.ui.dialog({
      titleKey: existing ? 'common.edit' : 'corrosion.newCoupon',
      bodyNode: body,
      actions: [
        { labelKey: 'common.cancel', kind: 'ghost', onClick: function () { return true; } },
        { labelKey: 'common.save', kind: 'primary', onClick: function () {
            if (!form.validate()) { return false; }
            var v = form.getValues();
            var rec;
            if (existing) {
              rec = {
                id: existing.id,
                createdAt: existing.createdAt,
                mpId: existing.mpId,
                pairId: v.pairId ? String(v.pairId).trim() : undefined,
                role: v.role,
                material: v.material,
                densityGcm3: Number(v.densityGcm3),
                wiMg: Number(v.wiMg),
                wfMg: Number(v.wfMg),
                areaIn2: Number(v.areaIn2),
                days: Number(v.days),
                startDate: v.startDate || undefined,
                endDate: v.endDate || undefined,
                exposedHours: Number(v.days) * 24,
                crMpy: existing.crMpy,
                status: existing.status || 'active'
              };
              if (existing.note) { rec.note = existing.note; }
            } else {
              rec = {
                id: 'C-' + Date.now().toString(36).toUpperCase(),
                mpId: mpId,
                pairId: v.pairId ? String(v.pairId).trim() : undefined,
                role: v.role,
                material: v.material,
                densityGcm3: Number(v.densityGcm3),
                wiMg: Number(v.wiMg),
                wfMg: Number(v.wfMg),
                areaIn2: Number(v.areaIn2),
                days: Number(v.days),
                startDate: v.startDate || undefined,
                endDate: v.endDate || undefined,
                status: 'active'
              };
            }
            requirePerm(h.repos.meta, 'fieldEntry').then(function () {
              return stampRec(h.repos.meta, rec, existing);
            }).then(function (stamped) {
              return h.repos.coupons.save(stamped);
            }).then(function () {
              dlg.close();
              if (onDone) { onDone(); }
            }).catch(function (err) {
              if (h.ui && typeof h.ui.toast === 'function') {
                h.ui.toast(h.t(isForbidden(err) ? 'security.forbidden' : 'common.error'), { severity: isForbidden(err) ? 'warning' : 'critical' });
              }
            });
            return false;
          } }
      ]
    });
  }

  // ---- Screening panels --------------------------------------------------------

  function buildEiPanel(h, coupons) {
    var corr = corrosion();
    var c = card(h, 'corrosion.inhibitorEfficiency');
    var pairs = {};
    (coupons || []).forEach(function (cp) {
      if (!cp.pairId) { return; }
      if (!pairs[cp.pairId]) { pairs[cp.pairId] = {}; }
      pairs[cp.pairId][cp.role || 'blank'] = cp;
    });
    var results = [];
    Object.keys(pairs).forEach(function (pid) {
      var blank = pairs[pid].blank;
      var inh = pairs[pid].inhibited;
      if (blank && blank.crMpy != null && inh && inh.crMpy != null && corr) {
        var ei = corr.inhibitorEfficiency({ crBlankMpy: blank.crMpy, crInhibitedMpy: inh.crMpy });
        results.push({ pairId: pid, ei: ei, band: corr.eiBand(ei) });
      }
    });
    if (!results.length) { c.appendChild(emptyState(h, 'common.none')); return c; }
    results.sort(function (a, b) { return a.ei - b.ei; });
    var ul = h.ui.el('ul', { class: 'plain-list' });
    results.forEach(function (r, i) {
      var li = h.ui.el('li', { class: 'row' });
      li.appendChild(h.ui.el('span', { class: 'pill', text: h.t('corrosion.pair') + ': ' + r.pairId }));
      li.appendChild(h.ui.el('span', { class: 'num', text: fmtNum(r.ei, 1) + ' %' }));
      li.appendChild(sevBadge(h, r.band === 'poor' ? 'severe' : r.band === 'acceptable' ? 'moderate' : r.band === 'good' ? 'high' : 'low'));
      li.appendChild(h.ui.el('span', { class: 'pill', text: h.t('corrosion.eiBands.' + r.band) }));
      if (i === 0) { li.appendChild(h.ui.el('span', { class: 'field-hint', text: h.t('corrosion.eiPoorestNote') })); }
      ul.appendChild(li);
    });
    c.appendChild(ul);
    return c;
  }

  function buildBalance(h, mp) {
    var corr = corrosion();
    var p = mp.process || {};
    var c = card(h, 'corrosion.inhibitorBalance');
    if (p.inhibitorTargetPpm == null || p.inhibitorResidualPpm == null) {
      c.appendChild(emptyState(h, 'common.none'));
      return c;
    }
    try {
      var r = corr.inhibitorBalance({ targetPpm: p.inhibitorTargetPpm, residualPpm: p.inhibitorResidualPpm });
      var row = h.ui.el('div', { class: 'row' });
      row.appendChild(h.ui.el('span', { class: 'num', text: fmtNum(r.pct, 1) + ' %' }));
      row.appendChild(sevBadge(h, r.band === 'onTarget' ? 'low' : r.band === 'over' ? 'moderate' : 'high'));
      row.appendChild(h.ui.el('span', { class: 'pill', text: h.t('corrosion.balanceBands.' + r.band) }));
      c.appendChild(row);
    } catch (e) {
      c.appendChild(emptyState(h, 'common.none'));
    }
    return c;
  }

  function avgRecent(readings, days, nowISO) {
    var now = nowISO ? Date.parse(nowISO) : Date.now();
    var cutoff = now - days * 86400000;
    var vals = [];
    (readings || []).forEach(function (r) {
      var t = Date.parse(r.date);
      if (!isNaN(t) && t >= cutoff && typeof r.crMpy === 'number') { vals.push(r.crMpy); }
    });
    if (!vals.length) { return null; }
    var sum = 0;
    vals.forEach(function (v) { sum += v; });
    return sum / vals.length;
  }

  function buildDwm(h, mp, readings) {
    var corr = corrosion();
    var p = mp.process || {};
    var c = card(h, 'corrosion.dwmTitle');
    if (!p.co2Ppm || !p.totalPressureKpa || typeof p.tempC !== 'number') {
      c.appendChild(emptyState(h, 'common.none'));
      return c;
    }
    try {
      var pCo2Bar = p.totalPressureKpa * p.co2Ppm / 1e6 / 100;
      var model = corr.deWaardMilliams({ tempC: p.tempC, pCo2Bar: pCo2Bar });
      var measured = avgRecent(readings, 7);
      var kv = h.ui.keyValueTable([
        ['corrosion.dwmResult', h.ui.el('span', { class: 'num', text: fmtNum(model.mpy, 2) + ' ' + h.t('units.mpy') })],
        ['corrosion.dwmNote', h.ui.el('span', { text: h.t('corrosion.dwmNote') })]
      ]);
      c.appendChild(kv);
      if (measured != null) {
        var ratio = measured / model.mpy;
        c.appendChild(h.ui.el('div', { class: 'row' },
          h.ui.el('span', { text: h.t('corrosion.modelRatio') + ': ' }),
          h.ui.el('span', { class: 'num', text: fmtNum(ratio, 2) }),
          h.ui.el('span', { class: 'pill', text: fmtNum(measured, 2) + ' / ' + fmtNum(model.mpy, 2) + ' mpy' })
        ));
      }
    } catch (e) {
      c.appendChild(emptyState(h, 'common.none'));
    }
    return c;
  }

  function buildSour(h, mp) {
    var corr = corrosion();
    var p = mp.process || {};
    var c = card(h, 'corrosion.sourScreening');
    if (!p.h2sPpm || !p.totalPressureKpa) {
      c.appendChild(emptyState(h, 'common.none'));
      return c;
    }
    try {
      var pp = corr.partialPressureH2S({ totalPressureKpa: p.totalPressureKpa, h2sPpm: p.h2sPpm });
      var level = corr.classifyMr0175(pp.kpa);
      var kv = h.ui.keyValueTable([
        ['corrosion.ph2s', h.ui.el('span', { class: 'num', text: fmtNum(pp.kpa, 4) + ' kPa' })],
        ['corrosion.mr0175Ref', h.ui.el('span', { class: 'pill', text: h.t('corrosion.mr0175.' + level) })]
      ]);
      c.appendChild(kv);
      c.appendChild(h.ui.el('p', { class: 'field-hint', text: h.t('corrosion.screeningNote') }));
    } catch (e) {
      c.appendChild(emptyState(h, 'common.none'));
    }
    return c;
  }

  function buildCp(h, mp) {
    var corr = corrosion();
    var cp = mp.cp || {};
    var c = card(h, 'corrosion.cpTitle');
    if (!cp.enabled) {
      c.appendChild(h.ui.el('p', { class: 'field-hint', text: h.t('common.none') }));
      return c;
    }
    var r = corr.cpEvaluate({ potentialMvCse: cp.potentialMvCse, polarizationMv: cp.polarizationMv });
    var sev = r.status === 'pass' ? 'low' : r.status === 'fail' ? 'severe' : 'moderate';
    c.appendChild(h.ui.el('div', { class: 'row' },
      sevBadge(h, sev),
      h.ui.el('span', { class: 'pill', text: h.t('corrosion.cpStatus.' + r.status) })
    ));
    if (r.criteria && r.criteria.length) {
      var ul = h.ui.el('ul', { class: 'plain-list' });
      r.criteria.forEach(function (crit) { ul.appendChild(h.ui.el('li', { text: crit })); });
      c.appendChild(ul);
    }
    return c;
  }

  function buildCui(h, mp) {
    var cui = mp.cui || {};
    var c = card(h, 'corrosion.cuiTitle');
    var kv = h.ui.keyValueTable([
      ['corrosion.insulated', h.ui.el('span', { text: cui.insulated ? h.t('common.yes') : h.t('common.no') })],
      ['corrosion.jacketType', h.ui.el('span', { text: cui.jacketType || '—' })],
      ['corrosion.lastCuiInspection', h.ui.el('span', { text: cui.lastInspISO ? fmtDate(cui.lastInspISO, { dateStyle: 'short' }) : '—' })]
    ]);
    c.appendChild(kv);
    return c;
  }

  function norsok506mod() { return root.IW.calc && root.IW.calc.norsok506; }
  function cui583mod() { return root.IW.calc && root.IW.calc.cui583; }
  function micMod() { return root.IW.calc && root.IW.calc.mic; }
  function unitsMod() { return root.IW.calc && root.IW.calc.units; }

  function classifyMpyFromMMYear(mmYear) {
    var u = unitsMod();
    var mpy = u && typeof u.mmYearToMpy === 'function' ? u.mmYearToMpy(mmYear) : mmYear * 39.37;
    return classifyMpy(mpy);
  }

  function ledBadge(h, level) {
    var cls = 'led';
    if (level === 'low' || level === 'none') { cls += ' led--ok'; }
    else if (level === 'moderate') { cls += ' led--warn'; }
    else if (level === 'high') { cls += ' led--crit-blink'; }
    else if (level === 'critical' || level === 'severe') { cls += ' led--crit'; }
    return h.ui.el('span', { class: cls, attrs: { 'aria-hidden': 'true', role: 'img' } });
  }

  function buildAdvancedCorrosion(h, mp) {
    var section = card(h, 'corrosion.advancedTitle');
    var saved = (mp.advanced && typeof mp.advanced === 'object') ? mp.advanced : {};

    // ---- NORSOK M-506 panel ----
    var norsokPanel = card(h, 'norsok.title');
    var norsokSaved = saved.norsok || {};
    var norsokResult = h.ui.el('div', { class: 'norsok-result' });

    function renderNorsokResult(inputValues) {
      norsokResult.textContent = '';
      var mod = norsok506mod();
      if (!mod || typeof mod.computeCR !== 'function') {
        norsokResult.appendChild(h.ui.el('p', { class: 'field-hint', text: h.t('common.moduleLoading') }));
        return;
      }
      try {
        var r = mod.computeCR(inputValues);
        if (!r.ok) {
          r.errors.forEach(function (e) {
            var key = 'norsok.error.' + e;
            var text = h.t(key);
            norsokResult.appendChild(h.ui.el('p', { class: 'field-error', text: (text && text !== key) ? text : e }));
          });
          return;
        }
        var row = h.ui.el('div', { class: 'row' });
        row.appendChild(ledBadge(h, classifyMpyFromMMYear(r.crMMPerYear)));
        row.appendChild(h.ui.el('span', { class: 'num', text: fmtNum(r.crMMPerYear, 4) + ' mm/y' }));

        var sev = classifyMpyFromMMYear(r.crMMPerYear);
        row.appendChild(h.ui.severityBadge(sev));
        norsokResult.appendChild(row);

        // Breakdown table
        var t = r.terms;
        var breakdown = h.ui.keyValueTable([
          ['norsok.breakdown.kt', h.ui.el('span', { class: 'num', text: fmtNum(t.kt, 3) })],
          ['norsok.breakdown.fph', h.ui.el('span', { class: 'num', text: fmtNum(t.fPH, 4) })],
          ['norsok.breakdown.fco2', h.ui.el('span', { class: 'num', text: fmtNum(t.fugacityBar, 4) + ' bar' })],
          ['norsok.breakdown.shear', h.ui.el('span', { class: 'num', text: fmtNum(t.shearPa, 1) + ' Pa (' + t.shearMode + ')' })],
          ['norsok.breakdown.exponent', h.ui.el('span', { class: 'num', text: fmtNum(t.exponent, 5) })],
          ['norsok.breakdown.reduction', h.ui.el('span', { class: 'num', text: fmtNum(t.reductionFactor, 4) + ' (' + t.reductionSource + ')' })]
        ]);
        norsokResult.appendChild(breakdown);

        // Warnings
        if (r.warnings && r.warnings.length) {
          var wDiv = h.ui.el('div', { class: 'field-hint' });
          r.warnings.forEach(function (w) {
            var key = 'norsok.warn.' + w;
            wDiv.appendChild(h.ui.el('p', { text: h.t(key) }));
          });
          norsokResult.appendChild(wDiv);
        }
      } catch (err) {
        norsokResult.appendChild(h.ui.el('p', { class: 'field-error', text: String(err) }));
      }
    }

    // Build NOROK form inline
    var nFields = [];
    function addNF(name, labelKey, type, def) {
      nFields.push({ name: name, labelKey: labelKey, type: type || 'number', value: def || '' });
    }
    var ns = norsokSaved.inputs || {};
    addNF('temperatureC', 'norsok.inputs.temp', 'number', ns.temperatureC != null ? ns.temperatureC : 20);
    addNF('totalPressureBar', 'norsok.inputs.pressure', 'number', ns.totalPressureBar != null ? ns.totalPressureBar : 1);
    addNF('co2MolePercent', 'norsok.inputs.co2', 'number', ns.co2MolePercent != null ? ns.co2MolePercent : 10);
    addNF('ph', 'norsok.inputs.ph', 'number', ns.ph != null ? ns.ph : 4);
    addNF('wallShearPa', 'norsok.inputs.shear', 'number', ns.wallShearPa);
    addNF('flowVelocityMs', 'norsok.inputs.velocity', 'number', ns.flowVelocityMs);
    addNF('pipeIDmm', 'norsok.inputs.diameter', 'number', ns.pipeIDmm);
    addNF('liquidDensityKgM3', 'norsok.inputs.density', 'number', ns.liquidDensityKgM3);
    addNF('liquidViscositymPaS', 'norsok.inputs.viscosity', 'number', ns.liquidViscositymPaS);
    addNF('glycolWtPercent', 'norsok.inputs.glycol', 'number', ns.glycolWtPercent != null ? ns.glycolWtPercent : 0);
    addNF('inhibitorEfficiencyPercent', 'norsok.inputs.inhibitor', 'number', ns.inhibitorEfficiencyPercent != null ? ns.inhibitorEfficiencyPercent : 0);

    var nForm = buildForm(h, nFields, {}, 'cf-ns');
    norsokPanel.appendChild(nForm.node);

    if (norsokSaved.inputs) {
      // Recalculate deterministically from the saved inputs so the last
      // result is shown after a reload (no dependence on a stored output).
      var restored = {};
      var src = norsokSaved.inputs;
      Object.keys(src).forEach(function (k) {
        var v = src[k];
        if (v !== null && v !== undefined && v !== '') { restored[k] = (typeof v === 'number') ? v : Number(v); }
      });
      renderNorsokResult(restored);
    }

    var nCalcBtn = h.ui.el('button', { class: 'btn btn-primary', text: h.t('norsok.inputs.calculate'),
      on: { click: function () {
        var vals = nForm.getValues();
        var input = {
          temperatureC: vals.temperatureC, totalPressureBar: vals.totalPressureBar,
          co2MolePercent: vals.co2MolePercent, ph: vals.ph,
          flowVelocityMs: vals.flowVelocityMs, pipeIDmm: vals.pipeIDmm,
          liquidDensityKgM3: vals.liquidDensityKgM3, liquidViscositymPaS: vals.liquidViscositymPaS,
          glycolWtPercent: vals.glycolWtPercent, inhibitorEfficiencyPercent: vals.inhibitorEfficiencyPercent
        };
        if (vals.wallShearPa != null && vals.wallShearPa !== '') { input.wallShearPa = Number(vals.wallShearPa); }
        renderNorsokResult(input);
        norsokResult.scrollIntoView({ behavior: 'smooth' });
      } }
    });
    var nSaveBtn = h.ui.el('button', { class: 'btn', text: h.t('norsok.inputs.save'),
      on: { click: function () {
        if (!mp.advanced) { mp.advanced = {}; }
        if (!mp.advanced.norsok) { mp.advanced.norsok = {}; }
        var vals = nForm.getValues();
        mp.advanced.norsok.inputs = vals;
        var mod = norsok506mod();
        if (mod && typeof mod.computeCR === 'function') {
          try {
            var input = {
              temperatureC: vals.temperatureC, totalPressureBar: vals.totalPressureBar,
              co2MolePercent: vals.co2MolePercent, ph: vals.ph,
              flowVelocityMs: vals.flowVelocityMs, pipeIDmm: vals.pipeIDmm,
              liquidDensityKgM3: vals.liquidDensityKgM3, liquidViscositymPaS: vals.liquidViscositymPaS,
              glycolWtPercent: vals.glycolWtPercent, inhibitorEfficiencyPercent: vals.inhibitorEfficiencyPercent
            };
            if (vals.wallShearPa != null && vals.wallShearPa !== '') { input.wallShearPa = Number(vals.wallShearPa); }
            var result = mod.computeCR(input);
            mp.advanced.norsok.result = result;
            renderNorsokResult(input);
          } catch (e) {}
        }
        requirePerm(h.repos.meta, 'assetWrite').then(function () {
          return stampRec(h.repos.meta, mp, mp);
        }).then(function (stamped) {
          return h.repos.monitoringPoints.save(stamped);
        }).then(function (saved) {
          h.ui.toast(h.t('common.saved'));
        }).catch(function (err) {
          if (h.ui && typeof h.ui.toast === 'function') {
            h.ui.toast(h.t(isForbidden(err) ? 'security.forbidden' : 'common.error'), { severity: isForbidden(err) ? 'warning' : 'critical' });
          }
        });
      } }
    });
    norsokPanel.appendChild(h.ui.el('div', { class: 'actions' }, nCalcBtn, nSaveBtn));
    norsokPanel.appendChild(norsokResult);
    section.appendChild(norsokPanel);

    // ---- CUI panel ----
    var cuiPanel = card(h, 'cui.title');
    var cuiSaved = saved.cui || {};
    var cuiResult = h.ui.el('div', { class: 'cui-result' });

    function renderCuiResult(inputValues) {
      cuiResult.textContent = '';
      var mod = cui583mod();
      if (!mod || typeof mod.assess !== 'function') {
        cuiResult.appendChild(h.ui.el('p', { class: 'field-hint', text: h.t('common.moduleLoading') }));
        return;
      }
      try {
        var r = mod.assess(inputValues);
        var row = h.ui.el('div', { class: 'row' });
        row.appendChild(ledBadge(h, r.riskLevel));
        row.appendChild(h.ui.el('span', { class: 'pill', text: h.t('cui.risk.' + r.riskLevel) }));
        row.appendChild(h.ui.el('span', { class: 'num', text: String(r.likelihoodScore) + '/10' }));
        cuiResult.appendChild(row);

        if (r.methods && r.methods.length) {
          var mDiv = h.ui.el('div', { class: 'field-hint' });
          r.methods.forEach(function (m) { mDiv.appendChild(h.ui.el('p', { text: h.t(m) })); });
          cuiResult.appendChild(mDiv);
        }
        if (r.notes && r.notes.length) {
          r.notes.forEach(function (n) { cuiResult.appendChild(h.ui.el('p', { class: 'field-hint', text: h.t(n) })); });
        }
      } catch (err) {
        cuiResult.appendChild(h.ui.el('p', { class: 'field-error', text: String(err) }));
      }
    }

    // Auto-detect material class
    function detectMaterialClass(materialId) {
      if (!materialId) return 'cs';
      var id = String(materialId).toLowerCase();
      if (id.indexOf('ss-') === 0 || id.indexOf('stainless') >= 0 || id.indexOf('duplex') >= 0 || id.indexOf('super-duplex') >= 0) {
        return 'ss';
      }
      return 'cs';
    }

    var cs = cuiSaved.inputs || {};
    var matClass = cs.materialClass || detectMaterialClass(mp.material);
    var cuiFields = [
      { name: 'materialClass', labelKey: 'cui.inputs.material', type: 'select', options: [{ value: 'cs', labelKey: 'CS' }, { value: 'ss', labelKey: 'SS' }], value: matClass },
      { name: 'operatingTempC', labelKey: 'cui.inputs.temp', type: 'number', value: cs.operatingTempC != null ? cs.operatingTempC : (mp.process && mp.process.tempC != null ? mp.process.tempC : 40) },
      { name: 'insulationType', labelKey: 'cui.inputs.insulation', type: 'select', options: [{ value: 'closed-cell', label: 'Closed-cell' }, { value: 'mineral-wool', label: 'Mineral wool' }, { value: 'calcium-silicate', label: 'Calcium silicate' }, { value: 'none', label: 'None' }], value: cs.insulationType || 'mineral-wool' },
      { name: 'coatingCondition', labelKey: 'cui.inputs.coating', type: 'select', options: [{ value: 'good', label: 'Good' }, { value: 'fair', label: 'Fair' }, { value: 'poor', label: 'Poor' }, { value: 'none', label: 'None' }], value: cs.coatingCondition || 'good' },
      { name: 'environment', labelKey: 'cui.inputs.environment', type: 'select', options: [{ value: 'dry', label: 'Dry' }, { value: 'temperate', label: 'Temperate' }, { value: 'coastal', label: 'Coastal' }, { value: 'marine', label: 'Marine' }], value: cs.environment || 'temperate' }
    ];

    var cuiForm = buildForm(h, cuiFields, {}, 'cf-cui');
    var cuiChecks = h.ui.el('div', { class: 'field-group' });
    function addCheck(name, labelKey, def) {
      var checked = cs[name] !== undefined ? cs[name] : (def || false);
      var cb = h.ui.el('input', { attrs: { type: 'checkbox', id: 'cui-' + name } });
      cb.checked = !!checked;
      var lbl = h.ui.el('label', { class: 'field-label', attrs: { for: 'cui-' + name } }, cb, h.ui.el('span', { text: h.t(labelKey) }));
      cuiChecks.appendChild(lbl);
      cuiChecks.setAttribute('data-' + name, 'true');
    }
    addCheck('penetratingFeatures', 'cui.inputs.penetrating');
    addCheck('cyclicService', 'cui.inputs.cyclic');
    addCheck('steamTraced', 'cui.inputs.steam');

    cuiPanel.appendChild(cuiForm.node);
    cuiPanel.appendChild(cuiChecks);

    if (cuiSaved.inputs) {
      // Recalculate deterministically from the saved inputs so the last
      // result is shown after a reload (no dependence on a stored output).
      renderCuiResult(cuiSaved.inputs);
    } else if (cuiSaved.result) {
      renderCuiResult(cuiSaved.result.inputs || {});
    }

    function readCuiInputs() {
      var vals = cuiForm.getValues();
      var checks = cuiChecks.querySelectorAll('input[type=checkbox]');
      checks.forEach(function (cb) { vals[cb.id.replace('cui-', '')] = cb.checked; });
      // Coerce temp to number
      if (vals.operatingTempC != null) vals.operatingTempC = Number(vals.operatingTempC);
      return vals;
    }

    var cuiCalcBtn = h.ui.el('button', { class: 'btn btn-primary', text: h.t('norsok.inputs.calculate'),
      on: { click: function () {
        var vals = readCuiInputs();
        renderCuiResult(vals);
        cuiResult.scrollIntoView({ behavior: 'smooth' });
      } }
    });
    var cuiSaveBtn = h.ui.el('button', { class: 'btn', text: h.t('norsok.inputs.save'),
      on: { click: function () {
        if (!mp.advanced) { mp.advanced = {}; }
        if (!mp.advanced.cui) { mp.advanced.cui = {}; }
        var vals = readCuiInputs();
        mp.advanced.cui.inputs = vals;
        var mod = cui583mod();
        if (mod && typeof mod.assess === 'function') {
          try {
            mp.advanced.cui.result = mod.assess(vals);
            renderCuiResult(vals);
          } catch (e) {}
        }
        requirePerm(h.repos.meta, 'assetWrite').then(function () {
          return stampRec(h.repos.meta, mp, mp);
        }).then(function (stamped) {
          return h.repos.monitoringPoints.save(stamped);
        }).then(function () {
          h.ui.toast(h.t('common.saved'));
        }).catch(function (err) {
          if (h.ui && typeof h.ui.toast === 'function') {
            h.ui.toast(h.t(isForbidden(err) ? 'security.forbidden' : 'common.error'), { severity: isForbidden(err) ? 'warning' : 'critical' });
          }
        });
      } }
    });
    cuiPanel.appendChild(h.ui.el('div', { class: 'actions' }, cuiCalcBtn, cuiSaveBtn));
    cuiPanel.appendChild(cuiResult);
    section.appendChild(cuiPanel);

    // ---- MIC panel ----
    var micPanel = card(h, 'mic.title');
    var micSaved = saved.mic || {};
    var micResult = h.ui.el('div', { class: 'mic-result' });

    function renderMicResult(inputValues) {
      micResult.textContent = '';
      var mod = micMod();
      if (!mod || typeof mod.assess !== 'function') {
        micResult.appendChild(h.ui.el('p', { class: 'field-hint', text: h.t('common.moduleLoading') }));
        return;
      }
      try {
        var r = mod.assess(inputValues);
        var row = h.ui.el('div', { class: 'row' });
        row.appendChild(ledBadge(h, r.riskLevel));
        row.appendChild(h.ui.el('span', { class: 'pill', text: h.t('mic.risk.' + r.riskLevel) }));
        row.appendChild(h.ui.el('span', { class: 'num', text: String(r.score) + '/15' }));
        micResult.appendChild(row);

        if (r.drivers && r.drivers.length) {
          var dDiv = h.ui.el('div', { class: 'field-hint' });
          r.drivers.forEach(function (d) { dDiv.appendChild(h.ui.el('p', { text: h.t(d) })); });
          micResult.appendChild(dDiv);
        }
      } catch (err) {
        micResult.appendChild(h.ui.el('p', { class: 'field-error', text: String(err) }));
      }
    }

    var ms = micSaved.inputs || {};
    var micChecks = h.ui.el('div', { class: 'field-group' });
    function addMicCheck(name, labelKey, def) {
      var checked = ms[name] !== undefined ? ms[name] : (def || false);
      var cb = h.ui.el('input', { attrs: { type: 'checkbox', id: 'mic-' + name } });
      cb.checked = !!checked;
      var lbl = h.ui.el('label', { class: 'field-label', attrs: { for: 'mic-' + name } }, cb, h.ui.el('span', { text: h.t(labelKey) }));
      micChecks.appendChild(lbl);
    }
    addMicCheck('freeWater', 'mic.factor.stagnant', false); // re-using stagnant label as it's the first
    // Actually freeWater is the prerequisite, let me use specific labels.
    // Clear and redo properly
    micChecks.textContent = '';
    function micField(name, labelKey, def) {
      var checked = ms[name] !== undefined ? ms[name] : (def || false);
      var cb = h.ui.el('input', { attrs: { type: 'checkbox', id: 'mic-' + name } });
      cb.checked = !!checked;
      var lbl = h.ui.el('label', { class: 'field-label', attrs: { for: 'mic-' + name } }, cb, h.ui.el('span', { text: h.t(labelKey) }));
      micChecks.appendChild(lbl);
    }
    micField('freeWater', 'mic.factor.freeWater');
    micField('stagnant', 'mic.factor.stagnant');
    micField('sulfate', 'mic.factor.sulfate');
    micField('deposits', 'mic.factor.deposits');
    micField('nearNeutralPh', 'mic.factor.nearNeutralPh');
    micField('sulfideSigns', 'mic.factor.sulfideSigns');
    micField('historyMic', 'mic.factor.historyMic');
    micField('highCounts', 'mic.factor.highCounts');

    var micTempField = buildForm(h, [{ name: 'temperatureC', labelKey: 'mic.factor.temperature', type: 'number', value: ms.temperatureC != null ? ms.temperatureC : (mp.process && mp.process.tempC != null ? mp.process.tempC : '') }], {}, 'cf-mic');
    micPanel.appendChild(micChecks);
    micPanel.appendChild(micTempField.node);

    if (micSaved.inputs) {
      // Recalculate deterministically from the saved inputs so the last
      // result is shown after a reload (no dependence on a stored output).
      renderMicResult(micSaved.inputs);
    } else if (micSaved.result) {
      renderMicResult(micSaved.result.inputs || {});
    }

    function readMicInputs() {
      var checks = micChecks.querySelectorAll('input[type=checkbox]');
      var vals = {};
      checks.forEach(function (cb) { vals[cb.id.replace('mic-', '')] = cb.checked; });
      var tempVal = micTempField.getValues().temperatureC;
      if (tempVal != null && tempVal !== '') vals.temperatureC = Number(tempVal);
      return vals;
    }

    var micCalcBtn = h.ui.el('button', { class: 'btn btn-primary', text: h.t('norsok.inputs.calculate'),
      on: { click: function () {
        var vals = readMicInputs();
        renderMicResult(vals);
        micResult.scrollIntoView({ behavior: 'smooth' });
      } }
    });
    var micSaveBtn = h.ui.el('button', { class: 'btn', text: h.t('norsok.inputs.save'),
      on: { click: function () {
        if (!mp.advanced) { mp.advanced = {}; }
        if (!mp.advanced.mic) { mp.advanced.mic = {}; }
        var vals = readMicInputs();
        mp.advanced.mic.inputs = vals;
        var mod = micMod();
        if (mod && typeof mod.assess === 'function') {
          try {
            mp.advanced.mic.result = mod.assess(vals);
            renderMicResult(vals);
          } catch (e) {}
        }
        requirePerm(h.repos.meta, 'assetWrite').then(function () {
          return stampRec(h.repos.meta, mp, mp);
        }).then(function (stamped) {
          return h.repos.monitoringPoints.save(stamped);
        }).then(function () {
          h.ui.toast(h.t('common.saved'));
        }).catch(function (err) {
          if (h.ui && typeof h.ui.toast === 'function') {
            h.ui.toast(h.t(isForbidden(err) ? 'security.forbidden' : 'common.error'), { severity: isForbidden(err) ? 'warning' : 'critical' });
          }
        });
      } }
    });
    micPanel.appendChild(h.ui.el('div', { class: 'actions' }, micCalcBtn, micSaveBtn));
    micPanel.appendChild(micResult);
    section.appendChild(micPanel);

    return section;
  }

  function fichaTable(h, mp) {
    var m = materialById(mp.material);
    var pairs = [
      ['corrosion.pointCode', h.ui.el('span', { class: 'num', text: mp.code || '' })],
      ['corrosion.pointName', h.ui.el('span', { text: mp.name || '—' })],
      ['common.sector', h.ui.el('span', { text: mp.sector ? h.t('common.' + mp.sector) : '—' })],
      ['corrosion.system', h.ui.el('span', { text: mp.systemId || '—' })],
      ['corrosion.line', h.ui.el('span', { text: mp.line || '—' })],
      ['corrosion.material', h.ui.el('span', { text: m ? m.name : (mp.material || '—') })],
      ['corrosion.sensorType', h.ui.el('span', { text: mp.sensorType ? h.t('corrosion.sensorTypes.' + mp.sensorType) : '—' })],
      ['corrosion.stationKm', h.ui.el('span', { class: 'num', text: mp.stationKm != null ? fmtNum(mp.stationKm, 2) : '—' })],
      ['corrosion.location', h.ui.el('span', { text: mp.location || '—' })],
      ['common.createdAt', h.ui.el('span', { text: mp.createdAt ? fmtDate(mp.createdAt, { dateStyle: 'short' }) : '—' })]
    ];
    return h.ui.keyValueTable(pairs);
  }

  // ---- Remaining life faceplate (Experion PKS) ---------------------------------

  function trendArrow(classification) {
    if (classification === 'increasing') { return '\u25B2'; }
    if (classification === 'decreasing') { return '\u25BC'; }
    return '\u25C6';
  }

  function trendChipClass(classification) {
    return 'trend-chip' + (classification ? ' trend-chip--' + classification : '');
  }

  function trendChipLabel(classification) {
    if (!classification) { return ''; }
    var i18n = i18nApi();
    if (i18n && typeof i18n.t === 'function') { return i18n.t('corrosion.trendLabels.' + classification); }
    return classification;
  }

  function buildRulFaceplate(h, mp, readings) {
    var rl = remainingLife();
    var spcMod = spc();
    var tMin = mp.tMin;
    var tNom = mp.tNom;

    var faceplateCard = h.ui.el('section', { class: 'card' });
    faceplateCard.appendChild(h.ui.el('h2', { class: 'section-title', text: h.t('corrosion.remainingLife') }));

    if (tMin == null || tNom == null) {
      faceplateCard.appendChild(h.ui.el('p', { class: 'field-hint', text: h.t('corrosion.tMinHint') }));
      return faceplateCard;
    }

    if (!rl || !spcMod) {
      faceplateCard.appendChild(emptyState(h, 'common.none'));
      return faceplateCard;
    }

    // RUL from corrosion-rate readings (mpy) projected against wall limits.
    var ruling = rl.rulFromCorrosionRates(readings.map(function (r) {
      return { date: r.date, value: r.crMpy };
    }), { tNom: tNom, tMin: tMin });

    if (ruling && ruling.error === 'E_NO_TNOM_TMIN') {
      faceplateCard.appendChild(emptyState(h, 'common.none'));
      return faceplateCard;
    }

    // Convert readings to {x:days, y:crMpy} for trend analysis
    var sortedReadings = readings.slice().sort(function (a, b) { return String(a.date).localeCompare(String(b.date)); });
    var trendPoints = [];
    if (sortedReadings.length >= 2) {
      var baseMs = Date.parse(sortedReadings[0].date);
      if (!isNaN(baseMs)) {
        for (var i = 0; i < sortedReadings.length; i++) {
          var ms = Date.parse(sortedReadings[i].date);
          if (!isNaN(ms) && typeof sortedReadings[i].crMpy === 'number') {
            trendPoints.push({ x: (ms - baseMs) / 86400000, y: sortedReadings[i].crMpy });
          }
        }
      }
    }

    var trendResult = null;
    var classification = 'insufficient';
    if (spcMod && trendPoints.length >= 2) {
      trendResult = spcMod.linearTrend(trendPoints);
      classification = spcMod.classifyTrend({ slope: trendResult.slope, r2: trendResult.r2, n: trendResult.n });
    }

    // LED state
    var months = ruling.rulMonths;
    var ledClass = 'led';
    if (months === Infinity || months >= 24) { ledClass += ' led--ok'; }
    else if (months >= 12) { ledClass += ' led--warn'; }
    else { ledClass += ' led--crit-blink'; }
    if (ruling.confidence === 'insufficient') { ledClass = 'led led--warn'; }

    var valueText;
    if (months === Infinity) { valueText = '\u221E'; }
    else { valueText = fmtNum(months, 0); }

    var fp = h.ui.el('div', { class: 'rul-faceplate' });
    fp.appendChild(h.ui.el('span', { class: 'rul-faceplate__header', text: h.t('corrosion.remainingLife') }));

    var row = h.ui.el('div', { class: 'rul-faceplate__row' });
    row.appendChild(h.ui.el('span', { class: ledClass, attrs: { 'aria-hidden': 'true', role: 'img', 'aria-label': ruling.confidence } }));
    row.appendChild(h.ui.el('span', { class: 'rul-faceplate__value', text: valueText }));
    row.appendChild(h.ui.el('span', { class: 'rul-faceplate__unit', text: h.t('common.months') }));
    fp.appendChild(row);

    // Trend chip
    var chip = h.ui.el('span', { class: trendChipClass(classification) });
    chip.appendChild(h.ui.el('span', { class: 'trend-chip__arrow', attrs: { 'aria-hidden': 'true' }, text: trendArrow(classification) }));
    chip.appendChild(h.ui.el('span', { text: trendChipLabel(classification) }));
    fp.appendChild(chip);

    faceplateCard.appendChild(fp);

    if (ruling.confidence === 'high' || ruling.confidence === 'medium') {
      faceplateCard.appendChild(h.ui.el('p', { class: 'field-hint', text: h.t('corrosion.rulingMethod') + ': ' + ruling.method + ', ' + h.t('common.confidence') + ': ' + ruling.confidence }));
    }

    return faceplateCard;
  }

  function processTable(h, mp) {
    var p = mp.process || {};
    function v(x, unit) { return x == null ? '—' : fmtNum(x, 2) + ' ' + unit; }
    return h.ui.keyValueTable([
      ['corrosion.h2s', h.ui.el('span', { class: 'num', text: v(p.h2sPpm, 'ppm') })],
      ['corrosion.co2', h.ui.el('span', { class: 'num', text: v(p.co2Ppm, 'ppm') })],
      ['corrosion.totalPressure', h.ui.el('span', { class: 'num', text: v(p.totalPressureKpa, 'kPa') })],
      ['corrosion.temperature', h.ui.el('span', { class: 'num', text: v(p.tempC, '°C') })],
      ['corrosion.bsw', h.ui.el('span', { class: 'num', text: v(p.bswPct, '%') })],
      ['corrosion.velocity', h.ui.el('span', { class: 'num', text: v(p.velocityMs, 'm/s') })],
      ['corrosion.inhibitorTarget', h.ui.el('span', { class: 'num', text: v(p.inhibitorTargetPpm, 'ppm') })],
      ['corrosion.inhibitorResidual', h.ui.el('span', { class: 'num', text: v(p.inhibitorResidualPpm, 'ppm') })]
    ]);
  }

  // ---- Detail view -------------------------------------------------------------

  function renderDetail(h, container, id) {
    Promise.all([
      h.repos.monitoringPoints.get(id),
      h.repos.readings.list(),
      h.repos.coupons.list(),
      h.repos.monitoringPoints.list()
    ]).then(function (d) {
      if (!container.isConnected) { return; }
      var mp = d[0];
      if (!mp) {
        container.textContent = '';
        container.appendChild(errorNode(h, new Error('not found: ' + id)));
        return;
      }
      var readings = (d[1] || []).filter(function (r) { return r.mpId === id; }).sort(function (a, b) { return String(a.date).localeCompare(String(b.date)); });
      var coupons = (d[2] || []).filter(function (c) { return c.mpId === id; });
      var existingCodes = (d[3] || []).filter(function (p) { return p.id !== id; }).map(function (p) { return p.code; });
      container.textContent = '';
      container.appendChild(buildDetail(h, mp, readings, coupons, existingCodes));
    }).catch(function (err) {
      container.textContent = '';
      container.appendChild(errorNode(h, err));
    });
  }

  function buildDetail(h, mp, readings, coupons, existingCodes) {
    var frag = document.createDocumentFragment();

    var header = h.ui.el('div', { class: 'page-header' });
    header.appendChild(h.ui.el('a', { class: 'btn btn-ghost', attrs: { href: '#/corrosion' }, on: { click: function (ev) { ev.preventDefault(); h.navigate('#/corrosion'); } } }, h.ui.icon('chevron-right', 18), h.ui.el('span', { text: h.t('common.back') })));
    header.appendChild(h.ui.el('h1', { text: mp.code }));
    var actions = h.ui.el('div', { class: 'actions' });
    actions.appendChild(h.ui.el('button', { class: 'btn', on: { click: function () { openMpForm(h, mp, existingCodes, function () { renderDetail(h, h.container, mp.id); }); } } }, h.ui.icon('edit', 18), h.ui.el('span', { text: h.t('common.edit') })));
    actions.appendChild(h.ui.el('button', { class: 'btn btn-danger', on: { click: function () { deleteMp(h, mp, function () { h.navigate('#/corrosion'); }); } } }, h.ui.icon('trash', 18), h.ui.el('span', { text: h.t('common.delete') })));
    actions.appendChild(h.ui.el('a', { class: 'btn', attrs: { href: '#/reports/dossier/' + encodeURIComponent(mp.id) }, on: { click: function (ev) { ev.preventDefault(); h.navigate('#/reports/dossier/' + encodeURIComponent(mp.id)); } } }, h.ui.icon('reports', 18), h.ui.el('span', { text: h.t('corrosion.pointDossier') })));
    header.appendChild(actions);
    frag.appendChild(header);

    // Ficha técnica.
    var ficha = card(h, 'corrosion.points');
    ficha.appendChild(fichaTable(h, mp));
    frag.appendChild(ficha);

    // Process parameters.
    var proc = card(h, 'corrosion.processParams');
    proc.appendChild(processTable(h, mp));
    frag.appendChild(proc);

    // Readings.
    var readingsCard = card(h, 'corrosion.readings');
    readingsCard.appendChild(h.ui.el('button', { class: 'btn btn-primary', on: { click: function () { readingForm(h, mp.id, function () { renderDetail(h, h.container, mp.id); }); } } }, h.ui.icon('plus', 18), h.ui.el('span', { text: h.t('corrosion.newReading') })));
    if (readings.length) {
      readingsCard.appendChild(trendChartNode(h, readings));

      // Detect outliers
      var spcMod = spc();
      var crValues = readings.map(function (r) { return r.crMpy; });
      var outlierIndices = spcMod && typeof spcMod.detectOutliers === 'function' ? spcMod.detectOutliers(crValues, { threshold: 3.5 }) : [];
      var outlierSet = {};
      for (var oi = 0; oi < outlierIndices.length; oi++) { outlierSet[outlierIndices[oi]] = true; }

      var readingRows = readings.slice().reverse().map(function (r, revIdx) {
        var origIdx = readings.length - 1 - revIdx;
        return { date: r.date, crMpy: r.crMpy, source: r.source, note: r.note, _outlier: !!outlierSet[origIdx] };
      });
      var readingTable = h.ui.table({
        captionKey: 'corrosion.readings',
        emptyKey: 'corrosion.noReadings',
        columns: [
          { key: 'date', labelKey: 'common.date', render: function (v) { return fmtDate(v, { dateStyle: 'short' }); } },
          { key: 'crMpy', labelKey: 'corrosion.crMpy', align: 'num', render: function (v, row) {
              var sev = classifyMpy(v);
              var els = [h.ui.el('span', { class: 'num', text: fmtNum(v, 2) }), sevBadge(h, sev)];
              if (row._outlier) {
                els.push(h.ui.el('span', { class: 'reading-outlier', text: h.t('corrosion.outlier') }));
              }
              return h.ui.el('span', { class: 'row' }, els);
            } },
          { key: 'source', labelKey: 'common.status', render: function (v) { return h.ui.el('span', { class: 'pill', text: v || '' }); } },
          { key: 'note', labelKey: 'common.note' }
        ],
        rows: readingRows
      });
      readingsCard.appendChild(readingTable);
    } else {
      readingsCard.appendChild(emptyState(h, 'corrosion.noReadings'));
    }
    frag.appendChild(readingsCard);

    // Coupons.
    var couponsCard = card(h, 'corrosion.coupons');
    couponsCard.appendChild(h.ui.el('button', { class: 'btn btn-primary', on: { click: function () { openCouponForm(h, mp.id, function () { renderDetail(h, h.container, mp.id); }); } } }, h.ui.icon('plus', 18), h.ui.el('span', { text: h.t('corrosion.newCoupon') })));
    var couponRows = coupons.map(function (cp) {
      var sev = classifyMpy(cp.crMpy);
      var m = materialById(cp.material);
      return { coupon: cp, role: cp.role, pairId: cp.pairId, material: m ? m.name : (cp.material || ''), crMpy: cp.crMpy, status: cp.status, sev: sev };
    });
    couponsCard.appendChild(h.ui.table({
      captionKey: 'corrosion.coupons',
      emptyKey: 'common.empty',
      columns: [
        { key: 'role', labelKey: 'corrosion.couponRole', render: function (v) { return v ? h.t(v === 'blank' ? 'corrosion.blank' : 'corrosion.inhibited') : ''; } },
        { key: 'pairId', labelKey: 'corrosion.pair' },
        { key: 'material', labelKey: 'corrosion.material' },
        { key: 'crMpy', labelKey: 'corrosion.crMpy', align: 'num', render: function (v, row) {
            return h.ui.el('span', { class: 'row' }, h.ui.el('span', { class: 'num', text: v == null ? '—' : fmtNum(v, 3) }), sevBadge(h, row.sev));
          } },
        { key: 'status', labelKey: 'common.status', render: function (v) { return h.ui.el('span', { class: 'pill', text: v || '' }); } },
        { key: 'actions', labelKey: 'common.actions', render: function (v, row) {
            return h.ui.el('button', { class: 'btn btn-ghost touch', attrs: { 'aria-label': h.t('common.edit') }, on: { click: function () {
              openCouponForm(h, mp.id, function () { renderDetail(h, h.container, mp.id); }, row.coupon);
            } } }, h.ui.icon('edit', 16), h.ui.el('span', { text: h.t('common.edit') }));
          } }
      ],
      rows: couponRows
    }));
    frag.appendChild(couponsCard);

    // Remaining life faceplate.
    frag.appendChild(buildRulFaceplate(h, mp, readings));

    // Inhibitor efficiency.
    frag.appendChild(buildEiPanel(h, coupons));

    // Balance + DWM + sour + CP + CUI.
    frag.appendChild(buildBalance(h, mp));
    frag.appendChild(buildDwm(h, mp, readings));
    frag.appendChild(buildSour(h, mp));
    frag.appendChild(buildCp(h, mp));
    frag.appendChild(buildCui(h, mp));
    frag.appendChild(buildAdvancedCorrosion(h, mp));

    return frag;
  }

  // ---- List view ---------------------------------------------------------------

  function renderList(h, container) {
    Promise.all([h.repos.monitoringPoints.list(), h.repos.readings.list()]).then(function (d) {
      if (!container.isConnected) { return; }
      var points = d[0] || [];
      var readings = d[1] || [];
      var latest = {};
      var times = {};
      var series = {};
      readings.forEach(function (r) {
        var t = Date.parse(r.date);
        if (isNaN(t)) { t = 0; }
        if (!latest[r.mpId] || t >= (times[r.mpId] === undefined ? -1 : times[r.mpId])) { latest[r.mpId] = r; times[r.mpId] = t; }
        if (!series[r.mpId]) { series[r.mpId] = []; }
        series[r.mpId].push({ t: t, crMpy: r.crMpy });
      });
      Object.keys(series).forEach(function (k) {
        series[k].sort(function (a, b) { return a.t - b.t; });
      });
      var existingCodes = points.map(function (p) { return p.code; });
      container.textContent = '';
      container.appendChild(buildList(h, points, latest, existingCodes, series));
    }).catch(function (err) {
      container.textContent = '';
      container.appendChild(errorNode(h, err));
    });
  }

  function buildList(h, points, latest, existingCodes, series) {
    series = series || {};
    var frag = document.createDocumentFragment();

    var header = h.ui.el('div', { class: 'page-header' });
    header.appendChild(h.ui.el('h1', { text: h.t('corrosion.title') }));
    var actions = h.ui.el('div', { class: 'actions' });
    actions.appendChild(h.ui.el('button', { class: 'btn btn-primary', on: { click: function () { openMpForm(h, null, existingCodes, null); } } }, h.ui.icon('plus', 18), h.ui.el('span', { text: h.t('corrosion.newPoint') })));
    header.appendChild(actions);
    frag.appendChild(header);

    var state = { q: '', sector: 'all', system: '', sensor: '' };

    var filters = h.ui.el('div', { class: 'filter-bar' });

    var searchWrap = h.ui.el('div', { class: 'field filter-field' });
    var searchId = 'mp-search';
    searchWrap.appendChild(h.ui.el('label', { class: 'visually-hidden', attrs: { for: searchId }, text: h.t('common.search') }));
    var searchInput = h.ui.el('input', { class: 'input', attrs: { id: searchId, type: 'search', placeholder: h.t('common.search') } });
    searchWrap.appendChild(searchInput);
    filters.appendChild(searchWrap);

    function makeSelect(labelKey, options, onValue) {
      var wrap = h.ui.el('div', { class: 'field filter-field' });
      var selId = 'mp-filter-' + labelKey.replace(/[^A-Za-z0-9]/g, '');
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

    var sectorSel = makeSelect('common.sector', [{ value: 'all', labelKey: 'common.all' }, { value: 'upstream', labelKey: 'common.upstream' }, { value: 'midstream', labelKey: 'common.midstream' }, { value: 'downstream', labelKey: 'common.downstream' }], function (v) { state.sector = v; redraw(); });
    filters.appendChild(sectorSel);

    var systems = [];
    points.forEach(function (p) { if (p.systemId && systems.indexOf(p.systemId) === -1) { systems.push(p.systemId); } });
    var systemSel = makeSelect('corrosion.system', [{ value: '', labelKey: 'common.all' }].concat(systems.map(function (s) { return { value: s, label: s }; })), function (v) { state.system = v; redraw(); });
    filters.appendChild(systemSel);

    var sensorOpts = ['couponGravimetric', 'erProbe', 'lprProbe', 'h2Probe', 'utInspection', 'visual'];
    var sensorSel = makeSelect('corrosion.sensorType', [{ value: '', labelKey: 'common.all' }].concat(sensorOpts.map(function (s) { return { value: s, labelKey: 'corrosion.sensorTypes.' + s }; })), function (v) { state.sensor = v; redraw(); });
    filters.appendChild(sensorSel);

    filters.appendChild(h.ui.el('button', { class: 'btn btn-ghost', on: { click: function () { state.q = ''; state.sector = 'all'; state.system = ''; state.sensor = ''; searchInput.value = ''; sectorSel.querySelector('select').value = 'all'; systemSel.querySelector('select').value = ''; sensorSel.querySelector('select').value = ''; redraw(); } } }, h.ui.icon('close', 18), h.ui.el('span', { text: h.t('common.clear') })));

    frag.appendChild(filters);

    var tableHost = h.ui.el('div');
    frag.appendChild(tableHost);

    searchInput.addEventListener('input', function () { state.q = searchInput.value; redraw(); });

    function filtered() {
      return points.filter(function (mp) {
        if (state.sector !== 'all' && mp.sector !== state.sector) { return false; }
        if (state.system && mp.systemId !== state.system) { return false; }
        if (state.sensor && mp.sensorType !== state.sensor) { return false; }
        if (state.q) {
          var q = state.q.toLowerCase();
          var hay = ((mp.code || '') + ' ' + (mp.name || '') + ' ' + (mp.location || '')).toLowerCase();
          if (hay.indexOf(q) === -1) { return false; }
        }
        return true;
      });
    }

    function rowActions(mp) {
      var wrap = h.ui.el('div', { class: 'row' });
      wrap.appendChild(h.ui.el('a', { class: 'btn btn-ghost touch', attrs: { href: '#/corrosion/mp/' + encodeURIComponent(mp.id), 'aria-label': h.t('common.edit') }, on: { click: function (ev) { ev.preventDefault(); h.navigate('#/corrosion/mp/' + encodeURIComponent(mp.id)); } } }, h.ui.icon('edit', 18)));
      wrap.appendChild(h.ui.el('button', { class: 'btn btn-ghost touch', attrs: { 'aria-label': h.t('common.delete') }, on: { click: function () { deleteMp(h, mp); } } }, h.ui.icon('trash', 18)));
      return wrap;
    }

    function redraw() {
      tableHost.textContent = '';
      var rows = filtered().map(function (mp) {
        var r = latest[mp.id];
        var mpy = r && typeof r.crMpy === 'number' ? r.crMpy : null;
        var ser = (series[mp.id] || []).map(function (x) { return x.crMpy; });
        return { id: mp.id, code: mp.code, name: mp.name, sector: mp.sector, material: mp.material, sensorType: mp.sensorType, lastMpy: mpy, _series: ser, _mp: mp };
      });
      tableHost.appendChild(h.ui.table({
        captionKey: 'corrosion.points',
        emptyKey: 'common.empty',
        columns: [
          { key: 'code', labelKey: 'corrosion.pointCode', render: function (v, row) {
              var S = root.IW && root.IW.symbols;
              var M = root.IW && root.IW.symbolMap;
              var sev = row.lastMpy == null ? null : classifyMpy(row.lastMpy);
              var state = sev == null ? 'nodata' : (sev === 'severe' || sev === 'high') ? 'crit' : sev === 'moderate' ? 'warn' : 'ok';
              var sym = (S && M && typeof S.node === 'function')
                ? S.node(M.forPoint(row._mp), { size: 18, state: state, title: row.name || v })
                : null;
              var link = h.ui.el('a', { class: 'row-link', attrs: { href: '#/corrosion/mp/' + encodeURIComponent(row.id) }, on: { click: function (ev) { ev.preventDefault(); h.navigate('#/corrosion/mp/' + encodeURIComponent(row.id)); } }, text: v });
              return h.ui.el('span', { class: 'sym-cell' }, sym || document.createTextNode(''), link);
            } },
          { key: 'name', labelKey: 'corrosion.pointName' },
          { key: 'sector', labelKey: 'common.sector', render: function (v) { return v ? h.t('common.' + v) : ''; } },
          { key: 'material', labelKey: 'corrosion.material', render: function (v) { var m = materialById(v); return m ? m.name : (v || ''); } },
          { key: 'sensorType', labelKey: 'corrosion.sensorType', render: function (v) { return v ? h.t('corrosion.sensorTypes.' + v) : ''; } },
          { key: 'lastMpy', labelKey: 'corrosion.crMpy', align: 'num', render: function (v) {
              if (v == null) { return '—'; }
              var sev = classifyMpy(v);
              return h.ui.el('span', { class: 'row' }, h.ui.el('span', { class: 'num', text: fmtNum(v, 2) }), sevBadge(h, sev));
            } },
          { key: '_series', labelKey: 'corrosion.trend', render: function (v) {
              var vals = v || [];
              if (vals.length < 2) { return '—'; }
              return h.ui.sparkline(vals, { width: 72, height: 16 });
            } },
          { key: '_actions', labelKey: 'common.actions', render: function (v, row) { return rowActions(row._mp); } }
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
    id: 'corrosion',
    titleKey: 'nav.corrosion',
    icon: 'corrosion',
    assembleMp: assembleMp,
    render: function (container, ctx) {
      if (typeof document === 'undefined' || !container) { return Promise.resolve(); }
      var ui = root.IW.ui;
      var t = ctx.i18n || function (k) { return k; };
      var repos = ctx.repos;
      var bus = ctx.bus;
      var navigate = ctx.navigate || function (hash) { if (typeof location !== 'undefined') { location.hash = hash; } };
      var id = ctx.params && ctx.params.id ? decodeURIComponent(ctx.params.id) : null;

      var h = {
        t: t, ui: ui, repos: repos, bus: bus, navigate: navigate,
        sector: ctx.sector, container: container
      };

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
        if (!d || d.viewId !== 'corrosion') { disposeLive(); }
      });
      subscribe(h, live, 'data:changed:monitoringPoints', reload);
      subscribe(h, live, 'data:changed:readings', reload);
      subscribe(h, live, 'data:changed:coupons', reload);

      if (id) { return renderDetail(h, container, id); }
      return renderList(h, container);
    }
  };
});
