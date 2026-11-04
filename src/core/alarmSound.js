/* IntegrityWatch Field — alarmSound
   Sonido de alerta con Web Audio API puro (sin archivos de audio).
   Patrón: 880 Hz 200 ms → silencio 180 ms → 659 Hz 200 ms, cada 2500 ms. */
(function (root, factory) {
  'use strict';
  var api = factory(root);
  root.IW = root.IW || {};
  root.IW.core = root.IW.core || {};
  root.IW.core.alarmSound = api;
  if (typeof module === 'object' && module.exports) { module.exports = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  var _enabled = true;
  var _volume = 0.6;
  var _active = false;
  var _sounding = false;
  var _unlocked = false;
  var _timerId = null;
  var _audioFactory = null;
  var _oscCreated = 0;
  var _ctx = null;

  function _getCtx() {
    if (_ctx) { return _ctx; }
    try {
      var Ctor = _audioFactory;
      if (!Ctor && typeof AudioContext !== 'undefined') { Ctor = AudioContext; }
      if (!Ctor && typeof webkitAudioContext !== 'undefined') { Ctor = webkitAudioContext; }
      if (!Ctor) { return null; }
      _ctx = new Ctor();
      return _ctx;
    } catch (e) {
      return null;
    }
  }

  function _tryUnlock(ctx) {
    if (!ctx) { return; }
    if (typeof ctx.state === 'string' && ctx.state === 'running') {
      _unlocked = true;
      return;
    }
    if (typeof ctx.resume !== 'function') {
      _unlocked = true;
      return;
    }
    try {
      var r = ctx.resume();
      if (r && typeof r.then === 'function') {
        r.then(function () { _unlocked = true; }).catch(function () {});
      } else {
        _unlocked = true;
      }
    } catch (e) {}
  }

  function _gestureHandler() {
    _unlock();
  }

  function _playNotes() {
    var ctx = _getCtx();
    if (!ctx) {
      _sounding = false;
      return;
    }
    if (!_unlocked) {
      _tryUnlock(ctx);
      if (!_unlocked) {
        if (typeof document !== 'undefined') {
          document.addEventListener('pointerdown', _gestureHandler, { once: true });
          document.addEventListener('keydown', _gestureHandler, { once: true });
        }
        _sounding = false;
        return;
      }
    }
    try {
      var now = ctx.currentTime || 0;
      var osc1 = ctx.createOscillator();
      _oscCreated++;
      osc1.frequency.value = 880;
      var gain1 = ctx.createGain();
      gain1.gain.value = _volume;
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.start(now);
      osc1.stop(now + 0.2);

      var osc2 = ctx.createOscillator();
      _oscCreated++;
      osc2.frequency.value = 659;
      var gain2 = ctx.createGain();
      gain2.gain.value = _volume;
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.start(now + 0.38);
      osc2.stop(now + 0.58);
    } catch (e) {}
    _sounding = false;
  }

  function playPattern() {
    if (!_active || !_enabled) { return; }
    _sounding = true;
    _playNotes();
  }

  function _startLoop() {
    if (_timerId !== null) { return; }
    _timerId = setInterval(playPattern, 2500);
  }

  function _stopLoop() {
    if (_timerId !== null) {
      clearInterval(_timerId);
      _timerId = null;
    }
    _sounding = false;
  }

  function configure(opts) {
    if (!opts) { return; }
    if (typeof opts.enabled === 'boolean') {
      _enabled = opts.enabled;
      if (!_enabled) { _stopLoop(); }
    }
    if (typeof opts.volume === 'number') {
      if (opts.volume < 0) { _volume = 0; }
      else if (opts.volume > 1) { _volume = 1; }
      else { _volume = opts.volume; }
    }
  }

  function setActive(bool) {
    _active = !!bool;
    if (_active && _enabled) {
      _startLoop();
    } else {
      _stopLoop();
    }
  }

  function testBlip() {
    _sounding = true;
    _playNotes();
  }

  function stopNow() {
    _stopLoop();
  }

  function state() {
    return {
      enabled: _enabled,
      volume: _volume,
      active: _active,
      sounding: _sounding,
      unlocked: _unlocked
    };
  }

  function _unlock() {
    _unlocked = true;
    if (typeof document !== 'undefined') {
      document.removeEventListener('pointerdown', _gestureHandler);
      document.removeEventListener('keydown', _gestureHandler);
    }
    _tryUnlock(_getCtx());
  }

  function __setAudioFactoryForTest(factory) {
    _audioFactory = factory;
    _ctx = null;
    _sounding = false;
  }

  function __tickForTest() {
    _oscCreated = 0;
    if (!_active || !_enabled) { return 0; }
    _sounding = true;
    _playNotes();
    return _oscCreated;
  }

  var api = {
    configure: configure,
    setActive: setActive,
    testBlip: testBlip,
    stopNow: stopNow,
    state: state,
    unlock: function () { _unlock(); },
    __setAudioFactoryForTest: __setAudioFactoryForTest,
    __tickForTest: __tickForTest
  };

  // Test-only: id del interval para aserciones de no-duplicados
  Object.defineProperty(api, '_timerId', {
    get: function () { return _timerId; },
    enumerable: false,
    configurable: true
  });

  return api;
});