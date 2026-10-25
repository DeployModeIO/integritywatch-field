/* IntegrityWatch Field — mic
   MIC screening checklist (adaptation of NACE TM0194/API 571 guidance).
   UMD-lite, pure, deterministic. */
(function (root, factory) {
  'use strict';
  var api = factory(root);
  root.IW = root.IW || {};
  root.IW.calc = root.IW.calc || {};
  root.IW.calc.mic = api;
  if (typeof module === 'object' && module.exports) { module.exports = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  function isNumber(v) { return typeof v === 'number' && isFinite(v); }

  function assess(input) {
    input = input || {};
    var freeWater = !!input.freeWater;

    if (!freeWater) {
      return {
        ok: true,
        score: 0,
        riskLevel: 'low',
        drivers: []
      };
    }

    var temperatureC = input.temperatureC;
    var stagnant = !!input.stagnant;
    var sulfate = !!input.sulfate;
    var deposits = !!input.deposits;
    var nearNeutralPh = !!input.nearNeutralPh;
    var sulfideSigns = !!input.sulfideSigns;
    var historyMic = !!input.historyMic;
    var highCounts = !!input.highCounts;

    var score = 0;
    var drivers = [];

    if (stagnant) {
      score += 3;
      drivers.push('mic.driver.stagnant');
    }

    if (isNumber(temperatureC) && temperatureC >= 20 && temperatureC <= 50) {
      score += 3;
      drivers.push('mic.driver.temperature');
    }

    if (sulfate) {
      score += 2;
      drivers.push('mic.driver.sulfate');
    }

    if (deposits) {
      score += 2;
      drivers.push('mic.driver.deposits');
    }

    if (nearNeutralPh) {
      score += 2;
      drivers.push('mic.driver.nearNeutralPh');
    }

    if (sulfideSigns) {
      score += 3;
      drivers.push('mic.driver.sulfideSigns');
    }

    if (historyMic) {
      score += 3;
      drivers.push('mic.driver.historyMic');
    }

    if (highCounts) {
      score += 3;
      drivers.push('mic.driver.highCounts');
    }

    // Cap at 15
    if (score > 15) { score = 15; }

    var riskLevel;
    if (score < 6) { riskLevel = 'low'; }
    else if (score <= 10) { riskLevel = 'moderate'; }
    else { riskLevel = 'high'; }

    return {
      ok: true,
      score: score,
      riskLevel: riskLevel,
      drivers: drivers
    };
  }

  return { assess: assess };
});