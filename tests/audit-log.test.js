/* IntegrityWatch Field — security.auditlog (TESTS P4-B)
   Cadena de hash de bitácora: encadenado, verificación, canonicidad,
   exportación tabular, cola FIFO bajo concurrencia e import-batches.
   Trabaja SOLO contra repos inyectados (auditRepo envuelto sobre dbMemory +
   metaRepo de store.create): NO depende de db.js ni de IndexedDB. */
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const storeApi = require('../src/core/store.js');
const dbMemory = require('../src/core/dbMemory.js');
const auditlog = require('../src/security/auditlog.js');

function freshDeps(opts) {
  opts = opts || {};
  const adapter = dbMemory.create();
  const s = storeApi.create(adapter);
  const auditRepo = {
    list: () => adapter.getAll('auditLog'),
    get: (id) => adapter.get('auditLog', id),
    save: (rec) => adapter.put('auditLog', rec),
    remove: (id) => adapter.remove('auditLog', id)
  };
  return { s, adapter, auditRepo, metaRepo: s.meta, opts };
}

function init(d, actorFn) {
  return auditlog.init({
    auditRepo: d.auditRepo,
    metaRepo: d.metaRepo,
    actorFn: actorFn === undefined ? () => ({ user: 'oper1', role: 'operator' }) : actorFn
  });
}

test('secuencia: 3 records encadenan hashes, head.seq=3, ids aud-000001..003', async () => {
  const d = freshDeps();
  await init(d);
  const e1 = await auditlog.record({ action: 'create', store: 'psvs', entityId: 'v1' });
  const e2 = await auditlog.record({ action: 'update', store: 'psvs', entityId: 'v1', before: { status: 'ok' }, after: { status: 'due' } });
  const e3 = await auditlog.record({ action: 'delete', store: 'psvs', entityId: 'v1' });

  assert.equal(e1.id, 'aud-000001');
  assert.equal(e2.id, 'aud-000002');
  assert.equal(e3.id, 'aud-000003');
  assert.equal(e1.seq, 1);
  assert.equal(e2.seq, 2);
  assert.equal(e3.seq, 3);

  assert.equal(e1.prevHash, 'GENESIS');
  assert.equal(e2.prevHash, e1.hash);
  assert.equal(e3.prevHash, e2.hash);
  assert.match(e1.hash, /^[0-9a-f]{64}$/);

  const head = await d.metaRepo.get('audit.head');
  assert.equal(head.seq, 3);
  assert.equal(head.hash, e3.hash);
  assert.ok(head.lastAt);

  const res = await auditlog.verifyChain();
  assert.equal(res.ok, true);
  assert.equal(res.checked, 3);
  assert.deepEqual(res.breaks, []);
});

test('record con actor null → user "?" y role "?" sin crash', async () => {
  const d = freshDeps();
  await init(d, () => null);
  const e = await auditlog.record({ action: 'read', store: 'readings' });
  assert.equal(e.user, '?');
  assert.equal(e.role, '?');
  assert.equal(e.action, 'read');
});

test('actorFn devuelve {user,role} al momento de escribir', async () => {
  const d = freshDeps();
  let actor = { user: 'ing1', role: 'engineer' };
  await init(d, () => actor);
  const e = await auditlog.record({ action: 'create', store: 'apmAssets', entityId: 'a1' });
  assert.equal(e.user, 'ing1');
  assert.equal(e.role, 'engineer');
  actor = null;
  const e2 = await auditlog.record({ action: 'read', store: 'apmAssets' });
  assert.equal(e2.user, '?');
});

test('verifyChain: mutación hostil de after → kind "hash"; borrado del último → "missing"', async () => {
  const d = freshDeps();
  await init(d);
  await auditlog.record({ action: 'create', store: 'psvs', entityId: 'v1' });
  const e2 = await auditlog.record({ action: 'update', store: 'psvs', entityId: 'v1', after: { status: 'due' } });
  await auditlog.record({ action: 'delete', store: 'psvs', entityId: 'v1' });

  const ok0 = await auditlog.verifyChain();
  assert.equal(ok0.ok, true);

  // Sobrescribir entry 2 directamente por el repo (sin recalcular hash).
  const stored2 = await d.auditRepo.get('aud-000002');
  assert.equal(stored2.hash, e2.hash);
  await d.auditRepo.save({ ...stored2, after: { status: 'overdue' } });

  const tampered = await auditlog.verifyChain();
  assert.equal(tampered.ok, false);
  assert.equal(tampered.breaks.length, 1);
  assert.equal(tampered.breaks[0].id, 'aud-000002');
  assert.equal(tampered.breaks[0].kind, 'hash');
  assert.notEqual(tampered.breaks[0].expected, tampered.breaks[0].actual);
  // actual = hash declarado en el doc (el original); expected = recompute del payload mutado.
  assert.equal(tampered.breaks[0].actual, e2.hash);

  // Borrar la última entrada: implementation reporta kind 'missing' para el
  // seq en 1..head.seq sin documento (documentado en la cabecera del módulo).
  await d.auditRepo.remove('aud-000003');
  const deleted = await auditlog.verifyChain();
  assert.equal(deleted.ok, false);
  const miss = deleted.breaks.find((b) => b.kind === 'missing');
  assert.ok(miss, 'debe reportar la entrada 3 como missing');
  assert.equal(miss.id, 'aud-000003');
});

test('determinismo canónico: mismo objeto con claves en otro orden → MISMO hash', async () => {
  const docA = {
    seq: 1, prevHash: 'GENESIS', action: 'create', store: 'psvs', entityStore: 'psvs',
    entityId: 'v1', at: '2026-11-03T00:00:00.000Z', user: 'u', role: 'r',
    before: { b: 2, a: 1 }, after: { z: [3, { q: 1, p: 2 }] }
  };
  const docB = {
    role: 'r', user: 'u', at: '2026-11-03T00:00:00.000Z',
    after: { z: [3, { p: 2, q: 1 }] }, before: { a: 1, b: 2 },
    entityId: 'v1', entityStore: 'psvs', store: 'psvs', action: 'create',
    prevHash: 'GENESIS', seq: 1
  };
  const hA = await auditlog.sha256Hex(auditlog.hashPayload(docA));
  const hB = await auditlog.sha256Hex(auditlog.hashPayload(docB));
  assert.equal(hA, hB);

  // canonicalize recursivo con claves ordenadas + undefined omitido.
  assert.equal(
    JSON.stringify(auditlog.canonicalize({ b: 1, a: { d: 2, c: 3 }, e: undefined })),
    '{"a":{"c":3,"d":2},"b":1}'
  );
});

test('listRecent / range filtrado y tolerante', async () => {
  const d = freshDeps();
  await init(d);
  await auditlog.record({ action: 'create', store: 'psvs', entityId: 'v1', at: '2026-01-01T00:00:00.000Z' });
  await auditlog.record({ action: 'update', store: 'readings', entityId: 'r1', at: '2026-06-01T00:00:00.000Z', userIgnored: undefined });
  await auditlog.record({ action: 'create', store: 'psvs', entityId: 'v2', at: '2026-12-01T00:00:00.000Z' });

  const rec = await auditlog.listRecent(2);
  assert.deepEqual(rec.map((e) => e.seq), [3, 2]);

  const window = await auditlog.range({ fromISO: '2026-02-01T00:00:00.000Z', toISO: '2026-12-31T23:59:59.000Z' });
  assert.deepEqual(window.map((e) => e.seq), [3, 2]);

  const byAction = await auditlog.range({ action: 'create' });
  assert.deepEqual(byAction.map((e) => e.entityId), ['v2', 'v1']);

  const limited = await auditlog.range({ user: 'oper1', limit: 1 });
  assert.equal(limited.length, 1);
  assert.equal(limited[0].seq, 3);
});

test('exportTabular: 12 columnas exactas y celdas >2000 chars truncadas con marca', async () => {
  const d = freshDeps();
  await init(d);
  const big = 'x'.repeat(5000);
  const e1 = await auditlog.record({ action: 'import', store: 'readings', count: 200000, importId: 'imp-7' });
  await auditlog.record({ action: 'update', store: 'psvs', entityId: 'v1', before: { note: big }, after: { note: big } });

  const logs = await auditlog.listRecent();
  const t = auditlog.exportTabular(logs);
  assert.equal(t.sheetName, 'bitacora_entrada');
  assert.deepEqual(t.headers, ['FECHA_UTC', 'USUARIO', 'ROL', 'ACCION', 'ALMACEN', 'ENTIDAD',
    'ANTES', 'DESPUES', 'COUNT', 'IMPORT_ID', 'HASH', 'PREV_HASH']);
  assert.equal(t.headers.length, 12);
  assert.equal(t.rows.length, 2);
  assert.equal(t.rows.every((r) => r.length === 12), true);

  // fila del import: count e importId en sus columnas
  const importRow = t.rows.find((r) => r[3] === 'import');
  assert.equal(importRow[8], '200000');
  assert.equal(importRow[9], 'imp-7');
  assert.equal(importRow[10], e1.hash);

  // fila con before/after enormes: ANTES y DESPUES truncadas a 2000 con marca
  const bigRow = t.rows.find((r) => r[3] === 'update');
  for (const idx of [6, 7]) {
    assert.equal(bigRow[idx].length, 2000);
    assert.ok(bigRow[idx].endsWith('…trunc'), 'celda truncada debe terminar en …trunc');
  }
  // celdas cortas NO se truncaron
  assert.equal(bigRow[5], 'v1');
});

test('concurrencia: 20 records en Promise.all → seqs únicos 1..20 y cadena válida (cola FIFO)', async () => {
  const d = freshDeps();
  await init(d);
  const results = await Promise.all(
    Array.from({ length: 20 }, (_, i) => auditlog.record({ action: 'update', store: 'readings', entityId: 'r' + i }))
  );
  const seqs = results.map((e) => e.seq).sort((a, b) => a - b);
  assert.deepEqual(seqs, Array.from({ length: 20 }, (_, i) => i + 1));
  const ids = new Set(results.map((e) => e.id));
  assert.equal(ids.size, 20);
  assert.ok(ids.has('aud-000001') && ids.has('aud-000020'));

  const res = await auditlog.verifyChain();
  assert.equal(res.ok, true);
  assert.equal(res.checked, 20);
  const head = await d.metaRepo.get('audit.head');
  assert.equal(head.seq, 20);
});

test('import-batch pattern: UNA entrada con count:200000 y store readings → verifyChain ok', async () => {
  const d = freshDeps();
  await init(d);
  const e = await auditlog.record({
    action: 'import.commit', store: 'readings', count: 200000,
    importId: 'imp-2026-11-03-001', entityId: 'batch:200000'
  });
  assert.equal(e.count, 200000);
  const res = await auditlog.verifyChain();
  assert.equal(res.ok, true);
  assert.equal(res.checked, 1);
});

test('markExported escribe audit.lastExport; init valida deps; record valida entrada', async () => {
  const d = freshDeps();
  await init(d);
  const e = await auditlog.record({ action: 'read', store: 'psvs' });
  const stamped = await auditlog.markExported(e.hash);
  assert.equal(stamped.hash, e.hash);
  assert.ok(stamped.at);
  const last = await d.metaRepo.get('audit.lastExport');
  assert.equal(last.hash, e.hash);

  await assert.rejects(() => auditlog.markExported(''), (err) => err.code === auditlog.BAD_INPUT);
  await assert.rejects(() => auditlog.record({ action: '', store: 'psvs' }), (err) => err.code === auditlog.BAD_INPUT);
  await assert.rejects(() => auditlog.record({ action: 'x' }), (err) => err.code === auditlog.BAD_INPUT);

  const fresh = freshDeps();
  await assert.rejects(() => auditlog.init({ auditRepo: null, metaRepo: fresh.metaRepo }), (err) => err.code === auditlog.BAD_INPUT);
});

test('hash ignora metadatos del repo (createdAt/updatedAt) y cubre entityStore', async () => {
  const d = freshDeps();
  await init(d);
  const e = await auditlog.record({ action: 'create', store: 'coupons', entityId: 'c1' });
  assert.equal(e.entityStore, 'coupons');
  // Un repo que sella (patrón store.js) añade campos fuera de la lista blanca:
  // verifyChain NO debe romperse.
  const stored = await d.auditRepo.get('aud-000001');
  await d.auditRepo.save({ ...stored, createdAt: '2020-01-01T00:00:00.000Z', updatedAt: '2020-01-01T00:00:00.000Z' });
  const afterStamp = await auditlog.verifyChain();
  assert.equal(afterStamp.ok, true);
  // borrar entityStore del doc persistido SÍ rompe el hash (está en HASH_FIELDS)
  const resaved = await d.auditRepo.get('aud-000001');
  const { entityStore, ...withoutAlias } = resaved;
  await d.auditRepo.save(withoutAlias);
  const res = await auditlog.verifyChain();
  assert.equal(res.ok, false);
  assert.equal(res.breaks[0].id, 'aud-000001');
  assert.equal(res.breaks[0].kind, 'hash');
});
