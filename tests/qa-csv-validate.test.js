/*
 * Test suite for CSV validation module
 * Verifies column mapping, data validation, and error handling
 */
import { test } from 'node:test';
import { strictEqual, deepStrictEqual, ok } from 'assert/strict';

import csv from '../src/ingest/csv.js';

test('mapColumns creates correct mapping for given headers', () => {
  const headers = ['Código Punto', 'TASA', 'mpy', 'Área', 'días', 'wi', 'wf', 'fecha', 'nota', 'xyz'];
  const { mapping, unmapped } = csv.mapColumns(headers);
  
  strictEqual(mapping['Código Punto'], 'mpCode');
  strictEqual(mapping['TASA'], 'crMpy');
  strictEqual(mapping['mpy'], 'crMpy');
  strictEqual(mapping['Área'], 'areaIn2');
  strictEqual(mapping['días'], 'days');
  strictEqual(mapping['wi'], 'wiMg');
  strictEqual(mapping['wf'], 'wfMg');
  strictEqual(mapping['fecha'], 'date');
  strictEqual(mapping['nota'], 'note');
  deepStrictEqual(unmapped, ['xyz']);
});

test('validateRows accepts crMpy values 0 and 1000', () => {
  const rows = [
    { mpCode: 'MP-001', date: '2026-10-10', crMpy: '0' },
    { mpCode: 'MP-001', date: '2026-10-11', crMpy: '1000' }
  ];
  const { valid, invalid } = csv.validateRows({
    rows,
    existingPointIds: ['MP-001'],
    nowISO: '2026-10-16T12:00:00Z',
    autoCreatePoints: false
  });
  
  strictEqual(valid.length, 2);
  strictEqual(invalid.length, 0);
});

test('validateRows rejects crMpy values 1000.001 and -0.001', () => {
  const rows = [
    { mpCode: 'MP-001', date: '2026-10-10', crMpy: '1000.001' },
    { mpCode: 'MP-001', date: '2026-10-11', crMpy: '-0.001' }
  ];
  const { valid, invalid } = csv.validateRows({
    rows,
    existingPointIds: ['MP-001'],
    nowISO: '2026-10-16T12:00:00Z',
    autoCreatePoints: false
  });
  
  strictEqual(valid.length, 0);
  strictEqual(invalid.length, 2);
  deepStrictEqual(invalid.map(e => e.code), ['E_RANGE', 'E_RANGE']);
});

test('validateRows bswPct validation', () => {
  const rows = [
    { mpCode: 'MP-001', date: '2026-10-10', crMpy: '0', bswPct: '101' }
  ];
  const { valid, invalid } = csv.validateRows({
    rows,
    existingPointIds: ['MP-001'],
    nowISO: '2026-10-16T12:00:00Z',
    autoCreatePoints: false
  });
  
  strictEqual(valid.length, 1);
  strictEqual(invalid.length, 0);
});

test('validateRows days validation', () => {
  const rows = [
    { mpCode: 'MP-001', date: '2026-10-10', wiMg: '100', wfMg: '50', areaIn2: '10', days: '0' }
  ];
  const { valid, invalid } = csv.validateRows({
    rows,
    existingPointIds: ['MP-001'],
    nowISO: '2026-10-16T12:00:00Z',
    autoCreatePoints: false
  });
  
  strictEqual(valid.length, 0);
  strictEqual(invalid.length, 1);
  strictEqual(invalid[0].code, 'E_RANGE');
});

test('validateRows wi/wf validation', () => {
  const rows = [
    { mpCode: 'MP-001', date: '2026-10-10', wiMg: '100', wfMg: '50', areaIn2: '10', days: '5' },
    { mpCode: 'MP-001', date: '2026-10-11', wiMg: '100', wfMg: '150', areaIn2: '10', days: '5' }
  ];
  const { valid, invalid } = csv.validateRows({
    rows,
    existingPointIds: ['MP-001'],
    nowISO: '2026-10-16T12:00:00Z',
    autoCreatePoints: false
  });
  
  strictEqual(valid.length, 1);
  strictEqual(invalid.length, 1);
  strictEqual(invalid[0].code, 'E_WF');
});

test('validateRows date validation - valid formats', () => {
  const rows = [
    { mpCode: 'MP-001', date: '2026-10-10', crMpy: '0' }
  ];
  const { valid, invalid } = csv.validateRows({
    rows,
    existingPointIds: ['MP-001'],
    nowISO: '2026-10-16T12:00:00Z',
    autoCreatePoints: false
  });
  
  strictEqual(valid.length, 1);
  strictEqual(invalid.length, 0);
});

test('validateRows date validation - invalid dates', () => {
  const rows = [
    { mpCode: 'MP-001', date: '31/31/2026', crMpy: '0' },
    { mpCode: 'MP-001', date: '2027-01-05', crMpy: '0' }
  ];
  const { valid, invalid } = csv.validateRows({
    rows,
    existingPointIds: ['MP-001'],
    nowISO: '2026-10-16T12:00:00Z',
    autoCreatePoints: false
  });
  
  strictEqual(valid.length, 0);
  strictEqual(invalid.length, 2);
  deepStrictEqual(invalid.map(e => e.code), ['E_DATE_FORMAT', 'E_DATE_FUTURE']);
});

test('validateRows missing mpCode', () => {
  const rows = [
    { mpCode: '', date: '2026-10-10', crMpy: '0' }
  ];
  const { valid, invalid } = csv.validateRows({
    rows,
    existingPointIds: ['MP-001'],
    nowISO: '2026-10-16T12:00:00Z',
    autoCreatePoints: false
  });
  
  strictEqual(valid.length, 0);
  strictEqual(invalid.length, 1);
  strictEqual(invalid[0].code, 'E_ID');
});

test('validateRows unknown mpCode with autoCreatePoints=false', () => {
  const rows = [
    { mpCode: 'MP-UNKNOWN', date: '2026-10-10', crMpy: '0' }
  ];
  const { valid, invalid, newPoints } = csv.validateRows({
    rows,
    existingPointIds: ['MP-001'],
    nowISO: '2026-10-16T12:00:00Z',
    autoCreatePoints: false
  });
  
  strictEqual(valid.length, 0);
  strictEqual(invalid.length, 1);
  strictEqual(invalid[0].code, 'E_MP_UNKNOWN');
  strictEqual(newPoints.length, 0);
});

test('validateRows unknown mpCode with autoCreatePoints=true', () => {
  const rows = [
    { mpCode: 'MP-UNKNOWN', date: '2026-10-10', crMpy: '0' }
  ];
  const { valid, invalid, newPoints } = csv.validateRows({
    rows,
    existingPointIds: ['MP-001'],
    nowISO: '2026-10-16T12:00:00Z',
    autoCreatePoints: true
  });
  
  strictEqual(valid.length, 1);
  strictEqual(invalid.length, 0);
  strictEqual(newPoints.length, 1);
  strictEqual(newPoints[0].id, 'MP-IMP-001');
  strictEqual(newPoints[0].code, 'MP-UNKNOWN');
});

test('validateRows duplicate detection', () => {
  const rows = [
    { mpCode: 'MP-001', date: '2026-10-10', crMpy: '100' },
    { mpCode: 'MP-001', date: '2026-10-10', crMpy: '100' }
  ];
  const { valid, invalid, duplicates } = csv.validateRows({
    rows,
    existingPointIds: ['MP-001'],
    nowISO: '2026-10-16T12:00:00Z',
    autoCreatePoints: false
  });
  
  strictEqual(valid.length, 1);
  strictEqual(invalid.length, 0);
  strictEqual(duplicates.length, 1);
});