'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const engine = require('../src/app/assistant-engine.js');

test('parseCitations should return empty array for empty hits', () => {
  assert.deepEqual(engine.parseCitations([]), []);
  assert.deepEqual(engine.parseCitations(undefined), []);
});

test('parseCitations should skip hits without payload.source', () => {
  const hits = [
    { payload: { source: 'src1', section: 'sec1', text: 'text1' } },
    { payload: { section: 'sec2', text: 'text2' } },
    { payload: { source: 'src3', section: 'sec3', text: 'text3' } }
  ];
  assert.deepEqual(engine.parseCitations(hits), [
    { n: 1, source: 'src1', section: 'sec1' },
    { n: 2, source: 'src3', section: 'sec3' }
  ]);
});

test('parseCitations should assign sequential n to valid hits', () => {
  const hits = [
    { payload: { source: 'src1', section: 'sec1', text: 'text1' } },
    { payload: { source: 'src2', section: 'sec2', text: 'text2' } }
  ];
  assert.deepEqual(engine.parseCitations(hits), [
    { n: 1, source: 'src1', section: 'sec1' },
    { n: 2, source: 'src2', section: 'sec2' }
  ]);
});

test('buildPrompt should include question in user message', () => {
  const question = '¿Qué es JavaScript?';
  const hits = [
    { payload: { source: 'src1', section: 'sec1', text: 'text1' } }
  ];
  const { user } = engine.buildPrompt(question, hits);
  assert.ok(user.includes(question));
});

test('buildPrompt should include numbered citations with source and section', () => {
  const question = '¿Qué es JavaScript?';
  const hits = [
    { payload: { source: 'src1', section: 'sec1', text: 'text1' } },
    { payload: { source: 'src2', section: 'sec2', text: 'text2' } }
  ];
  const { user } = engine.buildPrompt(question, hits);
  assert.ok(user.includes('[1] (src1: sec1)\ntext1'));
  assert.ok(user.includes('[2] (src2: sec2)\ntext2'));
});

test('buildPrompt should truncate context to 6000 characters', () => {
  const question = '¿Qué es JavaScript?';
  const hits = [
    { payload: { source: 'src1', section: 'sec1', text: 'a'.repeat(2500) } },
    { payload: { source: 'src2', section: 'sec2', text: 'b'.repeat(2500) } },
    { payload: { source: 'src3', section: 'sec3', text: 'c'.repeat(2500) } }
  ];
  const { user, contextChars } = engine.buildPrompt(question, hits);
  assert.ok(contextChars > 5000 && contextChars <= 6000);
  assert.ok(user.includes('[1] (src1: sec1)'));
  assert.ok(user.includes('[2] (src2: sec2)'));
  assert.ok(!user.includes('[3] (src3: sec3)'));
});

test('buildPrompt should omit chunks that exceed the character limit', () => {
  const question = '¿Qué es JavaScript?';
  const hits = [
    { payload: { source: 'src1', section: 'sec1', text: 'a'.repeat(3000) } },
    { payload: { source: 'src2', section: 'sec2', text: 'b'.repeat(3000) } }
  ];
  const { user } = engine.buildPrompt(question, hits);
  assert.ok(user.includes('[1] (src1: sec1)'));
  assert.ok(!user.includes('[2] (src2: sec2)'));
});

test('friendlyError should return E_OFFLINE for network-related TypeError', () => {
  const err = new TypeError('fetch failed');
  assert.strictEqual(engine.friendlyError(err, null), 'E_OFFLINE');
});

test('friendlyError should return E_LLM for status >= 500', () => {
  const err = null;
  assert.strictEqual(engine.friendlyError(err, 503), 'E_LLM');
});

test('friendlyError should return E_QDRANT for 400 <= status < 500', () => {
  const err = null;
  assert.strictEqual(engine.friendlyError(err, 404), 'E_QDRANT');
});

test('friendlyError should return E_UNKNOWN for other cases', () => {
  const err = null;
  assert.strictEqual(engine.friendlyError(err, undefined), 'E_UNKNOWN');
  assert.strictEqual(engine.friendlyError(null, 200), 'E_UNKNOWN');
});
