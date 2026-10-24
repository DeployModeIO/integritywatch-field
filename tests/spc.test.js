/* IntegrityWatch Field — SPC tests (T2)
   Tests for linearTrend, detectOutliers, classifyTrend. */
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const spc = require('../src/calc/spc.js');

test('linearTrend: perfect line y=2x+3', () => {
  const points = [
    { x: 0, y: 3 },
    { x: 1, y: 5 },
    { x: 2, y: 7 },
    { x: 3, y: 9 },
    { x: 4, y: 11 }
  ];
  const r = spc.linearTrend(points);
  assert.equal(r.n, 5);
  assert.ok(Math.abs(r.slope - 2) < 1e-9);
  assert.ok(Math.abs(r.intercept - 3) < 1e-9);
  assert.ok(Math.abs(r.r2 - 1) < 1e-9);
  assert.ok(Array.isArray(r.ci95Slope));
  assert.equal(r.ci95Slope.length, 2);
  assert.ok(r.ci95Slope[0] <= r.slope);
  assert.ok(r.ci95Slope[1] >= r.slope);
});

test('linearTrend: 2 points returns ci95Slope', () => {
  const points = [
    { x: 0, y: 10 },
    { x: 100, y: 0 }
  ];
  const r = spc.linearTrend(points);
  assert.equal(r.n, 2);
  assert.ok(Array.isArray(r.ci95Slope));
  assert.equal(r.ci95Slope.length, 2);
});

test('linearTrend: 1 point returns n=1 (insufficient for CI)', () => {
  const r = spc.linearTrend([{ x: 1, y: 2 }]);
  assert.equal(r.n, 1);
});

test('detectOutliers: z-score modified (MAD) detects one clear outlier', () => {
  // Values: mostly around 10, one at 30
  const values = [10, 9.5, 10.2, 9.8, 30, 10.1, 9.9];
  const outliers = spc.detectOutliers(values, { threshold: 3.5 });
  // Index 4 (value 30) should be flagged
  assert.ok(outliers.includes(4), 'index 4 (value 30) should be outlier');
  assert.equal(outliers.length, 1);
});

test('detectOutliers: no outliers in flat series', () => {
  const values = [10, 10.1, 9.9, 10.2, 9.8];
  const outliers = spc.detectOutliers(values, { threshold: 3.5 });
  assert.equal(outliers.length, 0);
});

test('detectOutliers: MAD=0 falls back to std dev', () => {
  // All same except one slightly off
  const values = [5, 5, 5, 5, 5, 5, 5, 5, 5.1];
  const outliers = spc.detectOutliers(values, { threshold: 3.5 });
  assert.equal(outliers.length, 0, '5.1 not extreme enough');
});

test('detectOutliers: both MAD and std 0 returns empty', () => {
  const values = [7, 7, 7, 7, 7];
  const outliers = spc.detectOutliers(values, { threshold: 3.5 });
  assert.equal(outliers.length, 0);
});

test('detectOutliers: default threshold is 3.5', () => {
  const values = [10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 200];
  const outliers = spc.detectOutliers(values);
  assert.ok(outliers.includes(19), 'index 19 (value 200) should be outlier');
});

test('detectOutliers: only one value returns empty', () => {
  const outliers = spc.detectOutliers([5]);
  assert.equal(outliers.length, 0);
});

test('detectOutliers: empty array returns empty', () => {
  const outliers = spc.detectOutliers([]);
  assert.equal(outliers.length, 0);
});

test('classifyTrend: insufficient (n < 3)', () => {
  assert.equal(spc.classifyTrend({ slope: 1, r2: 0.8, n: 2 }), 'insufficient');
  assert.equal(spc.classifyTrend({ slope: 1, r2: 0.9, n: 1 }), 'insufficient');
  assert.equal(spc.classifyTrend({ slope: 0, r2: 1, n: 0 }), 'insufficient');
});

test('classifyTrend: stable (|slope*avgX| < 2% of avgY)', () => {
  // slope very small relative to values
  assert.equal(spc.classifyTrend({ slope: 0.001, r2: 0.6, n: 4 }), 'stable');
  // flat line with tiny slope
  assert.equal(spc.classifyTrend({ slope: -0.001, r2: 0.8, n: 5 }), 'stable');
  // explicit: r2 >= 0.4 and n >= 3 for classification
  assert.equal(spc.classifyTrend({ slope: 0, r2: 0.5, n: 6 }), 'stable');
});

test('classifyTrend: increasing (positive slope, significant)', () => {
  assert.equal(spc.classifyTrend({ slope: 0.5, r2: 0.7, n: 5 }), 'increasing');
  assert.equal(spc.classifyTrend({ slope: 2, r2: 0.9, n: 4 }), 'increasing');
});

test('classifyTrend: decreasing (negative slope, significant)', () => {
  assert.equal(spc.classifyTrend({ slope: -0.5, r2: 0.7, n: 5 }), 'decreasing');
  assert.equal(spc.classifyTrend({ slope: -2, r2: 0.85, n: 4 }), 'decreasing');
});

test('classifyTrend: low r2 but n>=3 returns stable', () => {
  // r2 < 0.4 but n >= 3 -> 'stable' (cannot determine direction reliably)
  assert.equal(spc.classifyTrend({ slope: 0.5, r2: 0.3, n: 5 }), 'stable');
});