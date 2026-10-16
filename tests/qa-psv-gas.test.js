'use strict';
const assert = require('assert/strict');
const { test } = require('node:test');
const psv = require('../src/calc/psv.js');

const TOL = 0.005; // 0.5 %
function approx(a, b, tol) { return Math.abs(a - b) <= Math.abs(b) * tol; }

test('1 ORIFICES_526 API 526 letters D-T with areas', () => {
  const o = psv.ORIFICES_526;
  assert.strictEqual(o.length, 14);
  const letters = o.map(r => r.letter).join('');
  // DEVIATION-PSV-1: real API 526 table skips letter S (14 letters D-T minus S)
  assert.strictEqual(letters, 'DEFGHJKLMNPQRT');
  const areas = o.map(r => r.areaIn2);
  // DEVIATION-PSV-1: real areas match prompt anchor exactly
  assert.deepStrictEqual(areas, [0.110, 0.196, 0.307, 0.503, 0.785, 1.287, 1.838, 2.853, 3.60, 4.34, 6.38, 11.05, 16.00, 26.00]);
});

test('2 flowCoefficientC USC and SI', () => {
  assert.ok(approx(psv.flowCoefficientC(1.4, 'usc'), 356.06, TOL), 'usc');
  assert.ok(approx(psv.flowCoefficientC(1.4, 'si'), 0.027033, TOL), 'si');
});

test('3 flowCoefficientC(1.001) USC ~315.4', () => {
  assert.ok(approx(psv.flowCoefficientC(1.001, 'usc'), 315.4, TOL));
});

test('4 flowCoefficientC(1.0) throws E_K', () => {
  assert.throws(() => psv.flowCoefficientC(1.0, 'usc'), (e) => e.code === 'E_K');
});

test('5 criticalPressureRatio', () => {
  assert.ok(approx(psv.criticalPressureRatio(1.4), 0.5283, TOL));
  assert.ok(approx(psv.criticalPressureRatio(1.31), 0.5439, TOL));
});

test('6 isCriticalFlow', () => {
  assert.strictEqual(psv.isCriticalFlow(124.7, 14.7, 1.31), true);
  assert.strictEqual(psv.isCriticalFlow(100, 60, 1.4), false);
});

test('7 sizeGasVapor methanol default Kb', () => {
  const r = psv.sizeGasVapor({ Wlbh: 50000, M: 16.04, k: 1.31, TR: 600, Z: 0.95, P1psia: 124.7, P2psia: 14.7, Kd: 0.975 });
  assert.ok(approx(r.AreqIn2, 7.046, TOL), 'AreqIn2=' + r.AreqIn2);
  assert.strictEqual(r.critical, true);
});

test('8 sizeGasVapor with Kb 0.9', () => {
  const r = psv.sizeGasVapor({ Wlbh: 50000, M: 16.04, k: 1.31, TR: 600, Z: 0.95, P1psia: 124.7, P2psia: 14.7, Kd: 0.975, Kb: 0.9 });
  assert.ok(approx(r.AreqIn2, 7.046 / 0.9, TOL), 'AreqIn2=' + r.AreqIn2);
});

test('9 sizeGasVapor P2psia 90 non-critical and larger area', () => {
  const r = psv.sizeGasVapor({ Wlbh: 50000, M: 16.04, k: 1.31, TR: 600, Z: 0.95, P1psia: 124.7, P2psia: 90, Kd: 0.975 });
  assert.strictEqual(r.critical, false);
  assert.ok(r.AreqIn2 > 7.046, 'AreqIn2=' + r.AreqIn2);
});

test('10 AreqCm2 conversion', () => {
  const r = psv.sizeGasVapor({ Wlbh: 50000, M: 16.04, k: 1.31, TR: 600, Z: 0.95, P1psia: 124.7, P2psia: 14.7, Kd: 0.975 });
  assert.ok(approx(r.AreqCm2, r.AreqIn2 * 6.4516, TOL));
});

test('11 selectOrifice boundaries and E_OVER_T', () => {
  assert.strictEqual(psv.selectOrifice(0.110).letter, 'D');
  assert.strictEqual(psv.selectOrifice(0.111).letter, 'E');
  assert.strictEqual(psv.selectOrifice(26.0).letter, 'T');
  const over = psv.selectOrifice(26.1);
  assert.strictEqual(over.error, 'E_OVER_T');
});

test('12 validateInput error codes', () => {
  assert.ok(psv.validateInput({ Z: 0 }).some(e => e.code === 'E_Z'));
  assert.ok(psv.validateInput({ k: 1 }).some(e => e.code === 'E_K'));
  assert.ok(psv.validateInput({ P1psia: 10, P2psia: 10 }).some(e => e.code === 'E_P1LEP2'));
  assert.ok(psv.validateInput({ setPressurePsig: '' }).some(e => e.code === 'E_EMPTY'));
  assert.ok(psv.validateInput({ Wlbh: -1 }).some(e => e.code === 'E_NEG_FLOW'));
});