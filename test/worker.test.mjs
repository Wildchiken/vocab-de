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
