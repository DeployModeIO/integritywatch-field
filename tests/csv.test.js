/* IntegrityWatch Field — CSV ingest tests (T7)
   Anchors per docs/TESTS.md §12 (delimiter detection, parse, mapping,
   validation codes, toRecords reading/coupon conversion). */
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

require('../src/calc/corrosion.js');
const csv = require('../src/ingest/csv.js');

const FIX = (name) => fs.readFileSync(path.join(__dirname, 'fixtures', name), 'utf8');

function approx(actual, expected, rel) {
  rel = rel === undefined ? 0.005 : rel;
  assert.ok(
    Math.abs(actual - expected) / Math.abs(expected) < rel,
    actual + ' vs ' + expected + ' (rel tolerance ' + rel + ')'
  );
}

// Zip raw rows into canonical objects using the header→canonical mapping.
function toCanonical(headers, mapping, row) {
  const obj = {};
  headers.forEach((h, i) => {
    const f = mapping[h];
    if (f && row[i] !== undefined && String(row[i]).trim() !== '') {
      obj[f] = String(row[i]).trim();
    }
  });
  return obj;
}

const POINT_IDS = ['MP-CORR-001', 'MP-CORR-002', 'MP-CORR-003'];
const NOW_ISO = '2026-10-15T00:00:00Z';

// ---------------------------------------------------------------------------
// detectDelimiter
// ---------------------------------------------------------------------------

test('§12 detectDelimiter resolves comma / semicolon / tab fixtures', () => {
  assert.equal(csv.detectDelimiter(FIX('sample-comma.csv')), ',');
  assert.equal(csv.detectDelimiter(FIX('sample-semi.csv')), ';');
  assert.equal(csv.detectDelimiter(FIX('sample-tab.tsv')), '\t');
});

// ---------------------------------------------------------------------------
// parse
// ---------------------------------------------------------------------------

test('§12 parse keeps quoted commas intact and handles CRLF', () => {
  const p = csv.parse('punto,fecha,tasa,nota\r\nMP-CORR-001,2026-09-20,4.2,"nota, con coma"\r\n', { delimiter: ',' });
  assert.deepEqual(p.headers, ['punto', 'fecha', 'tasa', 'nota']);
  assert.equal(p.rows.length, 1);
  assert.equal(p.rows[0][3], 'nota, con coma');
});

test('§12 parse unescapes double-quote pairs', () => {
  const p = csv.parse('a,b\r\n"x""y",z\r\n', { delimiter: ',' });
  assert.equal(p.rows[0][0], 'x"y');
  assert.equal(p.rows[0][1], 'z');
});

// ---------------------------------------------------------------------------
// mapColumns
// ---------------------------------------------------------------------------

test('§12 mapColumns resolves aliases and lists unmapped headers', () => {
  const headers = ['Código Punto', 'Tasa', 'mpy', 'Área', 'días', 'wi', 'wf', 'unknown'];
  const { mapping, unmapped } = csv.mapColumns(headers);
  assert.equal(mapping['Código Punto'], 'mpCode');
  assert.equal(mapping['Tasa'], 'crMpy');
  assert.equal(mapping['mpy'], 'crMpy');
  assert.equal(mapping['Área'], 'areaIn2');
  assert.equal(mapping['días'], 'days');
  assert.equal(mapping['wi'], 'wiMg');
  assert.equal(mapping['wf'], 'wfMg');
  assert.deepEqual(unmapped, ['unknown']);
});

// ---------------------------------------------------------------------------
// validateRows
// ---------------------------------------------------------------------------

test('§12 validateRows sample-comma: 3 valid, 1 duplicate, 1 future-date error', () => {
  const p = csv.parse(FIX('sample-comma.csv'), { delimiter: ',' });
  const { mapping } = csv.mapColumns(p.headers);
  const rows = p.rows.map((r) => toCanonical(p.headers, mapping, r));
  const res = csv.validateRows({ rows, mapping, existingPointIds: POINT_IDS, nowISO: NOW_ISO });

  assert.equal(res.valid.length, 3);
  assert.equal(res.duplicates.length, 1);
  assert.equal(res.invalid.length, 1);
  assert.equal(res.invalid[0].code, 'E_DATE_FUTURE');
  assert.equal(res.invalid[0].field, 'date');
});

test('§12 validateRows sample-bad: expected error codes per row', () => {
  const p = csv.parse(FIX('sample-bad.csv'), { delimiter: ',' });
  const { mapping } = csv.mapColumns(p.headers);
  const rows = p.rows.map((r) => toCanonical(p.headers, mapping, r));
  const res = csv.validateRows({ rows, mapping, existingPointIds: POINT_IDS, nowISO: NOW_ISO });

  assert.equal(res.invalid.length, 4);
  assert.deepEqual(
    res.invalid.map((e) => e.code),
    ['E_WF', 'E_MP_UNKNOWN', 'E_RANGE', 'E_DATE_FORMAT']
  );
});

test('§12 validateRows autoCreatePoints assigns MP-IMP-001 for unknown point', () => {
  const p = csv.parse(FIX('sample-bad.csv'), { delimiter: ',' });
  const { mapping } = csv.mapColumns(p.headers);
  const rows = p.rows.map((r) => toCanonical(p.headers, mapping, r));
  const res = csv.validateRows({ rows, mapping, existingPointIds: POINT_IDS, nowISO: NOW_ISO, autoCreatePoints: true });

  assert.equal(res.newPoints.length, 1);
  assert.equal(res.newPoints[0].id, 'MP-IMP-001');
  assert.equal(res.newPoints[0].code, 'MP-NO-EXISTE');

  const created = res.valid.find((v) => v.mpId === 'MP-IMP-001');
  assert.ok(created, 'auto-created row must be valid');
  assert.equal(created.crMpy, 2.0);
});

// ---------------------------------------------------------------------------
// toRecords
// ---------------------------------------------------------------------------

test('§12 toRecords coupon from sample-tab: ASTM G4 CR ≈ 10.366 mpy', () => {
  const p = csv.parse(FIX('sample-tab.tsv'), { delimiter: '\t' });
  const { mapping } = csv.mapColumns(p.headers);
  const rows = p.rows.map((r) => toCanonical(p.headers, mapping, r));
  const res = csv.validateRows({ rows, mapping, existingPointIds: POINT_IDS, nowISO: NOW_ISO });
  const records = csv.toRecords(res.valid, mapping);

  assert.equal(records.readings.length, 0);
  assert.equal(records.coupons.length, 2);

  const c = records.coupons[0];
  assert.equal(c.mpId, 'MP-CORR-003');
  assert.equal(c.wiMg, 5200);
  assert.equal(c.wfMg, 4980);
  assert.equal(c.areaIn2, 2.0);
  assert.equal(c.days, 30);
  assert.equal(c.densityGcm3, 7.85);
  approx(c.crMpy, 10.366);
});

test('§12 toRecords reading from sample-comma: source import', () => {
  const p = csv.parse(FIX('sample-comma.csv'), { delimiter: ',' });
  const { mapping } = csv.mapColumns(p.headers);
  const rows = p.rows.map((r) => toCanonical(p.headers, mapping, r));
  const res = csv.validateRows({ rows, mapping, existingPointIds: POINT_IDS, nowISO: NOW_ISO });
  const records = csv.toRecords(res.valid, mapping);

  assert.equal(records.readings.length, 3);
  assert.equal(records.coupons.length, 0);

  const r0 = records.readings[0];
  assert.equal(r0.mpId, 'MP-CORR-001');
  assert.equal(r0.date, '2026-09-20');
  assert.equal(r0.crMpy, 4.2);
  assert.equal(r0.source, 'import');
  assert.equal(r0.note, 'ok');
});
