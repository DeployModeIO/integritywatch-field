/* IntegrityWatch Field — PSV sizing engine tests (T4)
   Anchors from docs/TESTS.md §6–§9. Pure math, no DOM, no network. */
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const psv = require('../src/calc/psv.js');

function rel(actual, expected, tolPct, label) {
  const tol = (tolPct === undefined ? 0.5 : tolPct) / 100;
  assert.ok(
    Math.abs(actual - expected) <= tol * Math.abs(expected),
    (label || '') + ` expected ${actual} ≈ ${expected} (±${tol * 100}%)`
  );
}

function codes(errors) {
  return errors.map((e) => e.code);
}

/* ------------------------------------------------------------------ */
/* §6 — flow coefficient C and critical flow                           */
/* ------------------------------------------------------------------ */

test('A6.1 C_usc(1.4)=356.06 and C_si(1.4)=0.027033 (TESTS.md §6)', () => {
  // C = 520·sqrt(k·(2/(k+1))^((k+1)/(k-1)));  k=1.4:
  // (2/2.4)^6 = 0.334898; ·1.4 = 0.468857; sqrt = 0.684732; ·520 = 356.06
  // SI coefficient 0.03948 · 0.684732 = 0.027033
  rel(psv.flowCoefficientC(1.4, 'usc'), 356.06, 0.5, 'C_usc');
  rel(psv.flowCoefficientC(1.4, 'si'), 0.027033, 0.5, 'C_si');
});

test('A6.2 C(1.001) ≈ 315.43 (limit k→1 = 520·e^(-1/2) = 315.4, TESTS.md §6)', () => {
  rel(psv.flowCoefficientC(1.001, 'usc'), 315.43, 0.5, 'C(1.001)');
});

test('A6.3 k≤1 throws Error with code E_K (TESTS.md §6)', () => {
  assert.throws(() => psv.flowCoefficientC(1.0, 'usc'), (e) => e && e.code === 'E_K');
  assert.throws(() => psv.flowCoefficientC(0.9, 'usc'), (e) => e && e.code === 'E_K');
});

test('A6.4 criticalPressureRatio (TESTS.md §6)', () => {
  // r_c = (2/(k+1))^(k/(k-1))
  // k=1.4: (2/2.4)^(1.4/0.4) = 0.83333^3.5 = e^(3.5·ln0.83333) = e^(-0.63813) = 0.5283
  rel(psv.criticalPressureRatio(1.4), 0.5283, 0.5, 'r_c(1.4)');
  // k=1.31: (2/2.31)^(1.31/0.31) = 0.86580^4.22581 = e^(4.22581·ln0.86580) = e^(-0.60885) = 0.5439
  rel(psv.criticalPressureRatio(1.31), 0.5439, 0.5, 'r_c(1.31)');
  // k=1.13: exact from the same expression (derived-from-formula anchor ±0.001)
  // (2/2.13)^(1.13/0.13) = 0.938967^8.69231 = e^(8.69231·ln0.938967) = e^(8.69231·(-0.06297)) = e^(-0.54734) = 0.5785
  const expected113 = Math.pow(2 / (1.13 + 1), 1.13 / (1.13 - 1));
  assert.ok(Math.abs(psv.criticalPressureRatio(1.13) - expected113) <= 0.001, 'r_c(1.13) vs formula');
});

test('A6.5 isCriticalFlow (TESTS.md §6)', () => {
  // P2/P1 = 14.7/124.7 = 0.1179 < 0.5439 → choked
  assert.equal(psv.isCriticalFlow(124.7, 14.7, 1.31), true);
  // P2/P1 = 60/100 = 0.6 > 0.5283 → not choked
  assert.equal(psv.isCriticalFlow(100, 60, 1.4), false);
});

/* ------------------------------------------------------------------ */
/* §7 — gas/vapor sizing (worked example)                              */
/* ------------------------------------------------------------------ */

function gasExample(overrides) {
  return Object.assign({
    Wlbh: 50000, P1psia: 124.7, P2psia: 14.7, TR: 600, Z: 0.95,
    M: 16.04, k: 1.31, Kd: 0.975, Kb: 1, Kc: 1
  }, overrides || {});
}

test('§7 gas example: A = 7.046 in², critical, C=347.93 (TESTS.md §7)', () => {
  const r = psv.sizeGasVapor(gasExample());
  // C(1.31) = 520·sqrt(1.31·(2/2.31)^(2.31/0.31)); sqrt term = 0.66910 → 347.93
  rel(r.C, 347.93, 0.5, 'C(1.31)');
  // sqrt(T·Z/M) = sqrt(570/16.04) = 5.9612; A = 50000·5.9612/(347.93·0.975·124.7) = 7.046
  rel(r.AreqIn2, 7.046, 0.5, 'AreqIn2');
  assert.equal(r.critical, true);
  assert.equal(r.F2, undefined, 'no F2 for critical flow');
  assert.equal(r.inputs.Kd, 0.975);
  rel(r.AreqCm2, r.AreqIn2 * 6.4516, 0.01, 'AreqCm2');
});

test('§7 selectOrifice(7.046) → Q (11.05 in²) (TESTS.md §7)', () => {
  const r = psv.sizeGasVapor(gasExample());
  const orifice = psv.selectOrifice(r.AreqIn2);
  assert.equal(orifice.letter, 'Q');
  assert.equal(orifice.areaIn2, 11.05);
});

test('§7 realCapacity: margin 56.8 %, Wreal 78413 lb/h (TESTS.md §7)', () => {
  const r = psv.sizeGasVapor(gasExample());
  const cap = psv.realCapacity({ orificeAreaIn2: 11.05, AreqIn2: r.AreqIn2, Wlbh: 50000 });
  assert.ok(Math.abs(cap.marginPct - 56.8) < 0.5, 'margin ≈ 56.8 %, got ' + cap.marginPct);
  rel(cap.WrealLbh, 78413, 0.5, 'Wreal');
  assert.equal(cap.QrealGpm, undefined, 'no liquid flow when only gas given');
});

test('A7.sub subcritical P2=90 psia: F2∈(0.6,0.9) and A_sub > A_crit (TESTS.md §7)', () => {
  const crit = psv.sizeGasVapor(gasExample());
  const sub = psv.sizeGasVapor(gasExample({ P2psia: 90 }));
  // r = 90/124.7 = 0.7217 > r_c(1.31)=0.5439 → subcritical
  assert.equal(sub.critical, false);
  assert.ok(sub.F2 > 0.6 && sub.F2 < 0.9, 'F2 in (0.6,0.9), got ' + sub.F2);
  // F2 = sqrt((k/(k-1))·r^(2/k)·(1-r^((k-1)/k))/(1-r))
  const r = 90 / 124.7;
  const k = 1.31;
  const F2 = Math.sqrt((k / (k - 1)) * Math.pow(r, 2 / k) * (1 - Math.pow(r, (k - 1) / k)) / (1 - r));
  rel(sub.F2, F2, 0.01, 'F2 vs formula');
  assert.ok(sub.AreqIn2 > crit.AreqIn2, 'subcritical area exceeds critical area');
});

/* ------------------------------------------------------------------ */
/* §8 — liquid sizing + analytical Kv (API 520 §5.8.2)                 */
/* ------------------------------------------------------------------ */

test('A8.water: Q=300, G=0.85, visc 1 cP → A=1.0677, orifice J, Kv=1 (TESTS.md §8)', () => {
  // ν = 1/0.85 = 1.176 cSt; A = 300·sqrt(0.85/110)/(38·0.65) = 1.0677 in²
  const r = psv.sizeLiquid({ Qgpm: 300, G: 0.85, P1psig: 124.7, P2psig: 14.7, Kd: 0.65, viscCp: 1 });
  rel(r.AreqIn2, 1.0677, 0.5, 'AreqIn2');
  assert.equal(psv.selectOrifice(r.AreqIn2).letter, 'J');
  // Re_orif = ρ·v·d/μ in orifice J (1.287 in²) ≈ 2803·300/(√1.287·1.176) ≈ 6.3e5
  rel(r.Re, 6.3e5, 5, 'Re');
  assert.equal(r.Kv, 1, 'Kv capped at 1 for Re ≥ 2e5');
  assert.equal(r.reRangeWarning, undefined);
  rel(r.AreqCm2, r.AreqIn2 * 6.4516, 0.01, 'AreqCm2');
});

test('A8.water realCapacity: margin 20.5 %, Qreal 361.9 gpm (TESTS.md §8)', () => {
  const r = psv.sizeLiquid({ Qgpm: 300, G: 0.85, P1psig: 124.7, P2psig: 14.7, Kd: 0.65 });
  const cap = psv.realCapacity({ orificeAreaIn2: 1.287, AreqIn2: r.AreqIn2, Qgpm: 300 });
  assert.ok(Math.abs(cap.marginPct - 20.5) < 0.5, 'margin ≈ 20.5 %, got ' + cap.marginPct);
  rel(cap.QrealGpm, 361.9, 0.5, 'Qreal');
  assert.equal(cap.WrealLbh, undefined);
});

test('A8.visc: Q=100, G=0.9, visc 1000 cP → A0=0.3841, orifice G, Kv≈0.8355 (TESTS.md §8)', () => {
  // ν = 1000/0.9 = 1111 cSt; ΔP=100; A0 = (100/24.7)·√(0.9/100) = 4.0486·0.09487 = 0.3841
  const base = { Qgpm: 100, G: 0.9, P1psig: 124.7, P2psig: 24.7, Kd: 0.65 };
  const noVisc = psv.sizeLiquid(base);
  rel(noVisc.AreqIn2, 0.3841, 0.5, 'A0');
  assert.equal(psv.selectOrifice(noVisc.AreqIn2).letter, 'G');

  const withVisc = psv.sizeLiquid(Object.assign({ viscCp: 1000 }, base));
  // Re_orif(G=0.503) ≈ 2803·100/(√0.503·1111) ≈ 356; Kv = 1/(0.9935+2.878/√356+342.75/356^1.5) ≈ 0.8355
  rel(withVisc.Re, 356, 5, 'Re');
  rel(withVisc.Kv, 0.8355, 0.5, 'Kv');
  // A_final = A0/Kv ≈ 0.4597 (still in orifice G)
  rel(withVisc.AreqIn2, 0.4597, 0.5, 'A_final');
  assert.equal(psv.selectOrifice(withVisc.AreqIn2).letter, 'G', 'area stays in orifice G');
  assert.ok(withVisc.iterations < 20, 'iterations < 20, got ' + withVisc.iterations);
  assert.ok(withVisc.AreqIn2 >= noVisc.AreqIn2, 'viscosity never shrinks required area');
});

test('A8.props kvFromRe monotonic non-decreasing and capped at 1 (TESTS.md §8)', () => {
  const kv = psv.kvFromRe;
  const prev = [100, 1000, 10000, 1e5, 2e5, 1e6];
  for (let i = 1; i < prev.length; i++) {
    assert.ok(kv(prev[i - 1]) <= kv(prev[i]), `Kv(${prev[i - 1]}) ≤ Kv(${prev[i]})`);
  }
  assert.ok(kv(100) < 1, 'Kv(100) < 1');
  assert.equal(kv(2e5), 1, 'Kv(2e5) capped to 1');
  assert.equal(kv(1e6), 1, 'Kv(1e6) capped to 1');
  // monotonic scan over a wide Re range
  let last = 0;
  for (let Re = 50; Re <= 2e5; Re *= 2) {
    const v = kv(Re);
    assert.ok(v >= last, `Kv monotonic at Re=${Re}`);
    last = v;
  }
});

test('A8.props viscCp absent or ≤0 → Kv=1 exactly without iterating (TESTS.md §8)', () => {
  const base = { Qgpm: 300, G: 0.85, P1psig: 124.7, P2psig: 14.7, Kd: 0.65 };
  const noVisc = psv.sizeLiquid(base);
  assert.equal(noVisc.Kv, 1);
  assert.equal(noVisc.iterations, 0);
  assert.equal(noVisc.Re, null);
  assert.equal(noVisc.reRangeWarning, undefined);

  const zeroVisc = psv.sizeLiquid(Object.assign({ viscCp: 0 }, base));
  assert.equal(zeroVisc.Kv, 1);
  assert.equal(zeroVisc.iterations, 0);
});

test('A8.props Re<100 → reRangeWarning E_RE_RANGE (TESTS.md §8)', () => {
  // Q=10, G=0.9, visc 1000 cP (ν=1111 cSt) → Re in orifice D(0.110) ≈ 76 < 100
  const r = psv.sizeLiquid({ Qgpm: 10, G: 0.9, P1psig: 124.7, P2psig: 24.7, Kd: 0.65, viscCp: 1000 });
  assert.ok(r.Re < 100, 'Re < 100, got ' + r.Re);
  assert.equal(r.reRangeWarning, 'E_RE_RANGE');
});

test('§8 liquid ΔP convention: setPressurePsig path matches direct P1/P2 (task item 2)', () => {
  // P1 = set·(1+op/100)+14.7 = 100·1.1+14.7 = 124.7; P2 = back+14.7 = 14.7 → ΔP = 110
  const direct = psv.sizeLiquid({ Qgpm: 300, G: 0.85, P1psig: 124.7, P2psig: 14.7, Kd: 0.65 });
  const viaSet = psv.sizeLiquid({ Qgpm: 300, G: 0.85, setPressurePsig: 100, overpressurePct: 10, backPressurePsig: 0, Kd: 0.65 });
  rel(viaSet.AreqIn2, direct.AreqIn2, 0.001, 'set-pressure path ≡ direct path');
});

/* ------------------------------------------------------------------ */
/* §8.tablas — digitized tables: monotonicity, endpoints, interpolation */
/* ------------------------------------------------------------------ */

function isNonIncreasing(arr) {
  for (let i = 1; i < arr.length; i++) {
    if (arr[i][1] > arr[i - 1][1] + 1e-12) return false;
  }
  return true;
}

test('A8.tablas KB_TABLE/KW_TABLE monotonic non-increasing in backpressure ratio', () => {
  assert.ok(isNonIncreasing(psv.KB_TABLE), 'KB_TABLE non-increasing');
  assert.ok(isNonIncreasing(psv.KW_TABLE), 'KW_TABLE non-increasing');
});

test('A8.tablas endpoints: Kb(balanced,0%)=1, Kb(pilot)=1, Kw(conventional)=1', () => {
  assert.equal(psv.kbBackpressure({ valveType: 'balanced', backPressurePsig: 0, setPressurePsig: 100, overpressurePct: 10 }), 1);
  assert.equal(psv.kbBackpressure({ valveType: 'pilot', backPressurePsig: 50, setPressurePsig: 100 }), 1);
  assert.equal(psv.kwBackpressureLiquid({ valveType: 'conventional', backPressurePsig: 50, setPressurePsig: 100 }), 1);
  assert.equal(psv.kwBackpressureLiquid({ valveType: 'pilot', backPressurePsig: 50, setPressurePsig: 100 }), 1);
  assert.equal(psv.kbBackpressure({ valveType: 'conventional', backPressurePsig: 0, setPressurePsig: 100 }), 1);
});

test('A8.tablas linear interpolation anchored at 2 knots per table', () => {
  // KB_TABLE knots [40,0.96],[45,0.92] → midpoint 42.5 % → 0.94
  const kb = psv.kbBackpressure({ valveType: 'balanced', backPressurePsig: 46.75, setPressurePsig: 100, overpressurePct: 10 });
  // ratio = 46.75 / (100·1.10) · 100 = 42.5 %
  rel(kb, 0.94, 0.01, 'Kb at 42.5 %');
  // KW_TABLE knots [60,0.90],[70,0.87] → midpoint 65 % → 0.885
  const kw = psv.kwBackpressureLiquid({ valveType: 'balanced', backPressurePsig: 65, setPressurePsig: 100 });
  rel(kw, 0.885, 0.01, 'Kw at 65 %');
});

/* ------------------------------------------------------------------ */
/* §9 — API 526 orifice selection                                      */
/* ------------------------------------------------------------------ */

test('A9.1 selectOrifice boundaries (TESTS.md §9)', () => {
  assert.equal(psv.selectOrifice(0.100).letter, 'D');
  assert.equal(psv.selectOrifice(0.110).letter, 'D'); // exact boundary
  assert.equal(psv.selectOrifice(0.111).letter, 'E');
  assert.equal(psv.selectOrifice(1.287).letter, 'J');
  assert.equal(psv.selectOrifice(1.29).letter, 'K');
  assert.equal(psv.selectOrifice(26.0).letter, 'T');
  const over = psv.selectOrifice(26.1);
  assert.equal(over.letter, null);
  assert.equal(over.error, 'E_OVER_T');
});

test('A9.2 realCapacity margin Areq 5.726 → P(6.38): 11.4 % (TESTS.md §9)', () => {
  const o = psv.selectOrifice(5.726);
  assert.equal(o.letter, 'P');
  const cap = psv.realCapacity({ orificeAreaIn2: 6.38, AreqIn2: 5.726 });
  assert.ok(Math.abs(cap.marginPct - 11.4) < 0.5, 'margin ≈ 11.4 %, got ' + cap.marginPct);
});

test('ORIFICES_526 has 14 letters D..T with exact areas (CONTRACTS §4.3)', () => {
  const areas = {
    D: 0.110, E: 0.196, F: 0.307, G: 0.503, H: 0.785, J: 1.287, K: 1.838,
    L: 2.853, M: 3.60, N: 4.34, P: 6.38, Q: 11.05, R: 16.00, T: 26.00
  };
  assert.equal(psv.ORIFICES_526.length, 14);
  for (const o of psv.ORIFICES_526) {
    assert.equal(o.areaIn2, areas[o.letter], 'area of ' + o.letter);
  }
});

/* ------------------------------------------------------------------ */
/* validateInput — error codes with minimal fixtures                   */
/* ------------------------------------------------------------------ */

test('validateInput E_EMPTY (missing set pressure)', () => {
  const errs = psv.validateInput({});
  assert.ok(codes(errs).includes('E_EMPTY'));
  const e = errs.find((x) => x.code === 'E_EMPTY');
  assert.equal(e.field, 'setPressurePsig');
  assert.ok(e.messageKey);
});

test('validateInput E_SET (non-positive set pressure)', () => {
  const errs = psv.validateInput({ setPressurePsig: -10, Wlbh: 1000 });
  assert.ok(codes(errs).includes('E_SET'));
});

test('validateInput E_Z (compressibility ≤ 0)', () => {
  assert.ok(codes(psv.validateInput({ setPressurePsig: 100, Wlbh: 1000, Z: 0 })).includes('E_Z'));
});

test('validateInput E_K (k ≤ 1)', () => {
  assert.ok(codes(psv.validateInput({ setPressurePsig: 100, Wlbh: 1000, k: 1.0 })).includes('E_K'));
});

test('validateInput E_P1LEP2 (P1 ≤ P2)', () => {
  assert.ok(codes(psv.validateInput({ setPressurePsig: 100, Wlbh: 1000, P1psia: 50, P2psia: 60 })).includes('E_P1LEP2'));
});

test('validateInput E_NEG_FLOW (non-positive flow)', () => {
  assert.ok(codes(psv.validateInput({ setPressurePsig: 100, Wlbh: -5 })).includes('E_NEG_FLOW'));
  assert.ok(codes(psv.validateInput({ setPressurePsig: 100, Qgpm: 0 })).includes('E_NEG_FLOW'));
});

test('validateInput E_T (temperature ≤ 0)', () => {
  assert.ok(codes(psv.validateInput({ setPressurePsig: 100, Wlbh: 1000, TR: 0 })).includes('E_T'));
});

test('validateInput E_M (molecular weight ≤ 0)', () => {
  assert.ok(codes(psv.validateInput({ setPressurePsig: 100, Wlbh: 1000, M: 0 })).includes('E_M'));
});

test('validateInput E_G (specific gravity ≤ 0)', () => {
  assert.ok(codes(psv.validateInput({ setPressurePsig: 100, Qgpm: 100, G: 0 })).includes('E_G'));
});

test('validateInput returns [] for a clean gas input', () => {
  assert.deepEqual(psv.validateInput({ setPressurePsig: 100, Wlbh: 50000, M: 16.04, k: 1.31, TR: 600, Z: 0.95, P1psia: 124.7, P2psia: 14.7 }), []);
});
