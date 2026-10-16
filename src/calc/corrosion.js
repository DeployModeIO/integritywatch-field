/* IntegrityWatch Field — corrosion
   Corrosion engineering calculations (ASTM G4, SP0775, DWM, sour service, CP). */
(function (root, factory) {
  'use strict';
  var api = factory(root);
  root.IW = root.IW || {};
  root.IW.calc = root.IW.calc || {};
  root.IW.calc.corrosion = api;
  if (typeof module === 'object' && module.exports) { module.exports = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  // Node-only fallback so the sibling units module resolves even when this
  // file is required standalone (browser relies on script order in index.html).
  if (typeof require === 'function' && !(root.IW && root.IW.calc && root.IW.calc.units)) {
    try { require('./units.js'); } catch (e) { /* ignore */ }
  }

  // Every invalid-input error is an Error whose `.code` property equals
  // 'E_INPUT' (tests assert `err.code === 'E_INPUT'`).
  function inputError(message) {
    var e = new Error(message);
    e.code = 'E_INPUT';
    return e;
  }

  function isNumber(v) { return typeof v === 'number' && isFinite(v); }

  function units() { return root.IW && root.IW.calc && root.IW.calc.units; }

  // ASTM G4 gravimetric weight-loss corrosion rate: mpy = 534·ΔW / (ρ·A·t_h).
  // Exposure time from `hours`, or `days` (×24) when hours is absent.
  function crFromWeightLoss(input) {
    input = input || {};
    var deltaWmg = input.deltaWmg;
    var densityGcm3 = input.densityGcm3;
    var areaIn2 = input.areaIn2;
    if (!isNumber(deltaWmg) || deltaWmg < 0) { throw inputError('E_INPUT: deltaWmg must be >= 0'); }
    if (!isNumber(densityGcm3) || densityGcm3 <= 0) { throw inputError('E_INPUT: densityGcm3 must be > 0'); }
    if (!isNumber(areaIn2) || areaIn2 <= 0) { throw inputError('E_INPUT: areaIn2 must be > 0'); }
    var t = null;
    if (isNumber(input.hours)) { t = input.hours; }
    else if (isNumber(input.days)) { t = input.days * 24; }
    if (t === null || t <= 0) { throw inputError('E_INPUT: exposure time (hours or days) must be > 0'); }
    var mpy = 534 * deltaWmg / (densityGcm3 * areaIn2 * t);
    var U = units();
    return { mpy: mpy, mmYear: U.mpyToMmYear(mpy), umYear: U.mpyToUmYear(mpy) };
  }

  // NACE/AMPP SP0775 severity: <1 low, 1–<5 moderate, 5–<10 high, ≥10 severe.
  function classifySp0775(mpy) {
    if (mpy < 1) { return 'low'; }
    if (mpy < 5) { return 'moderate'; }
    if (mpy < 10) { return 'high'; }
    return 'severe';
  }

  // Inhibitor efficiency (%) = (blank − inhibited) / blank × 100; null if blank ≤ 0.
  function inhibitorEfficiency(input) {
    input = input || {};
    var blank = input.crBlankMpy;
    var inh = input.crInhibitedMpy;
    if (!isNumber(blank) || blank <= 0) { return null; }
    if (!isNumber(inh)) { return null; }
    return (blank - inh) / blank * 100;
  }

  // EI quality band: <70 poor, 70–<85 acceptable, 85–<90 good, ≥90 excellent.
  function eiBand(pct) {
    if (!isNumber(pct)) { return null; }
    if (pct < 70) { return 'poor'; }
    if (pct < 85) { return 'acceptable'; }
    if (pct < 90) { return 'good'; }
    return 'excellent';
  }

  // De Waard & Milliams sweet-corrosion screening model:
  //   log10(V mm/y) = 5.8 − 1710/T_K + 0.67·log10(pCO2 bar)
  function deWaardMilliams(input) {
    input = input || {};
    var tempC = input.tempC;
    var pCo2Bar = input.pCo2Bar;
    if (!isNumber(tempC)) { throw inputError('E_INPUT: tempC required'); }
    if (!isNumber(pCo2Bar) || pCo2Bar <= 0) { throw inputError('E_INPUT: pCo2Bar must be > 0'); }
    var tK = tempC + 273.15;
    var logMmY = 5.8 - (1710 / tK) + 0.67 * Math.log10(pCo2Bar);
    var mmYear = Math.pow(10, logMmY);
    return { mmYear: mmYear, mpy: units().mmYearToMpy(mmYear) };
  }

  // H2S partial pressure from total pressure (kPa or psia) and mole ppm.
  function partialPressureH2S(input) {
    input = input || {};
    var h2sPpm = input.h2sPpm;
    if (!isNumber(h2sPpm) || h2sPpm < 0) { throw inputError('E_INPUT: h2sPpm required (>= 0)'); }
    var kpa = null;
    if (isNumber(input.totalPressureKpa)) { kpa = input.totalPressureKpa; }
    else if (isNumber(input.totalPressurePsia)) { kpa = units().psiToKpa(input.totalPressurePsia); }
    if (kpa === null) { throw inputError('E_INPUT: totalPressureKpa or totalPressurePsia required'); }
    var ph2sKpa = kpa * (h2sPpm / 1e6);
    return { kpa: ph2sKpa, psia: units().kpaToPsi(ph2sKpa) };
  }

  // MR0175/ISO 15156 sour-service screening by H2S partial pressure:
  // <0.3 kPa low, 0.3–100 kPa moderate, >100 kPa high.
  // Screening only: the complete MR0175/ISO 15156 regions require pH and
  // chloride concentration, which are not part of this screening level.
  function classifyMr0175(ph2sKpa) {
    if (ph2sKpa < 0.3) { return 'low'; }
    if (ph2sKpa <= 100) { return 'moderate'; }
    return 'high';
  }

  // Residual-inhibitor balance vs target: pct = residual/target × 100,
  // window 80–150 % → onTarget; below 80 → under; above 150 → over.
  function inhibitorBalance(input) {
    input = input || {};
    var target = input.targetPpm;
    var residual = input.residualPpm;
    if (!isNumber(target) || target <= 0) { throw inputError('E_INPUT: targetPpm must be > 0'); }
    if (!isNumber(residual)) { throw inputError('E_INPUT: residualPpm required'); }
    var pct = residual / target * 100;
    var band = pct < 80 ? 'under' : (pct > 150 ? 'over' : 'onTarget');
    return { pct: pct, band: band };
  }

  // NACE SP0169 cathodic-protection adequacy: pass on −850 mV vs CSE
  // (on/instant-off) or on 100 mV cathodic polarization.
  function cpEvaluate(input) {
    input = input || {};
    var potential = input.potentialMvCse;
    var polarization = input.polarizationMv;
    var hasPotential = isNumber(potential);
    var hasPolarization = isNumber(polarization);
    var criteria = [];
    if (!hasPotential && !hasPolarization) { return { status: 'insufficient', criteria: criteria }; }
    if (hasPotential && potential <= -850) {
      criteria.push('potential <= -850 mV vs CSE');
      return { status: 'pass', criteria: criteria };
    }
    if (hasPolarization && polarization >= 100) {
      criteria.push('polarization >= 100 mV');
      return { status: 'pass', criteria: criteria };
    }
    if (hasPotential) { criteria.push('potential > -850 mV vs CSE'); }
    if (hasPolarization) { criteria.push('polarization < 100 mV'); }
    return { status: 'fail', criteria: criteria };
  }

  // Material density lookup delegating to the IW.data.materials catalogue.
  function materialDensity(materialId) {
    var catalogue = root.IW && root.IW.data && root.IW.data.materials;
    if (!catalogue || typeof catalogue.byId !== 'function') { return null; }
    var m = catalogue.byId(materialId);
    return m ? m.densityGcm3 : null;
  }

  return {
    crFromWeightLoss: crFromWeightLoss,
    classifySp0775: classifySp0775,
    inhibitorEfficiency: inhibitorEfficiency,
    eiBand: eiBand,
    deWaardMilliams: deWaardMilliams,
    partialPressureH2S: partialPressureH2S,
    classifyMr0175: classifyMr0175,
    inhibitorBalance: inhibitorBalance,
    cpEvaluate: cpEvaluate,
    materialDensity: materialDensity
  };
});
