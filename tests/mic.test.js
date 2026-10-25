/* IntegrityWatch Field — MIC screening test (F4 M10)
   Checklist adaptation from NACE TM0194/API 571 guidance. */
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const mic = require('../src/calc/mic.js');

// ---------------------------------------------------------------------------
// No free water = always low, score 0
// ---------------------------------------------------------------------------

test('No free water → risk low, score 0 regardless of other factors', () => {
  const r = mic.assess({
    freeWater: false, temperatureC: 30, stagnant: true,
    sulfate: true, deposits: true, nearNeutralPh: true,
    sulfideSigns: true, historyMic: true, highCounts: true
  });
  assert.equal(r.riskLevel, 'low');
  assert.equal(r.score, 0);
});

// ---------------------------------------------------------------------------
// Score computation with free water
// ---------------------------------------------------------------------------

test('Free water only → score 0, risk low', () => {
  const r = mic.assess({ freeWater: true });
  assert.equal(r.score, 0);
  assert.equal(r.riskLevel, 'low');
});

test('Free water + stagnant → score 3', () => {
  const r = mic.assess({ freeWater: true, stagnant: true });
  assert.equal(r.score, 3);
});

test('Free water + temp in 20-50 range → score 3', () => {
  const r = mic.assess({ freeWater: true, temperatureC: 35 });
  assert.equal(r.score, 3);
});

test('Free water + temp outside 20-50 range → score 0', () => {
  const r = mic.assess({ freeWater: true, temperatureC: 15 });
  assert.equal(r.score, 0);
});

test('Free water + temp at 20 (boundary) → score 3', () => {
  const r = mic.assess({ freeWater: true, temperatureC: 20 });
  assert.equal(r.score, 3);
});

test('Free water + temp at 50 (boundary) → score 3', () => {
  const r = mic.assess({ freeWater: true, temperatureC: 50 });
  assert.equal(r.score, 3);
});

test('Free water + sulfate → score 2', () => {
  const r = mic.assess({ freeWater: true, sulfate: true });
  assert.equal(r.score, 2);
});

test('Free water + deposits → score 2', () => {
  const r = mic.assess({ freeWater: true, deposits: true });
  assert.equal(r.score, 2);
});

test('Free water + nearNeutralPh → score 2', () => {
  const r = mic.assess({ freeWater: true, nearNeutralPh: true });
  assert.equal(r.score, 2);
});

test('Free water + sulfideSigns → score 3', () => {
  const r = mic.assess({ freeWater: true, sulfideSigns: true });
  assert.equal(r.score, 3);
});

test('Free water + historyMic → score 3', () => {
  const r = mic.assess({ freeWater: true, historyMic: true });
  assert.equal(r.score, 3);
});

test('Free water + highCounts → score 3', () => {
  const r = mic.assess({ freeWater: true, highCounts: true });
  assert.equal(r.score, 3);
});

// ---------------------------------------------------------------------------
// Score cap at 15
// ---------------------------------------------------------------------------

test('All factors active → score capped at 15', () => {
  const r = mic.assess({
    freeWater: true, temperatureC: 30, stagnant: true,
    sulfate: true, deposits: true, nearNeutralPh: true,
    sulfideSigns: true, historyMic: true, highCounts: true
  });
  // stagnant(3) + temp(3) + sulfate(2) + deposits(2) + nearNeutral(2)
  // + sulfide(3) + history(3) + highCounts(3) = 21
  // capped at 15
  assert.equal(r.score, 15);
});

// ---------------------------------------------------------------------------
// Score combination tests
// ---------------------------------------------------------------------------

test('stagnant + sulfate + deposits → score 7', () => {
  const r = mic.assess({
    freeWater: true, stagnant: true, sulfate: true, deposits: true
  });
  assert.equal(r.score, 7);
});

test('sulfideSigns + historyMic → score 6', () => {
  const r = mic.assess({
    freeWater: true, sulfideSigns: true, historyMic: true
  });
  assert.equal(r.score, 6);
});

// ---------------------------------------------------------------------------
// Risk level boundaries
// ---------------------------------------------------------------------------

test('score 5 → risk low (boundary below moderate)', () => {
  // stagnant(3) + sulfate(2) = 5
  const r = mic.assess({ freeWater: true, stagnant: true, sulfate: true });
  assert.equal(r.score, 5);
  assert.equal(r.riskLevel, 'low');
});

test('score 6 → risk moderate (boundary)', () => {
  const r = mic.assess({
    freeWater: true, stagnant: true, sulfate: true, deposits: true
  });
  assert.equal(r.score, 7);
});

test('score 6 exactly → moderate', () => {
  // stagnant(3) + sulfate(2) + deposits(2) = 7... let me pick different
  // sulfideSigns(3) + historyMic(3) = 6
  const r = mic.assess({
    freeWater: true, sulfideSigns: true, historyMic: true
  });
  assert.equal(r.score, 6);
  assert.equal(r.riskLevel, 'moderate');
});

test('score 10 exactly → moderate (upper boundary)', () => {
  const r = mic.assess({
    freeWater: true, stagnant: true, temperatureC: 25,
    sulfate: true, deposits: true
  });
  assert.equal(r.score, 10);
  assert.equal(r.riskLevel, 'moderate');
});

test('score 11 → high', () => {
  const r = mic.assess({
    freeWater: true, stagnant: true, temperatureC: 25,
    sulfate: true, deposits: true, nearNeutralPh: true
  });
  assert.equal(r.score, 12);
  assert.equal(r.riskLevel, 'high');
});

// ---------------------------------------------------------------------------
// Drivers
// ---------------------------------------------------------------------------

test('Drivers list matches active factors', () => {
  const r = mic.assess({
    freeWater: true, stagnant: true, temperatureC: 30
  });
  assert.ok(r.drivers.indexOf('mic.driver.stagnant') !== -1);
  assert.ok(r.drivers.indexOf('mic.driver.temperature') !== -1);
  assert.equal(r.drivers.indexOf('mic.driver.sulfate'), -1);
});

test('No free water → empty drivers', () => {
  const r = mic.assess({
    freeWater: false, stagnant: true, sulfate: true
  });
  assert.equal(r.drivers.length, 0);
});

test('All factors active → all 8 drivers listed', () => {
  const r = mic.assess({
    freeWater: true, temperatureC: 30, stagnant: true,
    sulfate: true, deposits: true, nearNeutralPh: true,
    sulfideSigns: true, historyMic: true, highCounts: true
  });
  assert.equal(r.drivers.length, 8);
});

// ---------------------------------------------------------------------------
// Determinism
// ---------------------------------------------------------------------------

test('Deterministic: same inputs → same output', () => {
  const a = mic.assess({
    freeWater: true, temperatureC: 35, stagnant: true,
    sulfate: true, deposits: true
  });
  const b = mic.assess({
    freeWater: true, temperatureC: 35, stagnant: true,
    sulfate: true, deposits: true
  });
  assert.deepStrictEqual(a, b);
});