/* IntegrityWatch Field — lock
   Optional local PIN lock (PBKDF2-SHA256, pepper + per-user salt, rate-limited). */
(function (root, factory) {
  'use strict';
  var api = factory(root);
  root.IW = root.IW || {};
  root.IW.security = root.IW.security || {};
  root.IW.security.lock = api;
  if (typeof module === 'object' && module.exports) { module.exports = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  var ITERATIONS = 600000;
  var MIN_PIN_LENGTH = 6;
  var SALT_BYTES = 16;
  var PEPPER_BYTES = 32;
  var MAX_FAILS = 5;
  var LOCKOUT_MS = 30000;
  var SESSION_MINUTES = 15;

  var _crypto = null;
  var _currentRole = null;
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

  function deriveBits(pin, saltBytes, pepperBytes, iterations) {
    var c = cryptoApi();
    if (!c || !c.subtle) { return Promise.reject(new Error('WebCrypto unavailable')); }
    var pw = concatBytes(utf8(pin), pepperBytes);
    return c.subtle.importKey('raw', pw, 'PBKDF2', false, ['deriveBits']).then(function (key) {
      return c.subtle.deriveBits(
        { name: 'PBKDF2', salt: saltBytes, iterations: iterations, hash: 'SHA-256' },
        key,
        256
      );
    });
  }

  function deriveHashB64(pin, saltBytes, pepperBytes, iterations) {
    return deriveBits(pin, saltBytes, pepperBytes, iterations).then(function (bits) {
      return bytesToB64(new Uint8Array(bits));
    });
  }

  function isEnabled(meta) {
    return meta.get('lock.enabled').then(function (v) { return v === true; });
  }

  function makeSession(role, nowMs) {
    var nowISO = new Date(nowMs).toISOString();
    return {
      role: role,
      startISO: nowISO,
      lastActivityISO: nowISO,
      expiresISO: new Date(nowMs + SESSION_MINUTES * 60000).toISOString()
    };
  }

  function enable(opts, meta) {
    opts = opts || {};
    var pin = opts.pin;
    var role = opts.role || 'operator';
    if (!pin || typeof pin !== 'string' || pin.length < MIN_PIN_LENGTH) {
      return Promise.resolve({ ok: false, error: 'E_INVALID_PIN' });
    }
    var saltBytes = randomBytes(SALT_BYTES);
    var pepperBytes = randomBytes(PEPPER_BYTES);
    var pepperB64 = bytesToB64(pepperBytes);
    return deriveHashB64(pin, saltBytes, pepperBytes, ITERATIONS).then(function (hashB64) {
      var verifier = { saltB64: bytesToB64(saltBytes), hashB64: hashB64, iterations: ITERATIONS };
      _currentRole = role;
      _fails = 0;
      return meta.set('lock.verifier', verifier)
        .then(function () { return meta.set('lock.pepperB64', pepperB64); })
        .then(function () { return meta.set('lock.role', role); })
        .then(function () { return meta.set('lock.fails', 0); })
        .then(function () { return meta.set('lock.lockedUntilISO', null); })
        .then(function () { return meta.set('lock.enabled', true); })
        .then(function () { return meta.set('lock.session', makeSession(role, Date.now())); })
        .then(function () { return { ok: true, role: role }; });
    });
  }

  function disable(pin, meta) {
    return verify(pin, meta).then(function (res) {
      if (!res.ok) { return { ok: false, error: 'E_WRONG_PIN' }; }
      _currentRole = null;
      return meta.set('lock.enabled', false)
        .then(function () { return meta.set('lock.session', null); })
        .then(function () { return { ok: true }; });
    });
  }

  function verify(pin, meta) {
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
      return meta.get('lock.verifier').then(function (verifier) {
        if (!verifier || !verifier.saltB64 || !verifier.hashB64) {
          return { ok: false };
        }
        return meta.get('lock.pepperB64').then(function (pepperB64) {
          if (!pepperB64) { return { ok: false }; }
          var iterations = verifier.iterations || ITERATIONS;
          return deriveHashB64(pin, b64ToBytes(verifier.saltB64), b64ToBytes(pepperB64), iterations).then(function (hashB64) {
            if (constantTimeEqual(hashB64, verifier.hashB64)) {
              _fails = 0;
              return meta.get('lock.role').then(function (role) {
                _currentRole = role || null;
                return meta.set('lock.fails', 0).then(function () {
                  return meta.set('lock.lockedUntilISO', null).then(function () {
                    return meta.set('lock.session', makeSession(role, Date.now())).then(function () {
                      return { ok: true, role: role };
                    });
                  });
                });
              });
            }
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
          });
        });
      });
    });
  }

  function changePin(oldPin, newPin, meta) {
    if (!newPin || typeof newPin !== 'string' || newPin.length < MIN_PIN_LENGTH) {
      return Promise.resolve({ ok: false, error: 'E_INVALID_PIN' });
    }
    return verify(oldPin, meta).then(function (res) {
      if (!res.ok) { return { ok: false, error: 'E_WRONG_PIN' }; }
      return meta.get('lock.pepperB64').then(function (pepperB64) {
        if (!pepperB64) { return { ok: false, error: 'E_NOT_ENABLED' }; }
        var saltBytes = randomBytes(SALT_BYTES);
        return deriveHashB64(newPin, saltBytes, b64ToBytes(pepperB64), ITERATIONS).then(function (hashB64) {
          var verifier = { saltB64: bytesToB64(saltBytes), hashB64: hashB64, iterations: ITERATIONS };
          _fails = 0;
          return meta.set('lock.verifier', verifier)
            .then(function () { return meta.set('lock.fails', 0); })
            .then(function () { return meta.set('lock.lockedUntilISO', null); })
            .then(function () { return { ok: true }; });
        });
      });
    });
  }

  function currentSession(meta) {
    return meta.get('lock.session').then(function (s) {
      if (!s || typeof s !== 'object' || !s.expiresISO) { return null; }
      var exp = Date.parse(s.expiresISO);
      if (isNaN(exp) || exp <= Date.now()) { return null; }
      return { role: s.role, startISO: s.startISO, lastActivityISO: s.lastActivityISO, expiresISO: s.expiresISO };
    });
  }

  function touch(meta) {
    return meta.get('lock.session').then(function (s) {
      if (!s || typeof s !== 'object' || !s.expiresISO) { return { ok: false }; }
      var exp = Date.parse(s.expiresISO);
      if (isNaN(exp) || exp <= Date.now()) { return { ok: false }; }
      var nowMs = Date.now();
      var session = {
        role: s.role,
        startISO: s.startISO,
        lastActivityISO: new Date(nowMs).toISOString(),
        expiresISO: new Date(nowMs + SESSION_MINUTES * 60000).toISOString()
      };
      return meta.set('lock.session', session).then(function () {
        return { ok: true, expiresISO: session.expiresISO };
      });
    });
  }

  function role(meta) {
    return currentSession(meta).then(function (s) {
      return s ? s.role : null;
    });
  }

  // Deprecated: in-memory only; resets on reload. Use role(meta) instead.
  function currentRole() {
    return _currentRole;
  }

  return {
    MIN_PIN_LENGTH: MIN_PIN_LENGTH,
    isEnabled: isEnabled,
    enable: enable,
    disable: disable,
    verify: verify,
    changePin: changePin,
    currentRole: currentRole,
    currentSession: currentSession,
    touch: touch,
    role: role,
    __setCrypto: function (cryptoWeb) { _crypto = cryptoWeb; }
  };
});
