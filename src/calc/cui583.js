/* IntegrityWatch Field — cui583
   CUI screening per API RP 583/571 (qualitative adaptation, not
   the proprietary quantitative model). UMD-lite, pure, deterministic. */
(function (root, factory) {
  'use strict';
  var api = factory(root);
  root.IW = root.IW || {};
  root.IW.calc = root.IW.calc || {};
  root.IW.calc.cui583 = api;
  if (typeof module === 'object' && module.exports) { module.exports = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  function isNumber(v) { return typeof v === 'number' && isFinite(v); }

  function assess(input) {
    input = input || {};
    var materialClass = input.materialClass || 'cs';
    var operatingTempC = input.operatingTempC;
    var cyclicService = !!input.cyclicService;
    var steamTraced = !!input.steamTraced;
    var insulationType = input.insulationType || '';
    var coatingCondition = input.coatingCondition || 'good';
    var environment = input.environment || 'dry';
    var penetratingFeatures = !!input.penetratingFeatures;

    // Determine susceptibility band
    var susceptibility = 'none';
    var inBand = false;
    var inPeak = false;

    if (materialClass === 'cs') {
      if (operatingTempC >= -12 && operatingTempC <= 175) {
        susceptibility = 'in-band';
        inBand = true;
        if (operatingTempC >= 60 && operatingTempC <= 120) {
          susceptibility = 'peak';
          inPeak = true;
        }
      }
    } else if (materialClass === 'ss') {
      if (operatingTempC >= 60 && operatingTempC <= 205) {
        susceptibility = 'in-band';
        inBand = true;
      }
    }

    // Score accumulation
    var score = 0;

    // Base score from susceptibility
    if (inPeak) {
      score = 4;
    } else if (inBand) {
      score = 2;
    } else {
      // Out of band
      if (cyclicService || steamTraced) {
        score = 1;
      } else {
        score = 0;
      }
    }

    // Additive factors
    if (penetratingFeatures) { score += 2; }

    if (coatingCondition === 'none') { score += 2; }
    else if (coatingCondition === 'poor') { score += 1; }
    else if (coatingCondition === 'fair') { score += 1; }
    // coatingCondition 'good' → +0

    if (insulationType === 'mineral-wool' || insulationType === 'calcium-silicate') { score += 1; }
    else if (insulationType === 'closed-cell') { score += 0; }
    else if (insulationType === 'none') { score -= 2; }

    if (score < 0) { score = 0; }

    if (environment === 'marine') { score += 2; }
    else if (environment === 'coastal') { score += 1; }

    if (cyclicService && inBand) { score += 1; }
    if (steamTraced && inBand) { score += 1; }

    // Cap at 10
    if (score > 10) { score = 10; }

    // Risk level
    var riskLevel;
    if (susceptibility === 'none') {
      riskLevel = cyclicService ? 'moderate' : 'low';
    } else {
      if (score <= 2) { riskLevel = 'low'; }
      else if (score <= 5) { riskLevel = 'moderate'; }
      else if (score <= 8) { riskLevel = 'high'; }
      else { riskLevel = 'critical'; }
    }

    // Likelihood band
    var likelihoodBand;
    if (score <= 2) { likelihoodBand = 'low'; }
    else if (score <= 5) { likelihoodBand = 'medium'; }
    else { likelihoodBand = 'high'; }

    // Methods by risk level
    var methods = [];
    if (susceptibility !== 'none' || inBand || inPeak) {
      methods.push('cui.method.visual', 'cui.method.thermo');
      if (riskLevel === 'moderate' || riskLevel === 'high' || riskLevel === 'critical') {
        methods.push('cui.method.pec');
      }
      if (riskLevel === 'high' || riskLevel === 'critical') {
        methods.push('cui.method.rt', 'cui.method.gw', 'cui.method.utSpot');
      }
      if (riskLevel === 'critical') {
        methods.push('cui.method.utProgram');
      }
    } else {
      // Even out-of-band gets baseline methods
      methods.push('cui.method.visual', 'cui.method.thermo');
    }

    // Notes
    var notes = [];
    if (materialClass === 'ss' && isNumber(operatingTempC) && operatingTempC >= 60) {
      notes.push('cui.note.pt');
    }

    return {
      ok: true,
      susceptibility: susceptibility,
      likelihoodScore: score,
      riskLevel: riskLevel,
      likelihoodBand: likelihoodBand,
      methods: methods,
      notes: notes
    };
  }

  return { assess: assess };
});