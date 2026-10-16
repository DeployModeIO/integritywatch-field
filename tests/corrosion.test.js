/* IntegrityWatch Field — corrosion engine + materials/fluids data tests (T3)
   Anchors A1.1–A5.2 per docs/TESTS.md §1–§5 (hand-verified values, ±0.5 % rel). */
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

require('../src/calc/units.js');
const materials = require('../src/data/materials.js');
const fluids = require('../src/data/fluids.js');
const corrosion = require('../src/calc/corrosion.js');

function approx(actual, expected, rel) {
  rel = rel === undefined ? 0.005 : rel;
  assert.ok(
    Math.abs(actual - expected) / Math.abs(expected) < rel,
    actual + ' vs ' + expected + ' (rel tolerance ' + rel + ')'
  );
}

function assertEInput(fn) {
  assert.throws(fn, function (err) {
    assert.equal(err && err.code, 'E_INPUT');
    return true;
  });
}

// ---------------------------------------------------------------------------
// §1 — ASTM G4 / SP0775
// ---------------------------------------------------------------------------

test('A1.1 crFromWeightLoss ASTM G4 hand calc: 220 mg, 7.87 g/cm3, 2 in2, 720 h -> 10.366 mpy', () => {
  const r = corrosion.crFromWeightLoss({ deltaWmg: 220, densityGcm3: 7.87, areaIn2: 2.0, hours: 720 });
  approx(r.mpy, 10.366);
  approx(r.mmYear, 0.2633);
  approx(r.umYear, 263.3);
});

test('A1.2 crFromWeightLoss with days:30 (720 h) equals A1.1', () => {
  const a = corrosion.crFromWeightLoss({ deltaWmg: 220, densityGcm3: 7.87, areaIn2: 2.0, hours: 720 });
  const b = corrosion.crFromWeightLoss({ deltaWmg: 220, densityGcm3: 7.87, areaIn2: 2.0, days: 30 });
  assert.equal(b.mpy, a.mpy);
  approx(b.mpy, 10.366);
});

test('A1.3 crFromWeightLoss throws E_INPUT on invalid inputs', () => {
  assertEInput(() => corrosion.crFromWeightLoss({ deltaWmg: 220, densityGcm3: 0, areaIn2: 2.0, hours: 720 }));
  assertEInput(() => corrosion.crFromWeightLoss({ deltaWmg: 220, densityGcm3: 7.87, areaIn2: -1, hours: 720 }));
  assertEInput(() => corrosion.crFromWeightLoss({ deltaWmg: 220, densityGcm3: 7.87, areaIn2: 2.0, hours: 0 }));
  assertEInput(() => corrosion.crFromWeightLoss({ deltaWmg: -5, densityGcm3: 7.87, areaIn2: 2.0, hours: 720 }));
});

test('A1.4 classifySp0775 severity boundaries', () => {
  assert.equal(corrosion.classifySp0775(0.999), 'low');
  assert.equal(corrosion.classifySp0775(1), 'moderate');
  assert.equal(corrosion.classifySp0775(4.99), 'moderate');
  assert.equal(corrosion.classifySp0775(5), 'high');
  assert.equal(corrosion.classifySp0775(9.99), 'high');
  assert.equal(corrosion.classifySp0775(10), 'severe');
  assert.equal(corrosion.classifySp0775(25), 'severe');
});

// ---------------------------------------------------------------------------
// §2 — Inhibitor efficiency
// ---------------------------------------------------------------------------

test('A2.1 inhibitorEfficiency 8.0/2.0 -> 75 % -> acceptable', () => {
  const ei = corrosion.inhibitorEfficiency({ crBlankMpy: 8.0, crInhibitedMpy: 2.0 });
  approx(ei, 75.0);
  assert.equal(corrosion.eiBand(ei), 'acceptable');
});

test('A2.2 inhibitorEfficiency 12.4/0.62 -> 95 % -> excellent', () => {
  const ei = corrosion.inhibitorEfficiency({ crBlankMpy: 12.4, crInhibitedMpy: 0.62 });
  approx(ei, 95.0);
  assert.equal(corrosion.eiBand(ei), 'excellent');
});

test('A2.3 inhibitorEfficiency / eiBand boundaries and blank<=0 -> null', () => {
  assert.equal(corrosion.eiBand(85), 'good');
  assert.equal(corrosion.eiBand(70), 'acceptable');
  assert.equal(corrosion.eiBand(69), 'poor');
  approx(corrosion.inhibitorEfficiency({ crBlankMpy: 10, crInhibitedMpy: 1.5 }), 85);
  approx(corrosion.inhibitorEfficiency({ crBlankMpy: 10, crInhibitedMpy: 3 }), 70);
  approx(corrosion.inhibitorEfficiency({ crBlankMpy: 10, crInhibitedMpy: 3.1 }), 69);
  assert.equal(corrosion.inhibitorEfficiency({ crBlankMpy: 0, crInhibitedMpy: 2.0 }), null);
});

// ---------------------------------------------------------------------------
// §3 — De Waard & Milliams (screening)
// ---------------------------------------------------------------------------

test('A3.1 deWaardMilliams 60 C / 1.0 bar -> 4.647 mm/y -> 183.0 mpy', () => {
  const r = corrosion.deWaardMilliams({ tempC: 60, pCo2Bar: 1.0 });
  approx(r.mmYear, 4.647);
  approx(r.mpy, 183.0);
});

test('A3.2 deWaardMilliams 25 C / 0.5 bar -> 0.7292 mm/y -> 28.71 mpy', () => {
  const r = corrosion.deWaardMilliams({ tempC: 25, pCo2Bar: 0.5 });
  approx(r.mmYear, 0.7292);
  approx(r.mpy, 28.71);
});

test('A3.3 deWaardMilliams throws E_INPUT when pCo2Bar <= 0', () => {
  assertEInput(() => corrosion.deWaardMilliams({ tempC: 60, pCo2Bar: 0 }));
});

// ---------------------------------------------------------------------------
// §4 — Sour service MR0175/ISO 15156 (screening)
// ---------------------------------------------------------------------------

test('A4.1 partialPressureH2S 1000 psia / 2000 ppm -> 13.789 kPa -> moderate', () => {
  const r = corrosion.partialPressureH2S({ totalPressurePsia: 1000, h2sPpm: 2000 });
  approx(r.kpa, 13.789);
  approx(r.psia, 2.0);
  assert.equal(corrosion.classifyMr0175(r.kpa), 'moderate');
});

test('A4.2 partialPressureH2S 517 kPa / 30 ppm -> 0.01551 kPa -> low', () => {
  const r = corrosion.partialPressureH2S({ totalPressureKpa: 517, h2sPpm: 30 });
  approx(r.kpa, 0.01551);
  assert.equal(corrosion.classifyMr0175(r.kpa), 'low');
});

test('A4.3 partialPressureH2S 10000 kPa / 30000 ppm -> 300 kPa -> high', () => {
  const r = corrosion.partialPressureH2S({ totalPressureKpa: 10000, h2sPpm: 30000 });
  approx(r.kpa, 300);
  assert.equal(corrosion.classifyMr0175(r.kpa), 'high');
});

test('A4.4 classifyMr0175 boundary 0.3 kPa -> moderate', () => {
  assert.equal(corrosion.classifyMr0175(0.3), 'moderate');
});

// ---------------------------------------------------------------------------
// §5 — Inhibitor balance / CP
// ---------------------------------------------------------------------------

test('A5.1 inhibitorBalance percentages and 80/150 band boundaries', () => {
  assert.equal(corrosion.inhibitorBalance({ targetPpm: 20, residualPpm: 24 }).band, 'onTarget');
  assert.equal(corrosion.inhibitorBalance({ targetPpm: 20, residualPpm: 12 }).band, 'under');
  assert.equal(corrosion.inhibitorBalance({ targetPpm: 20, residualPpm: 40 }).band, 'over');
  approx(corrosion.inhibitorBalance({ targetPpm: 20, residualPpm: 24 }).pct, 120);
  approx(corrosion.inhibitorBalance({ targetPpm: 20, residualPpm: 12 }).pct, 60);
  approx(corrosion.inhibitorBalance({ targetPpm: 20, residualPpm: 40 }).pct, 200);
  assert.equal(corrosion.inhibitorBalance({ targetPpm: 100, residualPpm: 80 }).band, 'onTarget');
  assert.equal(corrosion.inhibitorBalance({ targetPpm: 100, residualPpm: 79.99 }).band, 'under');
  assert.equal(corrosion.inhibitorBalance({ targetPpm: 100, residualPpm: 150 }).band, 'onTarget');
  assert.equal(corrosion.inhibitorBalance({ targetPpm: 100, residualPpm: 150.01 }).band, 'over');
});

test('A5.2 cpEvaluate SP0169 pass/fail/insufficient', () => {
  assert.equal(corrosion.cpEvaluate({ potentialMvCse: -900 }).status, 'pass');
  assert.equal(corrosion.cpEvaluate({ potentialMvCse: -800 }).status, 'fail');
  assert.equal(corrosion.cpEvaluate({ polarizationMv: 120 }).status, 'pass');
  assert.equal(corrosion.cpEvaluate({}).status, 'insufficient');
  assert.ok(Array.isArray(corrosion.cpEvaluate({ potentialMvCse: -900 }).criteria));
});

// ---------------------------------------------------------------------------
// Materials / fluids data catalogues (SCHEMA §8.1 / §8.2)
// ---------------------------------------------------------------------------

test('materials catalogue: 13 entries with exact densities and byId null fallback', () => {
  const expected = {
    'api5l-gr-b': 7.85,
    'api5l-x52': 7.85,
    'api5l-x60': 7.85,
    'api5l-x70': 7.85,
    'a106-b': 7.85,
    'a516-70': 7.85,
    'ss-316l': 8.00,
    'ss-317l': 8.00,
    'duplex-2205': 7.80,
    'super-duplex-2507': 7.80,
    'cs-coated': 7.85,
    'cu-ni-90-10': 8.90,
    'alloy-c276': 8.89
  };
  assert.equal(materials.list().length, 13);
  for (const id of Object.keys(expected)) {
    const m = materials.byId(id);
    assert.ok(m, 'missing material ' + id);
    assert.equal(m.densityGcm3, expected[id], 'density ' + id);
    assert.ok(['carbonSteel', 'stainless', 'duplex', 'clad'].indexOf(m.family) >= 0, 'family ' + id);
  }
  assert.equal(materials.byId('does-not-exist'), null);
});

test('materialDensity delegates to IW.data.materials (g/cm3, null on unknown)', () => {
  assert.equal(corrosion.materialDensity('api5l-x52'), 7.85);
  assert.equal(corrosion.materialDensity('ss-316l'), 8.00);
  assert.equal(corrosion.materialDensity('alloy-c276'), 8.89);
  assert.equal(corrosion.materialDensity('nope'), null);
});

test('fluids catalogue: 11 editable entries with nameKey fluids.<id> and exact reference values', () => {
  assert.equal(fluids.list().length, 11);

  const gases = {
    methane: { M: 16.04, k: 1.31 },
    ethane: { M: 30.07, k: 1.19 },
    propane: { M: 44.10, k: 1.13 },
    butane: { M: 58.12, k: 1.09 },
    'natural-gas': { M: 19.0, k: 1.30, Z: 0.95 },
    hydrogen: { M: 2.016, k: 1.41 },
    nitrogen: { M: 28.01, k: 1.40 },
    steam: { M: 18.02, k: 1.31, Z: 1.0 }
  };
  for (const id of Object.keys(gases)) {
    const f = fluids.byId(id);
    assert.ok(f, 'missing fluid ' + id);
    assert.equal(f.phase, 'gas', 'phase ' + id);
    assert.equal(f.nameKey, 'fluids.' + id, 'nameKey ' + id);
    assert.equal(f.editable, true, 'editable ' + id);
    for (const key of Object.keys(gases[id])) {
      assert.equal(f[key], gases[id][key], id + '.' + key);
    }
  }

  const liquids = {
    water: { G: 1.00, viscCp: 1 },
    'crude-oil': { G: 0.85, viscCp: 15 },
    diesel: { G: 0.84, viscCp: 3 }
  };
  for (const id of Object.keys(liquids)) {
    const f = fluids.byId(id);
    assert.ok(f, 'missing fluid ' + id);
    assert.equal(f.phase, 'liquid', 'phase ' + id);
    assert.equal(f.nameKey, 'fluids.' + id, 'nameKey ' + id);
    assert.equal(f.editable, true, 'editable ' + id);
    for (const key of Object.keys(liquids[id])) {
      assert.equal(f[key], liquids[id][key], id + '.' + key);
    }
  }

  assert.equal(fluids.byId('does-not-exist'), null);
});
