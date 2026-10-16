/* IntegrityWatch Field — views-b pure logic tests (T9)
   Pure helpers from pipelines and apm views (no DOM). Anchors: CONTRACTS §5.6. */
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

require('../src/calc/apm.js');
const pipelines = require('../src/views/pipelines.js');
const apmView = require('../src/views/apm.js');

test('views-b.pipelines groupCampaigns groups by type+month with counts, sorted', () => {
  const inspections = [
    { id: '1', type: 'ild', date: '2026-03-15T00:00:00.000Z' },
    { id: '2', type: 'ild', date: '2026-03-20T00:00:00.000Z' },
    { id: '3', type: 'visual', date: '2026-03-10T00:00:00.000Z' },
    { id: '4', type: 'ild', date: '2026-02-01T00:00:00.000Z' }
  ];
  const camps = pipelines.groupCampaigns(inspections);
  assert.equal(camps.length, 3);
  const first = camps[0];
  assert.equal(first.month, '2026-02');
  assert.equal(first.type, 'ild');
  assert.equal(first.count, 1);
  const marIld = camps.find(function (c) { return c.month === '2026-03' && c.type === 'ild'; });
  assert.equal(marIld.count, 2);
});

test('views-b.apm computeMetrics 90d window from events', () => {
  const nowISO = '2026-10-15T00:00:00.000Z';
  const events = [
    { id: 'e1', assetId: 'A1', type: 'failure', start: '2026-10-01T00:00:00.000Z', downtimeH: 36 }
  ];
  const m = apmView.computeMetrics(events, { nowISO: nowISO, windowDays: 90 });
  assert.equal(m.windowH, 2160);
  assert.equal(m.failureCount, 1);
  assert.equal(m.downtimeH, 36);
  assert.ok(Math.abs(m.availability - (2124 / 2160) * 100) < 1e-9);
  assert.equal(m.mtbf, 2124);
  assert.equal(m.mttr, 36);
  assert.ok(Math.abs(m.failureRate - (1 / 2160)) < 1e-12);
});

test('views-b.apm computeMetrics derives downtime from start/end when absent', () => {
  const nowISO = '2026-10-15T00:00:00.000Z';
  const events = [
    { id: 'e1', assetId: 'A1', type: 'maintenance', start: '2026-10-10T00:00:00.000Z', end: '2026-10-10T06:00:00.000Z' }
  ];
  const m = apmView.computeMetrics(events, { nowISO: nowISO, windowDays: 90 });
  assert.equal(m.downtimeH, 6);
  assert.equal(m.failureCount, 0);
});

test('views-b.apm computeMetrics ignores events outside the window', () => {
  const nowISO = '2026-10-15T00:00:00.000Z';
  const events = [
    { id: 'e1', assetId: 'A1', type: 'failure', start: '2026-01-01T00:00:00.000Z', downtimeH: 999 }
  ];
  const m = apmView.computeMetrics(events, { nowISO: nowISO, windowDays: 90 });
  assert.equal(m.failureCount, 0);
  assert.equal(m.downtimeH, 0);
});

test('views-b.apm healthLevel traffic light', () => {
  assert.equal(apmView.healthLevel({ failureCount: 0, availability: 95 }, 90), 'good');
  assert.equal(apmView.healthLevel({ failureCount: 0, availability: 92 }, 90), 'warn');
  assert.equal(apmView.healthLevel({ failureCount: 0, availability: 85 }, 90), 'bad');
  assert.equal(apmView.healthLevel({ failureCount: 3, availability: 95 }, 90), 'bad');
  assert.equal(apmView.healthLevel({ failureCount: 0, availability: null }, 90), 'good');
});
