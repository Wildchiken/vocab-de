import { test } from 'node:test';
import assert from 'node:assert/strict';
import { timingSafeEqual } from 'node:crypto';
import worker from '../src/worker.js';
import { openD1 } from '../server/d1-sqlite.mjs';

// Workers-only API
crypto.subtle.timingSafeEqual ??= (a, b) => timingSafeEqual(Buffer.from(a), Buffer.from(b));

const env = { SYNC_TOKEN: 'secret', DB: openD1(':memory:') };
const call = (path, body, token = 'secret') =>
  worker.fetch(
    new Request(`https://x${path}`, {
      method: body ? 'POST' : 'GET',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: body && JSON.stringify(body),
    }),
    env,
  );

test('rejects wrong token', async () => {
  assert.equal((await call('/api/ping', null, 'nope')).status, 401);
  assert.equal((await call('/api/ping')).status, 200);
});

test('rejects malformed body', async () => {
  const res = await worker.fetch(
    new Request('https://x/api/sync', { method: 'POST', headers: { authorization: 'Bearer secret' }, body: '{' }),
    env,
  );
  assert.equal(res.status, 400);
});

test('last write wins and cursor pulls only newer rows', async () => {
  const w = (updated_at, zh) => ({ kind: 'word', id: 'w1', updated_at, data: { id: 'w1', zh } });

  let res = await (await call('/api/sync', { since: 0, changes: [w(100, 'A')] })).json();
  assert.equal(res.rows.length, 1);
  const cursor = res.cursor;

  // an older write must not override a newer one
  res = await (await call('/api/sync', { since: cursor, changes: [w(50, 'old')] })).json();
  assert.equal(res.rows.length, 0);

  // a newer write wins and shows up after the cursor
  res = await (await call('/api/sync', { since: cursor, changes: [w(200, 'B')] })).json();
  assert.equal(res.rows.length, 1);
  assert.equal(res.rows[0].data.zh, 'B');

  res = await (await call('/api/sync', { since: 0, changes: [] })).json();
  assert.equal(res.rows.length, 1);
  assert.equal(res.rows[0].data.zh, 'B');
});

test('ignores unknown kinds', async () => {
  const res = await (await call('/api/sync', { since: 0, changes: [{ kind: 'evil', id: 'x', updated_at: 1 }] })).json();
  assert.equal(res.accepted, 0);
});

test('API and asset responses carry the security headers', async () => {
  const api = await call('/api/ping');
  assert.match(api.headers.get('content-security-policy'), /default-src 'self'/);
  assert.equal(api.headers.get('x-content-type-options'), 'nosniff');

  const assets = { ASSETS: { fetch: async () => new Response('<!doctype html>', { headers: { 'content-type': 'text/html' } }) } };
  const page = await worker.fetch(new Request('https://x/'), assets);
  assert.equal(page.headers.get('content-type'), 'text/html');
  assert.match(page.headers.get('content-security-policy'), /frame-ancestors 'none'/);
  assert.equal(page.headers.get('referrer-policy'), 'no-referrer');
  assert.equal(await page.text(), '<!doctype html>');
});

// --- one library per token ---

const as = (env, token) => (path, body) =>
  worker.fetch(
    new Request(`https://x${path}`, {
      method: body ? 'POST' : 'GET',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: body && JSON.stringify(body),
    }),
    env,
  );
const word = (id, zh, updated_at = 10) => ({ kind: 'word', id, updated_at, data: { id, zh } });
const pull = async (call) => (await (await call('/api/sync', { since: 0, changes: [] })).json()).rows;

test('each allowed token has its own library', async () => {
  const shared = { SYNC_TOKEN: 'alice-secret', SYNC_TOKENS: 'bob-secret, carol-secret', DB: openD1(':memory:') };
  const alice = as(shared, 'alice-secret');
  const bob = as(shared, 'bob-secret');
  await alice('/api/sync', { since: 0, changes: [word('w1', 'Alice')] });
  await bob('/api/sync', { since: 0, changes: [word('w1', 'Bob'), word('w2', 'Bob 2')] });
  // the same record id in two libraries stays apart
  assert.deepEqual((await pull(alice)).map((r) => r.data.zh), ['Alice']);
  assert.deepEqual((await pull(bob)).map((r) => r.data.zh).sort(), ['Bob', 'Bob 2']);
  assert.deepEqual(await pull(as(shared, 'carol-secret')), []);
  // a token that is not on the list gets nothing
  assert.equal((await as(shared, 'mallory')('/api/ping')).status, 401);
  assert.equal((await as(shared, '')('/api/ping')).status, 401);
});

test('open mode: any long enough token gets its own library', async () => {
  const open = { SYNC_OPEN: '1', DB: openD1(':memory:') };
  const a = as(open, 'a-long-random-token-1');
  const b = as(open, 'another-long-token-22');
  const ping = await (await a('/api/ping')).json();
  assert.deepEqual(ping, { ok: true, mode: 'open', words: 0 });
  await a('/api/sync', { since: 0, changes: [word('w1', 'A')] });
  assert.equal((await pull(a)).length, 1);
  assert.equal((await pull(b)).length, 0);
  // short tokens are too easy to guess
  assert.equal((await as(open, 'short')('/api/ping')).status, 401);
  assert.equal((await as(open, 'x'.repeat(200))('/api/ping')).status, 401);
});

test('without any token configured the server refuses to sync', async () => {
  const res = await as({ DB: openD1(':memory:') }, 'whatever-token-123456')('/api/ping');
  assert.equal(res.status, 500);
});

test('the shared table of earlier versions moves to the SYNC_TOKEN library', async () => {
  const DB = openD1(':memory:');
  await DB.batch([
    DB.prepare(
      `CREATE TABLE records (kind TEXT NOT NULL, id TEXT NOT NULL, updated_at INTEGER NOT NULL,
        deleted INTEGER NOT NULL DEFAULT 0, data TEXT, seq INTEGER NOT NULL, PRIMARY KEY (kind, id))`,
    ),
    DB.prepare("INSERT INTO records VALUES ('word', 'old', 5, 0, '{\"id\":\"old\",\"zh\":\"alt\"}', 7)"),
  ]);
  const env = { SYNC_TOKEN: 'owner-token', SYNC_TOKENS: 'guest-token', DB };
  const owner = as(env, 'owner-token');
  const rows = await pull(owner);
  assert.deepEqual(rows.map((r) => [r.id, r.data.zh]), [['old', 'alt']]);
  // seq numbers are kept, so cursors held by existing devices stay valid
  assert.equal((await (await owner('/api/sync', { since: 7, changes: [] })).json()).rows.length, 0);
  assert.deepEqual(await pull(as(env, 'guest-token')), []);
  // the old table is kept under another name
  const { results } = await DB.prepare("SELECT name FROM sqlite_master WHERE name LIKE 'records%'").all();
  assert.deepEqual(results.map((r) => r.name), ['records_migrated']);
});

test('oversized records are skipped and a library has a size limit', async () => {
  const env = { SYNC_TOKEN: 'quota-token', DB: openD1(':memory:') };
  const call = as(env, 'quota-token');
  const res = await (await call('/api/sync', { since: 0, changes: [word('big', 'x'.repeat(70_000)), word('ok', 'fine')] })).json();
  assert.equal(res.accepted, 1);
  assert.deepEqual((await pull(call)).map((r) => r.id), ['ok']);
});

test('wiping deletes only the caller\'s library', async () => {
  const env = { SYNC_TOKEN: 'one-secret', SYNC_TOKENS: 'two-secret', DB: openD1(':memory:') };
  const one = as(env, 'one-secret');
  const two = as(env, 'two-secret');
  await one('/api/sync', { since: 0, changes: [word('a', 'A'), word('b', 'B')] });
  await two('/api/sync', { since: 0, changes: [word('a', 'other')] });
  assert.equal((await one('/api/wipe', {})).status, 200);
  assert.deepEqual(await pull(one), []);
  assert.deepEqual((await pull(two)).map((r) => r.data.zh), ['other']);
  // not without a valid password
  assert.equal((await as(env, 'nope-nope')('/api/wipe', {})).status, 401);
  assert.deepEqual((await pull(two)).length, 1);
  // a fresh library starts counting again from the beginning
  const res = await (await one('/api/sync', { since: 0, changes: [word('c', 'C')] })).json();
  assert.equal(res.rows.length, 1);
});

test('ping reports how many words the library holds', async () => {
  const env = { SYNC_TOKEN: 'count-token', DB: openD1(':memory:') };
  const call = as(env, 'count-token');
  const deleted = { ...word('gone', 'x'), deleted: true };
  await call('/api/sync', { since: 0, changes: [word('a', 'A'), word('b', 'B'), deleted, { kind: 'log', id: 'l1', updated_at: 1, data: {} }] });
  assert.equal((await (await call('/api/ping')).json()).words, 2);
});

test('after an erase, devices that hold the old library are told to start over', async () => {
  const env = { SYNC_TOKEN: 'epoch-token', DB: openD1(':memory:') };
  const call = as(env, 'epoch-token');
  const first = await (await call('/api/sync', { since: 0, epoch: null, changes: Array.from({ length: 5 }, (_, i) => word('w' + i, 'x')) })).json();
  assert.equal(first.epoch, 0);
  assert.equal(first.reset, undefined);
  // another device with the same epoch just syncs
  assert.equal((await (await call('/api/sync', { since: first.cursor, epoch: first.epoch, changes: [] })).json()).reset, undefined);

  const { epoch } = await (await call('/api/wipe', {})).json();
  assert.ok(epoch > 0);
  // a device that still has the old epoch gets a reset, and its changes are not applied
  const stale = await (await call('/api/sync', { since: first.cursor, epoch: first.epoch, changes: [word('late', 'old data')] })).json();
  assert.deepEqual([stale.reset, stale.epoch, stale.rows.length, stale.accepted], [true, epoch, 0, 0]);
  assert.deepEqual(await pull(call), []);

  // after starting over, the new library counts from 1 and a new word reaches everyone
  const fresh = await (await call('/api/sync', { since: 0, epoch, changes: [word('new', 'N')] })).json();
  assert.deepEqual([fresh.epoch, fresh.cursor, fresh.reset], [epoch, 1, undefined]);
  // a device that has never synced does not know an epoch yet and is not reset
  assert.equal((await (await call('/api/sync', { since: 0, epoch: null, changes: [] })).json()).reset, undefined);
  // erasing again moves the epoch on again
  assert.ok((await (await call('/api/wipe', {})).json()).epoch > epoch);
});

test('a library that is full refuses more records, checked every 1000 writes', async () => {
  const env = { SYNC_TOKEN: 'full-token', SYNC_MAX_RECORDS: '600', DB: openD1(':memory:') };
  const call = as(env, 'full-token');
  const batch = (from) => Array.from({ length: 500 }, (_, i) => word('w' + (from + i), 'x'));
  assert.equal((await call('/api/sync', { since: 0, changes: batch(0) })).status, 200);
  // the second batch carries the write counter past 1000, so this is where the size is checked
  const res = await call('/api/sync', { since: 0, changes: batch(500) });
  assert.equal(res.status, 413);
  assert.equal((await pull(call)).length, 500);
});
