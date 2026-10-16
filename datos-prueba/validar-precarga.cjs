/* Validador de precarga — IntegrityWatch Field
   Ejecuta el IMPORTADOR REAL (src/core/exportImport.js) sobre la precarga de ductos
   y verifica: forma del payload, dry-run sin mutación, import merge, integridad
   referencial y validez de enums. Uso: node datos-prueba\validar-precarga.cjs */
'use strict';
const fs = require('fs');
const path = require('path');
const dbMemory = require('../src/core/dbMemory.js');
const storeMod = require('../src/core/store.js');
const exportImport = require('../src/core/exportImport.js');
const materials = require('../src/data/materials.js');

const FILE = path.join(__dirname, 'precarga-ductos-combustibles.json');

const EXPECTED = ['pipelineSystems', 'lineAssets', 'lineInspections', 'monitoringPoints', 'readings', 'psvs', 'apmAssets', 'apmEvents'];
const ASSET_TYPES = ['sectionValve', 'blockValve', 'flange', 'fitting', 'pumpStation', 'compressorStation', 'tank', 'sump', 'valveChamber', 'crossing', 'row', 'meteringStation'];
const INSP_TYPES = ['ild', 'externalCorrosion', 'visual', 'ut', 'repair', 'replacement'];
const SIDES = ['left', 'right', 'center'];
const PRODUCTS = ['crude', 'gas', 'products', 'water'];
const SEVERITIES = ['low', 'moderate', 'high', 'severe'];
const SENSORS = ['couponGravimetric', 'erProbe', 'lprProbe', 'h2Probe', 'utInspection', 'visual'];
const EVENT_TYPES = ['failure', 'maintenance', 'unplannedOutage', 'workOrder', 'inspection'];
const VALVE_TYPES = ['conventional', 'balanced', 'pilot'];
const CATS = {
  upstream: ['well', 'platform', 'fpso', 'subsea', 'esp', 'suckerRod', 'gasLift', 'wellheadCompression', 'separator', 'storageTank'],
  midstream: ['pipeline', 'pumpStation', 'compressorStation', 'loadingTerminal', 'storageTank', 'gasPlant'],
  downstream: ['refinery', 'distillationUnit', 'hydrodesulfurization', 'reformer', 'heatExchanger', 'pump', 'compressor', 'column', 'furnace', 'utilitySteam', 'utilityAir', 'utilityNitrogen']
};

async function main() {
  const payload = JSON.parse(fs.readFileSync(FILE, 'utf8'));
  const d = payload.data || {};
  const checks = [];
  const ok = (id, cond, detail) => checks.push({ id: id, pass: !!cond, detail: detail || '' });

  ok('payload.app/version', payload.app === 'integritywatch-field' && payload.version === 1, payload.app + ' v' + payload.version);
  ok('stores esperados completos', EXPECTED.every(function (k) { return Array.isArray(d[k]); }), Object.keys(d).join(', '));
  ok('sin stores desconocidos', Object.keys(d).every(function (k) { return EXPECTED.indexOf(k) !== -1; }), '');
  const counts = {};
  EXPECTED.forEach(function (k) { counts[k] = (d[k] || []).length; });

  const adapter = dbMemory.create();
  const store = storeMod.create(adapter);
  await adapter.open();

  // Dry-run
  const dry = await exportImport.importAll(store, payload, { mode: 'merge', dryRun: true });
  ok('dry-run sin errores', (dry.errors || []).length === 0, JSON.stringify({ created: dry.created, updated: dry.updated, errors: (dry.errors || []).length }));
  ok('dry-run no muta', (await adapter.count('pipelineSystems')) === 0, 'systems tras dry=' + (await adapter.count('pipelineSystems')));

  // Import real
  const res = await exportImport.importAll(store, payload, { mode: 'merge', dryRun: false });
  ok('import merge sin errores', (res.errors || []).length === 0, JSON.stringify((res.errors || []).slice(0, 3)));
  for (const k of EXPECTED) {
    const n = await adapter.count(k);
    ok('store ' + k, n === counts[k], n + '/' + counts[k]);
  }

  // Datos
  const systems = await store.pipelineSystems.list();
  const assets = await store.lineAssets.list();
  const insp = await store.lineInspections.list();
  const points = await store.monitoringPoints.list();
  const readings = await store.readings.list();
  const psvs = await store.psvs.list();
  const apm = await store.apmAssets.list();
  const events = await store.apmEvents.list();
  const sysIds = new Set(systems.map(function (s) { return s.id; }));
  const assetIds = new Set(assets.map(function (a) { return a.id; }));
  const pointIds = new Set(points.map(function (p) { return p.id; }));
  const apmIds = new Set(apm.map(function (a) { return a.id; }));

  ok('ref: assets→systemId', assets.every(function (a) { return sysIds.has(a.systemId); }), assets.filter(function (a) { return !sysIds.has(a.systemId); }).map(function (a) { return a.id; }).join(',') || 'ok');
  ok('ref: insp→system+asset', insp.every(function (i) { return (!i.systemId || sysIds.has(i.systemId)) && (!i.lineAssetId || assetIds.has(i.lineAssetId)); }), '');
  ok('ref: points→systemId', points.every(function (p) { return !p.systemId || sysIds.has(p.systemId); }), '');
  ok('ref: readings→mpId', readings.every(function (r) { return pointIds.has(r.mpId); }), '');
  ok('ref: psvs→assetId', psvs.every(function (p) { return !p.assetId || assetIds.has(p.assetId); }), '');
  ok('ref: events→assetId', events.every(function (e) { return apmIds.has(e.assetId); }), '');

  ok('enum: asset type/side', assets.every(function (a) { return ASSET_TYPES.indexOf(a.type) !== -1 && SIDES.indexOf(a.side) !== -1; }), '');
  ok('enum: inspection type/severity', insp.every(function (i) { return INSP_TYPES.indexOf(i.type) !== -1 && SEVERITIES.indexOf(i.severity) !== -1; }), '');
  ok('enum: product', systems.every(function (s) { return PRODUCTS.indexOf(s.product) !== -1; }), '');
  ok('enum: sensor+material', points.every(function (p) { return SENSORS.indexOf(p.sensorType) !== -1 && !!materials.byId(p.material); }), '');
  ok('enum: valveType', psvs.every(function (p) { return VALVE_TYPES.indexOf(p.valveType) !== -1; }), '');
  ok('enum: apm cat/crit/rbi', apm.every(function (a) {
    const list = CATS[a.sector] || [];
    return list.indexOf(a.category) !== -1 && ['A', 'B', 'C'].indexOf(a.criticality) !== -1 && a.rbi && a.rbi.pof >= 1 && a.rbi.pof <= 5 && a.rbi.cof >= 1 && a.rbi.cof <= 5;
  }), '');
  ok('enum: event type', events.every(function (e) { return EVENT_TYPES.indexOf(e.type) !== -1; }), '');

  const range = new Map(systems.map(function (s) { return [s.id, [s.stationFromKm, s.stationToKm]]; }));
  ok('geom: stationKm en rango', assets.every(function (a) { const r = range.get(a.systemId); return r && a.stationKm >= r[0] && a.stationKm <= r[1]; }), '');
  ok('mapa: severidades variadas', (function () { const s = {}; insp.forEach(function (i) { s[i.severity] = 1; }); return Object.keys(s).length >= 3; })(), (function () { const s = {}; insp.forEach(function (i) { s[i.severity] = (s[i.severity] || 0) + 1; }); return JSON.stringify(s); })());

  let pass = 0, fail = 0;
  checks.forEach(function (c) {
    console.log((c.pass ? 'PASS' : 'FAIL') + '  ' + c.id + (c.detail ? '  — ' + c.detail : ''));
    if (c.pass) { pass++; } else { fail++; }
  });
  console.log('----------------------------------------------------------------');
  console.log('RESUMEN: ' + pass + ' PASS / ' + fail + ' FAIL');
  console.log('Registros por store: ' + JSON.stringify(counts));
  console.log('Sistemas: ' + systems.length + ' · Activos: ' + assets.length + ' · Inspecciones: ' + insp.length +
    ' · Puntos: ' + points.length + ' · Lecturas: ' + readings.length + ' · PSV: ' + psvs.length +
    ' · APM: ' + apm.length + ' · Eventos: ' + events.length + ' · Longitud total: ' +
    systems.reduce(function (a, s) { return a + (s.lengthKm || 0); }, 0) + ' km');
  process.exit(fail ? 1 : 0);
}

main().catch(function (e) { console.error('ERROR FATAL:', (e && e.message) || e); process.exit(2); });
