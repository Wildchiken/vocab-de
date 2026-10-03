import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../server/node.mjs';
import { openD1 } from '../server/d1-sqlite.mjs';

let server;
let base;

before(async () => {
  server = createApp({ SYNC_TOKEN: 'secret', DB: openD1(':memory:') });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

test('serves the app', async () => {
  const res = await fetch(`${base}/`);
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /text\/html/);
  const js = await fetch(`${base}/js/app.js`);
  assert.match(js.headers.get('content-type'), /javascript/);
});

test('does not serve files outside public/', async () => {
  const res = await fetch(`${base}/..%2fpackage.json`);
  assert.equal(res.status, 403);
  assert.equal((await fetch(`${base}/package.json`)).status, 404);
});

test('exposes the sync API', async () => {
  assert.equal((await fetch(`${base}/api/ping`)).status, 401);
  const ok = await fetch(`${base}/api/ping`, { headers: { authorization: 'Bearer secret' } });
  assert.deepEqual(await ok.json(), { ok: true, mode: 'private' });
  const res = await fetch(`${base}/api/sync`, {
    method: 'POST',
    headers: { authorization: 'Bearer secret', 'content-type': 'application/json' },
    body: JSON.stringify({ since: 0, changes: [{ kind: 'word', id: 'a', updated_at: 1, data: { id: 'a' } }] }),
  });
  assert.equal((await res.json()).rows.length, 1);
});

test('sends a strict content security policy with the pages and the API', async () => {
  for (const path of ['/', '/js/app.js', '/api/ping']) {
    const res = await fetch(`${base}${path}`);
    const csp = res.headers.get('content-security-policy');
    assert.match(csp, /script-src 'self'/, path);
    assert.doesNotMatch(csp, /unsafe-/, path);
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff', path);
  }
});
