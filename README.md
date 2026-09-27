# vocab-de

English | [中文](README.zh-CN.md)

A German vocabulary trainer that runs in the browser. It works on phones, tablets and computers, supports offline study in an ordinary browser, and can optionally be installed as an app. Sync between devices is optional and runs on a server you control. The interface is in English or Chinese, and meanings can be written in any language.

## Features

- Three independently scheduled card types, available according to the word and your learning progress:
  - Meaning: see the German word, recall what it means, rate yourself
  - Article (nouns with a known article): see only the noun and pick der / die / das; graded automatically by correctness and speed
  - Spelling: see the meaning and type the German (nouns with their article); unlocked once the meaning is well learned
- Scheduling uses [FSRS](https://github.com/open-spaced-repetition/fsrs4anki/wiki/The-Algorithm), with a target recall of 85%, 90% or 95%
- When you miss an article, you get the relevant ending rule (-ung → die, -chen → das, ...), the head noun of a compound (Haustür → die Tür), or a note that the word is an exception
- Free article practice that favors the nouns you get wrong most
- Paste import that understands common list formats: `der Tisch, -e - table`, `die Mutter, ¨ - mother`, `gehen, ging, ist gegangen = to go`, Goethe word lists, and two columns copied from a spreadsheet. Plural markers are expanded to full forms
- Offline first: all data lives in the browser (IndexedDB), every release is precached, and changes sync when a connection is available
- Interface modeled on iOS, with a sidebar on wide screens, dark mode, adjustable text size, and support for reduced motion and transparency
- German text-to-speech with the voices your system provides, keyboard shortcuts on computers

## Browser support

The app uses IndexedDB, Service Workers, ES modules and modern CSS. It is intended for recent browsers on iOS, iPadOS, Android, macOS, Windows and Linux. There is no verified minimum-version compatibility matrix yet; installation, speech and storage behavior vary by browser and device.

Read-aloud uses Web Speech. German voice availability and offline speech depend on the browser and system; the app does not bundle audio files.

## Running it

Choose static hosting for local study without a backend, Node.js with SQLite for self-hosted sync, or Cloudflare Workers with D1 for managed sync. All three use the same front end. Learning rules are German-specific; English and Chinese are interface languages, while meanings may be written in any language.

### Self-host with Node.js

Requires Node.js 22.13 or later. Works on a VPS, a NAS or any always-on computer.

```bash
npm install
export SYNC_TOKEN='replace-with-a-long-random-secret'
npm start
```

| Variable | Default | Purpose |
|---|---|---|
| `SYNC_TOKEN` | not set | Password for sync. Without it the app works, but sync is off |
| `PORT` | `8787` | HTTP port |
| `HOST` | `0.0.0.0` | Bind address; use `127.0.0.1` behind a local reverse proxy |
| `DB_PATH` | `vocab-de.sqlite` | SQLite database path, relative to the working directory |

Use HTTPS for Service Workers and secure-context features such as clipboard access; localhost also works for development. When other devices connect over the network, put the server behind a reverse proxy with a certificate, for example [Caddy](https://caddyserver.com): `caddy reverse-proxy --from vocab.example.com --to localhost:8787`.

### Cloudflare Workers

Uses Workers static assets and D1 without a Node server to maintain. Check your account’s current usage limits when deploying.

```bash
npm install
npx wrangler login
npx wrangler d1 create vocab-de
```

Put the `database_id` from the output into `wrangler.jsonc`, then:

```bash
npx wrangler secret put SYNC_TOKEN
npx wrangler deploy
```

The database table is created on the first request.

### Static hosting, without sync

The front end is plain files. Run `node scripts/build-sw.mjs` and upload the `public/` folder to any static host (GitHub Pages, Netlify, your own web server). Everything except sync works; data stays on each device and can be moved with Settings → Export / Import backup.

## Browser use and optional installation

Open the deployed URL to study. Local use requires neither an account nor installation. Before going offline, open it online and let the complete release cache download. You can return through a browser bookmark.

If your browser offers installation, these are the usual entry points:

- iPhone / iPad: in Safari, Share → Add to Home Screen
- Mac: in Safari, File → Add to Dock
- Android: in Chrome, menu → Install app
- Windows / macOS / Linux with Chrome or Edge: the install icon in the address bar, or Settings → Install in the app

Do not assume browser tabs and installed apps share local data. Connect sync or import a JSON backup in the context you plan to use. Installation does not guarantee permanent storage.

To enable sync, configure one backend and enter the same `SYNC_TOKEN` in Settings → Sync on each device. Keep the configured token; generating a new one at each restart disconnects existing clients. To connect another device, tap "Copy password for another device" in Settings on one device and "Paste" on the other.

The interface follows your system language. You can change it under Settings → Language.

## Import format

One word per line. Separate the German from its meaning with a tab, ` - `, ` = ` or `: `. Chinese meanings can follow the word directly.

```
der Tisch, -e - table
die Mutter, ¨ - mother
der Lehrer, - teacher
das Kind (-er) - child
gehen, ging, ist gegangen = to go
Zeitung
```

A lone `-` after a comma means "plural same as singular", not a separator. Lines without a meaning or article can be completed in the import preview.

## How sync works

Every record carries an update time. The server keeps the most recent write, and clients pull changes by a server sequence number. If two offline devices change the same word, the version with the newer update time wins, so device clocks that are far off can affect the result. Review logs sync by their own IDs. The Cloudflare Worker and the Node server serve the same API.

## Data and backup

Words, review history and settings are stored locally. JSON export includes words, review history and settings. Import currently merges words and review history; it does not restore settings, so configure those again on a new device. CSV export is only a word list. Clearing site data or browser storage eviction can remove local data. Export a backup before changing domains or browser profiles.

Each sync deployment is one shared library, not a multi-user account system. Anyone with the sync token can read and change that library. The token protects `/api/*`; the app page itself is public. Use HTTPS in production. Sync is not end-to-end encrypted.

The Node backend uses SQLite WAL mode. Use a consistent SQLite backup, or stop the server and preserve the database plus any remaining `-wal` file before restarting. Copying only the main database while it is running can omit recent writes. D1 backups are managed separately through Cloudflare.

## Development

```bash
npm install
npm start          # Node server on http://localhost:8787
npm run dev        # or the Cloudflare dev server (needs .dev.vars with SYNC_TOKEN)
npm test
```

```
public/              Front end: plain HTML, CSS and ES modules, no bundler
  js/fsrs.js         FSRS scheduler
  js/german.js       Parsing, plural expansion, article rules, spelling check
  js/store.js        IndexedDB storage, card selection, statistics
  js/sync.js         Incremental sync
  js/i18n.js         English and Chinese strings
  js/app.js          UI
src/worker.js        Sync API (/api/sync), used by both backends
src/sw.js            Service worker template, built into public/sw.js
server/node.mjs      Self-hosted server
server/d1-sqlite.mjs SQLite adapter with the D1 interface the API expects
scripts/             Build helpers
test/                Unit tests (node --test)
```

## License

[MIT](LICENSE)
