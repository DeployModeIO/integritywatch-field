/* IntegrityWatch Field — multi-user credentials (TESTS)
   Named users, admin management, session switching, migration. */
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const storeApi = require('../src/core/store.js');
const dbMemory = require('../src/core/dbMemory.js');
const lock = require('../src/security/lock.js');
const permissions = require('../src/security/permissions.js');
const users = require('../src/security/users.js');

lock.__setCrypto(globalThis.crypto);
users.__setCrypto(globalThis.crypto);

function freshStore() {
  return storeApi.create(dbMemory.create());
}

function byName(list, name) {
  return list.find(function (u) { return u.username === name; });
}

test('init() migrates legacy lock.enabled+verifier into an admin whose PIN still verifies (idempotent)', async () => {
  const s = freshStore();
  await lock.enable({ pin: '123456', role: 'admin' }, s.meta);
  await s.meta.set('users', undefined); // undo enable()'s bootstrap migration to exercise init() directly

  const initRes = await users.init(s.meta);
  assert.equal(initRes.ok, true);
  assert.equal(initRes.migrated, true);

  const list = await users.listUsers(s.meta);
  assert.equal(list.length, 1);
  assert.equal(list[0].username, 'admin');
  assert.equal(list[0].role, 'admin');
  assert.equal(list[0].active, true);

  const v = await users.verifyUser(s.meta, 'admin', '123456');
  assert.equal(v.ok, true);
  assert.equal(v.username, 'admin');
  assert.equal(v.role, 'admin');
  assert.equal(await s.meta.get('users.legacyMigrated'), true);

  const again = await users.init(s.meta);
  assert.equal(again.migrated, false);
  assert.equal((await users.listUsers(s.meta)).length, 1);
});

test('init() leaves users empty when lock is disabled', async () => {
  const s = freshStore();
  const initRes = await users.init(s.meta);
  assert.equal(initRes.ok, true);
  assert.equal(initRes.migrated, false);
  assert.deepEqual(await users.listUsers(s.meta), []);
});

test('createUser happy path, duplicate, bad username, weak passphrase, bad role', async () => {
  const s = freshStore();
  await users.init(s.meta);

  const ok = await users.createUser(s.meta, { username: '  alice  ', passphrase: 'secret1', role: 'operator' }, 'admin');
  assert.equal(ok.ok, true);
  assert.equal(ok.username, 'alice');

  const dup = await users.createUser(s.meta, { username: 'ALICE', passphrase: 'secret2', role: 'engineer' }, 'admin');
  assert.equal(dup.ok, false);
  assert.equal(dup.error, 'E_USER_EXISTS');

  const shortName = await users.createUser(s.meta, { username: 'ab', passphrase: 'secret1', role: 'operator' }, 'admin');
  assert.equal(shortName.error, 'E_BAD_USERNAME');

  const badChars = await users.createUser(s.meta, { username: 'bad user!', passphrase: 'secret1', role: 'operator' }, 'admin');
  assert.equal(badChars.error, 'E_BAD_USERNAME');

  const weak = await users.createUser(s.meta, { username: 'bob', passphrase: '12345', role: 'operator' }, 'admin');
  assert.equal(weak.error, 'E_WEAK_PASSPHRASE');

  const badRole = await users.createUser(s.meta, { username: 'carol', passphrase: 'secret1', role: 'boss' }, 'admin');
  assert.equal(badRole.error, 'E_BAD_ROLE');
});

test('listUsers exposes NO hash material', async () => {
  const s = freshStore();
  await users.init(s.meta);
  await users.createUser(s.meta, { username: 'alice', passphrase: 'secret1', role: 'operator' }, 'local');

  const list = await users.listUsers(s.meta);
  assert.equal(list.length, 1);
  const u = list[0];
  assert.equal(u.username, 'alice');
  assert.equal(u.role, 'operator');
  assert.equal(u.active, true);
  assert.ok(typeof u.createdAt === 'string');
  assert.equal(u.createdBy, 'local');
  assert.equal(u.saltB64, undefined);
  assert.equal(u.hashB64, undefined);
  assert.equal(u.iterations, undefined);
});

test('verifyUser ok, wrong passphrase generic, unknown user generic (no enumeration)', async () => {
  const s = freshStore();
  await users.init(s.meta);
  await users.createUser(s.meta, { username: 'alice', passphrase: 'secret1', role: 'operator' }, 'local');

  const ok = await users.verifyUser(s.meta, 'alice', 'secret1');
  assert.equal(ok.ok, true);
  assert.equal(ok.username, 'alice');
  assert.equal(ok.role, 'operator');

  const wrong = await users.verifyUser(s.meta, 'alice', 'wrongpass');
  assert.equal(wrong.ok, false);
  assert.equal(wrong.username, undefined);
  assert.equal(wrong.error, undefined);

  const unknown = await users.verifyUser(s.meta, 'nobody', 'whatever');
  assert.equal(unknown.ok, false);
  assert.equal(unknown.username, undefined);
  assert.equal(unknown.error, undefined);

  assert.deepEqual(Object.keys(wrong).sort(), Object.keys(unknown).sort());
});

test('setActive: last active admin, self-deactivation of non-admin, self-deactivation of admin with backup', async () => {
  const s = freshStore();
  await users.init(s.meta);
  await users.createUser(s.meta, { username: 'admin1', passphrase: 'secret1', role: 'admin' }, 'local');

  const last = await users.setActive(s.meta, 'admin1', false, 'admin1');
  assert.equal(last.ok, false);
  assert.equal(last.error, 'E_LAST_ADMIN');

  const noUser = await users.setActive(s.meta, 'ghost', false, 'admin1');
  assert.equal(noUser.error, 'E_NO_USER');

  await users.createUser(s.meta, { username: 'op1', passphrase: 'secret1', role: 'operator' }, 'admin1');
  const selfOp = await users.setActive(s.meta, 'op1', false, 'op1');
  assert.equal(selfOp.ok, true);

  await users.createUser(s.meta, { username: 'admin2', passphrase: 'secret1', role: 'admin' }, 'admin1');
  const selfAdmin = await users.setActive(s.meta, 'admin1', false, 'admin1');
  assert.equal(selfAdmin.ok, true);
});

test('setRole: demote last active admin → E_LAST_ADMIN; happy path works', async () => {
  const s = freshStore();
  await users.init(s.meta);
  await users.createUser(s.meta, { username: 'admin1', passphrase: 'secret1', role: 'admin' }, 'local');
  await users.createUser(s.meta, { username: 'op1', passphrase: 'secret1', role: 'operator' }, 'admin1');

  const demote = await users.setRole(s.meta, 'admin1', 'engineer', 'admin1');
  assert.equal(demote.ok, false);
  assert.equal(demote.error, 'E_LAST_ADMIN');

  const noUser = await users.setRole(s.meta, 'ghost', 'engineer', 'admin1');
  assert.equal(noUser.error, 'E_NO_USER');

  const promote = await users.setRole(s.meta, 'op1', 'engineer', 'admin1');
  assert.equal(promote.ok, true);
  assert.equal(byName(await users.listUsers(s.meta), 'op1').role, 'engineer');
});

test('changePassphrase: self correct current → ok; admin resets other without current; wrong current → E_WRONG_PASSPHRASE', async () => {
  const s = freshStore();
  await users.init(s.meta);
  await users.createUser(s.meta, { username: 'admin1', passphrase: 'secret1', role: 'admin' }, 'local');
  await users.createUser(s.meta, { username: 'op1', passphrase: 'opsecret', role: 'operator' }, 'admin1');

  const selfOk = await users.changePassphrase(s.meta, 'op1', 'op1', 'opsecret', 'newsecret');
  assert.equal(selfOk.ok, true);
  assert.equal((await users.verifyUser(s.meta, 'op1', 'newsecret')).ok, true);

  const adminReset = await users.changePassphrase(s.meta, 'admin1', 'op1', undefined, 'reset1');
  assert.equal(adminReset.ok, true);
  assert.equal((await users.verifyUser(s.meta, 'op1', 'reset1')).ok, true);

  const wrong = await users.changePassphrase(s.meta, 'admin1', 'admin1', 'notright', 'brandnew1');
  assert.equal(wrong.ok, false);
  assert.equal(wrong.error, 'E_WRONG_PASSPHRASE');
});

test('activeRole: session of a deactivated user → null', async () => {
  const s = freshStore();
  await users.init(s.meta);
  await users.createUser(s.meta, { username: 'op1', passphrase: 'secret1', role: 'operator' }, 'local');

  const v = await users.verifyUser(s.meta, 'op1', 'secret1');
  assert.equal(v.ok, true);
  assert.equal(await users.activeRole(s.meta), 'operator');

  await users.setActive(s.meta, 'op1', false, 'op1');
  assert.equal(await users.activeRole(s.meta), null);
});

test('session written on verifyUser success contains username + role + future expiresISO', async () => {
  const s = freshStore();
  await users.init(s.meta);
  await users.createUser(s.meta, { username: 'alice', passphrase: 'secret1', role: 'engineer' }, 'local');

  await users.verifyUser(s.meta, 'alice', 'secret1');
  const session = await s.meta.get('lock.session');
  assert.ok(session);
  assert.equal(session.username, 'alice');
  assert.equal(session.role, 'engineer');
  assert.ok(session.startISO);
  assert.ok(session.lastActivityISO);
  assert.ok(session.expiresISO);
  assert.ok(Date.parse(session.expiresISO) > Date.now());
});

test('lock.role() respects the users list: active user session passes, deactivated user fails', async () => {
  const s = freshStore();
  await users.init(s.meta);
  await users.createUser(s.meta, { username: 'op1', passphrase: 'secret1', role: 'operator' }, 'local');
  await users.verifyUser(s.meta, 'op1', 'secret1');

  assert.equal(await lock.role(s.meta), 'operator');

  await users.setActive(s.meta, 'op1', false, 'op1');
  assert.equal(await lock.role(s.meta), null);
});

test('stamp() prefers the session username over the role', async () => {
  const s = freshStore();
  await users.init(s.meta);
  await users.createUser(s.meta, { username: 'alice', passphrase: 'secret1', role: 'engineer' }, 'local');
  await users.verifyUser(s.meta, 'alice', 'secret1');

  const out = await permissions.stamp(s.meta, { id: 'a' }, null);
  assert.equal(out.createdBy, 'alice');
  assert.equal(out.updatedBy, 'alice');
});

test('hasUsers: false when empty, true when populated', async () => {
  const s = freshStore();
  assert.equal(await users.hasUsers(s.meta), false);

  await users.createUser(s.meta, { username: 'alice', passphrase: 'secret1', role: 'operator' }, 'local');
  assert.equal(await users.hasUsers(s.meta), true);
});

test('hasUsers stays true after the lock is disabled (users survive lock disable)', async () => {
  const s = freshStore();
  await users.init(s.meta);
  await users.createUser(s.meta, { username: 'alice', passphrase: 'secret1', role: 'admin' }, 'local');

  await lock.enable({ pin: '123456', role: 'admin' }, s.meta);
  await lock.disable('123456', s.meta);

  assert.equal(await lock.isEnabled(s.meta), false);
  assert.equal(await users.hasUsers(s.meta), true);
});

test('hasUsers runs init internally so a legacy lock migrates to a real user', async () => {
  const s = freshStore();
  await lock.enable({ pin: '123456', role: 'admin' }, s.meta);

  assert.equal(await users.hasUsers(s.meta), true);
  const list = await users.listUsers(s.meta);
  assert.equal(list.length, 1);
  assert.equal(list[0].username, 'admin');
});

test('verifyUser writes a session and lock.role() nulls after deactivation', async () => {
  const s = freshStore();
  await users.init(s.meta);
  await users.createUser(s.meta, { username: 'bob', passphrase: 'secret1', role: 'operator' }, 'local');

  const v = await users.verifyUser(s.meta, 'bob', 'secret1');
  assert.equal(v.ok, true);
  assert.equal((await s.meta.get('lock.session')).username, 'bob');
  assert.equal(await lock.role(s.meta), 'operator');

  await users.setActive(s.meta, 'bob', false, 'bob');
  assert.equal(await lock.role(s.meta), null);
});

test('touch() preserves the session username and role after verifyUser', async () => {
  const s = freshStore();
  await users.init(s.meta);
  await users.createUser(s.meta, { username: 'inge.moros', passphrase: 'secret1', role: 'engineer' }, 'local');

  const v = await users.verifyUser(s.meta, 'inge.moros', 'secret1');
  assert.equal(v.ok, true);

  const touch = await lock.touch(s.meta);
  assert.equal(touch.ok, true);

  const session = await s.meta.get('lock.session');
  assert.equal(session.username, 'inge.moros');
  assert.equal(session.role, 'engineer');
  assert.equal(await lock.role(s.meta), 'engineer');
  assert.equal(await users.activeRole(s.meta), 'engineer');
});

test('touch() twice extends expiresISO and keeps the username', async () => {
  const s = freshStore();
  await users.init(s.meta);
  await users.createUser(s.meta, { username: 'inge.moros', passphrase: 'secret1', role: 'engineer' }, 'local');

  await users.verifyUser(s.meta, 'inge.moros', 'secret1');

  const first = await lock.touch(s.meta);
  assert.equal(first.ok, true);
  const firstExp = Date.parse(first.expiresISO);

  await new Promise(function (r) { setTimeout(r, 20); });

  const second = await lock.touch(s.meta);
  assert.equal(second.ok, true);
  const secondExp = Date.parse(second.expiresISO);

  assert.ok(secondExp > firstExp);
  assert.equal((await s.meta.get('lock.session')).username, 'inge.moros');
});

test('a session missing username is invalid for both lock.role() and users.activeRole() when users exist', async () => {
  const s = freshStore();
  await users.init(s.meta);
  await users.createUser(s.meta, { username: 'alice', passphrase: 'secret1', role: 'engineer' }, 'local');

  await s.meta.set('lock.session', {
    role: 'engineer',
    startISO: new Date().toISOString(),
    lastActivityISO: new Date().toISOString(),
    expiresISO: new Date(Date.now() + 60000).toISOString()
  });

  assert.equal(await lock.role(s.meta), null);
  assert.equal(await users.activeRole(s.meta), null);
});

test('legacy session without username returns the role when there is no users list', async () => {
  const s = freshStore();
  await s.meta.set('lock.session', {
    role: 'admin',
    startISO: new Date().toISOString(),
    lastActivityISO: new Date().toISOString(),
    expiresISO: new Date(Date.now() + 60000).toISOString()
  });

  assert.equal(await lock.role(s.meta), 'admin');
  assert.equal(await users.activeRole(s.meta), 'admin');
});

test('enable() bootstraps the migrated admin and writes a session with its username', async () => {
  const s = freshStore();
  const res = await lock.enable({ pin: '654321', role: 'admin' }, s.meta);
  assert.equal(res.ok, true);

  const list = await users.listUsers(s.meta);
  assert.equal(list.length, 1);
  assert.equal(list[0].username, 'admin');
  assert.equal(list[0].role, 'admin');
  assert.equal(list[0].active, true);

  const session = await s.meta.get('lock.session');
  assert.equal(session.username, 'admin');
  assert.equal(await lock.role(s.meta), 'admin');
});

test('enable() then createUser keeps the admin role (bootstrap regression)', async () => {
  const s = freshStore();
  await lock.enable({ pin: '654321', role: 'admin' }, s.meta);

  const created = await users.createUser(s.meta, { username: 'inge.moros', passphrase: 'secret1', role: 'engineer' }, 'admin');
  assert.equal(created.ok, true);

  assert.equal(await lock.role(s.meta), 'admin');
});

test('enable() twice does not duplicate the admin user', async () => {
  const s = freshStore();
  await lock.enable({ pin: '654321', role: 'admin' }, s.meta);
  await lock.enable({ pin: '654321', role: 'admin' }, s.meta);

  const list = await users.listUsers(s.meta);
  assert.equal(list.length, 1);
  assert.equal(list[0].username, 'admin');
  assert.equal((await s.meta.get('lock.session')).username, 'admin');
  assert.equal(await lock.role(s.meta), 'admin');
});
