/* IntegrityWatch Field — psv
   Pressure relief valve sizing per API 520 Part I (sizing) and API 526 (orifices). */
(function (root, factory) {
  'use strict';
  var api = factory(root);
  root.IW = root.IW || {};
  root.IW.calc = root.IW.calc || {};
  root.IW.calc.psv = api;
  if (typeof module === 'object' && module.exports) { module.exports = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  // Protected sibling require: resolves at load time in Node only, never in the browser.
  var units = null;
  try { units = require('./units.js'); } catch (e) { units = null; }

  // Cross-module access ONLY at call time (CONTRACTS §1).
  function getUnits() {
    if (root.IW && root.IW.calc && root.IW.calc.units) { return root.IW.calc.units; }
    return units;
  }

  function in2ToCm2(a) {
    var u = getUnits();
    if (u && typeof u.in2ToCm2 === 'function') { return u.in2ToCm2(a); }
    return a * 6.4516;
  }

  function makeError(code, message) {
    var e = new Error(message);
    e.code = code;
    return e;
  }

  function isNum(v) { return typeof v === 'number' && isFinite(v); }

  function resolvedInput(input, defaults) {
    var out = {};
    var key;
    if (input) {
      for (key in input) {
        if (Object.prototype.hasOwnProperty.call(input, key)) { out[key] = input[key]; }
      }
    }
    for (key in defaults) {
      if (Object.prototype.hasOwnProperty.call(defaults, key)) { out[key] = defaults[key]; }
    }
    return out;
  }

  // Linear interpolation with clamping outside the table range.
  function piecewise(table, x) {
    if (x <= table[0][0]) { return table[0][1]; }
    for (var i = 1; i < table.length; i++) {
      if (x <= table[i][0]) {
        var x0 = table[i - 1][0];
        var y0 = table[i - 1][1];
        var x1 = table[i][0];
        var y1 = table[i][1];
        return y0 + (y1 - y0) * (x - x0) / (x1 - x0);
      }
    }
    return table[table.length - 1][1];
  }

  /* API 526 standard effective orifice areas (in²), letters D through T. */
  var ORIFICES_526 = [
    { letter: 'D', areaIn2: 0.110 },
    { letter: 'E', areaIn2: 0.196 },
    { letter: 'F', areaIn2: 0.307 },
    { letter: 'G', areaIn2: 0.503 },
    { letter: 'H', areaIn2: 0.785 },
    { letter: 'J', areaIn2: 1.287 },
    { letter: 'K', areaIn2: 1.838 },
    { letter: 'L', areaIn2: 2.853 },
    { letter: 'M', areaIn2: 3.60 },
    { letter: 'N', areaIn2: 4.34 },
    { letter: 'P', areaIn2: 6.38 },
    { letter: 'Q', areaIn2: 11.05 },
    { letter: 'R', areaIn2: 16.00 },
    { letter: 'T', areaIn2: 26.00 }
  ];

  /* Backpressure correction factor Kb for balanced-bellows PRVs (vapors/gases).
     Piecewise-linear digitization of API 520 Pt I backpressure correction curves
     (verify against current edition — see docs/STANDARDS.md disclaimer).
     x = superimposed backpressure ratio Pb/P1 (%), y = Kb. */
  var KB_TABLE = [
    [0, 1.00],
    [10, 1.00],
    [20, 1.00],
    [30, 1.00],
    [40, 0.96],
    [45, 0.92],
    [50, 0.85],
    [52, 0.79],
    [54, 0.72],
    [55, 0.65]
  ];

  /* Backpressure correction factor Kw for balanced-bellows PRVs (liquids).
     Piecewise-linear digitization of API 520 Pt I backpressure correction curves
     (verify against current edition — see docs/STANDARDS.md disclaimer).
     x = backpressure ratio Pb/P1 (%), y = Kw. */
  var KW_TABLE = [
    [0, 1.00],
    [10, 1.00],
    [20, 1.00],
    [30, 1.00],
    [40, 0.96],
    [50, 0.93],
    [60, 0.90],
    [70, 0.87],
    [80, 0.84],
    [90, 0.81],
    [100, 0.78]
  ];

  /* Viscosity correction factor Kv for liquids — analytical form (API 520 Pt I §5.8.2;
     VERIFY against current edition). Kv = min(1, 1/(0.9935 + 2.878/√Re + 342.75/Re^1.5)).
     Monotonic non-decreasing in Re and capped at 1 for Re ≳ 2e5. */
  function kvFromRe(Re) {
    var k = 1 / (0.9935 + 2.878 / Math.sqrt(Re) + 342.75 / Math.pow(Re, 1.5));
    return k > 1 ? 1 : k;
  }

  /* Reynolds number at a selected orifice area (API 520 Pt I §5.8.2).
     Re = ρ·v·d/μ with v = Q/A_orif and d = √(4·A_orif/π), computed internally in SI.
     Kinematic viscosity ν_cSt = viscCp/G; density ρ = G·998 kg/m³ (water at ~20 °C,
     documented approximation — ρ cancels because μ = ρ·ν, so Re = v·d/ν).
     USC verification shortcut: Re ≈ 2803·Q_gpm/(√A_in²·ν_cSt). */
  var RHO_WATER_KGM3 = 998;
  function reynoldsAtOrifice(Qgpm, AorifIn2, viscCp, G) {
    var Q = Qgpm * 6.30902e-5;              // gpm → m³/s
    var A = AorifIn2 * 6.4516e-4;           // in² → m²
    var d = Math.sqrt(4 * A / Math.PI);     // hydraulic diameter, m
    var v = Q / A;                          // velocity, m/s
    var rho = G * RHO_WATER_KGM3;           // kg/m³
    var nuCst = viscCp / G;                 // kinematic viscosity, cSt
    var nu = nuCst * 1e-6;                  // m²/s
    var mu = rho * nu;                      // dynamic viscosity, Pa·s
    return rho * v * d / mu;                // = v·d/ν (ρ cancels)
  }

  /* Flow coefficient C: C = Kc0·sqrt(k·(2/(k+1))^((k+1)/(k-1))).
     USC Kc0 = 520; SI Kc0 = 0.03948. k must be > 1. */
  function flowCoefficientC(k, units) {
    if (!isNum(k) || k <= 1) {
      throw makeError('E_K', 'specific heat ratio k must be greater than 1');
    }
    var s = Math.sqrt(k * Math.pow(2 / (k + 1), (k + 1) / (k - 1)));
    if (units === 'si') { return 0.03948 * s; }
    return 520 * s;
  }

  /* Critical (choked) pressure ratio r_c = (2/(k+1))^(k/(k-1)). */
  function criticalPressureRatio(k) {
    if (!isNum(k) || k <= 1) {
      throw makeError('E_K', 'specific heat ratio k must be greater than 1');
    }
    return Math.pow(2 / (k + 1), k / (k - 1));
  }

  /* Flow is critical when the downstream/upstream pressure ratio is at or below r_c. */
  function isCriticalFlow(P1psia, P2psia, k) {
    return (P2psia / P1psia) <= criticalPressureRatio(k);
  }

  /* Gas/vapor sizing (API 520 Pt I §5.6). Returns area in in² (plus cm² for display). */
  function sizeGasVapor(input) {
    var W = input.Wlbh;
    var P1 = input.P1psia;
    var P2 = input.P2psia;
    var T = input.TR;
    var Z = input.Z;
    var M = input.M;
    var k = input.k;
    var Kd = (input.Kd === undefined) ? 0.975 : input.Kd;
    var Kb = (input.Kb === undefined) ? 1 : input.Kb;
    var Kc = (input.Kc === undefined) ? 1 : input.Kc;

    var C = flowCoefficientC(k, 'usc');
    var critical = isCriticalFlow(P1, P2, k);

    var AreqIn2;
    var F2;
    if (critical) {
      AreqIn2 = W * Math.sqrt(T * Z / M) / (C * Kd * P1 * Kb * Kc);
    } else {
      var r = P2 / P1;
      F2 = Math.sqrt((k / (k - 1)) * Math.pow(r, 2 / k) * (1 - Math.pow(r, (k - 1) / k)) / (1 - r));
      AreqIn2 = W * Math.sqrt(T * Z / (M * P1 * (P1 - P2))) / (735 * F2 * Kd * Kc);
    }

    var result = {
      AreqIn2: AreqIn2,
      AreqCm2: in2ToCm2(AreqIn2),
      critical: critical,
      C: C,
      inputs: resolvedInput(input, { Kd: Kd, Kb: Kb, Kc: Kc })
    };
    if (!critical) { result.F2 = F2; }
    return result;
  }

  /* Liquid sizing (API 520 Pt I §5.8) with analytical viscosity correction (§5.8.2).
     ΔP convention: P1 = setPressurePsig·(1+overpressurePct/100)+14.7 psia when
     setPressurePsig is supplied, otherwise P1psig is used directly; P2 is
     backPressurePsig+14.7 or P2psig directly. The +14.7 offset cancels in ΔP. */
  function sizeLiquid(input) {
    var Q = input.Qgpm;
    var G = input.G;
    var Kd = (input.Kd === undefined) ? 0.65 : input.Kd;
    var Kw = (input.Kw === undefined) ? 1 : input.Kw;
    var Kc = (input.Kc === undefined) ? 1 : input.Kc;

    var P1;
    var P2;
    if (isNum(input.setPressurePsig)) {
      var op = (input.overpressurePct === undefined) ? 10 : input.overpressurePct;
      P1 = input.setPressurePsig * (1 + op / 100) + 14.7;
      P2 = (isNum(input.backPressurePsig) ? input.backPressurePsig : 0) + 14.7;
    } else {
      P1 = input.P1psig;
      P2 = input.P2psig;
    }
    var dP = P1 - P2;
    if (!(dP > 0)) {
      throw makeError('E_P1LEP2', 'liquid differential pressure must be positive');
    }

    // Area with Kv = 1 (uncorrected for viscosity).
    var base = Q * Math.sqrt(G / dP) / (38 * Kd * Kw * Kc);

    var Kv = 1;
    var Re = null;
    var iterations = 0;
    var reRangeWarning;
    var A = base;

    // Iterate: A(Kv=1) → selectOrifice → Re(orifice) → Kv → A → reconverge (≤20 iter).
    if (isNum(input.viscCp) && input.viscCp > 0) {
      var maxIter = 20;
      for (var i = 0; i < maxIter; i++) {
        var orifice = selectOrifice(A);
        var Aorif = (orifice && !orifice.error) ? orifice.areaIn2 : A;
        Re = reynoldsAtOrifice(Q, Aorif, input.viscCp, G);
        var KvNext = kvFromRe(Re);
        var ANext = base / KvNext;
        iterations = i + 1;
        if (Math.abs(ANext - A) / A < 0.0001) {
          A = ANext;
          Kv = KvNext;
          break;
        }
        A = ANext;
        Kv = KvNext;
      }
      if (Re < 100) { reRangeWarning = 'E_RE_RANGE'; }
    }

    var result = {
      AreqIn2: A,
      AreqCm2: in2ToCm2(A),
      Kv: Kv,
      Re: Re,
      iterations: iterations,
      inputs: resolvedInput(input, { Kd: Kd, Kw: Kw, Kc: Kc })
    };
    if (reRangeWarning) { result.reRangeWarning = reRangeWarning; }
    return result;
  }

  /* Backpressure correction factor Kb for gas/vapor (API 520 Pt I Figure 30).
     pilot → 1.0; conventional → 1.0 (superimposed backpressure >10 % requires a
     balanced bellows valve — surfaced to the UI as message E_BP_CONV); balanced → KB_TABLE. */
  function kbBackpressure(input) {
    var valveType = input.valveType || 'conventional';
    if (valveType === 'pilot') { return 1; }
    if (valveType === 'balanced') {
      var op = (input.overpressurePct === undefined) ? 10 : input.overpressurePct;
      var P1 = input.setPressurePsig * (1 + op / 100);
      var ratioPct = (input.backPressurePsig / P1) * 100;
      return piecewise(KB_TABLE, ratioPct);
    }
    return 1; // conventional
  }

  /* Backpressure correction factor Kw for liquids (API 520 Pt I Figure 31).
     conventional → 1.0; pilot → 1.0; balanced → KW_TABLE. */
  function kwBackpressureLiquid(input) {
    var valveType = input.valveType || 'conventional';
    if (valveType === 'conventional' || valveType === 'pilot') { return 1; }
    var ratioPct = (input.backPressurePsig / input.setPressurePsig) * 100;
    return piecewise(KW_TABLE, ratioPct);
  }

  /* Smallest API 526 orifice with area >= required. */
  function selectOrifice(AreqIn2) {
    for (var i = 0; i < ORIFICES_526.length; i++) {
      if (ORIFICES_526[i].areaIn2 >= AreqIn2) {
        return { letter: ORIFICES_526[i].letter, areaIn2: ORIFICES_526[i].areaIn2 };
      }
    }
    return { letter: null, error: 'E_OVER_T' };
  }

  /* Actual capacity and margin for a selected orifice area. */
  function realCapacity(input) {
    var ratio = input.orificeAreaIn2 / input.AreqIn2;
    var result = { marginPct: (ratio - 1) * 100 };
    if (isNum(input.Wlbh)) { result.WrealLbh = input.Wlbh * ratio; }
    if (isNum(input.Qgpm)) { result.QrealGpm = input.Qgpm * ratio; }
    return result;
  }

  /* Validate a sizing input object, returning [{ code, field, messageKey }]. */
  function validateInput(input) {
    input = input || {};
    var errors = [];
    var isMissing = function (v) { return v === undefined || v === null || v === ''; };
    function push(code, field) { errors.push({ code: code, field: field, messageKey: 'psv.err.' + code.toLowerCase() }); }

    if (isMissing(input.setPressurePsig)) {
      push('E_EMPTY', 'setPressurePsig');
    } else if (!isNum(input.setPressurePsig) || input.setPressurePsig <= 0) {
      push('E_SET', 'setPressurePsig');
    }

    if (!isMissing(input.Z) && (!isNum(input.Z) || input.Z <= 0)) {
      push('E_Z', 'Z');
    }

    if (!isMissing(input.k) && (!isNum(input.k) || input.k <= 1)) {
      push('E_K', 'k');
    }

    if (!isMissing(input.TR) && (!isNum(input.TR) || input.TR <= 0)) {
      push('E_T', 'TR');
    }

    if (!isMissing(input.M) && (!isNum(input.M) || input.M <= 0)) {
      push('E_M', 'M');
    }

    if (!isMissing(input.G) && (!isNum(input.G) || input.G <= 0)) {
      push('E_G', 'G');
    }

    if (isMissing(input.Wlbh) && isMissing(input.Qgpm)) {
      push('E_NEG_FLOW', 'Wlbh');
    } else if (!isMissing(input.Wlbh) && (!isNum(input.Wlbh) || input.Wlbh <= 0)) {
      push('E_NEG_FLOW', 'Wlbh');
    } else if (!isMissing(input.Qgpm) && (!isNum(input.Qgpm) || input.Qgpm <= 0)) {
      push('E_NEG_FLOW', 'Qgpm');
    }

    if (isNum(input.P1psia) && isNum(input.P2psia) && input.P1psia <= input.P2psia) {
      push('E_P1LEP2', 'P2psia');
    }

    return errors;
  }

  return {
    ORIFICES_526: ORIFICES_526,
    KB_TABLE: KB_TABLE,
    KW_TABLE: KW_TABLE,
    flowCoefficientC: flowCoefficientC,
    criticalPressureRatio: criticalPressureRatio,
    isCriticalFlow: isCriticalFlow,
    sizeGasVapor: sizeGasVapor,
    sizeLiquid: sizeLiquid,
    kbBackpressure: kbBackpressure,
    kwBackpressureLiquid: kwBackpressureLiquid,
    kvFromRe: kvFromRe,
    selectOrifice: selectOrifice,
    realCapacity: realCapacity,
    validateInput: validateInput
  };
});
