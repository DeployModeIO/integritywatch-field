/* IntegrityWatch Field — APM / RBI calculations (TESTS §10) */
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const apm = require('../src/calc/apm.js');

test('A10.1 availability: 720 h window, 36 h downtime -> 95.0 %', () => {
  const pct = apm.availability({ windowH: 720, downtimeH: 36 });
  assert.ok(Math.abs(pct - 95.0) < 1e-9);
});

test('A10.2 mtbf: (2160-60)/3 = 700 h; 0 failures -> null', () => {
  assert.equal(apm.mtbf({ windowH: 2160, downtimeH: 60, failureCount: 3 }), 700);
  assert.equal(apm.mtbf({ windowH: 2160, downtimeH: 60, failureCount: 0 }), null);
});

test('A10.3 mttr: 60/3 = 20 h', () => {
  assert.equal(apm.mttr({ downtimeH: 60, failureCount: 3 }), 20);
});

test('A10.4 oee: 0.95 * 0.90 * 0.98 = 0.8379', () => {
  const o = apm.oee({ a: 0.95, p: 0.90, q: 0.98 });
  assert.ok(Math.abs(o - 0.8379) < 1e-9);
});

test('A10.5 rbiRisk scores and bands', () => {
  assert.deepEqual(apm.rbiRisk({ pof: 4, cof: 5 }), { score: 20, band: 'veryHigh' });
  assert.deepEqual(apm.rbiRisk({ pof: 2, cof: 2 }), { score: 4, band: 'low' });
  assert.deepEqual(apm.rbiRisk({ pof: 3, cof: 2 }), { score: 6, band: 'medium' });
  assert.deepEqual(apm.rbiRisk({ pof: 3, cof: 4 }), { score: 12, band: 'high' });
  // Boundaries 4/5, 9/10, 15/16
  assert.equal(apm.rbiRisk({ pof: 1, cof: 4 }).band, 'low');
  assert.equal(apm.rbiRisk({ pof: 1, cof: 5 }).band, 'medium');
  assert.equal(apm.rbiRisk({ pof: 1, cof: 9 }).band, 'medium');
  assert.equal(apm.rbiRisk({ pof: 2, cof: 5 }).band, 'high');
  assert.equal(apm.rbiRisk({ pof: 3, cof: 5 }).band, 'high');
  assert.equal(apm.rbiRisk({ pof: 4, cof: 4 }).band, 'veryHigh');
});

test('A10.6 inspectionIntervalMonths base 24 (rounding to 0.5)', () => {
  assert.equal(apm.inspectionIntervalMonths({ band: 'low', baseMonths: 24 }), 24);
  assert.equal(apm.inspectionIntervalMonths({ band: 'medium', baseMonths: 24 }), 18);
  assert.equal(apm.inspectionIntervalMonths({ band: 'high', baseMonths: 24 }), 12);
  assert.equal(apm.inspectionIntervalMonths({ band: 'veryHigh', baseMonths: 24 }), 6);
});

test('A10.6 inspectionIntervalMonths rounds to nearest 0.5 month', () => {
  assert.equal(apm.inspectionIntervalMonths({ band: 'medium', baseMonths: 23 }), 17.5);
  assert.equal(apm.inspectionIntervalMonths({ band: 'veryHigh', baseMonths: 10 }), 2.5);
});

test('A10.6 nextInspectionDate: 2026-01-15 + 6 months -> 2026-07-15', () => {
  const iso = apm.nextInspectionDate({ fromISO: '2026-01-15', months: 6 });
  assert.equal(iso, '2026-07-15T00:00:00.000Z');
});
