/* IntegrityWatch Field — smoke test (T1b)
   Verifies module load order (CONTRACTS §2), units, bus, views, router and icons. */
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

require('../src/compat/file-guard.js');
const bus = require('../src/core/bus.js');
const units = require('../src/calc/units.js');
require('../src/data/materials.js');
require('../src/data/fluids.js');
require('../src/data/glossary.js');
require('../src/data/standards.js');
require('../src/i18n/locales/en.js');
require('../src/i18n/locales/es.js');
require('../src/i18n/locales/fr.js');
require('../src/i18n/locales/zh.js');
require('../src/i18n/locales/ru.js');
require('../src/i18n/locales/ar.js');
require('../src/i18n/locales/pt.js');
require('../src/i18n/i18n.js');
require('../src/core/db.js');
require('../src/core/dbMemory.js');
require('../src/core/store.js');
require('../src/core/exportImport.js');
require('../src/core/syncQueue.js');
require('../src/security/lock.js');
require('../src/calc/corrosion.js');
require('../src/calc/psv.js');
require('../src/calc/apm.js');
require('../src/rules/engine.js');
require('../src/rules/definitions.js');
require('../src/ingest/csv.js');
require('../src/ingest/witsmlLite.js');
const icons = require('../src/components/icons.js');
require('../src/components/ui.js');
require('../src/reports/quarterly.js');
require('../src/reports/dossier.js');
require('../src/reports/datasheet.js');
require('../src/views/dashboard.js');
require('../src/views/corrosion.js');
require('../src/views/psv.js');
require('../src/views/pipelines.js');
require('../src/views/pipelineMap.js');
require('../src/views/apm.js');
require('../src/views/ingest.js');
require('../src/views/recommendations.js');
require('../src/views/reports.js');
require('../src/views/glossary.js');
require('../src/views/admin.js');
require('../src/app/theme.js');
const router = require('../src/app/router.js');
require('../src/app/shell.js');
require('../src/app/main.js');

const IW = globalThis.IW;

test('T1b.a all modules load in CONTRACTS §2 order without throwing', () => {
  assert.ok(IW, 'global IW namespace should exist after loading all modules');
  assert.ok(IW.core && IW.core.bus, 'IW.core.bus loaded');
  assert.ok(IW.calc && IW.calc.units, 'IW.calc.units loaded');
  assert.ok(IW.app && IW.app.main, 'IW.app.main loaded');
  assert.ok(IW_LOCALES && IW_LOCALES.en, 'IW_LOCALES.en loaded');
});

test('T1b.b units conversions', () => {
  assert.ok(Math.abs(units.mpyToMmYear(100) - 2.54) < 1e-9, '100 mpy -> 2.54 mm/y');
  assert.equal(units.cToF(100), 212, '100 C -> 212 F');
});

test('T1b.b mulberry32 deterministic and bounded to [0,1)', () => {
  const a = units.mulberry32(42);
  const b = units.mulberry32(42);
  for (let i = 0; i < 1000; i++) {
    const x = a();
    const y = b();
    assert.equal(x, y, 'same seed must produce the same sequence');
    assert.ok(x >= 0 && x < 1, 'value must be in [0,1)');
  }
});

test('T1b.c bus on/emit/off with wildcard', () => {
  const calls = [];
  const handler = function (p) { calls.push(p); };
  const off = bus.on('data:changed:*', handler);
  bus.emit('data:changed:readings', 1);
  bus.emit('data:changed:coupons', 2);
  assert.deepEqual(calls, [1, 2]);
  off();
  bus.emit('data:changed:readings', 3);
  assert.deepEqual(calls, [1, 2]);
});

test('T1b.d views registry has 11 views with {id,titleKey,icon,render}', () => {
  const names = ['dashboard', 'corrosion', 'psv', 'pipelines', 'pipelineMap', 'apm', 'ingest', 'recommendations', 'reports', 'glossary', 'admin'];
  assert.equal(Object.keys(IW.views).length, 11, 'exactly 11 views registered');
  for (const name of names) {
    const v = IW.views[name];
    assert.ok(v, 'missing view ' + name);
    assert.equal(typeof v.id, 'string');
    assert.equal(typeof v.titleKey, 'string');
    assert.equal(typeof v.icon, 'string');
    assert.equal(typeof v.render, 'function');
  }
});

test('T1b.e router ROUTES frozen table has 16 patterns', () => {
  assert.equal(router.ROUTES.length, 16);
});

test('T1b.f icons cover all §4.14 names and severity() covers 4 levels', () => {
  const names = ['dashboard', 'corrosion', 'valve', 'pipeline', 'apm', 'ingest', 'recs', 'reports', 'glossary', 'admin', 'alert-critical', 'alert-warning', 'alert-info', 'shape-low', 'shape-moderate', 'shape-high', 'shape-severe', 'sun', 'moon', 'monitor', 'check', 'x', 'plus', 'search', 'filter', 'download', 'upload', 'printer', 'clipboard', 'refresh', 'chevron-down', 'chevron-right', 'lock', 'unlock', 'keyboard', 'close', 'edit', 'trash', 'play', 'menu', 'pump', 'engine', 'fire', 'substation', 'tank', 'compressor', 'separator', 'sensor', 'export', 'print', 'settings', 'chevron-left', 'info', 'warning', 'brand'];
  for (const n of names) {
    assert.ok(typeof icons.ICONS[n] === 'string' && icons.ICONS[n].length > 0, 'missing icon ' + n);
  }
  for (const lv of ['low', 'moderate', 'high', 'severe']) {
    assert.ok(typeof icons.severity(lv) === 'string' && icons.severity(lv).length > 0, 'missing severity shape ' + lv);
  }
});
