// Self-hosted server: serves public/ and the same /api as the Cloudflare Worker.
//   SYNC_TOKEN=... node server/node.mjs
// Environment: SYNC_TOKEN / SYNC_TOKENS (private list of sync tokens, one library each),
// SYNC_OPEN=1 (any token of 16+ characters gets its own library), PORT (8787), HOST (0.0.0.0),
// DB_PATH (vocab-de.sqlite)
import { createHash, timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { brotliCompressSync, gzipSync } from 'node:zlib';
import worker from '../src/worker.js';
import { SECURITY_HEADERS } from '../src/headers.js';
import { openD1 } from './d1-sqlite.mjs';

crypto.subtle.timingSafeEqual ??= (a, b) => timingSafeEqual(Buffer.from(a), Buffer.from(b));

const ROOT = fileURLToPath(new URL('../public/', import.meta.url));
const MAX_BODY = 5 * 1024 * 1024;
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
};

const COMPRESSIBLE = /^(text\/|application\/(json|manifest\+json|javascript)|image\/svg)/;
const compressed = new Map(); // etag → { gzip, br }, so each version of a file is compressed once

const acceptedEncoding = (req) => {
  const accepted = String(req.headers['accept-encoding'] || '');
  return /\bbr\b/.test(accepted) ? 'br' : /\bgzip\b/.test(accepted) ? 'gzip' : null;
};

async function serveStatic(req, res) {
  let path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  if (path.endsWith('/')) path += 'index.html';
  const file = resolve(ROOT, `.${path}`);
  if (!file.startsWith(ROOT)) return res.writeHead(403).end();
  try {
    const body = await readFile(file);
    const type = TYPES[extname(file)] || 'application/octet-stream';
    // The service worker does the offline caching. Otherwise the browser revalidates every time,
    // which costs a 304 with no body when nothing changed.
    const etag = `"${createHash('sha1').update(body).digest('base64url').slice(0, 20)}"`;
    const headers = { 'content-type': type, 'cache-control': 'no-cache', etag, vary: 'Accept-Encoding' };
    const known = String(req.headers['if-none-match'] || '').split(',').map((v) => v.trim().replace(/^W\//, ''));
    if (known.includes(etag)) return res.writeHead(304, headers).end();
    const encoding = body.length > 1024 && COMPRESSIBLE.test(type) ? acceptedEncoding(req) : null;
    let out = body;
    if (encoding) {
      const slot = compressed.get(etag) ?? {};
      slot[encoding] ??= encoding === 'br' ? brotliCompressSync(body) : gzipSync(body);
      compressed.set(etag, slot);
      if (compressed.size > 200) compressed.delete(compressed.keys().next().value);
      out = slot[encoding];
      headers['content-encoding'] = encoding;
    }
    res.writeHead(200, { ...headers, 'content-length': out.length });
    res.end(out);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain' }).end('not found');
  }
}

async function serveApi(req, res, env) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY) return res.writeHead(413).end();
    chunks.push(chunk);
  }
  const headers = {};
  for (const name of ['authorization', 'content-type']) if (req.headers[name]) headers[name] = req.headers[name];
  const request = new Request(new URL(req.url, 'http://localhost'), {
    method: req.method,
    headers,
    body: req.method === 'GET' || req.method === 'HEAD' ? undefined : Buffer.concat(chunks),
  });
  const response = await worker.fetch(request, env);
  let out = Buffer.from(await response.arrayBuffer());
  const reply = { ...Object.fromEntries(response.headers), vary: 'Accept-Encoding' };
  // gzip rather than brotli here: these responses are different every time
  if (out.length > 1024 && /\bgzip\b/.test(String(req.headers['accept-encoding'] || ''))) {
    out = gzipSync(out);
    reply['content-encoding'] = 'gzip';
  }
  res.writeHead(response.status, { ...reply, 'content-length': out.length });
  res.end(out);
}

export function createApp(env) {
  return createServer((req, res) => {
    for (const [name, value] of Object.entries(SECURITY_HEADERS)) res.setHeader(name, value);
    const handler = req.url.startsWith('/api/') ? serveApi(req, res, env) : serveStatic(req, res);
    handler.catch((err) => {
      console.error(err);
      if (!res.headersSent) res.writeHead(500);
      res.end();
    });
  });
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { SYNC_TOKEN, SYNC_TOKENS, SYNC_OPEN } = process.env;
  const env = { SYNC_TOKEN, SYNC_TOKENS, SYNC_OPEN, DB: openD1(process.env.DB_PATH || 'vocab-de.sqlite') };
  const tokens = [SYNC_TOKEN, ...String(SYNC_TOKENS || '').split(/[\s,]+/)].filter(Boolean);
  const open = /^(1|true|yes|on)$/i.test(String(SYNC_OPEN || ''));
  if (!tokens.length && !open) console.warn('No SYNC_TOKEN, SYNC_TOKENS or SYNC_OPEN is set, so sync is off. The app itself still works.');
  if (open) console.warn('SYNC_OPEN is on: anyone who can reach this server can create a library with a token of 16+ characters.');
  if (tokens.some((t) => t.length < 16)) console.warn('Some sync tokens are shorter than 16 characters. Use long random ones.');
  const port = Number(process.env.PORT) || 8787;
  const host = process.env.HOST || '0.0.0.0';
  createApp(env).listen(port, host, () => console.log(`vocab-de on http://localhost:${port}`));
}
