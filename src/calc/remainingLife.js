/* IntegrityWatch Field — remaining life
   Wall thickness RUL via least-squares regression over inspection readings. */
(function (root, factory) {
  'use strict';
  var api = factory(root);
  root.IW = root.IW || {};
  root.IW.calc = root.IW.calc || {};
  root.IW.calc.remainingLife = api;
  if (typeof module === 'object' && module.exports) { module.exports = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  function isNumber(v) { return typeof v === 'number' && isFinite(v); }

  function DAY_MS() { return 86400000; }

  // 1 mil (thou) per year = 0.0254 mm/year.
  var MPY_TO_MMYR = 0.0254;

  function fitSeries(points) {
    var n = (points || []).length;
    if (n === 0) { return { slope: 0, intercept: 0, r2: 0, n: 0 }; }
    if (n === 1) {
      return { slope: 0, intercept: points[0].y, r2: 0, n: 1 };
    }

    var sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0, sumY2 = 0;
    for (var i = 0; i < n; i++) {
      var x = points[i].x;
      var y = points[i].y;
      sumX += x;
      sumY += y;
      sumXY += x * y;
      sumX2 += x * x;
      sumY2 += y * y;
    }

    var denom = n * sumX2 - sumX * sumX;
    var slope = 0;
    var intercept = 0;
    if (denom !== 0) {
      slope = (n * sumXY - sumX * sumY) / denom;
    }
    intercept = (sumY - slope * sumX) / n;

    var ssRes = 0, ssTot = 0;
    var yMean = sumY / n;
    for (var j = 0; j < n; j++) {
      var yPred = slope * points[j].x + intercept;
      ssRes += (points[j].y - yPred) * (points[j].y - yPred);
      ssTot += (points[j].y - yMean) * (points[j].y - yMean);
    }
    var r2 = ssTot > 0 ? 1 - ssRes / ssTot : 0;

    return { slope: slope, intercept: intercept, r2: r2, n: n };
  }

  function remainingLifeMonths(input) {
    var tActual = input.tActual;
    var tMin = input.tMin;
    var ratePerYear = input.ratePerYear;
    if (!isNumber(tActual) || !isNumber(tMin)) { return Infinity; }
    if (tActual <= tMin) { return 0; }
    if (!isNumber(ratePerYear) || ratePerYear <= 0) { return Infinity; }
    var years = (tActual - tMin) / ratePerYear;
    return years * 12;
  }

  function rulFromSeries(readings, tMin) {
    if (tMin === undefined || tMin === null || (typeof tMin === 'number' && isNaN(tMin))) {
      return { rulMonths: 0, method: 'lastRate', confidence: 'insufficient', error: 'E_NO_TMIN' };
    }

    var list = (readings || []).slice();
    if (list.length < 2) {
      return { rulMonths: 0, method: 'lastRate', confidence: 'insufficient' };
    }

    list.sort(function (a, b) { return String(a.date).localeCompare(String(b.date)); });

    var baseMs = Date.parse(list[0].date);
    if (isNaN(baseMs)) { baseMs = 0; }

    var pts = [];
    for (var i = 0; i < list.length; i++) {
      var ms = Date.parse(list[i].date);
      if (isNaN(ms)) { continue; }
      var days = (ms - baseMs) / DAY_MS();
      var value = list[i].value;
      if (!isNumber(value)) { continue; }
      pts.push({ x: days, y: value });
    }

    if (pts.length < 2) {
      return { rulMonths: 0, method: 'lastRate', confidence: 'insufficient' };
    }

    var fit = fitSeries(pts);
    var r2 = fit.r2;
    var slope = fit.slope; // mm/day
    var ratePerYear = Math.abs(slope) * 365.25; // mm/year, always positive for RUL

    var method = 'regression';
    var confidence = 'low';

    if (fit.n >= 4 && r2 >= 0.7) {
      confidence = 'high';
    } else if (fit.n >= 3 && r2 >= 0.4) {
      confidence = 'medium';
    } else if (fit.n < 2) {
      confidence = 'insufficient';
      method = 'lastRate';
    }

    if (r2 < 0.4) {
      method = 'lastRate';
      confidence = 'low';
      // Use last two points for rate
      var lastTwo = pts.slice(-2);
      if (lastTwo.length === 2) {
        var dx = lastTwo[1].x - lastTwo[0].x;
        var dy = lastTwo[1].y - lastTwo[0].y;
        if (dx > 0) {
          ratePerYear = Math.abs(dy / dx) * 365.25;
        } else {
          ratePerYear = 0;
        }
      }
    }

    // Use the last actual thickness to compute RUL
    var tActual = pts[pts.length - 1].y;
    var months = remainingLifeMonths({ tActual: tActual, tMin: tMin, ratePerYear: ratePerYear });

    return { rulMonths: months, method: method, confidence: confidence };
  }

  // RUL from a corrosion-rate series (values in mpy) against wall thickness
  // limits: tNom is the current/nominal wall thickness (mm), tMin the minimum
  // acceptable thickness (mm). The corrosion rate (mm/yr) is derived from the
  // CR trend: regression-projected current rate when the fit is decent
  // (r2 >= 0.4), otherwise the mean of the series. Confidence follows the
  // same n/r2 rules as rulFromSeries.
  function rulFromCorrosionRates(readings, opts) {
    var tNom = opts && opts.tNom;
    var tMin = opts && opts.tMin;
    if (!isNumber(tNom) || !isNumber(tMin)) {
      return { rulMonths: 0, method: 'avgRate', confidence: 'insufficient', error: 'E_NO_TNOM_TMIN' };
    }

    var list = (readings || []).slice();
    list.sort(function (a, b) { return String(a.date).localeCompare(String(b.date)); });

    var baseMs = Date.parse(list.length ? list[0].date : '');
    if (isNaN(baseMs)) { baseMs = 0; }

    var pts = [];
    for (var i = 0; i < list.length; i++) {
      var ms = Date.parse(list[i].date);
      if (isNaN(ms) || !isNumber(list[i].value)) { continue; }
      pts.push({ x: (ms - baseMs) / DAY_MS(), y: list[i].value * MPY_TO_MMYR });
    }

    if (pts.length < 2) {
      return { rulMonths: 0, method: 'avgRate', confidence: 'insufficient' };
    }

    var fit = fitSeries(pts);
    var r2 = fit.r2;
    var ratePerYear;
    var method = 'regression';

    if (r2 >= 0.4 && fit.slope >= 0) {
      // Project the rate to "now" (last x) — conservative when CR is rising.
      ratePerYear = fit.slope * pts[pts.length - 1].x + fit.intercept;
    } else {
      var sum = 0;
      for (var j = 0; j < pts.length; j++) { sum += pts[j].y; }
      ratePerYear = sum / pts.length;
      method = 'avgRate';
    }
    if (!isNumber(ratePerYear) || ratePerYear < 0) { ratePerYear = 0; }

    var confidence = 'low';
    if (fit.n >= 4 && r2 >= 0.7) { confidence = 'high'; }
    else if (fit.n >= 3 && r2 >= 0.4) { confidence = 'medium'; }

    var months = remainingLifeMonths({ tActual: tNom, tMin: tMin, ratePerYear: ratePerYear });
    return { rulMonths: months, method: method, confidence: confidence, rateMmYr: ratePerYear };
  }

  return {
    fitSeries: fitSeries,
    remainingLifeMonths: remainingLifeMonths,
    rulFromSeries: rulFromSeries,
    rulFromCorrosionRates: rulFromCorrosionRates,
    MPY_TO_MMYR: MPY_TO_MMYR
  };
});