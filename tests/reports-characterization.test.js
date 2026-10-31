/* IntegrityWatch Field — reports structure characterization
   Freezes the current DOM structure of the three report builders
   (quarterly, dossier, datasheet) ahead of refactor. A change to a
   section, heading, table or row count must fail here. */
'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');

const shim = require('./helpers/dom-shim');
require('../src/reports/model.js');
require('../src/reports/charts.js');
require('../src/reports/model-quarterly.js');
require('../src/reports/model-dossier.js');
require('../src/reports/model-datasheet.js');
require('../src/reports/renderer.js');
require('../src/reports/registry.js');
const quarterly = require('../src/reports/quarterly.js');
const dossier = require('../src/reports/dossier.js');
const datasheet = require('../src/reports/datasheet.js');

before(() => shim.install());
after(() => shim.uninstall());

const t = (key) => key;
const PERIOD = { fromISO: '2026-01-01', toISO: '2026-03-31' };

const monitoringPoints = [
  {
    id: 'MP-TEST-1', code: 'MP-01', sector: 'upstream', line: 'L-100', material: 'CS',
    sensorType: 'visual', systemId: 'SYS-1',
    process: { h2sPpm: 5, co2Ppm: 1000, totalPressureKpa: 500, tempC: 40, inhibitorTargetPpm: 50, inhibitorResidualPpm: 45 }
  },
  {
    id: 'MP-TEST-2', code: 'MP-02', sector: 'midstream', line: 'L-200', material: 'SS',
    sensorType: 'probe', systemId: 'SYS-2',
    process: { h2sPpm: 0, co2Ppm: 500, totalPressureKpa: 300, tempC: 35, inhibitorTargetPpm: 0, inhibitorResidualPpm: 0 }
  }
];

const readings = [
  { id: 'R1', mpId: 'MP-TEST-1', date: '2026-01-10', crMpy: 4.5, source: 'coupon' },
  { id: 'R2', mpId: 'MP-TEST-1', date: '2026-02-10', crMpy: 5.5, source: 'coupon' },
  { id: 'R3', mpId: 'MP-TEST-1', date: '2026-03-10', crMpy: 6.0, source: 'coupon' },
  { id: 'R4', mpId: 'MP-TEST-2', date: '2026-01-15', crMpy: 2.0, source: 'probe' },
  { id: 'R5', mpId: 'MP-TEST-2', date: '2026-02-15', crMpy: 2.5, source: 'probe' },
  { id: 'R6', mpId: 'MP-TEST-2', date: '2026-03-15', crMpy: 3.0, source: 'probe' }
];

const coupons = [
  { id: 'C1', pairId: 'PAIR-1', role: 'blank', mpId: 'MP-TEST-1', wiMg: 1200.0, wfMg: 1180.0, areaIn2: 4.0, days: 90, exposedHours: 2160, densityGcm3: 7.85, startDate: '2026-01-01', endDate: '2026-03-31', crMpy: 8.0 },
  { id: 'C2', pairId: 'PAIR-1', role: 'inhibited', mpId: 'MP-TEST-1', wiMg: 1200.0, wfMg: 1195.0, areaIn2: 4.0, days: 90, exposedHours: 2160, densityGcm3: 7.85, startDate: '2026-01-01', endDate: '2026-03-31', crMpy: 2.0 }
];

const psvs = [
  {
    id: 'PSV-TEST-1', tag: 'PSV-101', assetId: 'MP-TEST-1', location: 'Skid A',
    valveType: 'conventional', fluid: { name: 'Natural Gas', phase: 'gas' }, fluidId: 'naturalGas',
    setPressurePsig: 150.0, backPressurePsig: 10.0, operatingTempF: 120.0,
    certifiedCapacity: 4.5, Kd: 0.975, Kb: 1.0, Kw: 1.0, Kc: 1.0,
    sizing: { Kv: 1.0, Re: 120000, critical: true, AreqIn2: 0.5, selectedAreaIn2: 0.6, selectedOrificeLetter: 'J', marginPct: 20.0, F2: undefined, Kb: 1.0, Kw: 1.0 },
    lastTestDate: '2025-06-01', nextTestDate: '2026-06-01', status: 'ok'
  }
];

const recommendations = [
  { id: 'REC-1', ruleId: 'R01', status: 'open', severity: 'warning', entityLabel: 'MP-01', entityId: 'MP-TEST-1' },
  { id: 'REC-2', ruleId: 'R02', status: 'resolved', severity: 'info', entityLabel: 'MP-02', entityId: 'MP-TEST-2' }
];

function listRepo(items) { return { list: async () => items }; }
function getRepo(items) { return { get: async (id) => items.find((it) => it.id === id) || null }; }

const quarterlyRepos = {
  monitoringPoints: listRepo(monitoringPoints),
  readings: listRepo(readings),
  coupons: listRepo(coupons),
  psvs: listRepo(psvs),
  apmAssets: listRepo([]),
  apmEvents: listRepo([]),
  recommendations: listRepo(recommendations)
};

const dossierRepos = {
  monitoringPoints: getRepo(monitoringPoints),
  readings: listRepo(readings),
  coupons: listRepo(coupons),
  psvs: listRepo(psvs)
};

const datasheetRepos = {
  psvs: getRepo(psvs)
};

function outline(el) { return shim.elementToOutline(el); }

function classTokens(node) {
  return (node && typeof node.class === 'string') ? node.class.split(/\s+/).filter(Boolean) : [];
}

function hasClass(node, name) { return classTokens(node).includes(name); }

function directSections(root) {
  return (root.children || []).filter((c) => c.tag === 'section' && hasClass(c, 'report-section'));
}

function headings(sections) {
  return sections.map((s) => {
    const h2 = (s.children || []).find((c) => c.tag === 'h2');
    return h2 ? h2.text : null;
  });
}

function findAll(node, predicate) {
  const acc = [];
  (function walk(n) {
    if (!n) { return; }
    if (predicate(n)) { acc.push(n); }
    (n.children || []).forEach(walk);
  })(node);
  return acc;
}

function reportTables(root) {
  return findAll(root, (n) => n.tag === 'div' && hasClass(n, 'report-table'));
}

function tableRowCount(tableNode) {
  const table = (tableNode.children || []).find((c) => c.tag === 'table');
  const tbody = table ? (table.children || []).find((c) => c.tag === 'tbody') : null;
  return tbody ? (tbody.children || []).filter((c) => c.tag === 'tr').length : 0;
}

function sectionWithHeading(root, key) {
  return directSections(root).find((s) => {
    const first = (s.children || [])[0];
    return first && first.text === key;
  }) || null;
}

function disclaimer(root) {
  return findAll(root, (n) => n.tag === 'div' && hasClass(n, 'report-disclaimer'));
}

function coverH1Text(root) {
  const header = (root.children || []).find((c) => c.tag === 'header' && hasClass(c, 'report-cover'));
  const h1 = header ? (header.children || []).find((c) => c.tag === 'h1') : null;
  return h1 ? h1.text : null;
}

function assertReportShell(root, rootClass, coverKey, sectionKeys, tableRows) {
  assert.equal(root.tag, 'div');
  assert.ok(hasClass(root, 'print-root'));
  assert.ok(hasClass(root, 'report'));
  assert.ok(hasClass(root, rootClass));
  assert.equal(coverH1Text(root), coverKey);

  const sections = directSections(root);
  assert.equal(sections.length, sectionKeys.length);
  assert.deepEqual(headings(sections), sectionKeys);

  const tables = reportTables(root);
  assert.deepEqual(tables.map(tableRowCount), tableRows);

  assert.ok(sectionWithHeading(root, 'reports.standardsApplied'), 'standards section exists');

  const disclaimers = disclaimer(root);
  assert.equal(disclaimers.length, 1);
  const strong = (disclaimers[0].children || []).find((c) => c.tag === 'strong');
  assert.ok(strong, 'disclaimer has a strong label');
  assert.equal(strong.text, 'reports.disclaimer');
}

test('quarterly report structure is frozen', async () => {
  const doc = await quarterly.build({ repos: quarterlyRepos, period: PERIOD, t });
  assert.ok(doc, 'build returns a document');
  assertReportShell(
    outline(doc),
    'report-quarterly',
    'reports.cover',
    [
      'reports.kpis',
      'reports.weeklyChartTitle',
      'reports.topCritical',
      'reports.eiByPairs',
      'reports.campaignsTable',
      'reports.recsSummary',
      'reports.standardsApplied',
      'reports.methodology'
    ],
    [2, 1, 2, 1]
  );
});

test('dossier report structure is frozen', async () => {
  const doc = await dossier.build({ repos: dossierRepos, mpId: 'MP-TEST-1', t });
  assert.ok(doc, 'build returns a document');
  assertReportShell(
    outline(doc),
    'report-dossier',
    'reports.dossierTitle',
    [
      'reports.pointInfo',
      'corrosion.readings',
      'reports.astmCalc',
      'reports.screening',
      'reports.associatedPsvs',
      'reports.standardsApplied'
    ],
    [3, 1]
  );
});

test('datasheet report structure is frozen', async () => {
  const doc = await datasheet.build({ repos: datasheetRepos, psvId: 'PSV-TEST-1', t });
  assert.ok(doc, 'build returns a document');
  assertReportShell(
    outline(doc),
    'report-datasheet',
    'reports.datasheetTitle',
    [
      'reports.datasheetFields',
      'psv.sizingTitle',
      'reports.testDates',
      'reports.standardsApplied'
    ],
    []
  );
});
