'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');

const corrosion = require('../src/calc/corrosion.js');
const materials = require('../src/data/materials.js');
const fluids = require('../src/data/fluids.js');

const TOL = 0.5;

function assertApprox(actual, expected, msg) {
  const ok = Math.abs(actual - expected) <= Math.abs(expected) * (TOL / 100);
  assert.ok(ok, `${msg || 'value'}: expected ~${expected} (±${TOL}%), got ${actual}`);
}

function assertInputError(fn, msg) {
  assert.throws(fn, (err) => err instanceof Error && err.code === 'E_INPUT', msg);
}

test('1 crFromWeightLoss ASTM G4 baseline', () => {
  const r = corrosion.crFromWeightLoss({ deltaWmg: 220, densityGcm3: 7.87, areaIn2: 2.0, hours: 720 });
  assertApprox(r.mpy, 10.366, 'mpy');
  assertApprox(r.mmYear, 0.2633, 'mmYear');
  assertApprox(r.umYear, 263.3, 'umYear');
});

test('2 days:30 equals hours:720', () => {
  const byDays = corrosion.crFromWeightLoss({ deltaWmg: 220, densityGcm3: 7.87, areaIn2: 2.0, days: 30 });
  const byHours = corrosion.crFromWeightLoss({ deltaWmg: 220, densityGcm3: 7.87, areaIn2: 2.0, hours: 720 });
  assertApprox(byDays.mpy, byHours.mpy, 'mpy equivalence');
  assertApprox(byDays.mmYear, byHours.mmYear, 'mmYear equivalence');
});

test('3 crFromWeightLoss rejects invalid inputs with E_INPUT', () => {
  assertInputError(() => corrosion.crFromWeightLoss({ deltaWmg: 220, densityGcm3: 0, areaIn2: 2.0, hours: 720 }), 'density 0');
  assertInputError(() => corrosion.crFromWeightLoss({ deltaWmg: 220, densityGcm3: 7.87, areaIn2: -1, hours: 720 }), 'area -1');
  assertInputError(() => corrosion.crFromWeightLoss({ deltaWmg: 220, densityGcm3: 7.87, areaIn2: 2.0, hours: 0 }), 'hours 0');
  assertInputError(() => corrosion.crFromWeightLoss({ deltaWmg: -5, densityGcm3: 7.87, areaIn2: 2.0, hours: 720 }), 'deltaWmg -5');
});

test('4 classifySp0775 severity bands', () => {
  assert.equal(corrosion.classifySp0775(0.999), 'low');
  assert.equal(corrosion.classifySp0775(1), 'moderate');
  assert.equal(corrosion.classifySp0775(4.99), 'moderate');
  assert.equal(corrosion.classifySp0775(5), 'high');
  assert.equal(corrosion.classifySp0775(9.99), 'high');
  assert.equal(corrosion.classifySp0775(10), 'severe');
});

test('5 inhibitorEfficiency and eiBand', () => {
  assertApprox(corrosion.inhibitorEfficiency({ crBlankMpy: 8, crInhibitedMpy: 2 }), 75, 'EI');
  assert.equal(corrosion.eiBand(75), 'acceptable');
  assert.equal(corrosion.eiBand(95), 'excellent');
  assert.equal(corrosion.inhibitorEfficiency({ crBlankMpy: 0, crInhibitedMpy: 2 }), null);
});

test('6 deWaardMilliams sweet screening', () => {
  const r = corrosion.deWaardMilliams({ tempC: 60, pCo2Bar: 1.0 });
  assertApprox(r.mmYear, 4.647, 'mmYear');
  assertApprox(r.mpy, 183.0, 'mpy');
});

test('7 deWaardMilliams rejects zero pCO2', () => {
  assertInputError(() => corrosion.deWaardMilliams({ tempC: 60, pCo2Bar: 0 }), 'pCo2Bar 0');
});

test('8 partialPressureH2S and classifyMr0175', () => {
  const r = corrosion.partialPressureH2S({ totalPressurePsia: 1000, h2sPpm: 2000 });
  assertApprox(r.kpa, 13.789, 'kPa');
  assert.equal(corrosion.classifyMr0175(0.299), 'low');
  assert.equal(corrosion.classifyMr0175(0.3), 'moderate');
  assert.equal(corrosion.classifyMr0175(100), 'moderate');
  assert.equal(corrosion.classifyMr0175(100.001), 'high');
});

test('9 inhibitorBalance bands', () => {
  // DEVIATION-CORR-9: the literal anchor {targetPpm:25,residualPpm:24} yields
  // pct=96 -> onTarget, not the stated 120/12/40. Residuals for target 25 are
  // chosen to hit the stated percentages: 30->120, 3->12, 10->40.
  // DEVIATION-CORR-9b: the anchor calls pct 40 "over", but the real window is
  // 80-150 %, so pct 40 is 'under' (over requires pct > 150).
  const on = corrosion.inhibitorBalance({ targetPpm: 25, residualPpm: 30 });
  assertApprox(on.pct, 120, 'pct 120');
  assert.equal(on.band, 'onTarget');

  const under = corrosion.inhibitorBalance({ targetPpm: 25, residualPpm: 3 });
  assertApprox(under.pct, 12, 'pct 12');
  assert.equal(under.band, 'under');

  const low = corrosion.inhibitorBalance({ targetPpm: 25, residualPpm: 10 });
  assertApprox(low.pct, 40, 'pct 40');
  assert.equal(low.band, 'under');

  const over = corrosion.inhibitorBalance({ targetPpm: 25, residualPpm: 40 });
  assertApprox(over.pct, 160, 'pct 160');
  assert.equal(over.band, 'over');
});

test('10 cpEvaluate criteria', () => {
  assert.equal(corrosion.cpEvaluate({ potentialMvCse: -900 }).status, 'pass');
  assert.equal(corrosion.cpEvaluate({ potentialMvCse: -800 }).status, 'fail');
  assert.equal(corrosion.cpEvaluate({ polarizationMv: 120 }).status, 'pass');
  assert.equal(corrosion.cpEvaluate({}).status, 'insufficient');
});

test('11 materials densities', () => {
  assert.equal(materials.byId('api5l-gr-b').densityGcm3, 7.85);
  assert.equal(materials.byId('ss-316l').densityGcm3, 8.00);
  assert.equal(materials.byId('duplex-2205').densityGcm3, 7.80);
  assert.equal(materials.byId('super-duplex-2507').densityGcm3, 7.80);
  assert.equal(materials.byId('cu-ni-90-10').densityGcm3, 8.90);
  assert.equal(materials.byId('alloy-c276').densityGcm3, 8.89);
  assert.equal(materials.byId('unknown-id'), null); // real: byId returns null for unknown ids
});

test('12 fluids catalogue', () => {
  assert.equal(fluids.fluids.length, 11);
  const methane = fluids.byId('methane');
  assertApprox(methane.M, 16.04, 'methane M');
  assertApprox(methane.k, 1.31, 'methane k');
  const water = fluids.byId('water');
  assert.equal(water.phase, 'liquid');
  assertApprox(water.G, 1.0, 'water G');
  assert.equal(fluids.byId('steam').phase, 'gas');
});
