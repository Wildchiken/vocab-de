// Generates public/sw.js with a content hash, so every deploy that changes a file
// ships a new cache and clients pick it up automatically.
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../public/', import.meta.url));
const template = fileURLToPath(new URL('../src/sw.js', import.meta.url));

const walk = (dir) =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });

const files = walk(root)
  .filter((p) => !basename(p).startsWith('.') && basename(p) !== 'sw.js')
  .map((p) => relative(root, p).split(sep).join('/'))
  .sort();

const hash = createHash('sha256');
for (const f of files) hash.update(f).update(readFileSync(join(root, f)));
const version = hash.digest('hex').slice(0, 12);

const header = `const VERSION = '${version}';\nconst FILES = ${JSON.stringify(['./', ...files], null, 2)};\n\n`;
writeFileSync(join(root, 'sw.js'), header + readFileSync(template, 'utf8'));
console.log(`sw.js ${version} (${files.length} files)`);
