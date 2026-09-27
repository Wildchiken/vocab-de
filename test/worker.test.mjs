import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { timingSafeEqual } from 'node:crypto';
import worker from '../src/worker.js';

// Workers 专有的 API，Node 里补一下
crypto.subtle.timingSafeEqual ??= (a, b) => timingSafeEqual(Buffer.from(a), Buffer.from(b));

// 用 node:sqlite 模拟 D1 的最小接口
function fakeD1() {
  const db = new DatabaseSync(':memory:');
  const stmt = (sql, args = []) => ({
    bind: (...a) => stmt(sql, a),
    all: async () => ({ results: db.prepare(sql).all(...args) }),
    run: async () => db.prepare(sql).run(...args),
  });
  return {
    prepare: (sql) => stmt(sql),
    batch: async (list) => {
      db.exec('BEGIN');
      for (const s of list) await s.run();
      db.exec('COMMIT');
    },
  };
}

const env = { SYNC_TOKEN: 'secret', DB: fakeD1() };
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

  // 旧的改动不能覆盖新的
  res = await (await call('/api/sync', { since: cursor, changes: [w(50, 'old')] })).json();
  assert.equal(res.rows.length, 0);

  // 新的改动会覆盖，并且在游标之后能拉到
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
