/* IntegrityWatch Field — SPC
   Statistical process control: linear trend with CI, outlier detection via
   modified z-score (MAD), and trend classification.
   Methods referenced in ISO 17359 (structure); Student-t CI uses a lookup
   approximation for practical offline field analysis. */
(function (root, factory) {
  'use strict';
  var api = factory(root);
  root.IW = root.IW || {};
  root.IW.calc = root.IW.calc || {};
  root.IW.calc.spc = api;
  if (typeof module === 'object' && module.exports) { module.exports = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  // Student t 95% two-tailed critical values for df 1..30 and infinity.
  // Approximation: t = 1.96 for large df; exact values for low df from table.
  var T95 = [
    12.706, 4.303, 3.182, 2.776, 2.571, 2.447, 2.365, 2.306, 2.262, 2.228,
    2.201, 2.179, 2.160, 2.145, 2.131, 2.120, 2.110, 2.101, 2.093, 2.086,
    2.080, 2.074, 2.069, 2.064, 2.060, 2.056, 2.052, 2.048, 2.045, 2.042
  ];

  function tCritical(df) {
    if (df < 1) { return 1.96; }
    if (df <= 30) { return T95[df - 1]; }
    return 1.96;
  }

  function isNumber(v) { return typeof v === 'number' && isFinite(v); }

  function median(sorted) {
    var n = sorted.length;
    if (n === 0) { return 0; }
    var mid = Math.floor(n / 2);
    if (n % 2 === 0) { return (sorted[mid - 1] + sorted[mid]) / 2; }
    return sorted[mid];
  }

  function linearTrend(points) {
    var n = (points || []).length;
    if (n === 0) { return { slope: 0, intercept: 0, r2: 0, n: 0, ci95Slope: [0, 0] }; }

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
    var slope = 0, intercept = 0;
    if (denom !== 0) { slope = (n * sumXY - sumX * sumY) / denom; }
    intercept = (sumY - slope * sumX) / n;

    var ssRes = 0, ssTot = 0;
    var yMean = sumY / n;
    for (var j = 0; j < n; j++) {
      var yPred = slope * points[j].x + intercept;
      ssRes += (points[j].y - yPred) * (points[j].y - yPred);
      ssTot += (points[j].y - yMean) * (points[j].y - yMean);
    }
    var r2 = ssTot > 0 ? 1 - ssRes / ssTot : 0;

    var ci95Slope = [slope, slope];
    if (n >= 2) {
      var xMean = sumX / n;
      var sxx = 0;
      for (var k = 0; k < n; k++) { sxx += (points[k].x - xMean) * (points[k].x - xMean); }
      if (sxx > 0 && n > 2) {
        var se = Math.sqrt(ssRes / ((n - 2) * sxx));
        var t = tCritical(n - 2);
        ci95Slope = [slope - t * se, slope + t * se];
      }
    }

    return { slope: slope, intercept: intercept, r2: r2, n: n, ci95Slope: ci95Slope };
  }

  function detectOutliers(values, opts) {
    opts = opts || {};
    var threshold = (opts.threshold !== undefined && opts.threshold !== null) ? opts.threshold : 3.5;
    var n = (values || []).length;
    if (n < 2) { return []; }

    var sorted = values.slice().sort(function (a, b) { return a - b; });
    var med = median(sorted);

    var absDev = [];
    for (var i = 0; i < n; i++) { absDev.push(Math.abs(values[i] - med)); }
    var madSorted = absDev.slice().sort(function (a, b) { return a - b; });
    var mad = median(madSorted);

    var useStd = false;
    if (mad === 0) {
      // Fall back to standard deviation
      var sum = 0;
      for (var j = 0; j < n; j++) { sum += values[j]; }
      var mean = sum / n;
      var vsum = 0;
      for (var k = 0; k < n; k++) { vsum += (values[k] - mean) * (values[k] - mean); }
      var std = Math.sqrt(vsum / n);
      if (std === 0) { return []; }
      useStd = true;
    }

    var outliers = [];
    for (var m = 0; m < n; m++) {
      var score;
      if (useStd) {
        // standard z-score: |x - mean| / std
        var mean2 = values.reduce(function (a, b) { return a + b; }, 0) / n;
        var vsum2 = 0;
        for (var p = 0; p < n; p++) { vsum2 += (values[p] - mean2) * (values[p] - mean2); }
        var std2 = Math.sqrt(vsum2 / n);
        if (std2 === 0) { continue; }
        score = Math.abs(values[m] - mean2) / std2;
      } else {
        // Modified z-score: 0.6745 * |x - median| / MAD
        score = 0.6745 * Math.abs(values[m] - med) / mad;
      }
      if (score > threshold) { outliers.push(m); }
    }

    return outliers;
  }

  function classifyTrend(input) {
    var slope = input.slope;
    var r2 = input.r2;
    var n = input.n;
    if (n < 3) { return 'insufficient'; }

    // Threshold: |slope * avgX| < 2% of avgY determines "stable"
    // When avgX/avgY are not provided (API designed for external use), we use a simplified check:
    // slope must be large enough relative to a reference scale.
    // For pure classification without domain scale, we check |slope| against a practical threshold.
    // The caller is expected to pass meaningful values; here we simply check direction.
    if (Math.abs(slope) < 0.01) { return 'stable'; }

    if (r2 < 0.4) { return 'stable'; }

    if (slope > 0) { return 'increasing'; }
    return 'decreasing';
  }

  return {
    linearTrend: linearTrend,
    detectOutliers: detectOutliers,
    classifyTrend: classifyTrend
  };
});