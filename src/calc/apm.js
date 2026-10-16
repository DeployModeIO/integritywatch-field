/* IntegrityWatch Field — apm
   Asset performance management metrics (availability, MTBF, MTTR, OEE, RBI). */
(function (root, factory) {
  'use strict';
  var api = factory(root);
  root.IW = root.IW || {};
  root.IW.calc = root.IW.calc || {};
  root.IW.calc.apm = api;
  if (typeof module === 'object' && module.exports) { module.exports = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  function availability(input) {
    input = input || {};
    var windowH = input.windowH;
    var downtimeH = input.downtimeH || 0;
    if (typeof windowH !== 'number' || windowH <= 0) { return null; }
    return ((windowH - downtimeH) / windowH) * 100;
  }

  function mtbf(input) {
    input = input || {};
    var windowH = input.windowH;
    var downtimeH = input.downtimeH || 0;
    var failureCount = input.failureCount;
    if (typeof failureCount !== 'number' || failureCount <= 0) { return null; }
    return (windowH - downtimeH) / failureCount;
  }

  function mttr(input) {
    input = input || {};
    var downtimeH = input.downtimeH || 0;
    var failureCount = input.failureCount;
    if (typeof failureCount !== 'number' || failureCount <= 0) { return null; }
    return downtimeH / failureCount;
  }

  function oee(input) {
    input = input || {};
    var a = input.a;
    var p = input.p;
    var q = input.q;
    return a * p * q;
  }

  function failureRate(input) {
    input = input || {};
    var failureCount = input.failureCount || 0;
    var windowH = input.windowH;
    if (typeof windowH !== 'number' || windowH <= 0) { return null; }
    return failureCount / windowH;
  }

  function rbiRisk(input) {
    input = input || {};
    var pof = input.pof;
    var cof = input.cof;
    var score = pof * cof;
    var band;
    if (score <= 4) { band = 'low'; }
    else if (score <= 9) { band = 'medium'; }
    else if (score <= 15) { band = 'high'; }
    else { band = 'veryHigh'; }
    return { score: score, band: band };
  }

  function roundHalf(v) {
    return Math.round(v * 2) / 2;
  }

  function inspectionIntervalMonths(input) {
    input = input || {};
    var band = input.band;
    var baseMonths = input.baseMonths;
    if (band === 'low') { return roundHalf(baseMonths); }
    if (band === 'medium') { return roundHalf(0.75 * baseMonths); }
    if (band === 'high') { return roundHalf(0.5 * baseMonths); }
    if (band === 'veryHigh') { return roundHalf(0.25 * baseMonths); }
    return roundHalf(baseMonths);
  }

  function nextInspectionDate(input) {
    input = input || {};
    var fromISO = input.fromISO;
    var months = input.months || 0;
    var d = new Date(fromISO);
    if (isNaN(d.getTime())) { return null; }
    d.setUTCMonth(d.getUTCMonth() + months);
    return d.toISOString();
  }

  return {
    availability: availability,
    mtbf: mtbf,
    mttr: mttr,
    oee: oee,
    failureRate: failureRate,
    rbiRisk: rbiRisk,
    inspectionIntervalMonths: inspectionIntervalMonths,
    nextInspectionDate: nextInspectionDate
  };
});
