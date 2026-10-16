/* IntegrityWatch Field — glossary & standards data (D1a)
   Anchors: SCHEMA.md §8.3 (glossary), §8.4 (standards). */
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const glossary = require('../src/data/glossary.js');
const standards = require('../src/data/standards.js');

const LOCALES = ['en', 'es', 'fr', 'zh', 'ru', 'ar', 'pt'];
const CATEGORIES = ['corrosion', 'psv', 'pipeline', 'apm', 'standards', 'data'];

test('D1a.a glossary exposes terms array with at least 40 terms', () => {
  assert.ok(Array.isArray(glossary.terms), 'terms is an array');
  assert.ok(glossary.terms.length >= 40, 'at least 40 terms, got ' + glossary.terms.length);
});

test('D1a.b term ids are unique and non-empty', () => {
  const ids = glossary.terms.map(function (t) { return t.id; });
  assert.equal(new Set(ids).size, ids.length, 'ids must be unique');
  for (const id of ids) {
    assert.equal(typeof id, 'string', 'id is a string');
    assert.ok(id.length > 0, 'id is non-empty');
  }
});

test('D1a.c every term has a valid category and all 6 categories are covered', () => {
  const seen = {};
  for (const t of glossary.terms) {
    assert.ok(CATEGORIES.indexOf(t.category) !== -1, 'invalid category ' + t.category + ' on ' + t.id);
    seen[t.category] = true;
  }
  for (const c of CATEGORIES) {
    assert.ok(seen[c], 'category ' + c + ' must be represented');
  }
});

test('D1a.d every term carries all 7 locales with non-empty term and definition', () => {
  for (const t of glossary.terms) {
    assert.equal(typeof t.standard, 'string', t.id + ' has a standard reference');
    assert.ok(t.standard.length > 0, t.id + ' standard reference non-empty');
    for (const loc of LOCALES) {
      const entry = t.i18n && t.i18n[loc];
      assert.ok(entry, t.id + ' missing locale ' + loc);
      assert.equal(typeof entry.term, 'string', t.id + ' ' + loc + ' term is string');
      assert.equal(typeof entry.definition, 'string', t.id + ' ' + loc + ' definition is string');
      assert.ok(entry.term.length > 0, t.id + ' ' + loc + ' term non-empty');
      assert.ok(entry.definition.length > 0, t.id + ' ' + loc + ' definition non-empty');
    }
  }
});

test('D1a.e byCategory filters to the requested category', () => {
  for (const c of CATEGORIES) {
    const filtered = glossary.byCategory(c);
    assert.ok(filtered.length > 0, 'category ' + c + ' returns results');
    for (const t of filtered) {
      assert.equal(t.category, c, 'byCategory(' + c + ') returned a term of category ' + t.category);
    }
  }
});

test('D1a.f search finds accented query in the requested locale', () => {
  const hits = glossary.search('corrosión', 'es');
  assert.ok(Array.isArray(hits), 'search returns an array');
  assert.ok(hits.length > 0, 'search("corrosión", "es") must find terms');
  for (const t of hits) {
    assert.ok(t.category === 'corrosion' || t.i18n.es.definition.indexOf('corrosión') !== -1, 'hit should be corrosion-related');
  }
});

test('D1a.g search is case-insensitive and accent-insensitive', () => {
  const accented = glossary.search('corrosión', 'es');
  const plain = glossary.search('corrosion', 'es');
  const upper = glossary.search('CORROSIÓN', 'es');
  assert.equal(accented.length, plain.length, 'accented and plain queries match');
  assert.equal(plain.length, upper.length, 'plain and uppercase queries match');
  assert.ok(plain.length > 0, 'case/accent-insensitive search returns results');
});

test('D1a.h search falls back to en for an unknown locale', () => {
  const hits = glossary.search('corrosion', 'xx');
  assert.ok(hits.length > 0, 'unknown locale falls back to en');
});

test('D1a.i standards catalogue has 33 entries with non-empty fields', () => {
  assert.ok(Array.isArray(standards.standards), 'standards is an array');
  assert.equal(standards.standards.length, 33, '33 standards entries');
  const ids = new Set();
  for (const s of standards.standards) {
    assert.equal(typeof s.id, 'string', 'id is string');
    assert.ok(s.id.length > 0, 'id non-empty');
    ids.add(s.id);
    assert.equal(typeof s.code, 'string', s.id + ' code is string');
    assert.ok(s.code.length > 0, s.id + ' code non-empty');
    assert.equal(typeof s.title, 'string', s.id + ' title is string');
    assert.ok(s.title.length > 0, s.id + ' title non-empty');
    assert.equal(typeof s.edition, 'string', s.id + ' edition is string');
    assert.ok(s.edition.length > 0, s.id + ' edition non-empty');
    assert.ok(Array.isArray(s.usedIn) && s.usedIn.length > 0, s.id + ' usedIn is a non-empty array');
  }
  assert.equal(ids.size, 33, 'standards ids unique');
});
