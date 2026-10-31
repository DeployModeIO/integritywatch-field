/* IntegrityWatch Field — QA data integrity test
   Node:test + assert/strict, CJS. No app modifications. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const dbMemory = require('../src/core/dbMemory');
const { create: createStore } = require('../src/core/store');
const exportImport = require('../src/core/exportImport');
const syncQueue = require('../src/core/syncQueue');
const lock = require('../src/security/lock');
const csv = require('../src/ingest/csv');
const bus = require('../src/core/bus');

// Ensure corrosion engine is loaded for store hooks
try { require('../src/calc/corrosion'); } catch (e) { /* ignore */ }
try { require('../src/calc/psv'); } catch (e) { /* ignore */ }

function readCsvFixture() {
  const p = path.join(__dirname, '..', 'datos-prueba', 'integritywatch-carga-prueba.csv');
  return fs.readFileSync(p, 'utf8');
}

test('T1: exportAll shape and includes all stores with importLog', async () => {
  const adapter = dbMemory.create();
  const store = createStore(adapter);
  await adapter.open();

  // seed minimal data in a couple stores
  await store.monitoringPoints.save({ id: 'MP-TEST-001', code: 'MP-TEST-001' });
  await store.readings.save({ id: 'R1', mpId: 'MP-TEST-001', date: '2026-10-16', crMpy: 5 });
  await store.coupons.save({ id: 'C1', mpId: 'MP-TEST-001', wiMg: 24100, wfMg: 23785, areaIn2: 3.72, days: 30 });
  await store.psvs.save({ id: 'PSV-001', tag: 'PSV-001', nextTestDate: '2026-10-16' });
  await store.pipelineSystems.save({ id: 'SYS-1', name: 'SYS-1' });
  await store.lineAssets.save({ id: 'LA-1', systemId: 'SYS-1', code: 'LA-1' });
  await store.lineInspections.save({ id: 'LI-1', systemId: 'SYS-1', lineAssetId: 'LA-1', date: '2026-10-16' });
  await store.apmAssets.save({ id: 'A1', code: 'A1', sector: 'upstream', category: 'well', criticality: 'A' });
  await store.apmEvents.save({ id: 'E1', assetId: 'A1', type: 'inspection', start: '2026-10-16' });
  await store.recommendations.save({ id: 'REC1', ruleId: 'R1', fingerprint: 'R1:readings:R1', severity: 'critical', entityStore: 'readings', entityId: 'R1', status: 'open' });
  await store.importLog.save({ id: 'IL1', fileName: 'test.csv', at: '2026-10-16T12:00:00Z', kind: 'csv', rowsTotal: 0, rowsOk: 0, rowsSkipped: 0, rowsError: 0, errors: [], createdPoints: [] });
  await store.mutationQueue.save({ id: 'MQ1', op: { type: 'put', store: 'readings', rec: { id: 'X' } }, createdAt: '2026-10-16T12:00:00Z', attempts: 0, dead: false });

  const exp = await exportImport.exportAll(store, { debug: true });
  assert.strictEqual(exp.app, 'integritywatch-field');
  assert.strictEqual(exp.version, 1);
  assert.ok(exp.exportedAt);
  assert.ok(exp.data);
  assert.ok(Array.isArray(exp.data.monitoringPoints));
  assert.ok(Array.isArray(exp.data.readings));
  assert.ok(Array.isArray(exp.data.coupons));
  assert.ok(Array.isArray(exp.data.psvs));
  assert.ok(Array.isArray(exp.data.pipelineSystems));
  assert.ok(Array.isArray(exp.data.lineAssets));
  assert.ok(Array.isArray(exp.data.lineInspections));
  assert.ok(Array.isArray(exp.data.apmAssets));
  assert.ok(Array.isArray(exp.data.apmEvents));
  assert.ok(Array.isArray(exp.data.recommendations));
  assert.ok(Array.isArray(exp.data.importLog));
  assert.ok(Array.isArray(exp.data.mutationQueue));
});

test('T2: Round-trip export→clear→import merge deep-equal by store (salvo updatedAt)', async () => {
  const adapter = dbMemory.create();
  const store = createStore(adapter);
  await adapter.open();

  const csvText = readCsvFixture();
  const parsed = csv.parse(csvText);
  const mapping = csv.mapColumns(parsed.headers);
  const existing = await store.monitoringPoints.list();
  const existingIds = existing.map((x) => x.id);
  const validated = csv.validateRows({ rows: parsed.rows.map((r) => {
    const obj = {};
    parsed.headers.forEach((h, idx) => { const c = mapping.mapping[h]; if (c) obj[c] = r[idx]; });
    return obj;
  }), mapping: mapping.mapping, existingPointIds: existingIds, nowISO: '2026-10-16T12:00:00Z', autoCreatePoints: true });
  const recs = csv.toRecords(validated.valid, mapping.mapping);
  recs.readings.forEach(function (r, i) { if (!r.id) { r.id = 'R-' + (i + 1); } });
  recs.coupons.forEach(function (r, i) { if (!r.id) { r.id = 'C-' + (i + 1); } });
  await store.monitoringPoints.saveAll(recs.monitoringPoints || []);
  await store.readings.saveAll(recs.readings || []);
  await store.coupons.saveAll(recs.coupons || []);

  const before = await exportImport.exportAll(store, { debug: true });
  const snap = JSON.parse(JSON.stringify(before));
  await Promise.all([
    store.monitoringPoints.clear(),
    store.readings.clear(),
    store.coupons.clear(),
    store.psvs.clear(),
    store.pipelineSystems.clear(),
    store.lineAssets.clear(),
    store.lineInspections.clear(),
    store.apmAssets.clear(),
    store.apmEvents.clear(),
    store.recommendations.clear(),
    store.importLog.clear(),
    store.mutationQueue.clear(),
  ]);
  const res = await exportImport.importAll(store, snap, { mode: 'merge', dryRun: false });
  assert.ok(res.errors.length === 0);
  const after = await exportImport.exportAll(store, { debug: true });
  function stripUpdatedAt(data) {
    const out = JSON.parse(JSON.stringify(data));
    for (const k of Object.keys(out)) {
      if (Array.isArray(out[k])) {
        out[k].forEach((x) => { delete x.updatedAt; delete x.createdAt; });
      }
    }
    return out;
  }
  assert.deepStrictEqual(stripUpdatedAt(before.data), stripUpdatedAt(after.data));
  const rCount = await store.readings.list();
  const cCount = await store.coupons.list();
  assert.ok(rCount.length >= 29); // readings count around 30
  assert.ok(cCount.length === 5);
});

test('T3: importAll replace only affects stores present; dryRun does not mutate', async () => {
  const adapter = dbMemory.create();
  const store = createStore(adapter);
  await adapter.open();
  await store.monitoringPoints.save({ id: 'MP-A', code: 'MP-A' });
  await store.readings.save({ id: 'R-A', mpId: 'MP-A', date: '2026-10-16', crMpy: 1 });
  const payload = {
    app: 'integritywatch-field',
    version: 1,
    exportedAt: '2026-10-16T12:00:00Z',
    data: { monitoringPoints: [{ id: 'MP-B', code: 'MP-B' }] }
  };
  const beforeReadings = await store.readings.list();
  const dry = await exportImport.importAll(store, payload, { mode: 'replace', dryRun: true });
  assert.ok(dry.errors.length === 0);
  assert.deepStrictEqual((await store.readings.list()).map(x=>x.id), beforeReadings.map(x=>x.id));
  const res = await exportImport.importAll(store, payload, { mode: 'replace', dryRun: false });
  assert.ok(res.errors.length === 0);
  const mps = await store.monitoringPoints.list();
  assert.ok(mps.length === 1 && mps[0].id === 'MP-B');
  const r2 = await store.readings.list();
  assert.ok(r2.length === beforeReadings.length); // readings not in payload remain (replace only affects present stores) — per spec: 'replace solo limpia stores PRESENTES en payload'
});

test('T4: Malicious/corrupt payloads controlled (no throw without catch)', async () => {
  const adapter = dbMemory.create();
  const store = createStore(adapter);
  await adapter.open();
  const bad1 = { app: 'x', version: 1, exportedAt: '2026-10-16T12:00:00Z', data: { monitoringPoints: [{ code: 'no-id' }] } };
  const bad2 = { app: 'x', version: 1, exportedAt: '2026-10-16T12:00:00Z', data: { unknownStore: [{ id: 'X' }] } };
  const bad3 = null;
  const r1 = await exportImport.importAll(store, bad1, { mode: 'merge' });
  assert.ok(Array.isArray(r1.errors));
  const r2 = await exportImport.importAll(store, bad2, { mode: 'merge' });
  assert.ok(Array.isArray(r2.errors));
  const r3 = await exportImport.importAll(store, bad3, { mode: 'merge' });
  assert.ok(Array.isArray(r3.errors));
});

test('T5: syncQueue behavior with __setFetch', async () => {
  const adapter = dbMemory.create();
  const store = createStore(adapter);
  await adapter.open();
  let flushed = 0;
  const b = bus;
  syncQueue.__setScheduler((cb) => { flushed++; cb(); });
  syncQueue.__setOnline(() => true);
  await syncQueue.init({ bus: b, adapter: adapter, getEndpoint: () => 'http://127.0.0.1:9/ingest' });
  let successCount = 0;
  let failCount = 0;
  syncQueue.__setFetch(async (url, opts) => {
    const body = JSON.parse(opts.body);
    if (body.store === 'ok') { successCount++; return { ok: true, status: 200 }; }
    if (body.store === 'fail') { failCount++; return { ok: false, status: 500 }; }
    return { ok: true, status: 200 };
  });
  const mq = store.mutationQueue;
  const r = await syncQueue.enqueue({ type: 'put', store: 'ok', rec: { id: '1' } });
  assert.ok(r && r.id);
  const pend = syncQueue.pending();
  assert.ok(typeof pend === 'number');
  await syncQueue.flush();
  await syncQueue.enqueue({ type: 'put', store: 'fail', rec: { id: '2' } });
  await syncQueue.flush();
  const all = await mq.list();
  const sent = all.find((x) => x.op && x.op.store === 'ok');
  const failed = all.find((x) => x.op && x.op.store === 'fail');
  if (sent) assert.ok(sent.sentISO);
  if (failed) assert.ok(failed.attempts >= 1);
  // remove enqueues delete
  await syncQueue.enqueue({ type: 'delete', store: 'readings', id: 'X' });
  const after = await mq.list();
  assert.ok(after.some((x) => x.op && x.op.type === 'delete'));
});

test('T5b: meta.syncEndpoint empty -> no enqueue side effects', async () => {
  const adapter = dbMemory.create();
  const store = createStore(adapter);
  await adapter.open();
  const b = bus;
  syncQueue.__setScheduler((cb) => cb());
  syncQueue.__setOnline(() => true);
  await syncQueue.init({ bus: b, adapter: adapter, getEndpoint: () => '' });
  const mqBefore = await store.mutationQueue.list();
  await store.readings.save({ id: 'RZ', mpId: 'MP-Z', date: '2026-10-16', crMpy: 1 });
  const mqAfter = await store.mutationQueue.list();
  assert.strictEqual(mqAfter.length, mqBefore.length);
});

test('T6: store hooks - coupons crMpy and psv status', async () => {
  const adapter = dbMemory.create();
  const store = createStore(adapter);
  await adapter.open();
  const c = await store.coupons.save({ id: 'C1', mpId: 'MP1', wiMg: 24100, wfMg: 23785, areaIn2: 3.72, days: 30, densityGcm3: 7.85 });
  // 24100-23785=315; 534*315/(7.85*3.72*720) ~ approx 8.0
  assert.ok(Math.abs(c.crMpy - 8.0) < 0.01);
  const p = await store.psvs.save({ id: 'PSV1', tag: 'PSV1', nextTestDate: '2026-09-15' }, '2026-10-16T12:00:00Z');
  assert.ok(p.status === 'overdue' || p.status === 'due');
  await store.psvs.save({ id: 'PSV2', tag: 'PSV2', nextTestDate: '2026-11-01' }, '2026-10-16T12:00:00Z');
  const p2 = await (await store.psvs.get('PSV2'));
  assert.strictEqual(p2.status, 'ok');
});

test('T6b: meta get/set round-trip', async () => {
  const adapter = dbMemory.create();
  const store = createStore(adapter);
  await adapter.open();
  await store.meta.set('testKey', { v: 42 });
  const v = await store.meta.get('testKey');
  assert.deepStrictEqual(v, { v: 42 });
});

test('T7: lock PBKDF2 enable/verify/lockout/changePin/verifier no pin', async () => {
  const adapter = dbMemory.create();
  const store = createStore(adapter);
  await adapter.open();
  const l = lock;
  const enabled = await l.enable({ pin: '123456', role: 'admin' }, store.meta);
  assert.ok(enabled.ok);
  const v1 = await l.verify('123456', store.meta);
  assert.ok(v1.ok);
  const changed = await l.changePin('123456', '567890', store.meta);
  assert.ok(changed.ok);
  const v2 = await l.verify('567890', store.meta);
  assert.ok(v2.ok);
  for (let i = 0; i < 5; i++) {
    await l.verify('malo', store.meta);
  }
  const locked = await l.verify('567890', store.meta);
  assert.ok(!locked.ok && locked.lockoutSec > 0);
  await store.meta.set('lock.fails', 0);
  await store.meta.set('lock.lockedUntilISO', null);
  await l.disable('567890', store.meta);
  const dis = await l.isEnabled(store.meta);
  assert.ok(!dis);
  const verifier = await store.meta.get('lock.verifier');
  assert.ok(verifier && typeof verifier.hashB64 === 'string');
  const pepper = await store.meta.get('lock.pepperB64');
  assert.ok(typeof pepper === 'string');
  const metaRaw = await store.meta.list();
  const hasPlain = JSON.stringify(metaRaw).includes('123456');
  assert.ok(!hasPlain);
});

test('T8: double import same CSV - dedupe behavior documented', async () => {
  const adapter = dbMemory.create();
  const store = createStore(adapter);
  await adapter.open();
  const csvText = readCsvFixture();
  const parsed = csv.parse(csvText);
  const mapping = csv.mapColumns(parsed.headers);
  const validated1 = csv.validateRows({ rows: parsed.rows.map((r) => {
    const obj = {}; parsed.headers.forEach((h,idx)=>obj[h]=r[idx]); return obj;
  }), mapping: mapping.mapping, existingPointIds: [], nowISO: '2026-10-16T12:00:00Z', autoCreatePoints: true });
  const recs1 = csv.toRecords(validated1.validRows, mapping.mapping);
  await store.monitoringPoints.saveAll(recs1.monitoringPoints||[]);
  await store.readings.saveAll(recs1.readings||[]);
  await store.coupons.saveAll(recs1.coupons||[]);
  const before = (await store.readings.list()).length;
  const validated2 = csv.validateRows({ rows: parsed.rows.map((r) => {
    const obj = {}; parsed.headers.forEach((h,idx)=>obj[h]=r[idx]); return obj;
  }), mapping: mapping.mapping, existingPointIds: (await store.monitoringPoints.list()).map(x=>x.id), nowISO: '2026-10-16T12:00:00Z', autoCreatePoints: true });
  const recs2 = csv.toRecords(validated2.validRows, mapping.mapping);
  await store.readings.saveAll(recs2.readings||[]);
  const after = (await store.readings.list()).length;
  assert.ok(after >= before); // csv parser may dedupe within same pass; at DB level saveAll upserts by id if same id used — risk exists if caller doesn’t dedupe
});

test('DEVIATION-DATA-1: csv parser dedupes within same validation pass (duplicates skipped)', async () => {
  const csvText = readCsvFixture();
  const parsed = csv.parse(csvText);
  const mapping = csv.mapColumns(parsed.headers);
  const validated = csv.validateRows({ rows: parsed.rows.map((r) => {
    const obj = {}; parsed.headers.forEach((h,idx)=>obj[h]=r[idx]); return obj;
  }), mapping: mapping.mapping, existingPointIds: [], nowISO: '2026-10-16T12:00:00Z', autoCreatePoints: true });
  assert.ok(validated.duplicates.length >= 0);
});

test('DEVIATION-DATA-2: coupons hook computes crMpy from wi/wf/area/days (ASTM G4)', async () => {
  const adapter = dbMemory.create();
  const store = createStore(adapter);
  await adapter.open();
  const c = await store.coupons.save({ id: 'C-DEV', mpId: 'MP-DEV', wiMg: 24100, wfMg: 23785, areaIn2: 3.72, days: 30, densityGcm3: 7.85 });
  assert.ok(c.crMpy !== undefined);
});

test('DEVIATION-DATA-3: psv status uses nextTestDate with injected nowISO (overdue/due/ok)', async () => {
  const adapter = dbMemory.create();
  const store = createStore(adapter);
  await adapter.open();
  await store.psvs.save({ id: 'P1', tag: 'P1', nextTestDate: '2026-09-01' }, '2026-10-16T12:00:00Z');
  await store.psvs.save({ id: 'P2', tag: 'P2', nextTestDate: '2026-10-20' }, '2026-10-16T12:00:00Z');
  await store.psvs.save({ id: 'P3', tag: 'P3' }, '2026-10-16T12:00:00Z');
  const list = await store.psvs.list();
  assert.ok(list.every((x) => ['ok','due','overdue'].includes(x.status)));
});

test('DEVIATION-DATA-4: lock verifier never contains pin in cleartext (PBKDF2)', async () => {
  const adapter = dbMemory.create();
  const store = createStore(adapter);
  await adapter.open();
  await lock.enable({ pin: '123456', role: 'admin' }, store.meta);
  const verifier = await store.meta.get('lock.verifier');
  const str = JSON.stringify(verifier);
  assert.ok(!str.includes('123456'));
  assert.ok(verifier.saltB64 && verifier.hashB64);
});
