/* IntegrityWatch Field — inspection evidence render tests
   Exercises renderEvidenceRows with and without evidence fields. */
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

require('../src/compat/file-guard.js');
require('../src/core/bus.js');
require('../src/i18n/locales/en.js');
require('../src/i18n/locales/es.js');
require('../src/i18n/i18n.js');
const evidence = require('../src/components/inspectionEvidence.js');

test('renderEvidenceRows with signature, photos, sketch: no null rows, correct count', () => {
  var rec = {
    signature: 'data:image/png;base64,abc',
    photos: [
      { dataUrl: 'data:image/jpeg;base64,def', capturedAt: '2026-03-14T09:30:00.000Z', gps: { lat: 40.5, lon: -3.0 } }
    ],
    sketch: 'data:image/png;base64,ghi'
  };
  var rows = evidence.renderEvidenceRows(rec);
  assert.ok(Array.isArray(rows), 'result is array');
  // signature row, photos row (1 photo → 1 row), sketch row = 3 rows
  assert.equal(rows.length, 3, '3 evidence rows for full record');

  for (var i = 0; i < rows.length; i++) {
    assert.ok(rows[i] !== null && rows[i] !== undefined, 'row ' + i + ' is not null');
    assert.ok(Array.isArray(rows[i]), 'row ' + i + ' is array [label, node]');
    assert.ok(typeof rows[i][0] === 'string', 'row ' + i + ' has string label');
    assert.ok(rows[i][1] !== null && rows[i][1] !== undefined, 'row ' + i + ' has non-null node');
  }
});

test('renderEvidenceRows with empty record: returns empty array, does not throw', () => {
  var rows = evidence.renderEvidenceRows({});
  assert.ok(Array.isArray(rows), 'result is array');
  assert.equal(rows.length, 0, 'empty record → 0 rows');
});

test('renderEvidenceRows with null/undefined record: returns empty array, does not throw', () => {
  assert.doesNotThrow(function () { evidence.renderEvidenceRows(null); });
  assert.doesNotThrow(function () { evidence.renderEvidenceRows(undefined); });
  var rows1 = evidence.renderEvidenceRows(null);
  assert.equal(rows1.length, 0);
  var rows2 = evidence.renderEvidenceRows(undefined);
  assert.equal(rows2.length, 0);
});

test('renderEvidenceRows with sketch only: 1 row, no photos row', () => {
  var rows = evidence.renderEvidenceRows({ sketch: 'data:image/png;base64,xxx' });
  assert.equal(rows.length, 1);
  assert.ok(rows[0] !== null);
});

test('renderEvidenceRows with photos only (2 photos): 1 row with photo grid', () => {
  var rows = evidence.renderEvidenceRows({
    photos: [
      { dataUrl: 'data:a', capturedAt: null, gps: null },
      { dataUrl: 'data:b', capturedAt: null, gps: null }
    ]
  });
  assert.equal(rows.length, 1);
  assert.ok(rows[0] !== null);
});