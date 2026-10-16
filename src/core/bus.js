/* IntegrityWatch Field — event bus
   Tiny pub/sub with simple single-star wildcards and per-listener error isolation. */
(function (root, factory) {
  'use strict';
  var api = factory(root);
  root.IW = root.IW || {};
  root.IW.core = root.IW.core || {};
  root.IW.core.bus = api;
  if (typeof module === 'object' && module.exports) { module.exports = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  var listeners = {};

  function matches(pattern, event) {
    if (pattern === event) { return true; }
    var star = pattern.indexOf('*');
    if (star === -1) { return false; }
    var prefix = pattern.slice(0, star);
    var suffix = pattern.slice(star + 1);
    if (event.length < prefix.length + suffix.length) { return false; }
    if (event.slice(0, prefix.length) !== prefix) { return false; }
    if (event.slice(event.length - suffix.length) !== suffix) { return false; }
    return true;
  }

  function on(evt, fn) {
    if (typeof fn !== 'function') { throw new TypeError('bus.on: listener must be a function'); }
    if (!listeners[evt]) { listeners[evt] = []; }
    listeners[evt].push(fn);
    return function unsubscribe() { off(evt, fn); };
  }

  function off(evt, fn) {
    var list = listeners[evt];
    if (!list) { return; }
    var i = list.indexOf(fn);
    if (i !== -1) { list.splice(i, 1); }
    if (list.length === 0) { delete listeners[evt]; }
  }

  function emit(evt, payload) {
    var keys = Object.keys(listeners);
    for (var k = 0; k < keys.length; k++) {
      if (!matches(keys[k], evt)) { continue; }
      var list = listeners[keys[k]].slice();
      for (var i = 0; i < list.length; i++) {
        try {
          list[i](payload);
        } catch (err) {
          if (typeof console !== 'undefined' && typeof console.error === 'function') {
            console.error('bus: listener error on "' + evt + '"', err);
          }
        }
      }
    }
  }

  return { on: on, off: off, emit: emit };
});
