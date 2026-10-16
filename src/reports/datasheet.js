/* IntegrityWatch Field — datasheet report
   PSV datasheet (print-first A4, API 520/API 526 style) plus clipboard text export. */
(function (root, factory) {
  'use strict';
  var api = factory(root);
  root.IW = root.IW || {};
  root.IW.reports = root.IW.reports || {};
  root.IW.reports.datasheet = api;
  if (typeof module === 'object' && module.exports) { module.exports = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  function psvCalc() { return root.IW && root.IW.calc ? root.IW.calc.psv : null; }
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

  function in2ToCm2(a) {
    var u = root.IW && root.IW.calc && root.IW.calc.units;
    if (u && typeof u.in2ToCm2 === 'function') { return u.in2ToCm2(a); }
    return a * 6.4516;
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

  function fluidName(p, t) {
    if (p.fluid && typeof p.fluid === 'object' && p.fluid.name) { return p.fluid.name; }
    var id = p.fluidId;
    if (id && t('fluids.' + id) !== 'fluids.' + id) { return t('fluids.' + id); }
    return id || '—';
  }

  function statusLabel(t, status) {
    if (status === 'due') { return t('common.due'); }
    if (status === 'overdue') { return t('common.overdue'); }
    return t('common.ok');
  }

  function fluidProps(p) {
    var f = p.fluid || {};
    return {
      phase: f.phase || (p.fluidId ? (root.IW && root.IW.data && root.IW.data.fluids && root.IW.data.fluids.byId ? (function () { var m = root.IW.data.fluids.byId(p.fluidId); return m ? m.phase : null; })() : null) : null),
      M: f.M, Z: f.Z, k: f.k, G: f.G, viscCp: f.viscCp
    };
  }

  function computeC(p, props) {
    var calc = psvCalc();
    if (!calc || props.phase !== 'gas' || typeof props.k !== 'number') { return null; }
    try { return calc.flowCoefficientC(props.k, 'usc'); } catch (e) { return null; }
  }

  function computeF2(p, props) {
    var calc = psvCalc();
    var sizing = p.sizing || {};
    if (!calc || props.phase !== 'gas' || typeof props.k !== 'number') { return null; }
    if (sizing.F2 !== undefined) { return sizing.F2; }
    var P1 = (typeof p.setPressurePsig === 'number') ? p.setPressurePsig * 1.1 + 14.7 : null;
    var P2 = (typeof p.backPressurePsig === 'number') ? p.backPressurePsig + 14.7 : null;
    if (P1 === null || P2 === null || P1 <= P2) { return null; }
    if (calc.isCriticalFlow(P1, P2, props.k)) { return null; }
    var r = P2 / P1;
    return Math.sqrt((props.k / (props.k - 1)) * Math.pow(r, 2 / props.k) * (1 - Math.pow(r, (props.k - 1) / props.k)) / (1 - r));
  }

  // Rows for both HTML (kvTable) and plain-text clipboard.
  function sizingRows(p, t) {
    var props = fluidProps(p);
    var sizing = p.sizing || {};
    var C = computeC(p, props);
    var F2 = computeF2(p, props);
    var areqIn2 = sizing.AreqIn2;
    var areqCm2 = (typeof areqIn2 === 'number') ? in2ToCm2(areqIn2) : null;

    return [
      [t('psv.kd'), fmtNum(p.Kd, 3)],
      [t('psv.kb'), fmtNum(sizing.Kb !== undefined ? sizing.Kb : p.Kb, 3)],
      [t('psv.kw'), fmtNum(sizing.Kw !== undefined ? sizing.Kw : p.Kw, 3)],
      [t('psv.kc'), fmtNum(p.Kc, 3)],
      [t('psv.kv'), fmtNum(sizing.Kv, 3)],
      [t('reports.coefficientC'), fmtNum(C, 2)],
      [t('reports.f2'), fmtNum(F2, 3)],
      [t('reports.reynolds'), fmtNum(sizing.Re, 0)],
      [t('psv.requiredArea'), (typeof areqIn2 === 'number' ? fmtNum(areqIn2, 3) + ' ' + t('units.in2') + ' (' + fmtNum(areqCm2, 3) + ' ' + t('units.cm2') + ')' : '—')],
      [t('psv.flowCritical'), sizing.critical === undefined ? '—' : t('psv.' + (sizing.critical ? 'flowCritical' : 'flowSubcritical'))],
      [t('psv.selectedOrifice'), p.orificeLetter || (sizing.selectedOrificeLetter || '—')],
      [t('psv.selectedArea'), (typeof sizing.selectedAreaIn2 === 'number' ? fmtNum(sizing.selectedAreaIn2, 3) + ' ' + t('units.in2') : (typeof p.certifiedCapacity === 'number' ? fmtNum(p.certifiedCapacity, 3) : '—'))],
      [t('psv.margin'), (typeof sizing.marginPct === 'number' ? fmtNum(sizing.marginPct, 1) + ' ' + t('units.pct') : '—')]
    ];
  }

  function build(opts) {
    opts = opts || {};
    if (typeof document === 'undefined') { return Promise.resolve(null); }
    var store = opts.repos || opts.store || {};
    var psvId = opts.psvId;
    var t = opts.t || function (k) { return k; };

    var getPsv = (store.psvs && typeof store.psvs.get === 'function') ? store.psvs.get(psvId) : Promise.resolve(null);
    return getPsv.then(function (p) {
      var doc = el('div', { class: 'print-root report report-datasheet' });
      doc.appendChild(el('header', { class: 'report-cover' },
        el('h1', { text: t('reports.datasheetTitle') }),
        el('p', { class: 'report-cover-subtitle', text: p ? (p.tag || p.id) : (psvId || '') }),
        el('p', { class: 'report-cover-generated', text: t('reports.generatedAt') + ': ' + fmtDate(new Date().toISOString()) })));

      if (!p) {
        doc.appendChild(el('p', { class: 'empty-state', text: t('reports.noData') }));
        return doc;
      }

      var fluid = p.fluid || {};
      doc.appendChild(section(t, 'reports.datasheetFields', [kvTable(t, [
        ['psv.tag', p.tag || p.id || '—'],
        ['psv.location', p.location || '—'],
        ['psv.valveType', t('psv.types.' + (p.valveType || 'conventional'))],
        ['psv.fluid', fluidName(p, t)],
        ['psv.phase', fluid.phase ? t('psv.' + (fluid.phase === 'gas' ? 'gasVapor' : 'liquid')) : '—'],
        ['psv.setPressure', fmtNum(p.setPressurePsig, 1) + ' ' + t('units.psig')],
        ['psv.backPressure', fmtNum(p.backPressurePsig, 1) + ' ' + t('units.psig')],
        ['psv.temperature', fmtNum(p.operatingTempF, 1) + ' ' + t('units.degF')],
        ['psv.certified', (typeof p.certifiedCapacity === 'number' ? fmtNum(p.certifiedCapacity, 3) : '—')]
      ])]));

      doc.appendChild(section(t, 'psv.sizingTitle', [kvTable(t, sizingRows(p, t))]));
      doc.appendChild(section(t, 'reports.testDates', [kvTable(t, [
        ['psv.lastTest', fmtDate(p.lastTestDate)],
        ['psv.nextTest', fmtDate(p.nextTestDate)],
        ['common.status', statusLabel(t, p.status)]
      ])]));

      var standards = (root.IW && root.IW.data && root.IW.data.standards && root.IW.data.standards.standards) || [];
      var used = standards.filter(function (s) { return !s.usedIn || s.usedIn.indexOf('psv') !== -1; });
      var standardsBody;
      if (used.length === 0) {
        standardsBody = el('p', { class: 'empty-state', text: t('reports.noData') });
      } else {
        standardsBody = kvTable(t, used.map(function (s) { return [s.code || s.id, s.edition || '—']; }));
      }
      doc.appendChild(section(t, 'reports.standardsApplied', [standardsBody]));

      doc.appendChild(el('div', { class: 'report-disclaimer', attrs: { role: 'note' } },
        el('strong', { text: t('reports.disclaimer') })));
      doc.appendChild(el('footer', { class: 'report-footer', text: t('reports.pageFooter') + ' · ' + t('reports.generatedAt') + ' ' + fmtDate(new Date().toISOString()) }));
      return doc;
    });
  }

  // Plain tab-separated text for the clipboard (no DOM required).
  function toClipboardText(p, t) {
    t = t || function (k) { return k; };
    if (!p) { return ''; }
    var fluid = p.fluid || {};
    var rows = [];
    function line(label, value) { rows.push(label + '\t' + value); }

    line(t('psv.tag'), p.tag || p.id || '');
    line(t('psv.location'), p.location || '');
    line(t('psv.valveType'), t('psv.types.' + (p.valveType || 'conventional')));
    line(t('psv.fluid'), fluidName(p, t));
    line(t('psv.phase'), fluid.phase ? t('psv.' + (fluid.phase === 'gas' ? 'gasVapor' : 'liquid')) : '');
    line(t('psv.setPressure'), fmtNum(p.setPressurePsig, 1) + ' ' + t('units.psig'));
    line(t('psv.backPressure'), fmtNum(p.backPressurePsig, 1) + ' ' + t('units.psig'));
    line(t('psv.temperature'), fmtNum(p.operatingTempF, 1) + ' ' + t('units.degF'));
    line(t('psv.certified'), (typeof p.certifiedCapacity === 'number' ? fmtNum(p.certifiedCapacity, 3) : ''));
    sizingRows(p, t).forEach(function (r) { line(r[0], String(r[1])); });
    line(t('psv.lastTest'), fmtDate(p.lastTestDate));
    line(t('psv.nextTest'), fmtDate(p.nextTestDate));
    line(t('common.status'), statusLabel(t, p.status));
    return rows.join('\n');
  }

  return { build: build, toClipboardText: toClipboardText };
});
