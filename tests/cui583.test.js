/* IntegrityWatch Field — CUI screening test (F4 M10)
   API RP 583/571 qualitative screening adaptation. */
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const cui583 = require('../src/calc/cui583.js');

// ---------------------------------------------------------------------------
// Temperature bands
// ---------------------------------------------------------------------------

test('CS at -13°C → outside band, susceptibility none', () => {
  const r = cui583.assess({
    materialClass: 'cs', operatingTempC: -13
  });
  assert.equal(r.susceptibility, 'none');
  assert.equal(r.riskLevel, 'low');
});

test('CS at -12°C → in-band, susceptibility in-band', () => {
  const r = cui583.assess({
    materialClass: 'cs', operatingTempC: -12
  });
  assert.equal(r.susceptibility, 'in-band');
});

test('CS at 175°C → in-band (upper bound)', () => {
  const r = cui583.assess({
    materialClass: 'cs', operatingTempC: 175
  });
  assert.equal(r.susceptibility, 'in-band');
});

test('CS at 176°C → outside band', () => {
  const r = cui583.assess({
    materialClass: 'cs', operatingTempC: 176
  });
  assert.equal(r.susceptibility, 'none');
});

test('CS at 60°C → peak band', () => {
  const r = cui583.assess({
    materialClass: 'cs', operatingTempC: 60
  });
  assert.equal(r.susceptibility, 'peak');
});

test('CS at 120°C → peak band (upper bound)', () => {
  const r = cui583.assess({
    materialClass: 'cs', operatingTempC: 120
  });
  assert.equal(r.susceptibility, 'peak');
});

test('CS at 90°C → peak band', () => {
  const r = cui583.assess({
    materialClass: 'cs', operatingTempC: 90
  });
  assert.equal(r.susceptibility, 'peak');
});

test('SS at 59°C → outside band', () => {
  const r = cui583.assess({
    materialClass: 'ss', operatingTempC: 59
  });
  assert.equal(r.susceptibility, 'none');
});

test('SS at 60°C → in-band (ECSCC susceptible)', () => {
  const r = cui583.assess({
    materialClass: 'ss', operatingTempC: 60
  });
  assert.equal(r.susceptibility, 'in-band');
});

test('SS at 205°C → in-band (upper bound)', () => {
  const r = cui583.assess({
    materialClass: 'ss', operatingTempC: 205
  });
  assert.equal(r.susceptibility, 'in-band');
});

test('SS at 206°C → outside band', () => {
  const r = cui583.assess({
    materialClass: 'ss', operatingTempC: 206
  });
  assert.equal(r.susceptibility, 'none');
});

// ---------------------------------------------------------------------------
// Score accumulation
// ---------------------------------------------------------------------------

test('CS in-band at 40°C, no other factors → base score 2', () => {
  const r = cui583.assess({
    materialClass: 'cs', operatingTempC: 40
  });
  assert.equal(r.likelihoodScore, 2);
  assert.equal(r.likelihoodBand, 'low');
});

test('CS peak at 80°C, no other factors → base score 4', () => {
  const r = cui583.assess({
    materialClass: 'cs', operatingTempC: 80
  });
  assert.equal(r.likelihoodScore, 4);
});

test('CS out-of-band with cyclic service and steam traced → score 1', () => {
  const r = cui583.assess({
    materialClass: 'cs', operatingTempC: -20,
    cyclicService: true, steamTraced: true
  });
  assert.equal(r.susceptibility, 'none');
  assert.equal(r.likelihoodScore, 1);
  assert.equal(r.riskLevel, 'moderate'); // cyclicService → at least moderate
});

test('CS out-of-band no cyclic no steam → score 0, risk low', () => {
  const r = cui583.assess({
    materialClass: 'cs', operatingTempC: -20
  });
  assert.equal(r.susceptibility, 'none');
  assert.equal(r.likelihoodScore, 0);
  assert.equal(r.riskLevel, 'low');
});

test('Penetrating features +2', () => {
  const base = cui583.assess({
    materialClass: 'cs', operatingTempC: 40
  });
  const withPen = cui583.assess({
    materialClass: 'cs', operatingTempC: 40, penetratingFeatures: true
  });
  assert.equal(withPen.likelihoodScore, base.likelihoodScore + 2);
});

test('Coating none +2', () => {
  const r = cui583.assess({
    materialClass: 'cs', operatingTempC: 80,
    coatingCondition: 'none'
  });
  assert.ok(r.likelihoodScore > 4); // peak(4) + none(2) = 6
});

test('Coating poor +1', () => {
  const r = cui583.assess({
    materialClass: 'cs', operatingTempC: 80,
    coatingCondition: 'poor'
  });
  assert.equal(r.likelihoodScore, 5); // peak(4) + poor(1) = 5
});

test('Coating fair +1', () => {
  const r = cui583.assess({
    materialClass: 'cs', operatingTempC: 80,
    coatingCondition: 'fair'
  });
  assert.equal(r.likelihoodScore, 5); // peak(4) + fair(1) = 5
});

test('Coating good +0', () => {
  const r = cui583.assess({
    materialClass: 'cs', operatingTempC: 80,
    coatingCondition: 'good'
  });
  assert.equal(r.likelihoodScore, 4); // peak(4) + good(0) = 4
});

test('Insulation mineral-wool +1', () => {
  const r = cui583.assess({
    materialClass: 'cs', operatingTempC: 40,
    insulationType: 'mineral-wool'
  });
  assert.equal(r.likelihoodScore, 3); // in-band(2) + wool(1) = 3
});

test('Insulation calcium-silicate +1', () => {
  const r = cui583.assess({
    materialClass: 'cs', operatingTempC: 40,
    insulationType: 'calcium-silicate'
  });
  assert.equal(r.likelihoodScore, 3);
});

test('Insulation closed-cell +0', () => {
  const r = cui583.assess({
    materialClass: 'cs', operatingTempC: 40,
    insulationType: 'closed-cell'
  });
  assert.equal(r.likelihoodScore, 2); // in-band(2) + closed-cell(0) = 2
});

test('Insulation none -2 minimum 0', () => {
  const r = cui583.assess({
    materialClass: 'cs', operatingTempC: 40,
    insulationType: 'none'
  });
  // in-band(2) + none(-2) = 0, clamped to 0
  assert.equal(r.likelihoodScore, 0);
});

test('Environment marine +2', () => {
  const r = cui583.assess({
    materialClass: 'cs', operatingTempC: 40,
    environment: 'marine'
  });
  assert.equal(r.likelihoodScore, 4); // in-band(2) + marine(2) = 4
});

test('Environment coastal +1', () => {
  const r = cui583.assess({
    materialClass: 'cs', operatingTempC: 40,
    environment: 'coastal'
  });
  assert.equal(r.likelihoodScore, 3);
});

test('Cyclic service +1', () => {
  const r = cui583.assess({
    materialClass: 'cs', operatingTempC: 40,
    cyclicService: true
  });
  assert.equal(r.likelihoodScore, 3);
});

test('Steam traced +1', () => {
  const r = cui583.assess({
    materialClass: 'cs', operatingTempC: 40,
    steamTraced: true
  });
  assert.equal(r.likelihoodScore, 3);
});

// ---------------------------------------------------------------------------
// Score cap at 10
// ---------------------------------------------------------------------------

test('Score capped at 10', () => {
  const r = cui583.assess({
    materialClass: 'cs', operatingTempC: 80,
    penetratingFeatures: true,
    coatingCondition: 'none',
    insulationType: 'mineral-wool',
    environment: 'marine',
    cyclicService: true,
    steamTraced: true
  });
  // peak(4) + pen(2) + none(2) + wool(1) + marine(2) + cyclic(1) + steam(1) = 13
  // but capped at 10
  assert.equal(r.likelihoodScore, 10);
});

// ---------------------------------------------------------------------------
// Risk level mapping
// ---------------------------------------------------------------------------

test('Risk level: score 0-2 → low', () => {
  const r = cui583.assess({
    materialClass: 'cs', operatingTempC: 40,
    insulationType: 'closed-cell'
  });
  assert.equal(r.likelihoodScore, 2);
  assert.equal(r.riskLevel, 'low');
});

test('Risk level: score 3-5 → moderate', () => {
  const r = cui583.assess({
    materialClass: 'cs', operatingTempC: 40,
    insulationType: 'mineral-wool'
  });
  assert.equal(r.likelihoodScore, 3);
  assert.equal(r.riskLevel, 'moderate');
});

test('Risk level: score 6-8 → high', () => {
  const r = cui583.assess({
    materialClass: 'cs', operatingTempC: 80,
    penetratingFeatures: true
  });
  // peak(4) + pen(2) = 6
  assert.equal(r.likelihoodScore, 6);
  assert.equal(r.riskLevel, 'high');
});

test('Risk level: score 9-10 → critical', () => {
  const r = cui583.assess({
    materialClass: 'cs', operatingTempC: 80,
    penetratingFeatures: true,
    coatingCondition: 'none',
    insulationType: 'mineral-wool',
    environment: 'marine'
  });
  // peak(4) + pen(2) + none(2) + wool(1) + marine(2) = 11 capped at 10
  assert.equal(r.likelihoodScore, 10);
  assert.equal(r.riskLevel, 'critical');
});

// ---------------------------------------------------------------------------
// Methods by risk level
// ---------------------------------------------------------------------------

test('Methods: low → visual, thermo', () => {
  const r = cui583.assess({
    materialClass: 'cs', operatingTempC: 40
  });
  assert.ok(r.methods.indexOf('cui.method.visual') !== -1);
  assert.ok(r.methods.indexOf('cui.method.thermo') !== -1);
});

test('Methods: moderate → visual, thermo, pec', () => {
  const r = cui583.assess({
    materialClass: 'cs', operatingTempC: 40,
    insulationType: 'mineral-wool'
  });
  assert.equal(r.riskLevel, 'moderate');
  assert.ok(r.methods.indexOf('cui.method.pec') !== -1);
});

test('Methods: high → visual, thermo, pec, rt, gw, utSpot', () => {
  const r = cui583.assess({
    materialClass: 'cs', operatingTempC: 80,
    penetratingFeatures: true
  });
  assert.equal(r.riskLevel, 'high');
  assert.ok(r.methods.indexOf('cui.method.rt') !== -1);
  assert.ok(r.methods.indexOf('cui.method.gw') !== -1);
  assert.ok(r.methods.indexOf('cui.method.utSpot') !== -1);
});

test('Methods: critical → all including utProgram', () => {
  const r = cui583.assess({
    materialClass: 'cs', operatingTempC: 80,
    penetratingFeatures: true,
    coatingCondition: 'none',
    insulationType: 'mineral-wool',
    environment: 'marine'
  });
  assert.equal(r.riskLevel, 'critical');
  assert.ok(r.methods.indexOf('cui.method.utProgram') !== -1);
});

// ---------------------------------------------------------------------------
// SS PT note
// ---------------------------------------------------------------------------

test('SS at T≥60 → PT note added', () => {
  const r = cui583.assess({
    materialClass: 'ss', operatingTempC: 80
  });
  assert.ok(r.notes.indexOf('cui.note.pt') !== -1);
});

test('CS at T≥60 → no PT note', () => {
  const r = cui583.assess({
    materialClass: 'cs', operatingTempC: 80
  });
  assert.equal(r.notes.indexOf('cui.note.pt'), -1);
});

test('SS at T<60 → no PT note', () => {
  const r = cui583.assess({
    materialClass: 'ss', operatingTempC: 50
  });
  assert.equal(r.notes.indexOf('cui.note.pt'), -1);
});

// ---------------------------------------------------------------------------
// Determinism
// ---------------------------------------------------------------------------

test('Deterministic: same inputs → same output', () => {
  const a = cui583.assess({
    materialClass: 'cs', operatingTempC: 80,
    penetratingFeatures: true, coatingCondition: 'poor',
    insulationType: 'mineral-wool', environment: 'coastal',
    cyclicService: true, steamTraced: true
  });
  const b = cui583.assess({
    materialClass: 'cs', operatingTempC: 80,
    penetratingFeatures: true, coatingCondition: 'poor',
    insulationType: 'mineral-wool', environment: 'coastal',
    cyclicService: true, steamTraced: true
  });
  assert.deepStrictEqual(a, b);
});