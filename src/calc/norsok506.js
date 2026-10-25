/* IntegrityWatch Field — norsok506
   NORSOK M-506 CO2 corrosion rate screening model.
   UMD-lite, pure, deterministic. No runtime dependencies.
   Reference: NORSOK M-506 Rev.1/Rev.2, dungnt/norsokm506 implementation. */
(function (root, factory) {
  'use strict';
  var api = factory(root);
  root.IW = root.IW || {};
  root.IW.calc = root.IW.calc || {};
  root.IW.calc.norsok506 = api;
  if (typeof module === 'object' && module.exports) { module.exports = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  function isNumber(v) { return typeof v === 'number' && isFinite(v); }

  var KT_TABLE = [
    [5, 0.42],
    [15, 1.59],
    [20, 4.762],
    [40, 8.927],
    [60, 10.695],
    [80, 9.949],
    [90, 6.250],
    [120, 7.770],
    [150, 5.203]
  ];

  // f(pH) piecewise definitions keyed by temperature.
  // Each entry has range pairs: [low, high, formula, description]
  // where formula is an object with low/high expressions.
  var PH_DEFS = {
    5: [
      { lo: 3.5, hi: 4.6, fn: function(p) { return 2.0676 + 0.2309 * p; } },
      { lo: 4.6, hi: 6.5, fn: function(p) { return 4.342 - 1.061 * p + 0.0708 * p * p; } }
    ],
    15: [
      { lo: 3.5, hi: 4.6, fn: function(p) { return 2.0676 - 0.2309 * p; } },
      { lo: 4.6, hi: 6.5, fn: function(p) { return 4.986 - 1.191 * p + 0.0708 * p * p; } }
    ],
    20: [
      { lo: 3.5, hi: 4.6, fn: function(p) { return 2.0676 - 0.2309 * p; } },
      { lo: 4.6, hi: 6.5, fn: function(p) { return 5.1885 - 1.2353 * p + 0.0708 * p * p; } }
    ],
    40: [
      { lo: 3.5, hi: 4.6, fn: function(p) { return 2.0676 - 0.2309 * p; } },
      { lo: 4.6, hi: 6.5, fn: function(p) { return 5.1885 - 1.2353 * p + 0.0708 * p * p; } }
    ],
    60: [
      { lo: 3.5, hi: 4.6, fn: function(p) { return 1.836 - 0.1818 * p; } },
      { lo: 4.6, hi: 6.5, fn: function(p) { return 15.444 - 6.1291 * p + 0.8204 * p * p - 0.0371 * p * p * p; } }
    ],
    80: [
      { lo: 3.5, hi: 4.6, fn: function(p) { return 2.6727 - 0.3636 * p; } },
      { lo: 4.6, hi: 6.5, fn: function(p) { return 331.68 * Math.exp(-1.2618 * p); } }
    ],
    90: [
      { lo: 3.5, hi: 4.57, fn: function(p) { return 3.1355 - 0.4673 * p; } },
      { lo: 4.57, hi: 5.62, fn: function(p) { return 21254 * Math.exp(-2.1811 * p); } },
      { lo: 5.62, hi: 6.5, fn: function(p) { return 0.4014 - 0.0538 * p; } }
    ],
    120: [
      { lo: 3.5, hi: 4.3, fn: function(p) { return 1.5375 - 0.125 * p; } },
      { lo: 4.3, hi: 5, fn: function(p) { return 5.9757 - 1.157 * p; } },
      { lo: 5, hi: 6.5, fn: function(p) { return 0.546125 - 0.071225 * p; } }
    ],
    150: [
      { lo: 3.5, hi: 3.8, fn: function(p) { return 1; } },
      { lo: 3.8, hi: 5, fn: function(p) { return 17.634 - 7.0945 * p + 0.715 * p * p; } },
      { lo: 5, hi: 6.5, fn: function(p) { return 0.037; } }
    ]
  };

  var PH_TABLE_T_KEYS = Object.keys(PH_DEFS).map(Number).sort(function(a, b) { return a - b; });

  function interpolateKt(tempC) {
    var n = KT_TABLE.length;
    if (tempC <= KT_TABLE[0][0]) {
      if (tempC === KT_TABLE[0][0]) return { kt: KT_TABLE[0][1], bounds: [KT_TABLE[0][0], KT_TABLE[0][0]] };
      return null;
    }
    if (tempC >= KT_TABLE[n - 1][0]) {
      if (tempC === KT_TABLE[n - 1][0]) return { kt: KT_TABLE[n - 1][1], bounds: [KT_TABLE[n - 1][0], KT_TABLE[n - 1][0]] };
      return null;
    }
    for (var i = 0; i < n - 1; i++) {
      if (tempC >= KT_TABLE[i][0] && tempC <= KT_TABLE[i + 1][0]) {
        if (tempC === KT_TABLE[i][0]) return { kt: KT_TABLE[i][1], bounds: [KT_TABLE[i][0], KT_TABLE[i][0]] };
        if (tempC === KT_TABLE[i + 1][0]) return { kt: KT_TABLE[i + 1][1], bounds: [KT_TABLE[i + 1][0], KT_TABLE[i + 1][0]] };
        var frac = (tempC - KT_TABLE[i][0]) / (KT_TABLE[i + 1][0] - KT_TABLE[i][0]);
        return {
          kt: KT_TABLE[i][1] + frac * (KT_TABLE[i + 1][1] - KT_TABLE[i][1]),
          bounds: [KT_TABLE[i][0], KT_TABLE[i + 1][0]]
        };
      }
    }
    return null;
  }

  function computeFPH(tempC, ph) {
    var keys = PH_TABLE_T_KEYS;
    if (tempC <= keys[0]) {
      return evaluateAtTemp(keys[0], ph);
    }
    if (tempC >= keys[keys.length - 1]) {
      return evaluateAtTemp(keys[keys.length - 1], ph);
    }
    for (var i = 0; i < keys.length - 1; i++) {
      if (tempC >= keys[i] && tempC <= keys[i + 1]) {
        if (tempC === keys[i]) return evaluateAtTemp(keys[i], ph);
        if (tempC === keys[i + 1]) return evaluateAtTemp(keys[i + 1], ph);
        var lo = evaluateAtTemp(keys[i], ph);
        var hi = evaluateAtTemp(keys[i + 1], ph);
        if (lo === null || hi === null) return null;
        var frac = (tempC - keys[i]) / (keys[i + 1] - keys[i]);
        return {
          fph: lo.fph + frac * (hi.fph - lo.fph),
          phLow: lo.phLow,
          phHigh: lo.phHigh
        };
      }
    }
    return null;
  }

  function evaluateAtTemp(t, ph) {
    var defs = PH_DEFS[t];
    if (!defs) return null;
    for (var j = 0; j < defs.length; j++) {
      var d = defs[j];
      // For all brackets except the last, use inclusive lo, exclusive hi
      // to avoid double-matching at breakpoints (e.g. pH=4.6).
      if (ph >= d.lo && (j < defs.length - 1 ? ph < d.hi : ph <= d.hi)) {
        return { fph: d.fn(ph), phLow: d.lo, phHigh: d.hi };
      }
    }
    return null;
  }

  function computeFugacity(totalPressureBar, tempC) {
    var Pcapped = Math.min(totalPressureBar, 250);
    var TK = tempC + 273.15;
    var logA = Pcapped * (0.0031 - 1.4 / TK);
    return Math.pow(10, logA);
  }

  function computeShearDukler(flowVelocityMs, pipeIDmm, liquidDensityKgM3, liquidViscositymPaS, roughnessMm) {
    var u = flowVelocityMs;
    var D = pipeIDmm / 1000;
    var rho = liquidDensityKgM3;
    var mu = liquidViscositymPaS / 1000;
    var k = (roughnessMm || 0.05) / 1000;

    var kOverD = k / D;
    var reTerm = mu / (rho * u * D);
    var inner = 20000 * kOverD + 1e6 * reTerm;
    var f = 0.001375 * (1 + Math.pow(inner, 1/3));
    var S = 0.5 * rho * f * u * u;
    return S;
  }

  function glycolFactor(wtPct) {
    if (wtPct >= 95) return 0.008;
    return Math.pow(10, 1.6 * (Math.log10(100 - wtPct) - 2));
  }

  function inhibitorFactor(effPct) {
    return 1 - effPct / 100;
  }

  function computeCR(input) {
    input = input || {};
    var warnings = [];
    var errors = [];

    // Always warn about organic acids limitation
    warnings.push('W_ORGANIC_ACIDS');
    warnings.push('W_NO_H2S_O2');

    var temperatureC = input.temperatureC;
    var totalPressureBar = input.totalPressureBar;
    var co2MolePercent = input.co2MolePercent;
    var ph = input.ph;

    if (!isNumber(temperatureC)) {
      errors.push('E_MISSING_INPUT');
      return { ok: false, crMMPerYear: 0, terms: {}, warnings: warnings, errors: errors };
    }
    if (!isNumber(totalPressureBar) || !isNumber(co2MolePercent) || !isNumber(ph)) {
      errors.push('E_MISSING_INPUT');
      return { ok: false, crMMPerYear: 0, terms: {}, warnings: warnings, errors: errors };
    }

    if (temperatureC < 5 || temperatureC > 150) {
      errors.push('E_TEMP_RANGE');
      return { ok: false, crMMPerYear: 0, terms: {}, warnings: warnings, errors: errors };
    }

    if (ph < 3.5 || ph > 6.5) {
      errors.push('E_PH_RANGE');
      return { ok: false, crMMPerYear: 0, terms: {}, warnings: warnings, errors: errors };
    }

    // Kt interpolation
    var ktResult = interpolateKt(temperatureC);
    if (!ktResult) {
      errors.push('E_TEMP_RANGE');
      return { ok: false, crMMPerYear: 0, terms: {}, warnings: warnings, errors: errors };
    }

    // Fugacity
    var a = computeFugacity(totalPressureBar, temperatureC);
    var Pcapped = Math.min(totalPressureBar, 250);
    var pCO2Bar = (co2MolePercent / 100) * Pcapped;
    var fCO2Bar = a * pCO2Bar;

    if (pCO2Bar < 0.5) {
      warnings.push('W_PCO2_LOW');
    }
    if (fCO2Bar < 0.1 || fCO2Bar > 10) {
      warnings.push('W_OUT_OF_ENVELOPE');
    }

    // Shear stress
    var shearPa, shearMode;
    if (isNumber(input.wallShearPa)) {
      shearPa = input.wallShearPa;
      shearMode = 'direct';
    } else if (isNumber(input.flowVelocityMs) && isNumber(input.pipeIDmm) &&
               isNumber(input.liquidDensityKgM3) && isNumber(input.liquidViscositymPaS)) {
      if (input.flowVelocityMs <= 0 || input.pipeIDmm <= 0) {
        errors.push('E_SHEAR_INPUT');
        return { ok: false, crMMPerYear: 0, terms: {}, warnings: warnings, errors: errors };
      }
      shearPa = computeShearDukler(
        input.flowVelocityMs,
        input.pipeIDmm,
        input.liquidDensityKgM3,
        input.liquidViscositymPaS,
        input.roughnessMm
      );
      shearMode = 'computed';
    } else {
      errors.push('E_SHEAR_INPUT');
      return { ok: false, crMMPerYear: 0, terms: {}, warnings: warnings, errors: errors };
    }

    if (shearPa < 1 || shearPa > 150) {
      warnings.push('W_SHEAR_RANGE');
    }

    // f(pH)
    var fphResult = computeFPH(temperatureC, ph);
    var fPH = fphResult.fph;
    var phLow = fphResult.phLow;
    var phHigh = fphResult.phHigh;

    // Glycol / inhibitor reduction
    var glycolWtPct = isNumber(input.glycolWtPercent) ? input.glycolWtPercent : 0;
    var inhibitorEffPct = isNumber(input.inhibitorEfficiencyPercent) ? input.inhibitorEfficiencyPercent : 0;

    var reductionFactor = 1;
    var reductionSource = 'none';
    var gf = 1;
    var ifact = 1;

    if (glycolWtPct > 0) {
      gf = glycolFactor(glycolWtPct);
      reductionFactor = gf;
      reductionSource = 'glycol';
    }
    if (inhibitorEffPct > 0) {
      ifact = inhibitorFactor(inhibitorEffPct);
      if (reductionSource === 'none' || ifact < reductionFactor) {
        reductionFactor = ifact;
        reductionSource = 'inhibitor';
      }
    }

    // Exponent
    var exponent = 0.146 + 0.0324 * Math.log10(Math.max(fCO2Bar, 1e-10));

    // CR = Kt * fCO2^0.62 * (S/19)^exponent * f(pH) * R
    var fco2Pow = Math.pow(fCO2Bar, 0.62);
    var shearTerm = Math.pow(shearPa / 19, exponent);
    var crMMPerYear = ktResult.kt * fco2Pow * shearTerm * fPH * reductionFactor;

    var terms = {
      kt: ktResult.kt,
      ktLow: ktResult.bounds[0],
      ktHigh: ktResult.bounds[1],
      interpolatedT: ktResult.bounds,
      fPH: fPH,
      phLow: phLow,
      phHigh: phHigh,
      fugacityBar: fCO2Bar,
      pCO2Bar: pCO2Bar,
      shearPa: shearPa,
      shearMode: shearMode,
      exponent: exponent,
      reductionFactor: reductionFactor,
      reductionSource: reductionSource
    };

    return {
      ok: true,
      crMMPerYear: crMMPerYear,
      terms: terms,
      warnings: warnings,
      errors: errors
    };
  }

  return {
    computeCR: computeCR,
    KT_TABLE: KT_TABLE,
    PH_TABLE: PH_TABLE_T_KEYS.map(function(t) { return [t, PH_DEFS[t]]; })
  };
});