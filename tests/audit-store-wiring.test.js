/* IntegrityWatch Field — enganche store ⇄ security.auditlog (TESTS P4-C)
   Verifica que los repos de IW.core.store auditan sus writes (create/update/
   delete/bulk) a través de la cadena de hash, que el store 'auditLog' NO se
   auto-audita (guard anti-recursión), que los dataURL se redactan y que todo
   es best-effort (un actor null o fallos de auditlog no rompen el negocio).
   Trabaja con dbMemory + store.create + initAudit (el mismo wiring de main.js). */
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const storeApi = require('../src/core/store.js');
const dbMemory = require('../src/core/dbMemory.js');
const auditlog = require('../src/security/auditlog.js');

async function wired(actorFn) {
  const s = storeApi.create(dbMemory.create());
  await s.initAudit({ actorFn: actorFn || (() => ({ user: 'oper1', role: 'operator' })) });
  return s;
}

// Entradas de la bitácora por seq ascendente (a través del repo enganchado).
async function entries() {
  const all = await auditlog.listRecent();
  return all.sort((a, b) => a.seq - b.seq);
}

test('store.create expone auditLog (sin sync) e initAudit', () => {
  const s = storeApi.create(dbMemory.create());
  assert.equal(typeof s.auditLog.save, 'function');
  assert.equal(typeof s.auditLog.list, 'function');
  assert.equal(typeof s.initAudit, 'function');
});

test('save() nuevo → entrada "create" con before null y after sellado', async () => {
  const s = await wired();
  await s.readings.save({ id: 'r1', mpId: 'mp1', crMpy: 3.2 });
  const list = await entries();
  assert.equal(list.length, 1);
  const e = list[0];
  assert.equal(e.action, 'create');
  assert.equal(e.store, 'readings');
  assert.equal(e.entityId, 'r1');
  assert.equal(e.before, null);
  assert.equal(e.after.id, 'r1');
  assert.equal(e.after.crMpy, 3.2);
  assert.ok(e.after.createdAt && e.after.updatedAt);
  assert.equal(e.user, 'oper1');
  assert.equal(e.role, 'operator');
});

test('save() repetido sobre mismo id → entrada "update" con before/after', async () => {
  const s = await wired();
  await s.readings.save({ id: 'r1', mpId: 'mp1', crMpy: 3.2 });
  await s.readings.save({ id: 'r1', mpId: 'mp1', crMpy: 4.5 });
  const list = await entries();
  assert.equal(list.length, 2);
  assert.deepEqual(list.map((e) => e.action), ['create', 'update']);
  const upd = list[1];
  assert.equal(upd.store, 'readings');
  assert.equal(upd.entityId, 'r1');
  assert.equal(upd.before.crMpy, 3.2);
  assert.equal(upd.after.crMpy, 4.5);
});

test('remove() → entrada "delete" con before; remove inexistente NO audita', async () => {
  const s = await wired();
  await s.readings.save({ id: 'r1', mpId: 'mp1' });
  await s.readings.remove('r1');
  await s.readings.remove('no-existe');
  const list = await entries();
  const dels = list.filter((e) => e.action === 'delete');
  assert.equal(dels.length, 1);
  assert.equal(dels[0].entityId, 'r1');
  assert.equal(dels[0].before.id, 'r1');
  assert.equal(dels[0].after, undefined);
});

test('saveAll(30) → UNA entrada "bulk-write" count 30; clear() → "bulk-clear" count 0', async () => {
  const s = await wired();
  await s.readings.saveAll(Array.from({ length: 30 }, (_, i) => ({ id: 'r' + i, mpId: 'mp1' })));
  await s.readings.clear();
  const list = await entries();
  assert.equal(list.length, 2);
  assert.equal(list[0].action, 'bulk-write');
  assert.equal(list[0].store, 'readings');
  assert.equal(list[0].count, 30);
  assert.equal(list[0].before, undefined);
  assert.equal(list[0].after, undefined);
  assert.equal(list[1].action, 'bulk-clear');
  assert.equal(list[1].count, 0);
});

test('repos delegados (coupons/psvs) auditan bajo su storeName', async () => {
  const s = await wired();
  await s.psvs.save({ id: 'v1', tag: 'PSV-1', nextTestDate: '2026-09-01' });
  await s.coupons.save({ id: 'c1', mpId: 'mp1', wiMg: 100, wfMg: 98, densityGcm3: 7.87, areaIn2: 2, days: 30 });
  const list = await entries();
  assert.deepEqual(list.map((e) => e.store), ['psvs', 'coupons']);
  assert.deepEqual(list.map((e) => e.action), ['create', 'create']);
});

test('guard anti-recursión: guardar directo en auditLog NO genera entradas nuevas', async () => {
  const s = await wired();
  await s.readings.save({ id: 'r1' });
  const headBefore = await s.meta.get('audit.head');
  await s.auditLog.save({ id: 'aud-manual', action: 'x', store: 'auditLog' });
  const headAfter = await s.meta.get('audit.head');
  assert.equal(headAfter.seq, headBefore.seq, 'el head no avanza al escribir en auditLog');
  const raw = await s.auditLog.list();
  assert.equal(raw.length, 2, 'solo la entrada real de negocio + la manual');
  assert.ok(!raw.some((d) => d.id === 'aud-000002'), 'no se auto-auditó la escritura en auditLog');
});

test('redacción: dataURL de photos/signature → "[dataURL N bytes]" en before/after', async () => {
  const s = await wired();
  const big = 'data:image/jpeg;base64,' + 'A'.repeat(200);
  await s.lineInspections.save({ id: 'i1', photos: [{ file: 'f.jpg', dataUrl: big }], signature: big });
  await s.lineInspections.save({ id: 'i1', photos: [{ file: 'f.jpg', dataUrl: big }], signature: big, note: 'v2' });
  const list = await entries();
  const upd = list.find((e) => e.action === 'update');
  const expect = '[dataURL ' + big.length + ' bytes]';
  assert.equal(list[0].after.photos[0].dataUrl, expect);
  assert.equal(list[0].after.photos[0].file, 'f.jpg');
  assert.equal(list[0].after.signature, expect);
  assert.equal(upd.before.photos[0].dataUrl, expect);
});

test('actorFn async (patrón main.js con lock.currentSession) → user/role reales', async () => {
  const s = await wired(async () => ({ user: 'ing1', role: 'engineer' }));
  await s.readings.save({ id: 'r1' });
  const list = await entries();
  assert.equal(list[0].user, 'ing1');
  assert.equal(list[0].role, 'engineer');
});

test('actor null → entradas con user "?" sin romper el write de negocio', async () => {
  const s = await wired(() => null);
  const c = await s.readings.save({ id: 'r1' });
  assert.equal(c.id, 'r1');
  const list = await entries();
  assert.equal(list[0].user, '?');
  assert.equal(list[0].role, '?');
});

test('verifyChain ok tras create+update+delete+bulk-write (4 encadenadas)', async () => {
  const s = await wired();
  await s.readings.save({ id: 'r1', crMpy: 1 });
  await s.readings.save({ id: 'r1', crMpy: 2 });
  await s.readings.remove('r1');
  await s.readings.saveAll([{ id: 'r2' }, { id: 'r3' }]);
  const res = await auditlog.verifyChain();
  assert.equal(res.ok, true);
  assert.equal(res.checked, 4);
  assert.deepEqual(res.breaks, []);
  const head = await s.meta.get('audit.head');
  assert.equal(head.seq, 4);
  assert.equal(head.hash, (await entries())[3].hash);
});
