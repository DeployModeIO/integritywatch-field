/* IntegrityWatch Field — offline sync queue (CONTRACTS §4.9, SCHEMA §9) */
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const dbMemory = require('../src/core/dbMemory.js');
const syncQueue = require('../src/core/syncQueue.js');

function freshAdapter() {
  return dbMemory.create();
}

test('syncQueue enqueue persists to mutationQueue and pending() counts', async () => {
  const adapter = freshAdapter();
  syncQueue.__setOnline(() => true);
  await syncQueue.init({ adapter, getEndpoint: () => null });
  assert.equal(syncQueue.pending(), 0);

  await syncQueue.enqueue({ type: 'put', store: 'readings', rec: { id: 'r1' } });
  assert.equal(syncQueue.pending(), 1);

  const rows = await adapter.getAll('mutationQueue');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].op.store, 'readings');
  assert.equal(rows[0].op.rec.id, 'r1');
  assert.equal(rows[0].attempts, 0);
  assert.equal(rows[0].dead, false);
});

test('syncQueue flush with no endpoint stays latent (0 cost)', async () => {
  const adapter = freshAdapter();
  let called = false;
  syncQueue.__setFetch(() => { called = true; return Promise.resolve({ ok: true }); });
  syncQueue.__setOnline(() => true);
  await syncQueue.init({ adapter, getEndpoint: () => null });
  await syncQueue.enqueue({ type: 'put', store: 'readings', rec: { id: 'r1' } });

  const result = await syncQueue.flush();
  assert.equal(result.sent, 0);
  assert.equal(result.failed, 0);
  assert.equal(called, false);
  assert.equal(syncQueue.pending(), 1);
});

test('syncQueue flush when offline is a no-op', async () => {
  const adapter = freshAdapter();
  let called = false;
  syncQueue.__setFetch(() => { called = true; return Promise.resolve({ ok: true }); });
  syncQueue.__setOnline(() => false);
  await syncQueue.init({ adapter, getEndpoint: () => 'https://example.com/sync' });
  await syncQueue.enqueue({ type: 'put', store: 'readings', rec: { id: 'r1' } });

  const result = await syncQueue.flush();
  assert.equal(result.sent, 0);
  assert.equal(result.failed, 0);
  assert.equal(called, false);
});

test('syncQueue flush POSTs JSON via injected fetch and marks sentISO on success', async () => {
  const adapter = freshAdapter();
  const posted = [];
  syncQueue.__setFetch((url, init) => {
    posted.push({ url, init });
    return Promise.resolve({ ok: true, status: 200 });
  });
  syncQueue.__setScheduler(() => {}); // no-op to avoid stray timers
  syncQueue.__setOnline(() => true);
  await syncQueue.init({ adapter, getEndpoint: () => 'https://example.com/sync' });
  await syncQueue.enqueue({ type: 'put', store: 'readings', rec: { id: 'r1', crMpy: 3.2 } });

  assert.equal(syncQueue.pending(), 1);
  const result = await syncQueue.flush();
  assert.equal(result.sent, 1);
  assert.equal(result.failed, 0);
  assert.equal(posted.length, 1);
  assert.equal(posted[0].url, 'https://example.com/sync');
  assert.equal(posted[0].init.method, 'POST');
  assert.equal(JSON.parse(posted[0].init.body).type, 'put');
  assert.equal(syncQueue.pending(), 0);

  const rows = await adapter.getAll('mutationQueue');
  assert.ok(rows[0].sentISO);
  assert.equal(rows[0].dead, false);
});

test('syncQueue failure backoff 1s/5s/30s and dead after 5 attempts', async () => {
  const adapter = freshAdapter();
  syncQueue.__setFetch(() => Promise.resolve({ ok: false, status: 500 }));
  const scheduled = [];
  syncQueue.__setScheduler((cb, ms) => { scheduled.push(ms); }); // record, do not fire
  syncQueue.__setOnline(() => true);
  await syncQueue.init({ adapter, getEndpoint: () => 'https://example.com/sync' });
  await syncQueue.enqueue({ type: 'put', store: 'readings', rec: { id: 'r1' } });

  for (let i = 0; i < 5; i++) {
    await syncQueue.flush();
  }

  assert.deepEqual(scheduled, [1000, 5000, 30000, 30000]);
  const rows = await adapter.getAll('mutationQueue');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].attempts, 5);
  assert.equal(rows[0].dead, true);
  assert.equal(syncQueue.pending(), 0);
});

test('syncQueue validateEndpoint allows https and loopback http only', () => {
  assert.equal(syncQueue.validateEndpoint('https://example.com/sync'), true);
  assert.equal(syncQueue.validateEndpoint('http://localhost:8080/sync'), true);
  assert.equal(syncQueue.validateEndpoint('http://127.0.0.1/sync'), true);
  assert.equal(syncQueue.validateEndpoint('http://[::1]:8080/sync'), true);
  assert.equal(syncQueue.validateEndpoint('http://example.com/sync'), false);
  assert.equal(syncQueue.validateEndpoint('ftp://example.com/sync'), false);
  assert.equal(syncQueue.validateEndpoint(''), false);
  assert.equal(syncQueue.validateEndpoint(null), false);
  assert.equal(syncQueue.validateEndpoint('not a url'), false);
});

test('syncQueue redacts userinfo from the insecure-endpoint log', async () => {
  const adapter = freshAdapter();
  syncQueue.__setOnline(() => true);
  await syncQueue.init({ adapter, getEndpoint: () => 'http://user:secret@example.com/sync' });
  await syncQueue.enqueue({ type: 'put', store: 'readings', rec: { id: 'r1' } });

  const logged = [];
  const origError = console.error;
  console.error = function () { logged.push(Array.prototype.join.call(arguments, ' ')); };
  try {
    await syncQueue.flush();
  } finally {
    console.error = origError;
  }

  assert.ok(logged.length >= 1, 'expected an insecure-endpoint log');
  const all = logged.join(' ');
  assert.ok(!all.includes('user:secret'), 'userinfo must be redacted');
  assert.ok(!all.includes('/sync'), 'path must be redacted');
  assert.ok(all.includes('http://example.com'), 'protocol + host must be logged');
});
