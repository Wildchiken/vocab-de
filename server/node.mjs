// Self-hosted server: serves public/ and the same /api as the Cloudflare Worker.
//   SYNC_TOKEN=... node server/node.mjs
// Environment: SYNC_TOKEN (enables sync), PORT (8787), HOST (0.0.0.0), DB_PATH (vocab-de.sqlite)
import { timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import worker from '../src/worker.js';
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

async function serveStatic(req, res) {
  let path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  if (path.endsWith('/')) path += 'index.html';
  const file = resolve(ROOT, `.${path}`);
  if (!file.startsWith(ROOT)) return res.writeHead(403).end();
  try {
    const body = await readFile(file);
    // The service worker does the offline caching; the browser should always revalidate.
    res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream', 'cache-control': 'no-cache' });
    res.end(body);
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
  res.writeHead(response.status, Object.fromEntries(response.headers));
  res.end(Buffer.from(await response.arrayBuffer()));
}

export function createApp(env) {
  return createServer((req, res) => {
    const handler = req.url.startsWith('/api/') ? serveApi(req, res, env) : serveStatic(req, res);
    handler.catch((err) => {
      console.error(err);
      if (!res.headersSent) res.writeHead(500);
      res.end();
    });
  });
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const env = { SYNC_TOKEN: process.env.SYNC_TOKEN, DB: openD1(process.env.DB_PATH || 'vocab-de.sqlite') };
  if (!env.SYNC_TOKEN) console.warn('SYNC_TOKEN is not set, so sync is off. The app itself still works.');
  const port = Number(process.env.PORT) || 8787;
  const host = process.env.HOST || '0.0.0.0';
  createApp(env).listen(port, host, () => console.log(`vocab-de on http://localhost:${port}`));
}
