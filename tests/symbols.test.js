'use strict';
// Symbol set contract: every symbol is safe, has geometry, and every ISO 14224
// category used by the APM module resolves to an existing pictogram.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const symbols = require(path.join(__dirname, '..', 'src', 'components', 'symbols.js'));
const map = require(path.join(__dirname, '..', 'src', 'components', 'symbol-map.js'));

const SECTORS = {
  upstream: ['well', 'platform', 'fpso', 'subsea', 'esp', 'suckerRod', 'gasLift',
    'wellheadCompression', 'separator', 'storageTank', 'centrifugalPump', 'generator',
    'firePump', 'fireSystem'],
  midstream: ['pipeline', 'pumpStation', 'compressorStation', 'loadingTerminal',
    'storageTank', 'gasPlant', 'centrifugalPump', 'reciprocatingPump', 'generator',
    'substation', 'firePump', 'fireSystem'],
  downstream: ['refinery', 'distillationUnit', 'hydrodesulfurization', 'reformer',
    'heatExchanger', 'pump', 'compressor', 'column', 'furnace', 'utilitySteam',
    'utilityAir', 'utilityNitrogen', 'centrifugalPump', 'reciprocatingPump',
    'generator', 'substation', 'firePump', 'fireSystem']
};

test('symbol set has a usable geometry for every entry', () => {
  const names = symbols.names();
  assert.ok(names.length >= 30, `expected a full set, got ${names.length}`);
  for (const name of names) {
    const def = symbols.meta(name);
    assert.match(def.vb, /^-?[\d.]+[ ,]+-?[\d.]+[ ,]+[\d.]+[ ,]+[\d.]+$/,
      `${name}: invalid viewBox ${def.vb}`);
    assert.ok(def.body.length > 20, `${name}: body too small`);
    assert.ok(!/<script/i.test(def.body), `${name}: script must be stripped`);
    assert.ok(!/fill="#|stroke="#/i.test(def.body), `${name}: hard-coded colour left`);
    assert.ok(!/<text/i.test(def.body), `${name}: text nodes must be stripped`);
  }
});

test('every ISO 14224 category in the app resolves to an existing symbol', () => {
  for (const [sector, cats] of Object.entries(SECTORS)) {
    for (const cat of cats) {
      const sym = map.forCategory(cat);
      assert.ok(symbols.has(sym), `${sector}/${cat} -> ${sym} (missing)`);
    }
  }
});

test('monitoring points, line assets, PSVs and recommendations resolve', () => {
  assert.equal(map.forPoint({ sensorType: 'couponGravimetric' }), 'corrosion');
  assert.equal(map.forPoint({ sensorType: 'couponGravimetric', cuiInsulated: true, cuiRisk: 'high' }), 'cui');
  assert.equal(map.forPoint({ sensorType: 'couponGravimetric', micRisk: 'moderate' }), 'mic');
  assert.equal(map.forLineAsset('valve'), 'valve-gate');
  assert.equal(map.forLineAsset('unknown'), 'pipeline-segment');
  assert.equal(map.forPsv(), 'psv');
  assert.equal(map.forRecommendation({ entityType: 'psv' }), 'psv');
  for (const s of [map.forPoint({}), map.forLineAsset('riser'), map.forPsv()]) {
    assert.ok(symbols.has(s), `${s} missing`);
  }
});

test('node() builds an svg with the right viewBox and state class', () => {
  const shim = require(path.join(__dirname, 'helpers', 'dom-shim.js'));
  shim.install();
  try {
    const el = symbols.node('valve-gate', { size: 32, state: 'crit', title: 'Gate valve' });
    assert.ok(el, 'node returned null');
    assert.equal(el.getAttribute('viewBox'), symbols.meta('valve-gate').vb);
    assert.equal(el.getAttribute('height'), '32');
    assert.ok(Number(el.getAttribute('width')) > 0, 'width must be derived from the aspect ratio');
    assert.match(el.getAttribute('class'), /sym-crit/);
    assert.equal(el.getAttribute('aria-label'), 'Gate valve');
    assert.equal(symbols.node('does-not-exist'), null);
  } finally {
    shim.uninstall();
  }
});
