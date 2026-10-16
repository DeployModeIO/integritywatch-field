/* IntegrityWatch Field — i18n tests (T2a)
   Anchors: TESTS.md §13 (locale parity, t fallback/interpolation, storage) and
   CONTRACTS.md §4.11 (IW.i18n public API). */
'use strict';

const { test, before } = require('node:test');
const assert = require('node:assert/strict');

const en = require('../src/i18n/locales/en.js');
const es = require('../src/i18n/locales/es.js');
const pt = require('../src/i18n/locales/pt.js');
const i18n = require('../src/i18n/i18n.js');

// Shared fake dependencies (Map storage so setLocale persists without DOM/localStorage).
const storage = new Map();
const events = [];
const bus = { emit: function (evt, payload) { events.push({ evt: evt, payload: payload }); } };

before(async () => {
  await i18n.init({ locales: globalThis.IW_LOCALES, bus: bus, storage: storage });
});

// Collect every leaf key (string value) as a dotted path, ignoring the __meta subtree.
function keySet(obj) {
  const out = new Set();
  (function walk(node, prefix) {
    for (const key of Object.keys(node)) {
      if (key === '__meta') { continue; }
      const path = prefix ? prefix + '.' + key : key;
      const val = node[key];
      if (val !== null && typeof val === 'object') {
        walk(val, path);
      } else {
        out.add(path);
      }
    }
  })(obj, '');
  return out;
}

function assertSameKeys(a, b, label) {
  assert.equal(a.size, b.size, label + ': key count mismatch (' + a.size + ' vs ' + b.size + ')');
  for (const key of a) {
    assert.ok(b.has(key), label + ': missing key "' + key + '"');
  }
}

test('T2a.a deep key parity en/es/pt and inventory size > 330', () => {
  assert.deepEqual(en.__meta, { code: 'en', name: 'English', nativeName: 'English', dir: 'ltr' });
  assert.deepEqual(es.__meta, { code: 'es', name: 'Spanish', nativeName: 'Español', dir: 'ltr' });
  assert.deepEqual(pt.__meta, { code: 'pt', name: 'Portuguese', nativeName: 'Português', dir: 'ltr' });

  const enKeys = keySet(en);
  const esKeys = keySet(es);
  const ptKeys = keySet(pt);

  assertSameKeys(enKeys, esKeys, 'en vs es');
  assertSameKeys(enKeys, ptKeys, 'en vs pt');

  assert.ok(enKeys.size > 330, 'expected >330 leaf keys, got ' + enKeys.size);
});

test('T2a.b t() nested resolution and en/raw fallback', () => {
  i18n.setLocale('en');
  assert.equal(i18n.t('common.appName'), 'IntegrityWatch Field');
  assert.equal(i18n.t('nav.dashboard'), 'Dashboard');
  assert.equal(i18n.t('corrosion.sensorTypes.erProbe'), 'ER probe');
  assert.equal(i18n.t('apm.categories.hydrodesulfurization'), 'Hydrodesulfurization');

  // Key present in en but deliberately resolvable in es too (all three carry full inventory).
  i18n.setLocale('es');
  assert.equal(i18n.t('nav.dashboard'), 'Panel');

  // Unknown key -> raw key returned.
  assert.equal(i18n.t('no.such.key.deep'), 'no.such.key.deep');
});

test('T2a.c t() interpolates {{param}} as plain text', () => {
  i18n.setLocale('en');
  assert.equal(
    i18n.t('rules.msg.R1', { code: 'MP-CORR-001', cr: '12.4' }),
    'MP-CORR-001: corrosion rate 12.4 mpy exceeds 10 mpy in the last 24 h'
  );
  assert.equal(
    i18n.t('rules.msg.R11', { name: 'PUMP-02', pct: '85', threshold: '90' }),
    'PUMP-02: availability 85% below threshold 90%'
  );
  // Missing params leave the placeholder untouched.
  assert.equal(
    i18n.t('rules.msg.R1', {}),
    '{{code}}: corrosion rate {{cr}} mpy exceeds 10 mpy in the last 24 h'
  );
  // No params at all must not throw.
  assert.equal(i18n.t('common.save'), 'Save');
});

test('T2a.d setLocale persists to Map storage, emits event, no DOM crash', () => {
  i18n.setLocale('es');
  assert.equal(i18n.getLocale(), 'es');
  assert.equal(storage.get('iw.locale'), 'es');

  const evt = events[events.length - 1];
  assert.equal(evt.evt, 'locale:changed');
  assert.deepEqual(evt.payload, { locale: 'es' });

  // Invalid code falls back to en and persists en.
  i18n.setLocale('zz');
  assert.equal(i18n.getLocale(), 'en');
  assert.equal(storage.get('iw.locale'), 'en');
});

test('T2a.e listLocales reflects registered locales', () => {
  const list = i18n.listLocales();
  assert.equal(list.length, 3);
  const byCode = {};
  for (const entry of list) { byCode[entry.code] = entry; }
  assert.deepEqual(byCode.en, { code: 'en', name: 'English', nativeName: 'English', dir: 'ltr' });
  assert.deepEqual(byCode.es, { code: 'es', name: 'Spanish', nativeName: 'Español', dir: 'ltr' });
  assert.deepEqual(byCode.pt, { code: 'pt', name: 'Portuguese', nativeName: 'Português', dir: 'ltr' });
});

test('T2a.f formatNumber/formatDate use current locale', () => {
  i18n.setLocale('en');
  assert.equal(i18n.formatNumber(1234.5), '1,234.5');
  i18n.setLocale('es');
  // CLDR: es groups only at 5+ integer digits, so 1234.5 -> '1234,5' (comma decimal).
  assert.equal(i18n.formatNumber(1234.5), '1234,5');
  i18n.setLocale('pt');
  assert.equal(i18n.formatNumber(1234.5), '1.234,5');

  i18n.setLocale('en');
  const d = i18n.formatDate('2026-10-15T00:00:00Z', {
    timeZone: 'UTC', year: 'numeric', month: 'short', day: 'numeric'
  });
  assert.equal(typeof d, 'string');
  assert.ok(d.indexOf('2026') !== -1, 'formatted date should contain the year');
});
