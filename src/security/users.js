/* IntegrityWatch Field — users
   Named multi-user credentials for the local lock (PBKDF2-SHA256, shared pepper
   + per-user salt, rate-limited against the same global lockout as lock.js). */
(function (root, factory) {
  'use strict';
  var api = factory(root);
  root.IW = root.IW || {};
  root.IW.security = root.IW.security || {};
  root.IW.security.users = api;
  if (typeof module === 'object' && module.exports) { module.exports = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  var ITERATIONS = 600000;
  var MIN_PASSPHRASE_LENGTH = 6;
  var SALT_BYTES = 16;
  var PEPPER_BYTES = 32;
  var MAX_FAILS = 5;
  var LOCKOUT_MS = 30000;
  var SESSION_MINUTES = 15;
  var ROLES = ['operator', 'engineer', 'admin'];
  var USERNAME_RE = /^[a-z0-9._-]+$/i;

  var _crypto = null;
  var _fails = 0;

  function cryptoApi() {
    if (_crypto) { return _crypto; }
    if (typeof globalThis !== 'undefined' && globalThis.crypto && globalThis.crypto.subtle) { return globalThis.crypto; }
    if (typeof crypto !== 'undefined' && crypto.subtle) { return crypto; }
    return null;
  }

  function randomBytes(n) {
    var c = cryptoApi();
    if (c && typeof c.getRandomValues === 'function') {
      var buf = new Uint8Array(n);
      c.getRandomValues(buf);
      return buf;
    }
    var out = new Uint8Array(n);
    for (var i = 0; i < n; i++) { out[i] = Math.floor(Math.random() * 256); }
    return out;
  }

  function bytesToB64(bytes) {
    var arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    if (typeof Buffer !== 'undefined') { return Buffer.from(arr).toString('base64'); }
    var bin = '';
    for (var i = 0; i < arr.length; i++) { bin += String.fromCharCode(arr[i]); }
    return btoa(bin);
  }

  function b64ToBytes(b64) {
    if (typeof Buffer !== 'undefined') { return new Uint8Array(Buffer.from(b64, 'base64')); }
    var bin = atob(b64);
    var out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) { out[i] = bin.charCodeAt(i); }
    return out;
  }

  function utf8(str) {
    if (typeof TextEncoder !== 'undefined') { return new TextEncoder().encode(str); }
    var out = [];
    for (var i = 0; i < str.length; i++) {
      var c = str.charCodeAt(i);
      if (c < 0x80) { out.push(c); }
      else if (c < 0x800) { out.push(0xc0 | (c >> 6), 0x80 | (c & 0x3f)); }
      else if (c >= 0xd800 && c <= 0xdbff && i + 1 < str.length) {
        var c2 = str.charCodeAt(i + 1);
        if (c2 >= 0xdc00 && c2 <= 0xdfff) {
          var cp = 0x10000 + ((c - 0xd800) << 10) + (c2 - 0xdc00);
          out.push(0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 0x3f), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f));
          i++;
          continue;
        }
        out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f));
      } else {
        out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f));
      }
    }
    return new Uint8Array(out);
  }

  function concatBytes(a, b) {
    var out = new Uint8Array(a.length + b.length);
    out.set(a, 0);
    out.set(b, a.length);
    return out;
  }

  function constantTimeEqual(a, b) {
    if (typeof a !== 'string' || typeof b !== 'string') { return false; }
    if (a.length !== b.length) { return false; }
    var diff = 0;
    for (var i = 0; i < a.length; i++) {
      diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
    }
    return diff === 0;
  }

  function deriveBits(passphrase, saltBytes, pepperBytes, iterations) {
    var c = cryptoApi();
    if (!c || !c.subtle) { return Promise.reject(new Error('WebCrypto unavailable')); }
    var pw = concatBytes(utf8(passphrase), pepperBytes);
    return c.subtle.importKey('raw', pw, 'PBKDF2', false, ['deriveBits']).then(function (key) {
      return c.subtle.deriveBits(
        { name: 'PBKDF2', salt: saltBytes, iterations: iterations, hash: 'SHA-256' },
        key,
        256
      );
    });
  }

  function deriveHashB64(passphrase, saltBytes, pepperBytes, iterations) {
    return deriveBits(passphrase, saltBytes, pepperBytes, iterations).then(function (bits) {
      return bytesToB64(new Uint8Array(bits));
    });
  }

  function getUsers(meta) {
    return meta.get('users').then(function (u) {
      return Array.isArray(u) ? u : [];
    });
  }

  function setUsers(meta, users) {
    return meta.set('users', users);
  }

  function findUser(users, username) {
    if (typeof username !== 'string') { return null; }
    var lower = username.toLowerCase();
    for (var i = 0; i < users.length; i++) {
      var u = users[i];
      if (u && typeof u.username === 'string' && u.username.toLowerCase() === lower) { return u; }
    }
    return null;
  }

  function getPepperB64(meta) {
    return meta.get('users.pepperB64').then(function (p) {
      if (p) { return p; }
      var pepperBytes = randomBytes(PEPPER_BYTES);
      var b64 = bytesToB64(pepperBytes);
      return meta.set('users.pepperB64', b64).then(function () { return b64; });
    });
  }

  function init(meta) {
    return meta.get('users').then(function (users) {
      if (Array.isArray(users)) {
        return { ok: true, migrated: false };
      }
      return meta.get('lock.enabled').then(function (enabled) {
        if (enabled !== true) {
          return { ok: true, migrated: false };
        }
        return meta.get('lock.verifier').then(function (verifier) {
          if (!verifier || !verifier.saltB64 || !verifier.hashB64) {
            return { ok: true, migrated: false };
          }
          return meta.get('lock.pepperB64').then(function (pepperB64) {
            var admin = {
              username: 'admin',
              role: 'admin',
              active: true,
              saltB64: verifier.saltB64,
              hashB64: verifier.hashB64,
              iterations: verifier.iterations || ITERATIONS,
              createdAt: new Date().toISOString(),
              createdBy: 'local'
            };
            return meta.set('users', [admin]).then(function () {
              if (pepperB64) { return meta.set('users.pepperB64', pepperB64); }
              return Promise.resolve();
            }).then(function () {
              return meta.set('users.legacyMigrated', true);
            }).then(function () {
              return { ok: true, migrated: true };
            });
          });
        });
      });
    });
  }

  function hasUsers(meta) {
    return init(meta).then(function () {
      return getUsers(meta).then(function (users) {
        return Array.isArray(users) && users.length > 0;
      });
    });
  }

  function listUsers(meta) {
    return getUsers(meta).then(function (users) {
      return users.map(function (u) {
        return {
          username: u.username,
          role: u.role,
          active: u.active,
          createdAt: u.createdAt,
          createdBy: u.createdBy
        };
      });
    });
  }

  function createUser(meta, input, actor) {
    actor = actor || 'local';
    input = input || {};
    var username = (typeof input.username === 'string') ? input.username.trim() : '';
    var passphrase = input.passphrase;
    var role = input.role;

    if (username.length < 3 || username.length > 32 || !USERNAME_RE.test(username)) {
      return Promise.resolve({ ok: false, error: 'E_BAD_USERNAME' });
    }
    if (!passphrase || typeof passphrase !== 'string' || passphrase.length < MIN_PASSPHRASE_LENGTH) {
      return Promise.resolve({ ok: false, error: 'E_WEAK_PASSPHRASE' });
    }
    if (ROLES.indexOf(role) === -1) {
      return Promise.resolve({ ok: false, error: 'E_BAD_ROLE' });
    }

    return getUsers(meta).then(function (users) {
      if (findUser(users, username)) {
        return { ok: false, error: 'E_USER_EXISTS' };
      }
      return getPepperB64(meta).then(function (pepperB64) {
        var saltBytes = randomBytes(SALT_BYTES);
        return deriveHashB64(passphrase, saltBytes, b64ToBytes(pepperB64), ITERATIONS).then(function (hashB64) {
          users.push({
            username: username,
            role: role,
            active: true,
            saltB64: bytesToB64(saltBytes),
            hashB64: hashB64,
            iterations: ITERATIONS,
            createdAt: new Date().toISOString(),
            createdBy: actor
          });
          return setUsers(meta, users).then(function () {
            return { ok: true, username: username };
          });
        });
      });
    });
  }

  function countOtherActiveAdmins(users, exclude) {
    for (var i = 0; i < users.length; i++) {
      var u = users[i];
      if (u !== exclude && u.active === true && u.role === 'admin') { return true; }
    }
    return false;
  }

  function setActive(meta, username, active, actor) {
    return getUsers(meta).then(function (users) {
      var user = findUser(users, username);
      if (!user) {
        return { ok: false, error: 'E_NO_USER' };
      }
      if (active === false && user.active === true && user.role === 'admin') {
        if (!countOtherActiveAdmins(users, user)) {
          return { ok: false, error: 'E_LAST_ADMIN' };
        }
      }
      user.active = (active === true);
      return setUsers(meta, users).then(function () {
        return { ok: true };
      });
    });
  }

  function setRole(meta, username, newRole, actor) {
    if (ROLES.indexOf(newRole) === -1) {
      return Promise.resolve({ ok: false, error: 'E_BAD_ROLE' });
    }
    return getUsers(meta).then(function (users) {
      var user = findUser(users, username);
      if (!user) {
        return { ok: false, error: 'E_NO_USER' };
      }
      if (user.role === 'admin' && newRole !== 'admin' && user.active === true) {
        if (!countOtherActiveAdmins(users, user)) {
          return { ok: false, error: 'E_LAST_ADMIN' };
        }
      }
      user.role = newRole;
      return setUsers(meta, users).then(function () {
        return { ok: true };
      });
    });
  }

  function applyNewPassphrase(meta, users, target, newPass) {
    return getPepperB64(meta).then(function (pepperB64) {
      var saltBytes = randomBytes(SALT_BYTES);
      return deriveHashB64(newPass, saltBytes, b64ToBytes(pepperB64), ITERATIONS).then(function (hashB64) {
        target.saltB64 = bytesToB64(saltBytes);
        target.hashB64 = hashB64;
        target.iterations = ITERATIONS;
        return setUsers(meta, users).then(function () {
          return { ok: true };
        });
      });
    });
  }

  function changePassphrase(meta, actorUsername, targetUsername, currentPass, newPass) {
    if (!newPass || typeof newPass !== 'string' || newPass.length < MIN_PASSPHRASE_LENGTH) {
      return Promise.resolve({ ok: false, error: 'E_WEAK_PASSPHRASE' });
    }
    return getUsers(meta).then(function (users) {
      var target = findUser(users, targetUsername);
      if (!target) {
        return { ok: false, error: 'E_NO_USER' };
      }
      var isSelf = (typeof actorUsername === 'string') &&
        actorUsername.toLowerCase() === target.username.toLowerCase();

      if (isSelf) {
        return getPepperB64(meta).then(function (pepperB64) {
          var iterations = target.iterations || ITERATIONS;
          var current = (typeof currentPass === 'string') ? currentPass : '';
          return deriveHashB64(current, b64ToBytes(target.saltB64), b64ToBytes(pepperB64), iterations).then(function (hashB64) {
            if (!constantTimeEqual(hashB64, target.hashB64)) {
              return { ok: false, error: 'E_WRONG_PASSPHRASE' };
            }
            return applyNewPassphrase(meta, users, target, newPass);
          });
        });
      }

      var actorUser = findUser(users, actorUsername);
      if (!actorUser || actorUser.role !== 'admin' || actorUser.active !== true) {
        return { ok: false, error: 'E_FORBIDDEN' };
      }
      return applyNewPassphrase(meta, users, target, newPass);
    });
  }

  function registerFail(meta, now) {
    _fails += 1;
    var fails = _fails;
    var result = { ok: false };
    return meta.set('lock.fails', fails).then(function () {
      if (fails >= MAX_FAILS) {
        var untilISO = new Date(now + LOCKOUT_MS).toISOString();
        return meta.set('lock.lockedUntilISO', untilISO).then(function () {
          result.lockoutSec = Math.ceil((Date.parse(untilISO) - now) / 1000);
          return result;
        });
      }
      return result;
    });
  }

  function writeSession(meta, user) {
    var nowMs = Date.now();
    var nowISO = new Date(nowMs).toISOString();
    var session = {
      username: user.username,
      role: user.role,
      startISO: nowISO,
      lastActivityISO: nowISO,
      expiresISO: new Date(nowMs + SESSION_MINUTES * 60000).toISOString()
    };
    return meta.set('lock.session', session);
  }

  function verifyUser(meta, username, passphrase) {
    var now = Date.now();
    return meta.get('lock.fails').then(function (persisted) {
      _fails = (typeof persisted === 'number' && isFinite(persisted)) ? persisted : 0;
      return meta.get('lock.lockedUntilISO');
    }).then(function (lockedUntil) {
      if (lockedUntil) {
        var until = Date.parse(lockedUntil);
        if (!isNaN(until) && until > now) {
          return { ok: false, lockoutSec: Math.ceil((until - now) / 1000) };
        }
        _fails = 0;
      }
      return getUsers(meta).then(function (users) {
        var user = findUser(users, username);
        if (!user || user.active !== true) {
          return registerFail(meta, now);
        }
        return getPepperB64(meta).then(function (pepperB64) {
          if (!pepperB64) {
            return registerFail(meta, now);
          }
          var iterations = user.iterations || ITERATIONS;
          var pw = (typeof passphrase === 'string') ? passphrase : '';
          return deriveHashB64(pw, b64ToBytes(user.saltB64), b64ToBytes(pepperB64), iterations).then(function (hashB64) {
            if (constantTimeEqual(hashB64, user.hashB64)) {
              _fails = 0;
              return meta.set('lock.fails', 0).then(function () {
                return meta.set('lock.lockedUntilISO', null).then(function () {
                  return writeSession(meta, user).then(function () {
                    return { ok: true, username: user.username, role: user.role };
                  });
                });
              });
            }
            return registerFail(meta, now);
          });
        });
      });
    });
  }

  function activeRole(meta) {
    return meta.get('lock.session').then(function (s) {
      if (!s || typeof s !== 'object' || !s.expiresISO) { return null; }
      var exp = Date.parse(s.expiresISO);
      if (isNaN(exp) || exp <= Date.now()) { return null; }
      return getUsers(meta).then(function (users) {
        if (Array.isArray(users) && users.length > 0) {
          if (!s.username) { return null; }
          var user = findUser(users, s.username);
          if (!user || user.active !== true) { return null; }
          return s.role || null;
        }
        return s.role || null;
      });
    });
  }

  return {
    ROLES: ROLES,
    MIN_PASSPHRASE_LENGTH: MIN_PASSPHRASE_LENGTH,
    init: init,
    hasUsers: hasUsers,
    listUsers: listUsers,
    createUser: createUser,
    setActive: setActive,
    setRole: setRole,
    changePassphrase: changePassphrase,
    verifyUser: verifyUser,
    activeRole: activeRole,
    __setCrypto: function (cryptoWeb) { _crypto = cryptoWeb; }
  };
});
