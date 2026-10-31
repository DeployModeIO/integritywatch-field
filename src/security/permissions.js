/* IntegrityWatch Field — permissions
   Single role-based permission guard driven by one declared matrix. */
(function (root, factory) {
  'use strict';
  var api = factory(root);
  root.IW = root.IW || {};
  root.IW.security = root.IW.security || {};
  root.IW.security.permissions = api;
  if (typeof module === 'object' && module.exports) { module.exports = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  var ROLES = ['operator', 'engineer', 'admin'];

  var ACTIONS = {
    read: 'read',
    fieldEntry: 'fieldEntry',
    assetWrite: 'assetWrite',
    reportSign: 'reportSign',
    recResolve: 'recResolve',
    recAcknowledge: 'recAcknowledge',
    delete: 'delete',
    admin: 'admin',
    export: 'export'
  };

  var MATRIX = {
    operator: {
      read: true,
      fieldEntry: true,
      assetWrite: false,
      reportSign: false,
      recResolve: false,
      recAcknowledge: true,
      delete: false,
      admin: false,
      export: false
    },
    engineer: {
      read: true,
      fieldEntry: true,
      assetWrite: true,
      reportSign: true,
      recResolve: true,
      recAcknowledge: false,
      delete: false,
      admin: false,
      export: true
    },
    admin: {
      read: true,
      fieldEntry: true,
      assetWrite: true,
      reportSign: true,
      recResolve: true,
      recAcknowledge: true,
      delete: true,
      admin: true,
      export: true
    }
  };

  function lockApi() {
    return (root.IW && root.IW.security && root.IW.security.lock) || null;
  }

  function can(role, action) {
    var row = MATRIX[role];
    if (!row) { return false; }
    return row[action] === true;
  }

  function forbiddenError() {
    var err = new Error('E_FORBIDDEN');
    err.code = 'E_FORBIDDEN';
    return err;
  }

  function hasLock() {
    var lock = lockApi();
    return !!(lock && typeof lock.isEnabled === 'function');
  }

  function guard(meta) {
    function effectiveRole() {
      var lock = lockApi();
      if (!hasLock()) {
        // Lock module missing → fail closed: no role, non-read actions denied.
        return Promise.resolve(null);
      }
      return lock.isEnabled(meta).then(function (enabled) {
        // lock disabled → single-user device, full access
        if (!enabled) { return 'admin'; }
        return lock.role(meta);
      });
    }

    return {
      can: function (action) {
        if (!hasLock()) {
          // Fail closed: with no lock module only read is allowed.
          return Promise.resolve(action === 'read');
        }
        return effectiveRole().then(function (role) { return can(role, action); });
      },
      require: function (action) {
        if (!hasLock()) {
          if (action === 'read') { return Promise.resolve(true); }
          return Promise.reject(forbiddenError());
        }
        return effectiveRole().then(function (role) {
          if (!can(role, action)) { throw forbiddenError(); }
          return true;
        });
      },
      role: function () {
        if (!hasLock()) { return Promise.resolve(null); }
        var lock = lockApi();
        if (typeof lock.role !== 'function') { return Promise.resolve(null); }
        return lock.role(meta);
      }
    };
  }

  // Shared authorship stamp helper (audit trail). Resolves the acting role from
  // the current session guard; falls back to 'local' when the lock is disabled
  // or there is no active session. On CREATE (no `existing`) it sets createdBy/
  // createdAt and updatedBy/updatedAt to the same actor + timestamp; on UPDATE
  // (`existing` provided) it refreshes updatedBy/updatedAt and preserves the
  // original createdBy/createdAt. Mutates and returns `rec`.
  async function stamp(meta, rec, existing) {
    var actor = 'local';
    var g = guard(meta);
    if (g && typeof g.role === 'function') {
      var r = await g.role();
      if (r) { actor = r; }
    }
    var now = new Date().toISOString();
    if (existing) {
      if (existing.createdBy !== undefined) { rec.createdBy = existing.createdBy; }
      if (existing.createdAt !== undefined) { rec.createdAt = existing.createdAt; }
    } else {
      rec.createdBy = actor;
      rec.createdAt = now;
    }
    rec.updatedBy = actor;
    rec.updatedAt = now;
    return rec;
  }

  return {
    ROLES: ROLES,
    ACTIONS: ACTIONS,
    MATRIX: MATRIX,
    can: can,
    guard: guard,
    stamp: stamp
  };
});
