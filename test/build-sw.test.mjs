import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';

test('service worker precaches every front-end file', () => {
  execFileSync(process.execPath, ['scripts/build-sw.mjs']);
  const sw = readFileSync('public/sw.js', 'utf8');
  const files = JSON.parse(sw.match(/const FILES = (\[[\s\S]*?\]);/)[1]);
  for (const f of readdirSync('public/js')) assert.ok(files.includes(`js/${f}`), `missing js/${f}`);
  assert.ok(files.includes('index.html') && files.includes('app.css') && files.includes('./'));
  assert.ok(!files.includes('sw.js'));
  assert.match(sw, /const VERSION = '[0-9a-f]{12}'/);
});
