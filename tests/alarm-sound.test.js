/* IntegrityWatch Field — alarmSound tests (Node, sin navegador). */
'use strict';

var test = require('node:test');
var assert = require('node:assert/strict');

var alarmSound = require('../src/core/alarmSound.js');

/* ── Mock AudioContext factory ──────────────────────────────────────────────── */
function makeMock() {
  var gainObj = { value: 0 };
  var calls = { createOscillator: 0, createGain: 0, resume: 0 };
  var ctx = {
    createOscillator: function () {
      calls.createOscillator++;
      return {
        start: function () {},
        stop: function () {},
        frequency: { value: 0 },
        connect: function () {}
      };
    },
    createGain: function () {
      calls.createGain++;
      return { gain: gainObj, connect: function () {} };
    },
    destination: {},
    currentTime: 0,
    resume: function () {
      calls.resume++;
      return Promise.resolve();
    },
    state: 'running',
    close: function () { calls.closeCount = (calls.closeCount || 0) + 1; }
  };
  return { ctx: ctx, calls: calls, gain: gainObj };
}

function resetModule() {
  alarmSound.stopNow();
  alarmSound.configure({ enabled: true, volume: 0.6 });
  alarmSound.setActive(false);
  alarmSound.__setAudioFactoryForTest(null);
}

/* ── Tests ─────────────────────────────────────────────────────────────────── */

test('a) setActive(true) + enabled=true → __tickForTest crea los 2 osciladores del patron', function () {
  resetModule();
  var mock = makeMock();
  alarmSound.__setAudioFactoryForTest(function () { return mock.ctx; });
  alarmSound.setActive(true);
  alarmSound.configure({ enabled: true });
  var count = alarmSound.__tickForTest();
  assert.equal(count, 2, '2 osciladores creados por patron');
  assert.ok(alarmSound.state().active, 'state().active === true');
});

test('b) setActive(false) → __tickForTest no crea osciladores', function () {
  resetModule();
  var mock = makeMock();
  alarmSound.__setAudioFactoryForTest(function () { return mock.ctx; });
  alarmSound.setActive(false);
  var count = alarmSound.__tickForTest();
  assert.equal(count, 0, '0 osciladores con active=false');
});

test('c) configure({enabled:false}) → __tickForTest no crea osciladores', function () {
  resetModule();
  var mock = makeMock();
  alarmSound.__setAudioFactoryForTest(function () { return mock.ctx; });
  alarmSound.setActive(true);
  alarmSound.configure({ enabled: false });
  var count = alarmSound.__tickForTest();
  assert.equal(count, 0, '0 osciladores con enabled=false');
  assert.equal(alarmSound.state().enabled, false);
});

test('d) volume 0.3 → gain.value del mock === 0.3', function () {
  resetModule();
  var mock = makeMock();
  alarmSound.__setAudioFactoryForTest(function () { return mock.ctx; });
  alarmSound.configure({ volume: 0.3 });
  alarmSound.setActive(true);
  alarmSound.__tickForTest();
  assert.equal(mock.gain.value, 0.3, 'gain refleja el volumen configurado');
  assert.equal(alarmSound.state().volume, 0.3);
});

test('d.2) volume clampeado a [0, 1]', function () {
  resetModule();
  var mock = makeMock();
  alarmSound.__setAudioFactoryForTest(function () { return mock.ctx; });
  alarmSound.configure({ volume: -0.5 });
  assert.equal(alarmSound.state().volume, 0);
  alarmSound.configure({ volume: 2.5 });
  assert.equal(alarmSound.state().volume, 1);
});

test('e) testBlip() crea exactamente 2 osciladores aunque active=false', function () {
  resetModule();
  var mock = makeMock();
  alarmSound.__setAudioFactoryForTest(function () { return mock.ctx; });
  alarmSound.setActive(false);
  alarmSound.testBlip();
  assert.equal(mock.calls.createOscillator, 2, 'testBlip crea 2 osciladores');
});

test('f) state() coherencia: devuelve las 5 propiedades esperadas', function () {
  resetModule();
  var mock = makeMock();
  alarmSound.__setAudioFactoryForTest(function () { return mock.ctx; });
  alarmSound.configure({ enabled: true, volume: 0.8 });
  alarmSound.setActive(true);
  var s = alarmSound.state();
  assert.equal(typeof s.enabled, 'boolean');
  assert.equal(typeof s.volume, 'number');
  assert.equal(typeof s.active, 'boolean');
  assert.equal(typeof s.sounding, 'boolean');
  assert.equal(typeof s.unlocked, 'boolean');
  assert.equal(s.enabled, true);
  assert.equal(s.volume, 0.8);
  assert.equal(s.active, true);
  // unlocked es true porque el mock reporta state: 'running'
  assert.equal(s.unlocked, true);
  // sounding se pone false al final de __tickForTest
  assert.equal(s.sounding, false);
});

test('g) setActive(true) dos veces → un solo interval (no duplicado)', function () {
  resetModule();
  var mock = makeMock();
  alarmSound.__setAudioFactoryForTest(function () { return mock.ctx; });
  alarmSound.setActive(true);
  var first = alarmSound._timerId;
  assert.ok(first !== null, 'primer interval creado');
  alarmSound.setActive(true);
  var second = alarmSound._timerId;
  assert.equal(second, first, 'el mismo id, sin duplicar interval');
  alarmSound.setActive(false);
  assert.equal(alarmSound._timerId, null, 'interval limpiado');
});

test('h) configure enabled:false durante loop activo frena el interval', function () {
  resetModule();
  var mock = makeMock();
  alarmSound.__setAudioFactoryForTest(function () { return mock.ctx; });
  alarmSound.setActive(true);
  assert.ok(alarmSound._timerId !== null, 'loop activo');
  alarmSound.configure({ enabled: false });
  assert.equal(alarmSound._timerId, null, 'interval limpiado al deshabilitar');
});