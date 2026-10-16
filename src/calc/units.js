/* IntegrityWatch Field — units
   Pure unit conversions, clamp/round helpers and a deterministic PRNG (no DOM). */
(function (root, factory) {
  'use strict';
  var api = factory(root);
  root.IW = root.IW || {};
  root.IW.calc = root.IW.calc || {};
  root.IW.calc.units = api;
  if (typeof module === 'object' && module.exports) { module.exports = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  var MPY_TO_MM_YEAR = 0.0254;
  var MPY_TO_UM_YEAR = 25.4;

  function mpyToMmYear(mpy) { return mpy * MPY_TO_MM_YEAR; }
  function mpyToUmYear(mpy) { return mpy * MPY_TO_UM_YEAR; }
  function mmYearToMpy(mmY) { return mmY / MPY_TO_MM_YEAR; }

  function cToF(c) { return (c * 9 / 5) + 32; }
  function fToC(f) { return (f - 32) * 5 / 9; }
  function cToR(c) { return (c + 273.15) * 9 / 5; }
  function fToR(f) { return f + 459.67; }
  function kToC(k) { return k - 273.15; }
  function cToK(c) { return c + 273.15; }

  function psiToKpa(p) { return p * 6.894757293; }
  function kpaToPsi(k) { return k * 0.145037738; }
  function barToKpa(b) { return b * 100; }
  function kpaToBar(k) { return k / 100; }

  function in2ToCm2(a) { return a * 6.4516; }
  function lbhToKgh(w) { return w * 0.45359237; }
  function gpmToM3h(q) { return q * 0.227124707; }

  function clamp(v, min, max) {
    if (v < min) { return min; }
    if (v > max) { return max; }
    return v;
  }

  function round(v, dec) {
    var d = (dec === undefined || dec === null) ? 0 : dec;
    var factor = Math.pow(10, d);
    return Math.round(v * factor) / factor;
  }

  function mulberry32(seed) {
    var a = seed >>> 0;
    return function () {
      a |= 0;
      a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  return {
    MPY_TO_MM_YEAR: MPY_TO_MM_YEAR,
    MPY_TO_UM_YEAR: MPY_TO_UM_YEAR,
    mpyToMmYear: mpyToMmYear,
    mpyToUmYear: mpyToUmYear,
    mmYearToMpy: mmYearToMpy,
    cToF: cToF,
    fToC: fToC,
    cToR: cToR,
    fToR: fToR,
    kToC: kToC,
    cToK: cToK,
    psiToKpa: psiToKpa,
    kpaToPsi: kpaToPsi,
    barToKpa: barToKpa,
    kpaToBar: kpaToBar,
    in2ToCm2: in2ToCm2,
    lbhToKgh: lbhToKgh,
    gpmToM3h: gpmToM3h,
    clamp: clamp,
    round: round,
    mulberry32: mulberry32
  };
});
