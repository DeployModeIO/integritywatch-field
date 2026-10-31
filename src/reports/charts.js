(function (root, factory) {
  'use strict';
  var api = factory(root);
  root.IW = root.IW || {};
  root.IW.reports = root.IW.reports || {};
  root.IW.reports.charts = api;
  if (typeof module === 'object' && module.exports) { module.exports = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  var SVG_NS = 'http://www.w3.org/2000/svg';
  var W = 180;
  var H = 90;
  var AXIS_SW = 0.3;
  var GRID_SW = 0.3;
  var LINE_SW = 0.4;
  var TARGET_SW = 0.4;
  var TICK_FONT = 3;
  var TITLE_FONT = 3.6;
  var TICKS = 5;
  var MAX_LABEL = 24;

  function isNum(v) { return typeof v === 'number' && isFinite(v); }

  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

  function trunc(s) {
    s = String(s);
    return s.length > MAX_LABEL ? s.slice(0, MAX_LABEL) : s;
  }

  function tickFormat(v) {
    if (!isFinite(v)) { return ''; }
    var a = Math.abs(v);
    if (a >= 1e6 || (a > 0 && a < 1e-4)) { return v.toExponential(1); }
    if (a >= 100) { return String(Math.round(v)); }
    if (a >= 10) { return v.toFixed(1); }
    return v.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
  }

  function svgEl(tag, attrs) {
    var node = document.createElementNS(SVG_NS, tag);
    if (attrs) {
      for (var k in attrs) {
        if (Object.prototype.hasOwnProperty.call(attrs, k) && attrs[k] !== null && attrs[k] !== undefined) {
          node.setAttribute(k, attrs[k]);
        }
      }
    }
    return node;
  }

  function textNode(str, x, y, cls, extra) {
    var attrs = { x: x, y: y, 'font-size': TICK_FONT };
    if (cls) { attrs['class'] = cls; }
    if (extra) {
      for (var k in extra) {
        if (Object.prototype.hasOwnProperty.call(extra, k)) { attrs[k] = extra[k]; }
      }
    }
    var node = svgEl('text', attrs);
    node.textContent = String(str);
    return node;
  }

  function chartRoot(kind, ariaLabel) {
    var attrs = {
      viewBox: '0 0 180 90',
      preserveAspectRatio: 'xMidYMid meet',
      'class': 'report-chart report-chart-' + kind,
      role: 'img'
    };
    if (ariaLabel) { attrs['aria-label'] = String(ariaLabel); }
    return svgEl('svg', attrs);
  }

  function fixRange(mi, ma) {
    if (isNum(mi) && isNum(ma) && ma > mi) { return [mi, ma]; }
    if (isNum(mi) && isNum(ma)) {
      var pad = Math.abs(ma) > 0 ? Math.abs(ma) * 0.1 : 1;
      var lo = mi - pad;
      var hi = ma + pad;
      if (hi > lo) { return [lo, hi]; }
    }
    return [-1, 1];
  }

  function sanitizePoints(arr, useIndexX) {
    var out = [];
    (arr || []).forEach(function (p, idx) {
      if (!p) { return; }
      var x = p.x;
      if (useIndexX && !isNum(x)) { x = idx; }
      if (!isNum(x) || !isNum(p.y)) { return; }
      out.push({ x: x, y: p.y, label: p.label });
    });
    return out;
  }

  function drawCartesian(svg, L, R, T, B, xMin, xMax, yMin, yMax, yLabel) {
    var iw = W - L - R;
    var ih = H - T - B;
    function sx(x) { return L + (clamp(x, xMin, xMax) - xMin) / (xMax - xMin) * iw; }
    function sy(y) { return T + (1 - (clamp(y, yMin, yMax) - yMin) / (yMax - yMin)) * ih; }
    var i;
    for (i = 0; i < TICKS; i++) {
      var t = i / (TICKS - 1);
      var yv = yMin + t * (yMax - yMin);
      var yp = sy(yv);
      svg.appendChild(svgEl('line', { x1: L, y1: yp, x2: L + iw, y2: yp, 'class': 'ch-grid', 'stroke-width': GRID_SW }));
      svg.appendChild(textNode(trunc(tickFormat(yv)), L - 1.2, yp + 1.1, 'ch-label', { 'text-anchor': 'end' }));
    }
    for (i = 0; i < TICKS; i++) {
      var tt = i / (TICKS - 1);
      var xv = xMin + tt * (xMax - xMin);
      var xp = sx(xv);
      svg.appendChild(svgEl('line', { x1: xp, y1: T + ih, x2: xp, y2: T + ih + 1, 'class': 'ch-axis', 'stroke-width': AXIS_SW }));
      svg.appendChild(textNode(trunc(tickFormat(xv)), xp, T + ih + 3.4, 'ch-label', { 'text-anchor': 'middle' }));
    }
    svg.appendChild(svgEl('line', { x1: L, y1: T + ih, x2: L + iw, y2: T + ih, 'class': 'ch-axis', 'stroke-width': AXIS_SW }));
    svg.appendChild(svgEl('line', { x1: L, y1: T, x2: L, y2: T + ih, 'class': 'ch-axis', 'stroke-width': AXIS_SW }));
    if (yLabel) {
      svg.appendChild(textNode(trunc(String(yLabel)), 2, T - 2.4, 'ch-label', { 'text-anchor': 'start', 'font-size': TITLE_FONT }));
    }
    return { sx: sx, sy: sy, iw: iw, ih: ih };
  }

  function trend(opts) {
    opts = opts || {};
    var svg = chartRoot('trend', opts.ariaLabel);
    var L = 20, R = 6, T = 8, B = 12;
    var pts = sanitizePoints(opts.points, false);
    if (pts.length === 0) { return svg; }
    var xs = pts.map(function (p) { return p.x; });
    var ys = pts.map(function (p) { return p.y; });
    var xMin = Math.min.apply(null, xs);
    var xMax = Math.max.apply(null, xs);
    var yMin = isNum(opts.yMin) ? opts.yMin : Math.min.apply(null, ys);
    var yMax = isNum(opts.yMax) ? opts.yMax : Math.max.apply(null, ys);
    var xr = fixRange(xMin, xMax);
    var yr = fixRange(yMin, yMax);
    xMin = xr[0]; xMax = xr[1];
    yMin = yr[0]; yMax = yr[1];
    var g = drawCartesian(svg, L, R, T, B, xMin, xMax, yMin, yMax, opts.yLabel);
    (opts.bands || []).forEach(function (b) {
      if (!b || (!isNum(b.from) && !isNum(b.to))) { return; }
      var lo = Math.min(b.from, b.to);
      var hi = Math.max(b.from, b.to);
      var yTop = g.sy(hi);
      var yBot = g.sy(lo);
      var h = yBot - yTop;
      if (!isFinite(h) || h <= 0) { return; }
      svg.appendChild(svgEl('rect', { x: L, y: yTop, width: g.iw, height: h, 'class': 'ch-band ch-band-' + (b.status || 'ok') }));
    });
    var ptsStr = pts.map(function (p) { return g.sx(p.x).toFixed(2) + ',' + g.sy(p.y).toFixed(2); }).join(' ');
    svg.appendChild(svgEl('polyline', { points: ptsStr, 'class': 'ch-line', 'stroke-width': LINE_SW, fill: 'none' }));
    pts.forEach(function (p) {
      svg.appendChild(svgEl('circle', { cx: g.sx(p.x), cy: g.sy(p.y), r: 0.7, 'class': 'ch-point' }));
      if (p.label) { svg.appendChild(textNode(trunc(String(p.label)), g.sx(p.x) + 1.1, g.sy(p.y) - 1.1, 'ch-label')); }
    });
    return svg;
  }

  function cusum(opts) {
    opts = opts || {};
    var svg = chartRoot('cusum', opts.ariaLabel);
    var L = 20, R = 6, T = 8, B = 12;
    var pts = sanitizePoints(opts.points, true);
    if (pts.length === 0) { return svg; }
    var thr = isNum(opts.threshold) ? Math.abs(opts.threshold) : 0;
    var xs = pts.map(function (p) { return p.x; });
    var ys = pts.map(function (p) { return p.y; });
    var xMin = Math.min.apply(null, xs);
    var xMax = Math.max.apply(null, xs);
    var xr = fixRange(xMin, xMax);
    xMin = xr[0]; xMax = xr[1];
    var absMax = 0;
    ys.forEach(function (y) { absMax = Math.max(absMax, Math.abs(y)); });
    var half = Math.max(absMax, thr) * 1.15;
    if (!isFinite(half) || !(half > 0)) { half = 1; }
    var g = drawCartesian(svg, L, R, T, B, xMin, xMax, -half, half, null);
    svg.appendChild(svgEl('line', { x1: L, y1: g.sy(0), x2: L + g.iw, y2: g.sy(0), 'class': 'ch-axis', 'stroke-width': TARGET_SW }));
    if (thr > 0) {
      svg.appendChild(svgEl('line', { x1: L, y1: g.sy(thr), x2: L + g.iw, y2: g.sy(thr), 'class': 'ch-target', 'stroke-width': TARGET_SW, 'stroke-dasharray': '2 1.2' }));
      svg.appendChild(svgEl('line', { x1: L, y1: g.sy(-thr), x2: L + g.iw, y2: g.sy(-thr), 'class': 'ch-target', 'stroke-width': TARGET_SW, 'stroke-dasharray': '2 1.2' }));
    }
    var ptsStr = pts.map(function (p) { return g.sx(p.x).toFixed(2) + ',' + g.sy(p.y).toFixed(2); }).join(' ');
    svg.appendChild(svgEl('polyline', { points: ptsStr, 'class': 'ch-line', 'stroke-width': LINE_SW, fill: 'none' }));
    pts.forEach(function (p) {
      svg.appendChild(svgEl('circle', { cx: g.sx(p.x), cy: g.sy(p.y), r: 0.6, 'class': 'ch-point' }));
    });
    return svg;
  }

  function bullet(opts) {
    opts = opts || {};
    var svg = chartRoot('bullet', opts.ariaLabel);
    var L = 14, R = 14;
    var barY = 38, barH = 14;
    var iw = W - L - R;
    var value = isNum(opts.value) ? opts.value : NaN;
    var target = isNum(opts.target) ? opts.target : NaN;
    var max = isNum(opts.max) && opts.max > 0 ? opts.max : 0;
    var bands = (opts.bands || []).filter(function (b) { return b && isNum(b.to); }).slice().sort(function (a, b) { return a.to - b.to; });
    if (!(max > 0)) {
      var m = 0;
      if (isFinite(value)) { m = Math.max(m, value); }
      if (isFinite(target)) { m = Math.max(m, target); }
      bands.forEach(function (b) { m = Math.max(m, b.to); });
      max = m > 0 ? m * 1.1 : 1;
    }
    function px(v) { return L + (clamp(v, 0, max) / max) * iw; }
    var prev = 0;
    bands.forEach(function (b) {
      var to = Math.max(b.to, prev);
      if (to <= 0) { return; }
      var x0 = px(prev);
      var x1 = px(to);
      var w = x1 - x0;
      if (!isFinite(w) || w <= 0) { return; }
      svg.appendChild(svgEl('rect', { x: x0, y: barY, width: w, height: barH, 'class': 'ch-band ch-band-' + (b.status || 'ok') }));
      prev = to;
    });
    if (isFinite(value)) {
      var vx = px(Math.max(value, 0));
      svg.appendChild(svgEl('rect', { x: L, y: barY, width: vx - L, height: barH, 'class': 'ch-bar' }));
    }
    if (isFinite(target)) {
      var tx = px(target);
      svg.appendChild(svgEl('line', { x1: tx, y1: barY - 2, x2: tx, y2: barY + barH + 2, 'class': 'ch-target', 'stroke-width': TARGET_SW }));
    }
    svg.appendChild(svgEl('line', { x1: L, y1: barY + barH, x2: L + iw, y2: barY + barH, 'class': 'ch-axis', 'stroke-width': AXIS_SW }));
    svg.appendChild(textNode('0', L, barY + barH + 4, 'ch-label', { 'text-anchor': 'middle' }));
    svg.appendChild(textNode(trunc(tickFormat(max)), L + iw, barY + barH + 4, 'ch-label', { 'text-anchor': 'middle' }));
    return svg;
  }

  function matrix(opts) {
    opts = opts || {};
    var svg = chartRoot('matrix', opts.ariaLabel);
    var cell = 14;
    var L = 22;
    var T = 4;
    var grid = cell * 5;
    var byCell = {};
    (opts.cells || []).forEach(function (c) {
      if (!c) { return; }
      var x = Math.round(c.x);
      var y = Math.round(c.y);
      if (x >= 1 && x <= 5 && y >= 1 && y <= 5) { byCell[x + ':' + y] = c; }
    });
    function gx(i) { return L + (i - 1) * cell; }
    function gy(j) { return T + (j - 1) * cell; }
    var xx, yy;
    for (yy = 1; yy <= 5; yy++) {
      for (xx = 1; xx <= 5; xx++) {
        var risk = xx * yy;
        var level = risk <= 6 ? 'low' : (risk <= 12 ? 'med' : 'high');
        var c = byCell[xx + ':' + yy];
        var rect = svgEl('rect', { x: gx(xx), y: gy(yy), width: cell, height: cell, 'class': 'ch-risk-' + level });
        if (c && Array.isArray(c.ids) && c.ids.length) { rect.setAttribute('title', trunc(c.ids.join(', '))); }
        svg.appendChild(rect);
        if (c && isNum(c.count)) {
          svg.appendChild(textNode(trunc(String(c.count)), gx(xx) + cell / 2, gy(yy) + cell / 2 + 1.2, 'ch-label', { 'text-anchor': 'middle', 'font-size': TITLE_FONT }));
        }
      }
    }
    var i;
    for (i = 1; i <= 5; i++) {
      svg.appendChild(textNode(String(i), L + cell / 2 + (i - 1) * cell, T + grid + 3.6, 'ch-label', { 'text-anchor': 'middle' }));
      svg.appendChild(textNode(String(i), L - 1.6, T + cell / 2 + (i - 1) * cell + 1.1, 'ch-label', { 'text-anchor': 'end' }));
    }
    if (opts.xLabel) {
      svg.appendChild(textNode(trunc(String(opts.xLabel)), L + grid / 2, T + grid + 7.4, 'ch-label', { 'text-anchor': 'middle', 'font-size': TITLE_FONT }));
    }
    if (opts.yLabel) {
      svg.appendChild(textNode(trunc(String(opts.yLabel)), 2, T - 1, 'ch-label', { 'text-anchor': 'start', 'font-size': TITLE_FONT }));
    }
    return svg;
  }

  return { trend: trend, cusum: cusum, bullet: bullet, matrix: matrix };
});
