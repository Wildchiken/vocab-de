import { SECURITY_HEADERS } from './headers.js';

const PULL_LIMIT = 1000;
const MAX_CHANGES = 500;
const MAX_BODY = 5 * 1024 * 1024;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) return withSecurityHeaders(await env.ASSETS.fetch(request));

    try {
      const owner = await authorize(request, env);
      if (!owner) return json({ error: 'unauthorized' }, 401);
      await ensureSchema(env);

      if (url.pathname === '/api/ping' && request.method === 'GET') {
        return json({ ok: true, mode: isOpen(env) ? 'open' : 'private' });
      }
      if (url.pathname === '/api/sync' && request.method === 'POST') {
        return json(await sync(env, owner, await readJson(request)));
      }
      return json({ error: 'not found' }, 404);
    } catch (err) {
      if (err instanceof HttpError) return json({ error: err.message }, err.status);
      console.error(err);
      return json({ error: 'server error' }, 500);
    }
  },
};

// Assets are served through the Worker (see run_worker_first) so they carry the same headers.
function withSecurityHeaders(res) {
  const out = new Response(res.body, res);
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) out.headers.set(name, value);
  return out;
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...SECURITY_HEADERS, 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
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

// Every sync token is its own library: the server keeps only a hash of it, and all rows carry
// that hash as their owner. Which tokens work is up to the operator:
//   SYNC_TOKEN / SYNC_TOKENS  a private list (comma or space separated), one library each
//   SYNC_OPEN=1               any token of 16+ characters opens its own library
const MIN_OPEN_TOKEN = 16;
const MAX_TOKEN = 128;
const MAX_RECORD_BYTES = 64 * 1024;
const MAX_RECORDS = 200_000;

const tokenList = (env) => [...new Set([env.SYNC_TOKEN, ...String(env.SYNC_TOKENS || '').split(/[\s,]+/)].filter(Boolean))];
const isOpen = (env) => /^(1|true|yes|on)$/i.test(String(env.SYNC_OPEN || ''));

const enc = new TextEncoder();
function sameToken(given, token) {
  const a = enc.encode(given);
  const b = enc.encode(token);
  return a.byteLength === b.byteLength && crypto.subtle.timingSafeEqual(a, b);
}

async function ownerOf(token) {
  const digest = await crypto.subtle.digest('SHA-256', enc.encode(token));
  return [...new Uint8Array(digest)].slice(0, 16).map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** The library this request may use, or null. */
async function authorize(request, env) {
  const allowed = tokenList(env);
  const open = isOpen(env);
  if (!allowed.length && !open) throw new HttpError(500, 'SYNC_TOKEN is not set');
  const given = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!given || given.length > MAX_TOKEN) return null;
  // compare against every token so the time taken doesn't reveal which one matched
  let ok = false;
  for (const token of allowed) if (sameToken(given, token)) ok = true;
  if (!ok && open && given.length >= MIN_OPEN_TOKEN) ok = true;
  return ok ? ownerOf(given) : null;
}

const ready = new WeakSet();

async function ensureSchema(env) {
  if (ready.has(env.DB)) return;
  await env.DB.batch([
    env.DB.prepare(
      `CREATE TABLE IF NOT EXISTS library (
        owner TEXT NOT NULL, kind TEXT NOT NULL, id TEXT NOT NULL, updated_at INTEGER NOT NULL,
        deleted INTEGER NOT NULL DEFAULT 0, data TEXT, seq INTEGER NOT NULL,
        PRIMARY KEY (owner, kind, id))`,
    ),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_library_seq ON library (owner, seq)'),
  ]);
  // Earlier versions had one shared table; its rows now belong to the SYNC_TOKEN library. The
  // old table is kept under another name in case a rollback is needed.
  const legacyTable = async () =>
    (await env.DB.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'records'").all()).results.length > 0;
  if (env.SYNC_TOKEN && (await legacyTable())) {
    const owner = await ownerOf(env.SYNC_TOKEN);
    try {
      await env.DB.batch([
        env.DB.prepare(
          `INSERT OR IGNORE INTO library (owner, kind, id, updated_at, deleted, data, seq)
           SELECT ?1, kind, id, updated_at, deleted, data, seq FROM records`,
        ).bind(owner),
        env.DB.prepare('ALTER TABLE records RENAME TO records_migrated'),
      ]);
    } catch (err) {
      // Another instance may have moved the table first; anything else is a real failure.
      if (await legacyTable()) throw err;
    }
  }
  ready.add(env.DB);
}

// Applies client changes (last write wins by updated_at), then returns rows with seq > since.
async function sync(env, owner, body) {
  const since = Number(body.since) || 0;
  const changes = Array.isArray(body.changes) ? body.changes : [];
  if (changes.length > MAX_CHANGES) throw new HttpError(413, `at most ${MAX_CHANGES} changes per request`);

  if (changes.length) {
    const { results } = await env.DB.prepare('SELECT COUNT(*) AS n FROM library WHERE owner = ?1').bind(owner).all();
    if (results[0].n + changes.length > MAX_RECORDS) throw new HttpError(413, 'library is full');
  }

  const upsert = env.DB.prepare(
    `INSERT INTO library (owner, kind, id, updated_at, deleted, data, seq)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, (SELECT COALESCE(MAX(seq), 0) + 1 FROM library WHERE owner = ?1))
     ON CONFLICT (owner, kind, id) DO UPDATE SET
       updated_at = excluded.updated_at, deleted = excluded.deleted,
       data = excluded.data, seq = excluded.seq
     WHERE excluded.updated_at > library.updated_at`,
  );
  const stmts = [];
  for (const c of changes) {
    if (!['word', 'log', 'settings'].includes(c.kind) || typeof c.id !== 'string' || c.id.length > 200) continue;
    const data = JSON.stringify(c.data ?? null);
    if (data.length > MAX_RECORD_BYTES) continue;
    stmts.push(upsert.bind(owner, c.kind, c.id, Number(c.updated_at) || 0, c.deleted ? 1 : 0, data));
  }
  for (let i = 0; i < stmts.length; i += 100) await env.DB.batch(stmts.slice(i, i + 100));

  const { results } = await env.DB.prepare(
    'SELECT kind, id, updated_at, deleted, data, seq FROM library WHERE owner = ?1 AND seq > ?2 ORDER BY seq LIMIT ?3',
  )
    .bind(owner, since, PULL_LIMIT)
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
