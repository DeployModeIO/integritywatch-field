/* IntegrityWatch Field — reliability
   Weibull reliability statistics (ISO 14224) for asset performance management.
   RRX regression (Bernard median ranks), Wilson-Hilferty chi-square approximation,
   MTBF confidence intervals, failure probability projections. */
(function (root, factory) {
  'use strict';
  var api = factory(root);
  root.IW = root.IW || {};
  root.IW.calc = root.IW.calc || {};
  root.IW.calc.reliability = api;
  if (typeof module === 'object' && module.exports) { module.exports = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  function isFiniteNumber(v) {
    return typeof v === 'number' && isFinite(v);
  }

  // Bernard approximation: F_i = (i - 0.3) / (n + 0.4)
  function medianRanks(n) {
    if (typeof n !== 'number' || n < 1 || !isFinite(n)) { return []; }
    var denom = n + 0.4;
    var out = new Array(n);
    for (var i = 1; i <= n; i++) { out[i - 1] = (i - 0.3) / denom; }
    return out;
  }

  // Weibull parameter estimation via RRX (rank regression on x).
  // x = ln(t), y = ln(-ln(1 - F)), then linear regression: β = slope, η = exp(-intercept/β).
  function weibullFit(failureTimes) {
    var raw = (failureTimes || []).slice();
    var tFiltered = [];
    for (var i = 0; i < raw.length; i++) {
      if (isFiniteNumber(raw[i]) && raw[i] > 0) { tFiltered.push(raw[i]); }
    }
    var n = tFiltered.length;
    if (n < 2) { return { insufficient: true, n: n }; }

    tFiltered.sort(function (a, b) { return a - b; });
    var ranks = medianRanks(n);
    var sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0, sumY2 = 0;

    for (var j = 0; j < n; j++) {
      var x = Math.log(tFiltered[j]);
      var F = ranks[j];
      var y = Math.log(-Math.log(1 - F));
      sumX += x;
      sumY += y;
      sumXY += x * y;
      sumX2 += x * x;
      sumY2 += y * y;
    }

    var denom = n * sumX2 - sumX * sumX;
    if (denom === 0) { return { insufficient: true, n: n }; }

    var beta = (n * sumXY - sumX * sumY) / denom;
    var intercept = (sumY - beta * sumX) / n;
    var eta = Math.exp(-intercept / beta);

    var ssRes = 0, ssTot = 0;
    var yMean = sumY / n;
    for (var k = 0; k < n; k++) {
      var xk = Math.log(tFiltered[k]);
      var yPred = beta * xk + intercept;
      var yk = Math.log(-Math.log(1 - ranks[k]));
      ssRes += (yk - yPred) * (yk - yPred);
      ssTot += (yk - yMean) * (yk - yMean);
    }
    var r2 = ssTot > 0 ? 1 - ssRes / ssTot : 0;

    return { beta: beta, eta: eta, r2: r2, n: n };
  }

  // Weibull CDF: F(t) = 1 - exp(-(t/eta)^beta)
  function weibullCdf(t, beta, eta) {
    if (!isFiniteNumber(t) || t <= 0 || !isFiniteNumber(beta) || beta <= 0 || !isFiniteNumber(eta) || eta <= 0) {
      return 0;
    }
    var val = 1 - Math.exp(-Math.pow(t / eta, beta));
    return val < 0 ? 0 : val > 1 ? 1 : val;
  }

  // B10 life: time at which 10% of population has failed.
  function b10Life(beta, eta) {
    if (!isFiniteNumber(beta) || beta <= 0 || !isFiniteNumber(eta) || eta <= 0) { return null; }
    return eta * Math.pow(-Math.log(0.9), 1 / beta);
  }

  // Failure pattern classification from β (ISO 14224 guidance).
  function failurePattern(beta) {
    if (beta === 'insufficient' || typeof beta === 'string') { return 'insufficient'; }
    if (!isFiniteNumber(beta)) { return 'insufficient'; }
    if (beta < 0.8) { return 'early-life'; }
    if (beta <= 1.2) { return 'random'; }
    return 'wear-out';
  }

  // Wilson-Hilferty chi-square quantile approximation.
  function chiSqQuantile(df, p) {
    if (df <= 0 || !isFiniteNumber(df)) { return 0; }
    var z;
    if (Math.abs(p - 0.9) < 1e-14) { z = 1.2816; }
    else if (Math.abs(p - 0.95) < 1e-14) { z = 1.6449; }
    else if (Math.abs(p - 0.05) < 1e-14) { z = -1.6449; }
    else if (Math.abs(p - 0.1) < 1e-14) { z = -1.2816; }
    else { return df; }
    var term = 1 - 2 / (9 * df) + z * Math.sqrt(2 / (9 * df));
    return df * Math.pow(Math.max(term, 0), 3);
  }

  // MTBF with confidence interval using chi-square bounds (exponential assumption).
  function mtbfWithCi(totalHours, failures, conf) {
    var k = (typeof failures === 'number' && failures > 0) ? failures : 0;
    if (!isFiniteNumber(totalHours) || totalHours <= 0) {
      return { mtbf: Infinity, lo: null, hi: null };
    }
    if (k <= 0) {
      return { mtbf: Infinity, lo: null, hi: null };
    }

    var mtbf = totalHours / k;
    var df = 2 * k;
    var alpha = 1 - conf;
    var chiHi = chiSqQuantile(df, 1 - alpha / 2);
    var chiLo = chiSqQuantile(df, alpha / 2);

    if (chiHi <= 0 || chiLo <= 0) {
      return { mtbf: mtbf, lo: null, hi: null };
    }

    var lo = (2 * totalHours) / chiHi;
    var hi = (2 * totalHours) / chiLo;
    return { mtbf: mtbf, lo: lo, hi: hi };
  }

  // Failure probability at given day offsets.
  function failureProbabilities(beta, eta, daysList) {
    var out = [];
    (daysList || []).forEach(function (days) {
      var hours = days * 24;
      out.push({ days: days, hours: hours, prob: weibullCdf(hours, beta, eta) });
    });
    return out;
  }

  return {
    medianRanks: medianRanks,
    weibullFit: weibullFit,
    weibullCdf: weibullCdf,
    b10Life: b10Life,
    failurePattern: failurePattern,
    chiSqQuantile: chiSqQuantile,
    mtbfWithCi: mtbfWithCi,
    failureProbabilities: failureProbabilities
  };
});