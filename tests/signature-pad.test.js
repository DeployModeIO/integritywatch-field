/* IntegrityWatch Field — signature pad smoke test
   Validates the module exposes createSignaturePad and downscaleDataUrl. */
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

require('../src/compat/file-guard.js');
require('../src/core/bus.js');
require('../src/i18n/locales/en.js');
require('../src/i18n/locales/es.js');
require('../src/i18n/i18n.js');
require('../src/components/signaturePad.js');

const IW = globalThis.IW;

test('signaturePad module exposes API', () => {
  assert.ok(IW.components && IW.components.signaturePad, 'IW.components.signaturePad exists');
  var api = IW.components.signaturePad;
  assert.equal(typeof api.createSignaturePad, 'function', 'createSignaturePad is a function');
  assert.equal(typeof api.downscaleDataUrl, 'function', 'downscaleDataUrl is a function');
});