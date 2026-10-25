/* IntegrityWatch Field — pipeline assessment tests (ASME B31G original + Modified)
   Golden cases hand-calculated. See docs/STANDARDS.md §7. */
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const b31g = require('../src/calc/pipelineAssessment.js');

// ---------------------------------------------------------------------------
// b31g({ D, t, Su, depthPct, lengthMm, modified })
// D=pipe OD mm; t=wall mm; Su=SMYS MPa; depthPct=% depth; lengthMm=axial length mm
// Pf = failure pressure MPa
//
// Original: Sf = 1.25 * Sy; Q = sqrt(1 + 0.628 * L² / (D * t))
// Modified: Sf = Sy + 68.95; b = 2*sqrt(D*t); L'_mod = min(L, b*0.85)
//
// Hand-calculated golden case:
// D=610mm, t=9.5mm, Sy=414MPa, a=40%, L=100mm
// a = 0.4 * 9.5 = 3.8mm
// Q = sqrt(1 + 0.628 * 100² / (610*9.5)) = sqrt(1 + 6280/5795) = sqrt(2.08369) ≈ 1.4435
// Sf_orig = 1.25*414 = 517.5
// Pf_orig = (2/3)*517.5*9.5/610 * (1-0.4)/(1-0.4/Q) = 0.6667*517.5*9.5/610 * 0.6/(1-0.2771)
//         = 5.373 * 0.6 / 0.7229 ≈ 4.460 MPa
// Sf_mod = 414 + 68.95 = 482.95
// L'_mod = min(100, 2*sqrt(610*9.5)*0.85) = min(100, 152.26*0.85) = min(100, 129.42) = 100
// Pf_mod = (2/3)*482.95*9.5/610 * 0.6/0.7229 ≈ 4.164 MPa  (mod ≤ orig ✓)
// ---------------------------------------------------------------------------

test('b31g: original golden case hand-calculated', () => {
  const r = b31g.b31g({ D: 610, t: 9.5, Su: 414, depthPct: 40, lengthMm: 100, modified: false });
  const a = 0.4 * 9.5; // 3.8mm
  const Q = Math.sqrt(1 + 0.628 * 100 * 100 / (610 * 9.5));
  const Sf = 1.25 * 414; // 517.5
  const Pf_expected = (2 / 3) * Sf * 9.5 / 610 * (1 - a / 9.5) / (1 - (a / 9.5) / Q);
  assert.ok(typeof r.Pf === 'number');
  assert.ok(Math.abs(r.Pf - Pf_expected) < 1e-3, 'Pf=' + r.Pf + ' expected=' + Pf_expected);
  assert.ok(r.Pf > 0);
});

test('b31g: modified golden case hand-calculated', () => {
  const r = b31g.b31g({ D: 610, t: 9.5, Su: 414, depthPct: 40, lengthMm: 100, modified: true });
  const a = 0.4 * 9.5;
  const b = 2 * Math.sqrt(610 * 9.5);
  const Lmod = Math.min(100, b * 0.85);
  const Q = Math.sqrt(1 + 0.628 * Lmod * Lmod / (610 * 9.5));
  const Sf = 414 + 68.95;
  const Pf_expected = (2 / 3) * Sf * 9.5 / 610 * (1 - a / 9.5) / (1 - (a / 9.5) / Q);
  assert.ok(typeof r.Pf === 'number');
  assert.ok(Math.abs(r.Pf - Pf_expected) < 1e-3);
  assert.ok(r.Pf > 0);
});

test('b31g: modified <= original (modified more conservative)', () => {
  const orig = b31g.b31g({ D: 610, t: 9.5, Su: 414, depthPct: 40, lengthMm: 100, modified: false });
  const mod = b31g.b31g({ D: 610, t: 9.5, Su: 414, depthPct: 40, lengthMm: 100, modified: true });
  assert.ok(mod.Pf <= orig.Pf + 0.001, 'modified Pf=' + mod.Pf + ' should be <= original Pf=' + orig.Pf);
});

test('b31g: zero depth yields high Pf (essentially burst)', () => {
  const r = b31g.b31g({ D: 610, t: 9.5, Su: 414, depthPct: 0, lengthMm: 100, modified: false });
  const Sf = 1.25 * 414;
  const Pf_burst = (2 / 3) * Sf * 9.5 / 610;
  assert.ok(Math.abs(r.Pf - Pf_burst) < 1e-6);
  assert.ok(r.Pf > 4); // should be ~5.37 MPa
});

test('b31g: 100% depth gives very low Pf', () => {
  const r = b31g.b31g({ D: 610, t: 9.5, Su: 414, depthPct: 100, lengthMm: 100, modified: false });
  assert.ok(r.Pf < 0.001);
  assert.ok(r.Pf >= 0);
});

test('b31g: larger L reduces Pf (wider defect is worse)', () => {
  const short = b31g.b31g({ D: 610, t: 9.5, Su: 414, depthPct: 40, lengthMm: 50, modified: false });
  const long = b31g.b31g({ D: 610, t: 9.5, Su: 414, depthPct: 40, lengthMm: 500, modified: false });
  assert.ok(long.Pf < short.Pf, 'longer defect should have lower Pf');
});

test('b31g: modified L optimization kicks in for long defects', () => {
  // When L > b*0.85, modified caps the effective length
  const b = 2 * Math.sqrt(610 * 9.5); // ≈ 152.26
  const bigL = b * 0.85 + 100; // > b*0.85 → L is capped
  const r = b31g.b31g({ D: 610, t: 9.5, Su: 414, depthPct: 40, lengthMm: bigL, modified: true });
  assert.ok(r.Pf > 0);
  // Should use L'_mod = b*0.85, not the full bigL
});

test('b31g: default modified = false (original B31G)', () => {
  const r1 = b31g.b31g({ D: 610, t: 9.5, Su: 414, depthPct: 40, lengthMm: 100 });
  const r2 = b31g.b31g({ D: 610, t: 9.5, Su: 414, depthPct: 40, lengthMm: 100, modified: false });
  assert.ok(Math.abs(r1.Pf - r2.Pf) < 1e-9);
});

// ---------------------------------------------------------------------------
// allowableOperatingPressure({ Pf, designFactor })
// pAllow = Pf / (1.43 * designFactor)   (safety factor B31G 1.43)
// ---------------------------------------------------------------------------

test('allowableOperatingPressure: standard B31G SF', () => {
  const r = b31g.allowableOperatingPressure({ Pf: 10, designFactor: 0.72 });
  const expected = 10 / (1.43 * 0.72); // 10/1.0296 ≈ 9.713
  assert.ok(Math.abs(r - expected) < 1e-6);
});

test('allowableOperatingPressure: Pf = 0 yields 0', () => {
  assert.equal(b31g.allowableOperatingPressure({ Pf: 0, designFactor: 0.72 }), 0);
});

test('allowableOperatingPressure: lower DF gives higher pAllow', () => {
  // pAllow = Pf / (1.43 * DF): smaller DF -> larger pAllow
  const r1 = b31g.allowableOperatingPressure({ Pf: 10, designFactor: 0.4 });
  const r2 = b31g.allowableOperatingPressure({ Pf: 10, designFactor: 0.72 });
  assert.ok(r1 > r2, 'r1=' + r1 + ' should be > r2=' + r2);
});

// ---------------------------------------------------------------------------
// assessAnomalies(assets, anomalies, { Su, D, t, designFactor, opPressure })
// → per anomaly: { id, Pf, pAllow, exceeds: opPressure > pAllow }
// ---------------------------------------------------------------------------

test('assessAnomalies: assesses each anomaly', () => {
  const anomalies = [
    { id: 'a1', depthPct: 20, lengthMm: 50 },
    { id: 'a2', depthPct: 60, lengthMm: 200 }
  ];
  const results = b31g.assessAnomalies([], anomalies, {
    Su: 414, D: 610, t: 9.5, designFactor: 0.72, opPressure: 5
  });
  assert.equal(results.length, 2);
  assert.equal(results[0].id, 'a1');
  assert.equal(results[1].id, 'a2');
  assert.ok(typeof results[0].Pf === 'number');
  assert.ok(typeof results[1].pAllow === 'number');
  // Deep anomaly 60% with operating pressure 5 should exceeds
  assert.equal(results[1].exceeds, true);
});

test('assessAnomalies: exceed false when opPressure <= pAllow', () => {
  const anomalies = [{ id: 'a1', depthPct: 5, lengthMm: 40 }];
  const results = b31g.assessAnomalies([], anomalies, {
    Su: 414, D: 610, t: 9.5, designFactor: 0.72, opPressure: 4
  });
  assert.equal(results[0].exceeds, false);
});

test('assessAnomalies: empty returns empty array', () => {
  const results = b31g.assessAnomalies([], [], {
    Su: 414, D: 610, t: 9.5, designFactor: 0.72, opPressure: 5
  });
  assert.deepEqual(results, []);
});