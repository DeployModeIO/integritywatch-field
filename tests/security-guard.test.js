/* IntegrityWatch Field — permission guard (TESTS)
   Single role matrix + guard driven by lock.role(meta). */
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const storeApi = require('../src/core/store.js');
const dbMemory = require('../src/core/dbMemory.js');
const lock = require('../src/security/lock.js');
const permissions = require('../src/security/permissions.js');

lock.__setCrypto(globalThis.crypto);

function freshStore() {
  return storeApi.create(dbMemory.create());
}

test('ROLES and ACTIONS are declared as specified', () => {
  assert.deepEqual(permissions.ROLES, ['operator', 'engineer', 'admin']);
  assert.deepEqual(permissions.ACTIONS, {
    read: 'read',
    fieldEntry: 'fieldEntry',
    assetWrite: 'assetWrite',
    reportSign: 'reportSign',
    recResolve: 'recResolve',
    recAcknowledge: 'recAcknowledge',
    delete: 'delete',
    admin: 'admin',
    export: 'export'
  });
});

test('MATRIX is complete: every ACTION key has an entry for each of the 3 roles, and every matrix key is a declared ACTION', () => {
  assert.ok(permissions.MATRIX, 'MATRIX must be exposed');
  permissions.ROLES.forEach(function (role) {
    assert.ok(permissions.MATRIX[role], 'matrix missing role ' + role);
  });
  // ACTIONS -> MATRIX: every declared action is present for each role.
  Object.keys(permissions.ACTIONS).forEach(function (action) {
    permissions.ROLES.forEach(function (role) {
      assert.ok(
        Object.prototype.hasOwnProperty.call(permissions.MATRIX[role], action),
        'matrix[' + role + '] missing action key ' + action
      );
    });
  });
  // MATRIX -> ACTIONS: every role's matrix key is a declared action.
  permissions.ROLES.forEach(function (role) {
    Object.keys(permissions.MATRIX[role]).forEach(function (key) {
      assert.ok(
        Object.prototype.hasOwnProperty.call(permissions.ACTIONS, key),
        'matrix[' + role + '] has undeclared action key ' + key
      );
    });
  });
});

test('can() honours the declared role matrix', () => {
  assert.equal(permissions.can('operator', 'assetWrite'), false);
  assert.equal(permissions.can('engineer', 'assetWrite'), true);
  assert.equal(permissions.can('admin', 'delete'), true);
  assert.equal(permissions.can('operator', 'delete'), false);
  assert.equal(permissions.can('engineer', 'delete'), false);
  assert.equal(permissions.can('operator', 'recResolve'), false);
  assert.equal(permissions.can('operator', 'recAcknowledge'), true);
  assert.equal(permissions.can('engineer', 'recResolve'), true);
  assert.equal(permissions.can('admin', 'admin'), true);
  assert.equal(permissions.can('admin', 'export'), true);
});

test('can() returns false for unknown roles or actions', () => {
  assert.equal(permissions.can('unknown', 'delete'), false);
  assert.equal(permissions.can('admin', 'unknownAction'), false);
});

test('guard(meta) require() resolves for an allowed action on an engineer session', async () => {
  const s = freshStore();
  await lock.enable({ pin: '123456', role: 'engineer' }, s.meta);
  const g = permissions.guard(s.meta);

  assert.equal(await g.can('assetWrite'), true);
  await assert.doesNotReject(function () { return g.require('assetWrite'); });
});

test('guard(meta) require() rejects with E_FORBIDDEN for a forbidden action', async () => {
  const s = freshStore();
  await lock.enable({ pin: '123456', role: 'engineer' }, s.meta);
  const g = permissions.guard(s.meta);

  await assert.rejects(function () { return g.require('delete'); }, function (err) {
    assert.equal(err.code, 'E_FORBIDDEN');
    return true;
  });
});

test('guard(meta) role() reflects the current session role', async () => {
  const s = freshStore();
  await lock.enable({ pin: '123456', role: 'engineer' }, s.meta);
  const g = permissions.guard(s.meta);
  assert.equal(await g.role(), 'engineer');
});

test('lock disabled → single-user device, full access', async () => {
  const s = freshStore();
  const g = permissions.guard(s.meta);

  assert.equal(await g.can('delete'), true);
  assert.equal(await g.can('admin'), true);
  assert.equal(await g.role(), null);
  await assert.doesNotReject(function () { return g.require('admin'); });
});

test('lock enabled with no valid session → forbidden', async () => {
  const s = freshStore();
  await lock.enable({ pin: '123456', role: 'operator' }, s.meta);
  const session = await s.meta.get('lock.session');
  await s.meta.set('lock.session', {
    role: session.role,
    startISO: session.startISO,
    lastActivityISO: session.lastActivityISO,
    expiresISO: new Date(Date.now() - 1000).toISOString()
  });
  const g = permissions.guard(s.meta);
  assert.equal(await g.can('read'), false);
});

test('guard fail-closed: missing lock module denies non-read and keeps read allowed', async () => {
  const s = freshStore();
  const savedLock = globalThis.IW.security.lock;
  delete globalThis.IW.security.lock;
  try {
    const g = permissions.guard(s.meta);
    assert.equal(await g.role(), null);
    assert.equal(await g.can('read'), true);
    assert.equal(await g.can('assetWrite'), false);
    assert.equal(await g.can('delete'), false);
    await assert.doesNotReject(function () { return g.require('read'); });
    await assert.rejects(function () { return g.require('assetWrite'); }, function (err) {
      assert.equal(err.code, 'E_FORBIDDEN');
      return true;
    });
  } finally {
    globalThis.IW.security.lock = savedLock;
  }
});
