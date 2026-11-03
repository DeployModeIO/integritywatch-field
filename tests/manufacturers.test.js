/* IntegrityWatch Field — manufacturers data (D-catálogo OEM)
    Anchors: API 610 (pumps), API 526 (PSV), API 618 (recip compressors),
    API 617 (centrifugal/expanders). Pure factual catalogue, no brand marks. */
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const manufacturers = require('../src/data/manufacturers.js');

const SCOPE_BOMBA = 'bomba-api610';
const SCOPE_PSV = 'psv-api526';
const SCOPE_COMP = 'compresor-api618';
const SCOPE_TURB = 'turbo-expansor';

const VALID_SCOPES = [SCOPE_BOMBA, SCOPE_PSV, SCOPE_COMP, SCOPE_TURB];
const CORE_STANDARDS = ['API 610', 'API 526', 'API 618'];

// Slug: lowercase ascii, digits, single internal hyphens, no leading/trailing hyphen.
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

test('M.a SCOPES exposes the four catalogue scopes', () => {
  assert.ok(Array.isArray(manufacturers.SCOPES), 'SCOPES is an array');
  for (const s of VALID_SCOPES) {
    assert.ok(manufacturers.SCOPES.indexOf(s) !== -1, 'SCOPES contains ' + s);
  }
});

test('M.b at least 14 manufacturers in the catalogue', () => {
  const all = manufacturers.list();
  assert.ok(Array.isArray(all), 'list() returns array');
  assert.ok(all.length >= 14, 'at least 14 manufacturers, got ' + all.length);
});

test('M.c list(bomba-api610) returns at least 8 entries', () => {
  const pumps = manufacturers.list(SCOPE_BOMBA);
  assert.ok(Array.isArray(pumps), 'list returns array');
  assert.ok(pumps.length >= 8, 'at least 8 API 610 pump makers, got ' + pumps.length);
  for (const m of pumps) {
    assert.ok(m.scopes.indexOf(SCOPE_BOMBA) !== -1, 'list(' + SCOPE_BOMBA + ') only returns that scope');
  }
});

test('M.d every scope returns a non-empty list', () => {
  for (const s of VALID_SCOPES) {
    assert.ok(manufacturers.list(s).length > 0, 'scope ' + s + ' has entries');
  }
});

test('M.e list of unknown scope returns empty array', () => {
  assert.deepEqual(manufacturers.list('no-existe'), [], 'unknown scope -> []');
});

test('M.f ids are unique slugs (lowercase, no accents)', () => {
  const seen = new Set();
  for (const m of manufacturers.list()) {
    assert.equal(typeof m.id, 'string', 'id is string');
    assert.ok(SLUG_RE.test(m.id), 'id "' + m.id + '" is a lowercase accent-free slug');
    assert.ok(m.id.indexOf(' ') === -1, 'id has no spaces');
    assert.ok(m.id === m.id.normalize('NFD').replace(/[̀-ͯ]/g, ''), 'id has no accents');
    assert.ok(!seen.has(m.id), 'id ' + m.id + ' is unique');
    seen.add(m.id);
  }
});

test('M.g every entry is complete with no undefined fields', () => {
  for (const m of manufacturers.list()) {
    assert.equal(typeof m.name, 'string', m.id + ' name is string');
    assert.ok(m.name.length > 0, m.id + ' name non-empty');
    assert.equal(typeof m.country, 'string', m.id + ' country is string');
    assert.ok(m.country.length > 0, m.id + ' country non-empty');
    assert.ok(Array.isArray(m.scopes) && m.scopes.length > 0, m.id + ' scopes non-empty array');
    assert.ok(Array.isArray(m.families) && m.families.length > 0, m.id + ' families non-empty array');
    for (const s of m.scopes) {
      assert.ok(VALID_SCOPES.indexOf(s) !== -1, m.id + ' scope "' + s + '" is valid');
    }
    for (const f of m.families) {
      assert.equal(typeof f.model, 'string', m.id + ' family model is string');
      assert.ok(f.model.length > 0, m.id + ' family model non-empty');
      assert.equal(typeof f.standard, 'string', m.id + ' family standard is string');
      assert.ok(f.standard.length > 0, m.id + ' family standard non-empty');
      if (f.notes !== undefined) {
        assert.equal(typeof f.notes, 'string', m.id + ' notes is string when present');
      }
      // No undefined leaking into any declared field.
      assert.notEqual(f.model, undefined, m.id + ' model not undefined');
      assert.notEqual(f.standard, undefined, m.id + ' standard not undefined');
    }
  }
});

test('M.h each entry has >=1 family on an API 610/526/618 core standard', () => {
  for (const m of manufacturers.list()) {
    const hasCore = m.families.some(function (f) {
      return CORE_STANDARDS.indexOf(f.standard) !== -1;
    });
    assert.ok(hasCore, m.id + ' must carry at least one API 610/526/618 family');
  }
});

test('M.i find() round-trips every id and returns null for unknown', () => {
  for (const m of manufacturers.list()) {
    const got = manufacturers.find(m.id);
    assert.ok(got, 'find(' + m.id + ') returns an entry');
    assert.equal(got.id, m.id, 'round-trip id matches');
    assert.equal(got.name, m.name, 'round-trip name matches');
  }
  assert.equal(manufacturers.find('does-not-exist'), null, 'unknown id -> null');
});

test('M.j byModel("OH2") finds pump families', () => {
  const hits = manufacturers.byModel('OH2');
  assert.ok(Array.isArray(hits), 'byModel returns array');
  assert.ok(hits.length >= 1, 'byModel("OH2") returns results, got ' + hits.length);
  const anyOh2 = hits.some(function (m) {
    return m.families.some(function (f) { return /oh2/i.test(f.model); });
  });
  assert.ok(anyOh2, 'a hit truly contains an OH2 family');
});

test('M.k byModel is case and accent insensitive and matches API classes', () => {
  assert.ok(manufacturers.byModel('api 526').length >= 1, 'byModel("api 526") finds PSV makers');
  assert.ok(manufacturers.byModel('BB3').length >= 1, 'byModel("BB3") finds multistage pumps');
  assert.ok(manufacturers.byModel('bb3').length >= 1, 'lowercase query matches');
  assert.equal(manufacturers.byModel('').length, 0, 'empty query -> no results');
});

test('M.l the catalogue covers all four scopes across entries', () => {
  const covered = {};
  for (const m of manufacturers.list()) {
    for (const s of m.scopes) { covered[s] = true; }
  }
  for (const s of VALID_SCOPES) {
    assert.ok(covered[s], 'scope ' + s + ' is represented in the catalogue');
  }
});
