/* IntegrityWatch Field — persistent PIN session (TESTS §13) */
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const storeApi = require('../src/core/store.js');
const dbMemory = require('../src/core/dbMemory.js');
const lock = require('../src/security/lock.js');

const LOCK_PATH = path.resolve(__dirname, '../src/security/lock.js');

function freshStore() {
  return storeApi.create(dbMemory.create());
}

function freshLock() {
  const resolved = require.resolve(LOCK_PATH);
  delete require.cache[resolved];
  const mod = require(resolved);
  mod.__setCrypto(globalThis.crypto);
  return mod;
}

test('enable() persists lock.session with role and future expiresISO', async () => {
  const s = freshStore();
  const res = await lock.enable({ pin: '123456', role: 'admin' }, s.meta);
  assert.equal(res.ok, true);

  const session = await s.meta.get('lock.session');
  assert.ok(session);
  assert.equal(session.role, 'admin');
  assert.ok(session.startISO);
  assert.ok(session.lastActivityISO);
  assert.ok(session.expiresISO);
  assert.ok(Date.parse(session.expiresISO) > Date.now());
});

test('role(meta) returns the role for a fresh session', async () => {
  const s = freshStore();
  await lock.enable({ pin: '123456', role: 'admin' }, s.meta);
  assert.equal(await lock.role(s.meta), 'admin');
});

test('role(meta) returns null after the session expires', async () => {
  const s = freshStore();
  await lock.enable({ pin: '123456', role: 'admin' }, s.meta);
  const session = await s.meta.get('lock.session');
  await s.meta.set('lock.session', {
    role: session.role,
    startISO: session.startISO,
    lastActivityISO: session.lastActivityISO,
    expiresISO: new Date(Date.now() - 1000).toISOString()
  });
  assert.equal(await lock.role(s.meta), null);
});

test('touch(meta) extends expiresISO', async () => {
  const s = freshStore();
  await lock.enable({ pin: '123456', role: 'admin' }, s.meta);
  const before = await s.meta.get('lock.session');
  const beforeExp = Date.parse(before.expiresISO);

  await new Promise(function (r) { setTimeout(r, 20); });

  const res = await lock.touch(s.meta);
  assert.equal(res.ok, true);
  assert.ok(res.expiresISO);
  const after = await s.meta.get('lock.session');
  assert.ok(Date.parse(after.expiresISO) > beforeExp);
  assert.ok(Date.parse(after.expiresISO) > Date.now());
});

test('touch(meta) returns ok:false without a valid session', async () => {
  const s = freshStore();
  const res = await lock.touch(s.meta);
  assert.equal(res.ok, false);
});

test('verify rehydrates the persisted fails counter across a fresh module instance', async () => {
  const s = freshStore();
  await lock.enable({ pin: '123456', role: 'operator' }, s.meta);

  for (let i = 0; i < 4; i++) {
    await lock.verify('000000', s.meta);
  }
  assert.equal(await s.meta.get('lock.fails'), 4);

  const lock2 = freshLock();
  const res = await lock2.verify('000000', s.meta);
  assert.equal(res.ok, false);
  assert.ok(res.lockoutSec > 0);
  assert.ok(await s.meta.get('lock.lockedUntilISO'));
});
