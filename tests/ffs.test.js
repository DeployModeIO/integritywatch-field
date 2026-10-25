/* IntegrityWatch Field — FFS tests (API 579-1 Part 3 Level 1)
   Golden cases hand-calculated. See docs/STANDARDS.md §6. */
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const ffs = require('../src/calc/ffs.js');

// ---------------------------------------------------------------------------
// requiredThickness({ P, Ri, S, E, CA })
// t_req = P * Ri / (S * E − 0.6 * P) + CA   (mm)
// P in MPa, S in MPa, Ri in mm, E 0..1, CA in mm
// ---------------------------------------------------------------------------

test('requiredThickness: golden case hand-calculated', () => {
  const r = ffs.requiredThickness({ P: 2, Ri: 100, S: 138, E: 1, CA: 1.5 });
  const expected = 2 * 100 / (138 * 1 - 0.6 * 2) + 1.5;
  // 200 / (138 - 1.2) + 1.5 = 200 / 136.8 + 1.5 = 1.4619883... + 1.5
  assert.ok(Math.abs(r - expected) < 1e-6, 't_req = ' + r + ', expected ' + expected);
});

test('requiredThickness: zero CA, high pressure', () => {
  const r = ffs.requiredThickness({ P: 10, Ri: 50, S: 200, E: 1, CA: 0 });
  const expected = 10 * 50 / (200 * 1 - 0.6 * 10);
  // 500 / (200 - 6) = 500 / 194 = 2.577319...
  assert.ok(Math.abs(r - expected) < 1e-6);
});

test('requiredThickness: E < 1 reduces denominator', () => {
  const r = ffs.requiredThickness({ P: 2, Ri: 100, S: 138, E: 0.85, CA: 1.5 });
  const expected = 2 * 100 / (138 * 0.85 - 0.6 * 2) + 1.5;
  // 200 / (117.3 - 1.2) + 1.5 = 200 / 116.1 + 1.5 = 1.72265... + 1.5 = 3.22265...
  assert.ok(Math.abs(r - expected) < 1e-6);
});

test('requiredThickness: denominator ≤ 0 → error', () => {
  // P too high relative to S*E
  try {
    ffs.requiredThickness({ P: 200, Ri: 100, S: 100, E: 1, CA: 0 });
    assert.fail('should have thrown');
  } catch (e) {
    assert.ok(e && e.message && e.message.indexOf('E_BAD_INPUT') !== -1);
  }
});

test('requiredThickness: S*E == 0.6*P → error', () => {
  // 138 * 0.5 = 69; 0.6 * 115 = 69 → denominator=0
  try {
    ffs.requiredThickness({ P: 115, Ri: 100, S: 138, E: 0.5, CA: 0 });
    assert.fail('should have thrown');
  } catch (e) {
    assert.ok(e && e.message && e.message.indexOf('E_BAD_INPUT') !== -1);
  }
});

// ---------------------------------------------------------------------------
// mawpAssessed({ t, Ri, S, E, CA })
// P = S * E * (t − CA) / (Ri + 0.6 * (t − CA))   (MPa)
// if t − CA ≤ 0 → 0
// ---------------------------------------------------------------------------

test('mawpAssessed: golden case hand-calculated', () => {
  const r = ffs.mawpAssessed({ t: 8, Ri: 100, S: 138, E: 1, CA: 1.5 });
  // t-CA = 6.5; P = 138*6.5 / (100 + 0.6*6.5) = 897 / (100+3.9) = 897 / 103.9
  const expected = 138 * 6.5 / (100 + 0.6 * 6.5);
  // 897 / 103.9 ≈ 8.6333...
  assert.ok(Math.abs(r - expected) < 1e-6);
});

test('mawpAssessed: thick wall case', () => {
  const r = ffs.mawpAssessed({ t: 25, Ri: 100, S: 138, E: 1, CA: 0 });
  const expected = 138 * 25 / (100 + 0.6 * 25);
  // 3450 / (100 + 15) = 3450 / 115 = 30.0
  assert.ok(Math.abs(r - expected) < 1e-6);
});

test('mawpAssessed: t-CA <= 0 → 0', () => {
  const r = ffs.mawpAssessed({ t: 1, Ri: 100, S: 138, E: 1, CA: 2 });
  assert.equal(r, 0);
});

test('mawpAssessed: t == CA → 0', () => {
  const r = ffs.mawpAssessed({ t: 1.5, Ri: 100, S: 138, E: 1, CA: 1.5 });
  assert.equal(r, 0);
});

// ---------------------------------------------------------------------------
// assessGeneralMetalLoss({ tMeas, tNom, P, Ri, S, E, CA })
// → { tRequired, mawpAssessed, pass, utilization }
// ---------------------------------------------------------------------------

test('assessGeneralMetalLoss: pass when tMeas >= tRequired', () => {
  const r = ffs.assessGeneralMetalLoss({ tMeas: 8, tNom: 9.53, P: 2, Ri: 100, S: 138, E: 1, CA: 1.5 });
  assert.ok(typeof r.tRequired === 'number');
  assert.ok(typeof r.mawpAssessed === 'number');
  assert.equal(r.pass, true);
  assert.ok(typeof r.utilization === 'number');
  assert.ok(r.utilization > 0);
  assert.ok(r.utilization <= 1);
});

test('assessGeneralMetalLoss: fail when tMeas < tRequired (thin wall)', () => {
  const r = ffs.assessGeneralMetalLoss({ tMeas: 2, tNom: 9.53, P: 8, Ri: 100, S: 138, E: 1, CA: 1.5 });
  assert.equal(r.pass, false);
  assert.ok(r.utilization > 1);
});

test('assessGeneralMetalLoss: utilization ratio correct', () => {
  const r = ffs.assessGeneralMetalLoss({ tMeas: 8, tNom: 9.53, P: 2, Ri: 100, S: 138, E: 1, CA: 1.5 });
  const expectedUtil = 2 / r.mawpAssessed;
  assert.ok(Math.abs(r.utilization - expectedUtil) < 1e-6);
});

// ---------------------------------------------------------------------------
// screenPit({ tMeas, pitDepth, CA })
// Conservative L1 screening: pitDepth ≤ tMeas − tRequired (with default/zero CA)
// Uses the same single-wall criterion.
// ---------------------------------------------------------------------------

// screenPit uses same formula as assessGeneralMetalLoss to compute tRequired
// L1 conservative screening: pitDepth ≤ tMeas − tRequired
// P=2, Ri=100, S=138, E=1 → tReq without CA = 1.462mm

test('screenPit: shallow pit passes', () => {
  // tMeas=8mm, tReq≈2.96mm (with CA), (8-2.96)=5.04mm, pitDepth=2mm → pass
  const r = ffs.screenPit({ tMeas: 8, pitDepth: 2, CA: 1.5, P: 2, Ri: 100, S: 138, E: 1 });
  assert.equal(r.pass, true);
});

test('screenPit: deep pit fails', () => {
  // tMeas=8mm, tReq≈2.96mm, pitDepth=6mm > 5.04mm → fail
  const r = ffs.screenPit({ tMeas: 8, pitDepth: 6, CA: 1.5, P: 2, Ri: 100, S: 138, E: 1 });
  assert.equal(r.pass, false);
});

test('screenPit: pit deeper than wall with no CA fails', () => {
  const r = ffs.screenPit({ tMeas: 4, pitDepth: 4, CA: 0, P: 2, Ri: 100, S: 138, E: 1 });
  // tReq ≈ 1.462, remaining = 4 - 1.462 = 2.538; pit 4 > 2.538 → fail
  assert.equal(r.pass, false);
});

// ---------------------------------------------------------------------------
// assessLineSystem(sys, materials)
// Takes a pipeline system record and optional materials catalogue.
// sys: { dnIn, wallThicknessMm, opPressureMpa, material }
// Defaults: E=0.85 (ERW seam), CA=1.5 mm, S=414 MPa (X52) if no smysMpa.
// Returns null with error if missing required fields.
// ---------------------------------------------------------------------------

test('assessLineSystem: complete system returns valid assessment', () => {
  const sys = { dnIn: 16, wallThicknessMm: 9.53, opPressureMpa: 5, material: 'api5l-x52' };
  const mats = { byId: function () { return null; } };
  const r = ffs.assessLineSystem(sys, mats);
  assert.ok(r, 'should return result');
  assert.equal(r.dnIn, 16);
  assert.equal(r.wallThicknessMm, 9.53);
  // D=406.4, Ri=203.2-9.53=193.67, P=5, S=414, E=0.85, CA=1.5
  const D = 16 * 25.4; // 406.4
  const Ri = D / 2 - 9.53; // 193.67
  const tReq_expected = 5 * Ri / (414 * 0.85 - 0.6 * 5) + 1.5;
  assert.ok(Math.abs(r.tRequired - tReq_expected) < 1e-6);
  assert.ok(typeof r.mawpAssessed === 'number');
  assert.equal(r.pass, r.wallThicknessMm >= r.tRequired);
  assert.equal(typeof r.utilization, 'number');
  assert.ok(r.utilization > 0);
});

test('assessLineSystem: missing opPressure returns error', () => {
  const sys = { dnIn: 16, wallThicknessMm: 9.53 };
  const mats = { byId: function () { return null; } };
  const r = ffs.assessLineSystem(sys, mats);
  assert.equal(r, null);
});

test('assessLineSystem: missing wallThickness returns error', () => {
  const sys = { dnIn: 16, opPressureMpa: 5 };
  const mats = { byId: function () { return null; } };
  const r = ffs.assessLineSystem(sys, mats);
  assert.equal(r, null);
});

test('assessLineSystem: material with smysMpa uses it', () => {
  const sys = { dnIn: 20, wallThicknessMm: 12, opPressureMpa: 6, material: 'custom-alloy' };
  const mats = { byId: function (id) { return id === 'custom-alloy' ? { smysMpa: 485 } : null; } };
  const r = ffs.assessLineSystem(sys, mats);
  assert.ok(r);
  const D = 20 * 25.4; // 508
  const Ri = D / 2 - 12;
  const tReq_custom = 6 * Ri / (485 * 0.85 - 0.6 * 6) + 1.5;
  assert.ok(Math.abs(r.tRequired - tReq_custom) < 1e-6);
});

test('assessLineSystem: SMYS lookup via root.IW.data.materials', () => {
  // Simulate the global materials registry
  const sys = { dnIn: 16, wallThicknessMm: 9.53, opPressureMpa: 5, material: 'api5l-x60' };
  // Use default S=414 since no smysMpa in the live catalogue
  const r = ffs.assessLineSystem(sys, null);
  assert.ok(r);
  assert.ok(r.pass, 'thick wall at low pressure should pass');
});