/* IntegrityWatch Field — PIN lock (TESTS §13) */
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const storeApi = require('../src/core/store.js');
const dbMemory = require('../src/core/dbMemory.js');
const lock = require('../src/security/lock.js');

function freshStore() {
  return storeApi.create(dbMemory.create());
}

test('lock enable -> verify ok with persisted role', async () => {
  const s = freshStore();
  const res = await lock.enable({ pin: '1234', role: 'admin' }, s.meta);
  assert.equal(res.ok, true);
  assert.equal(await lock.isEnabled(s.meta), true);

  const v = await lock.verify('1234', s.meta);
  assert.equal(v.ok, true);
  assert.equal(v.role, 'admin');
  assert.equal(await s.meta.get('lock.role'), 'admin');
  assert.equal(lock.currentRole(), 'admin');

  const verifier = await s.meta.get('lock.verifier');
  assert.ok(verifier.saltB64);
  assert.ok(verifier.hashB64);
  assert.equal(verifier.iterations, 210000);
});

test('lock 5 wrong pins -> lockoutSec > 0 and correct pin blocked while locked', async () => {
  const s = freshStore();
  await lock.enable({ pin: '1234', role: 'operator' }, s.meta);

  let last;
  for (let i = 0; i < 5; i++) {
    last = await lock.verify('0000', s.meta);
  }
  assert.equal(last.ok, false);
  assert.ok(last.lockoutSec > 0);

  const blocked = await lock.verify('1234', s.meta);
  assert.equal(blocked.ok, false);
  assert.ok(blocked.lockoutSec > 0);
  assert.ok(await s.meta.get('lock.lockedUntilISO'));
});

test('lock changePin then verify with new pin', async () => {
  const s = freshStore();
  await lock.enable({ pin: '1234', role: 'admin' }, s.meta);
  const r = await lock.changePin('1234', '5678', s.meta);
  assert.equal(r.ok, true);

  const oldFail = await lock.verify('1234', s.meta);
  assert.equal(oldFail.ok, false);
  const newOk = await lock.verify('5678', s.meta);
  assert.equal(newOk.ok, true);
  assert.equal(newOk.role, 'admin');
});

test('lock disable requires correct pin and clears enabled flag', async () => {
  const s = freshStore();
  await lock.enable({ pin: '1234', role: 'admin' }, s.meta);
  const wrong = await lock.disable('9999', s.meta);
  assert.equal(wrong.ok, false);
  assert.equal(await lock.isEnabled(s.meta), true);

  const ok = await lock.disable('1234', s.meta);
  assert.equal(ok.ok, true);
  assert.equal(await lock.isEnabled(s.meta), false);
  assert.equal(lock.currentRole(), null);
});

test('lock verify when disabled returns ok:false', async () => {
  const s = freshStore();
  assert.equal(await lock.isEnabled(s.meta), false);
  const v = await lock.verify('1234', s.meta);
  assert.equal(v.ok, false);
});
