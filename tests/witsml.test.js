/* IntegrityWatch Field — WITSML-lite parser tests (T7)
   Anchors per docs/TESTS.md §12 (WITSML) and docs/SCHEMA.md §7. */
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const witsmlLite = require('../src/ingest/witsmlLite.js');

const fixture = fs.readFileSync(path.join(__dirname, 'fixtures', 'sample-witsml.xml'), 'utf8');

test('WITSML fixture: 2 wells, 3 stations, 1 channel x 4 valid points, E_WITSML_POINT for malformed point', () => {
  const r = witsmlLite.parse(fixture);

  assert.equal(r.wells.length, 2);
  assert.deepEqual(r.wells[0], { uid: 'W-1', name: 'Well Alpha', field: 'Norte', operator: 'Petronorth' });
  assert.equal(r.wells[1].uid, 'W-2');
  assert.equal(r.wells[1].name, 'Well Beta');

  assert.equal(r.trajectoryStations.length, 3);
  assert.equal(r.trajectoryStations[0].wellUid, 'W-1');
  assert.deepEqual(r.trajectoryStations.map((s) => s.md), [120.5, 350.0, 600.0]);
  assert.deepEqual(r.trajectoryStations.map((s) => s.incl), [12.3, 15.1, 18.4]);
  assert.deepEqual(r.trajectoryStations.map((s) => s.azi), [45.0, 47.2, 50.5]);

  assert.equal(r.channels.length, 1);
  const ch = r.channels[0];
  assert.equal(ch.wellUid, 'W-1');
  assert.equal(ch.name, 'CR_MPY');
  assert.equal(ch.unit, 'mpy');
  assert.equal(ch.mpCode, 'MP-CORR-001');
  assert.equal(ch.points.length, 4);
  assert.deepEqual(ch.points.map((p) => p.value), [3.2, 3.4, 3.1, 3.6]);
  assert.deepEqual(ch.points.map((p) => p.time), [
    '2026-09-01T00:00:00Z',
    '2026-09-02T00:00:00Z',
    '2026-09-03T00:00:00Z',
    '2026-09-04T00:00:00Z'
  ]);

  const pointErrors = r.errors.filter((e) => e.code === 'E_WITSML_POINT');
  assert.ok(pointErrors.length >= 1, 'expected at least one E_WITSML_POINT error');
  assert.ok(r.errors[0].detail, 'error should carry a detail string');
});

test('WITSML inline variant with witsml: prefix on every tag -> same result', () => {
  const inline = [
    '<?xml version="1.0"?>',
    '<witsml:iw-lite>',
    '  <witsml:wells>',
    '    <witsml:well uid="W-1" name="Well Alpha" field="Norte" operator="Petronorth"/>',
    '    <witsml:well uid="W-2" name="Well Beta"/>',
    '  </witsml:wells>',
    '  <witsml:trajectories>',
    '    <witsml:station wellUid="W-1" md="120.5" incl="12.3" azi="45.0"/>',
    '    <witsml:station wellUid="W-1" md="350.0" incl="15.1" azi="47.2"/>',
    '    <witsml:station wellUid="W-1" md="600.0" incl="18.4" azi="50.5"/>',
    '  </witsml:trajectories>',
    '  <witsml:channels>',
    '    <witsml:channel wellUid="W-1" name="CR_MPY" unit="mpy" mpCode="MP-CORR-001">',
    '      <witsml:point time="2026-09-01T00:00:00Z" value="3.2"/>',
    '      <witsml:point time="2026-09-02T00:00:00Z" value="3.4"/>',
    '      <witsml:point time="2026-09-03T00:00:00Z" value="3.1"/>',
    '      <witsml:point time="2026-09-04T00:00:00Z" value="3.6"/>',
    '      <witsml:point time="2026-09-05T00:00:00Z"/>',
    '    </witsml:channel>',
    '  </witsml:channels>',
    '</witsml:iw-lite>'
  ].join('\n');

  const r = witsmlLite.parse(inline);

  assert.equal(r.wells.length, 2);
  assert.equal(r.wells[0].name, 'Well Alpha');
  assert.equal(r.trajectoryStations.length, 3);
  assert.equal(r.channels.length, 1);
  assert.equal(r.channels[0].mpCode, 'MP-CORR-001');
  assert.equal(r.channels[0].points.length, 4);
  assert.deepEqual(r.channels[0].points.map((p) => p.value), [3.2, 3.4, 3.1, 3.6]);
  assert.equal(r.errors.filter((e) => e.code === 'E_WITSML_POINT').length, 1);
});

test('WITSML single-quoted attributes parse the same as double-quoted', () => {
  const single = [
    '<iw-lite>',
    '  <wells>',
    "    <well uid='W-1' name='Well Alpha' field='Norte' operator='Petronorth'/>",
    '  </wells>',
    '  <channels>',
    "    <channel wellUid='W-1' name='CR_MPY' unit='mpy' mpCode='MP-CORR-001'>",
    "      <point time='2026-09-01T00:00:00Z' value='3.2'/>",
    '    </channel>',
    '  </channels>',
    '</iw-lite>'
  ].join('\n');

  const r = witsmlLite.parse(single);

  assert.equal(r.wells.length, 1);
  assert.equal(r.wells[0].name, 'Well Alpha');
  assert.equal(r.channels.length, 1);
  assert.equal(r.channels[0].points.length, 1);
  assert.equal(r.channels[0].points[0].value, 3.2);
  assert.equal(r.errors.length, 0);
});

test('WITSML empty/invalid XML -> empty structure, no throw', () => {
  assert.deepEqual(witsmlLite.parse(''), {
    wells: [],
    trajectoryStations: [],
    channels: [],
    errors: []
  });
  assert.deepEqual(witsmlLite.parse('   '), {
    wells: [],
    trajectoryStations: [],
    channels: [],
    errors: []
  });
});

test('WITSML hostile tag names are escaped and matched literally (ReDoS-safe)', () => {
  // ".*" must match only a literal "<.* …>" tag, not swallow the document.
  const dotStar = witsmlLite.scanLeaf('<.* uid="X"/>', '.*');
  assert.equal(dotStar.length, 1);
  assert.equal(dotStar[0].uid, 'X');

  // Quantifier-laden name is treated literally; it must not throw or hang.
  const hostile = 'a{1000000}(';
  const quant = witsmlLite.scanLeaf('<a{1000000}( uid="Y"/>', hostile);
  assert.equal(quant.length, 1);
  assert.equal(quant[0].uid, 'Y');

  // A literal ".*" tag is not present in a document containing only <well>.
  assert.equal(witsmlLite.scanLeaf('<well uid="Z"/>', '.*').length, 0);
});
