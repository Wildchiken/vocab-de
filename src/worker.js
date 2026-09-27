const PULL_LIMIT = 1000;
const MAX_CHANGES = 500;
const MAX_BODY = 5 * 1024 * 1024;

let schemaReady = false;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request);

    try {
      if (!(await authorized(request, env))) return json({ error: 'unauthorized' }, 401);
      await ensureSchema(env);

      if (url.pathname === '/api/ping' && request.method === 'GET') {
        return json({ ok: true });
      }
      if (url.pathname === '/api/sync' && request.method === 'POST') {
        return json(await sync(env, await readJson(request)));
      }
      return json({ error: 'not found' }, 404);
    } catch (err) {
      if (err instanceof HttpError) return json({ error: err.message }, err.status);
      console.error(err);
      return json({ error: 'server error' }, 500);
    }
  },
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}

async function readJson(request) {
  if (Number(request.headers.get('content-length')) > MAX_BODY) throw new HttpError(413, 'request too large');
  try {
    return await request.json();
  } catch {
    throw new HttpError(400, 'invalid JSON');
  }
}

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

async function authorized(request, env) {
  if (!env.SYNC_TOKEN) throw new HttpError(500, 'SYNC_TOKEN is not set');
  const given = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  const enc = new TextEncoder();
  const a = enc.encode(given);
  const b = enc.encode(env.SYNC_TOKEN);
  if (a.byteLength !== b.byteLength) return false;
  return crypto.subtle.timingSafeEqual(a, b);
}

async function ensureSchema(env) {
  if (schemaReady) return;
  await env.DB.batch([
    env.DB.prepare(
      `CREATE TABLE IF NOT EXISTS records (
        kind TEXT NOT NULL, id TEXT NOT NULL, updated_at INTEGER NOT NULL,
        deleted INTEGER NOT NULL DEFAULT 0, data TEXT, seq INTEGER NOT NULL,
        PRIMARY KEY (kind, id))`,
    ),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_records_seq ON records (seq)'),
  ]);
  schemaReady = true;
}

// Applies client changes (last write wins by updated_at), then returns rows with seq > since.
async function sync(env, body) {
  const since = Number(body.since) || 0;
  const changes = Array.isArray(body.changes) ? body.changes : [];
  if (changes.length > MAX_CHANGES) throw new HttpError(413, `at most ${MAX_CHANGES} changes per request`);

  const upsert = env.DB.prepare(
    `INSERT INTO records (kind, id, updated_at, deleted, data, seq)
     VALUES (?1, ?2, ?3, ?4, ?5, (SELECT COALESCE(MAX(seq), 0) + 1 FROM records))
     ON CONFLICT (kind, id) DO UPDATE SET
       updated_at = excluded.updated_at, deleted = excluded.deleted,
       data = excluded.data, seq = excluded.seq
     WHERE excluded.updated_at > records.updated_at`,
  );
  const stmts = [];
  for (const c of changes) {
    if (!['word', 'log', 'settings'].includes(c.kind) || typeof c.id !== 'string') continue;
    stmts.push(
      upsert.bind(c.kind, c.id, Number(c.updated_at) || 0, c.deleted ? 1 : 0, JSON.stringify(c.data ?? null)),
    );
  }
  for (let i = 0; i < stmts.length; i += 100) await env.DB.batch(stmts.slice(i, i + 100));

  const { results } = await env.DB.prepare(
    'SELECT kind, id, updated_at, deleted, data, seq FROM records WHERE seq > ?1 ORDER BY seq LIMIT ?2',
  )
    .bind(since, PULL_LIMIT)
    .all();

  const rows = results.map((r) => ({
    kind: r.kind,
    id: r.id,
    updated_at: r.updated_at,
    deleted: Boolean(r.deleted),
    data: JSON.parse(r.data),
  }));
  const cursor = results.length ? results[results.length - 1].seq : since;
  return { rows, cursor, more: results.length === PULL_LIMIT, accepted: stmts.length };
}
