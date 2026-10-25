/* IntegrityWatch Field — reliability tests (F3a T1)
   Tests for medianRanks, weibullFit, weibullCdf, b10Life, failurePattern,
   chiSqQuantile, mtbfWithCi, failureProbabilities. */
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const rel = require('../src/calc/reliability.js');

// (a) Perfect Weibull round-trip: generate 5 times from known β=2, η=500,
//     fit should recover them within ±2% and r²>0.99.
test('R1.1 weibullFit round-trip: constructed Weibull series recovers beta/eta within 2%', () => {
  // Generate via inverse: t = η * (-ln(1-F))^(1/β) with F = (i-0.3)/(n+0.4)
  // β=2, η=500, n=5
  // i=1: F≈0.12963, t=500·(-ln0.87037)^0.5=500·0.37143=185.71
  // i=2: F≈0.31481, t=500·(-ln0.68519)^0.5=500·0.61919=309.60
  // i=3: F=0.5,      t=500·(-ln0.5)^0.5     =500·0.83260=416.30
  // i=4: F≈0.68519, t=500·(-ln0.31481)^0.5=500·1.07367=536.84
  // i=5: F≈0.87037, t=500·(-ln0.12963)^0.5=500·1.42677=713.38
  var times = [185.71, 309.60, 416.30, 536.84, 713.38];
  var r = rel.weibullFit(times);

  assert.equal(r.n, 5);
  assert.ok(!r.insufficient, 'should not be insufficient');
  // β=2 ±2% → [1.96, 2.04]
  assert.ok(r.beta > 1.96 && r.beta < 2.04, 'beta should be ~2, got ' + r.beta);
  // η=500 ±2% → [490, 510]
  assert.ok(r.eta > 490 && r.eta < 510, 'eta should be ~500, got ' + r.eta);
  assert.ok(r.r2 > 0.99, 'r2 should be >0.99, got ' + r.r2);
});

// (b) medianRanks: sum of median ranks for n=5
test('R1.2 medianRanks: Bernard approximation for n=5', () => {
  var ranks = rel.medianRanks(5);
  assert.equal(ranks.length, 5);
  // i=1: (1-0.3)/(5+0.4) = 0.7/5.4 ≈ 0.12963
  // i=2: 1.7/5.4 ≈ 0.31481
  // i=3: 2.7/5.4 = 0.5
  // i=4: 3.7/5.4 ≈ 0.68519
  // i=5: 4.7/5.4 ≈ 0.87037
  // sum = (0.7+1.7+2.7+3.7+4.7)/5.4 = 13.5/5.4 = 2.5
  assert.ok(Math.abs(ranks[0] - 0.12963) < 0.0001);
  assert.ok(Math.abs(ranks[4] - 0.87037) < 0.0001);
  var sum = ranks.reduce(function (a, b) { return a + b; }, 0);
  assert.ok(Math.abs(sum - 2.5) < 1e-9, 'sum should be 2.5, got ' + sum);
});

// (c) b10Life: β=2, η=500 → 500·(-ln0.9)^0.5 ≈ 162.3
test('R1.3 b10Life: beta=2, eta=500', () => {
  var b10 = rel.b10Life(2, 500);
  // 500 * (-ln(0.9))^0.5 = 500 * 0.1053605^0.5 = 500 * 0.32459 = 162.296
  assert.ok(Math.abs(b10 - 162.3) < 0.05, 'b10 should be ~162.3, got ' + b10);
});

// (d) mtbfWithCi: 10000 h, 5 failures → mtbf 2000, CI via Wilson-Hilferty
test('R1.4 mtbfWithCi: 10000h, 5 failures, conf 0.9', () => {
  var r = rel.mtbfWithCi(10000, 5, 0.9);
  assert.equal(r.mtbf, 2000);
  // χ²_hi(0.95, df=10) via WH ≈ 18.289, χ²_lo(0.05, df=10) ≈ 3.931
  // lo = 2*10000/18.289 ≈ 1093.6
  // hi = 2*10000/3.931  ≈ 5087.8
  assert.ok(r.lo != null, 'lo should not be null');
  assert.ok(r.hi != null, 'hi should not be null');
  assert.ok(Math.abs(r.lo - 1093.6) < 1.5, 'lo should be ~1093.6, got ' + r.lo);
  assert.ok(Math.abs(r.hi - 5087.8) < 8, 'hi should be ~5087.8, got ' + r.hi);
  assert.ok(r.lo < r.mtbf && r.mtbf < r.hi, 'lo < mtbf < hi');
});

// (e) Edge cases
test('R1.5 edge: n=1 → insufficient', () => {
  var r = rel.weibullFit([100]);
  assert.ok(r.insufficient);
});

test('R1.6 edge: zero failures → mtbf Infinity, lo null', () => {
  var r = rel.mtbfWithCi(10000, 0, 0.9);
  assert.equal(r.mtbf, Infinity);
  assert.equal(r.lo, null);
});

test('R1.7 edge: garbage times filtered (t≤0, non-finite)', () => {
  var r = rel.weibullFit([-5, 0, 100, 200, NaN, Infinity, 300, 400]);
  // Only [100, 200, 300, 400] survive → n=4
  assert.equal(r.n, 4);
  assert.ok(!r.insufficient);
});

test('R1.8 weibullCdf: β=2, η=500, t=400 → 1-exp(-(400/500)^2)', () => {
  // (400/500)^2 = 0.64, 1-exp(-0.64) = 1-0.52729 = 0.4727
  var prob = rel.weibullCdf(400, 2, 500);
  assert.ok(Math.abs(prob - 0.4727) < 0.001);
});

test('R1.9 failurePattern classification', () => {
  assert.equal(rel.failurePattern(0.5), 'early-life');
  assert.equal(rel.failurePattern(0.8), 'random');
  assert.equal(rel.failurePattern(1.0), 'random');
  assert.equal(rel.failurePattern(1.2), 'random');
  assert.equal(rel.failurePattern(1.21), 'wear-out');
  assert.equal(rel.failurePattern(3), 'wear-out');
  assert.equal(rel.failurePattern('insufficient'), 'insufficient');
});

test('R1.10 failureProbabilities: β=2, η=500 at 30/90/180 days', () => {
  var probs = rel.failureProbabilities(2, 500, [30, 90, 180]);
  assert.equal(probs.length, 3);
  // 30d: t=720h, (720/500)^2=2.0736, 1-exp(-2.0736)=0.874
  assert.ok(Math.abs(probs[0].prob - 0.874) < 0.01, '30d prob ~0.874');
  // 90d: t=2160h, (2160/500)^2=18.662, 1-exp(-18.662)≈1
  assert.ok(probs[1].prob > 0.999, '90d prob ~1');
  assert.ok(probs[2].prob > 0.999, '180d prob ~1');
});

test('R1.11 chiSqQuantile: known values', () => {
  // df=10, p=0.95: z=1.6449 → ~18.288 (actual Chi-sq: 18.307)
  var hi = rel.chiSqQuantile(10, 0.95);
  assert.ok(hi > 17 && hi < 20, 'χ²(10, 0.95) should be ~18.3, got ' + hi);
  // df=10, p=0.05: z=-1.6449 → ~3.93 (actual: 3.94)
  var lo = rel.chiSqQuantile(10, 0.05);
  assert.ok(lo > 3 && lo < 5, 'χ²(10, 0.05) should be ~3.94, got ' + lo);
});

test('R1.12 mtbfWithCi: null failures treated as zero', () => {
  var r = rel.mtbfWithCi(10000, null, 0.9);
  assert.equal(r.mtbf, Infinity);
  assert.equal(r.lo, null);
});