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

/* ── Multi-pestaña (bug real navegador 2026-11-03) ─────────────────────
   La cola FIFO de record() es POR PÁGINA: dos pestañas que leen
   'audit.head' concurrentemente calculaban el mismo seq y un aud-N pisaba
   al otro → verifyChain 'CADENA ROTA'. Fix: sección crítica envuelta en
   navigator.locks('iwf-audit-head', exclusive) + reparación defensiva del
   head contra los docs (repairHead: adopta el hash del doc del head y
   avanza hasta el máximo seq existente) + read-check antes de persistir.
   Se simulan DOS PESTAÑAS como dos closures del módulo (require fresh con
   delete require.cache) compartiendo el MISMO par de repos — análogo al
   IndexedDB compartido entre pestañas. */

function freshAuditlogModule() {
  const p = require.resolve('../src/security/auditlog.js');
  delete require.cache[p];
  return require(p);
}

// El getter global de navigator (Node >= 21) no tiene setter → redefinir la
// propiedad y restaurar el descriptor original al terminar (también el
// registro UMD globalThis.IW.security.auditlog que el require fresh pisa).
function withNavigatorOverride(mock, fn) {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  const iwSecurity = (globalThis.IW && globalThis.IW.security) ? globalThis.IW.security : null;
  const iwAuditBefore = iwSecurity ? iwSecurity.auditlog : undefined;
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true, enumerable: true, writable: true, value: mock
  });
  return Promise.resolve().then(fn).finally(() => {
    if (original) {
      Object.defineProperty(globalThis, 'navigator', original);
    } else {
      delete globalThis.navigator;
    }
    if (!iwSecurity) { return; }
    if (iwAuditBefore !== undefined) { iwSecurity.auditlog = iwAuditBefore; }
    else { delete iwSecurity.auditlog; }
  });
}

// Cola simple FIFO que serializa callbacks: imita Web Locks exclusive entre
// dos "pestañas" del mismo proceso.
function makeLockQueue() {
  const state = { tail: Promise.resolve(), name: null, calls: 0 };
  const locks = {
    request(name, opts, fn) {
      state.name = name;
      state.calls += 1;
      const result = state.tail.then(fn);
      state.tail = result.then(() => undefined, () => undefined);
      return result;
    }
  };
  return { locks, state };
}

function tabSetup(mod, d) {
  return mod.init({
    auditRepo: d.auditRepo,
    metaRepo: d.metaRepo,
    actorFn: () => ({ user: 'oper1', role: 'operator' })
  });
}

test('multi-pestaña SIN locks (navigator.locks null): 2×10 records concurrentes → cadena intacta (reparación #2)', async () => {
  const d = freshDeps();
  await withNavigatorOverride({ locks: null }, async () => {
    const modA = freshAuditlogModule();
    const modB = freshAuditlogModule();
    await tabSetup(modA, d);
    await tabSetup(modB, d);
    const [ra, rb] = await Promise.all([
      Promise.all(Array.from({ length: 10 }, (_, i) => modA.record({ action: 'update', store: 'rules', entityId: 'tabA' + i }))),
      Promise.all(Array.from({ length: 10 }, (_, i) => modB.record({ action: 'update', store: 'rules', entityId: 'tabB' + i })))
    ]);
    assert.equal(ra.length, 10);
    assert.equal(rb.length, 10);

    const docs = await d.auditRepo.list();
    const ids = new Set(docs.map((x) => x.id));
    assert.equal(ids.size, docs.length, 'sin ids duplicados en lo persistido');
    const seqs = docs.map((x) => x.seq).sort((a, b) => a - b);
    assert.deepEqual(seqs, Array.from({ length: seqs.length }, (_, i) => i + 1), 'seqs contiguos 1..M sin huecos');
    assert.ok(docs.length >= 10 && docs.length <= 20, 'persistidos entre 10 y 20 (sin locks puede haber pisadas)');

    const res = await modA.verifyChain();
    assert.equal(res.ok, true, 'breaks: ' + JSON.stringify(res.breaks));

    // La Reparación #2 al rescate: meta es caché, los docs mandan. Inyectar a
    // mano un head OBSOLETO (seq/hash de un doc viejo como si la otra pestaña
    // hubiera adelantado sin setear meta) → el siguiente record debe avanzar
    // hasta el máximo seq existente y encadenar desde su hash, sin pisar nada.
    const headNow = await d.metaRepo.get('audit.head');
    assert.ok(headNow.seq >= 2);
    const stale = await d.auditRepo.get('aud-' + String(headNow.seq - 1).padStart(6, '0'));
    await d.metaRepo.set('audit.head', { hash: stale.hash, seq: stale.seq, lastAt: stale.at });
    const e = await modA.record({ action: 'create', store: 'rules', entityId: 'post-stale' });
    assert.equal(e.seq, docs.length + 1, 'repara el head rezagado y escribe tras el último doc');
    assert.equal(e.prevHash, (await d.auditRepo.get('aud-' + String(docs.length).padStart(6, '0'))).hash);

    const postStale = await modA.verifyChain();
    assert.equal(postStale.ok, true);
    assert.equal(postStale.checked, docs.length + 1);
  });
});

test('multi-pestaña CON locks exclusivas: 2×10 records → seqs 1..20 exactos, sin duplicados, sin huecos', async () => {
  const d = freshDeps();
  const { locks, state } = makeLockQueue();
  await withNavigatorOverride({ locks }, async () => {
    const modA = freshAuditlogModule();
    const modB = freshAuditlogModule();
    await tabSetup(modA, d);
    await tabSetup(modB, d);
    const [ra, rb] = await Promise.all([
      Promise.all(Array.from({ length: 10 }, (_, i) => modA.record({ action: 'update', store: 'rules', entityId: 'tabA' + i }))),
      Promise.all(Array.from({ length: 10 }, (_, i) => modB.record({ action: 'update', store: 'rules', entityId: 'tabB' + i })))
    ]);
    const all = ra.concat(rb);
    const seqs = all.map((e) => e.seq).sort((a, b) => a - b);
    assert.deepEqual(seqs, Array.from({ length: 20 }, (_, i) => i + 1), 'seqs 1..20 exactos sin duplicados');
    assert.equal(new Set(all.map((e) => e.id)).size, 20);
    assert.equal(state.name, auditlog.EAL_LOCK_NAME, 'lock exclusivo global: iwf-audit-head');
    assert.equal(state.calls, 20, 'un request por record');

    const res = await modA.verifyChain();
    assert.equal(res.ok, true);
    assert.equal(res.checked, 20);
    const docs = await d.auditRepo.list();
    assert.equal(docs.length, 20);
  });
});

test('head rezagado SIN locks: repairHead avanza al máximo seq existente y el siguiente doc encaja', async () => {
  const d = freshDeps();
  await withNavigatorOverride({ locks: null }, async () => {
    const mod = freshAuditlogModule();
    await tabSetup(mod, d);
    const e1 = await mod.record({ action: 'create', store: 'psvs', entityId: 'v1' });
    const e2 = await mod.record({ action: 'update', store: 'psvs', entityId: 'v1' });
    const e3 = await mod.record({ action: 'delete', store: 'psvs', entityId: 'v1' });
    // otra pestaña dejó meta con el head viejo (seq 1) y se cayó antes de setear
    await d.metaRepo.set('audit.head', { hash: e1.hash, seq: 1, lastAt: e1.at });
    const e4 = await mod.record({ action: 'create', store: 'psvs', entityId: 'v2' });
    assert.equal(e4.seq, 4, 'avanzó sobre los docs existentes hasta 3');
    assert.equal(e4.prevHash, e3.hash, 'prevHash = hash del doc seq 3 (head reparado desde los docs)');
    const head = await d.metaRepo.get('audit.head');
    assert.equal(head.seq, 4);
    const res = await mod.verifyChain();
    assert.equal(res.ok, true);
    assert.equal(res.checked, 4);
  });
});

test('navigator.locks rechaza → el error propaga al llamador y NO rompe la cola FIFO', async () => {
  const d = freshDeps();
  const boom = new Error('boom-locks');
  await withNavigatorOverride({
    locks: { request: () => Promise.reject(boom) }
  }, async () => {
    await init(d);
    await assert.rejects(() => auditlog.record({ action: 'read', store: 'psvs' }),
      (err) => err === boom);
    // cola intacta: record OK sin locks
    await withNavigatorOverride({ locks: null }, async () => {
      const e = await auditlog.record({ action: 'read', store: 'psvs' });
      assert.equal(e.seq, 1);
    });
  });
});
