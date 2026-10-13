# vocab-de

English | [中文](README.zh-CN.md)

A German vocabulary trainer that runs in the browser. It works on phones, tablets and computers, supports offline study in an ordinary browser, and can optionally be installed as an app. Sync between devices is optional and runs on a server you control. The interface is in English or Chinese, and meanings can be written in any language.

![Tablet home screen with today's reviews and new words](docs/screenshots/en/home.png)

| Recognize and three grades | Search and organize words | Progress in dark mode |
|:---:|:---:|:---:|
| <a href="docs/screenshots/en/study.png"><img src="docs/screenshots/en/study.png" width="250" alt="German word and meaning, an example sentence and three rating buttons"></a> | <a href="docs/screenshots/en/words.png"><img src="docs/screenshots/en/words.png" width="250" alt="Word list with search, tag and status filters, colored articles and plural forms"></a> | <a href="docs/screenshots/en/stats.png"><img src="docs/screenshots/en/stats.png" width="250" alt="Dark statistics screen with study counts, word status and progress by tag"></a> |

Screenshots use the starter vocabulary and simulated review history, captured in a desktop browser at tablet and phone sizes. Click an image to view it in full.

More study modes: [Recall](docs/screenshots/en/recall.png) · [Choice](docs/screenshots/en/choice.png) · [Spell](docs/screenshots/en/spell.png) · [Article](docs/screenshots/en/article.png).

## Features

- A 20-word A1 starter set to try before importing your own list
- Tags and batch selection for organizing words: adding and removing tags, pausing/resuming review, and deleting entries, each with a labeled button
- Sentences and set phrases as well as single words (`Das ist mir egal.`, `auf jeden Fall`); spelling checks ignore punctuation and flag a small typo instead of marking it wrong
- Free practice for a selection, or for whatever a tag, status or search shows, in the mode you pick, without touching the review schedule, for a quick pass before a test
- Statistics list the words you keep forgetting, and a word you miss again and again gets a nudge to add an example or break it down

- One schedule per word, and a **study mode** you choose on the home screen (remembered): Recognize (see the German and rate Don't know / Fuzzy / Know it, the default and as in MaiMemo), Recall (see the meaning, think of the German), Choice (pick the meaning among four), Listen (only the sound), Spell (see the meaning and type the German, marked automatically) and Article (only der / die / das). Changing the mode only changes the question: the words due today stay the same and the answer updates the same schedule, so the amount of review does not grow. A word met for the first time is always shown in Recognize, and a word that a mode can't handle (no meaning, not a noun, no German voice in the browser) falls back to it.
- Words you already know from a long list: tap "Already know it" on a new card and its first review is set about two weeks out, so you don't have to go through every word. At the end of a round, the words you missed are listed, so you can add a note or go over them again
- In Recognize there is an option, "Ask the article of nouns first" (on the home screen next to the study mode, off by default): nouns seen before are shown without der / die / das, and picking one also shows the answer; a wrong or forgotten article caps that answer at Fuzzy, since knowing a German noun includes its gender.
- Scheduling uses [FSRS](https://github.com/open-spaced-repetition/fsrs4anki/wiki/The-Algorithm) (created by Jarrett Ye, who worked on MaiMemo's memory algorithm; FSRS grew out of MaiMemo's DHP model), with a target recall of 85%, 90% or 95%. The first answer of the day decides the next review; a word marked Don't know or Fuzzy comes back a few minutes later that day until you know it, without affecting the long-term schedule
- A predictable workload: one "new words per day" setting, with an estimate of daily minutes two months in based on your own answer speed. After a break, piled-up reviews are spread over a few days and new words pause meanwhile
- The most recently added batch of words is learned first, in its own order, so this week's lesson or a word you just met doesn't wait behind a long list
- When you miss an article, you get the relevant ending rule (-ung → die, -chen → das, ...), the head noun of a compound (Haustür → die Tür), or a note that the word is an exception
- Free practice (home screen, a selection in the word list, or the words missed in a round): pick any of the study modes each time, remembered apart from the study mode and used for words not studied yet too; Article practice takes the nouns. From the home screen it draws learned words at random, the ones you forget or miss the article of more often. It doesn't change your schedule, and a finished round can be gone over again another way.
- Short sounds for right and wrong answers and for finishing a session, which can be turned off in Settings; they stay quiet when the phone is on silent
- Word list progress: the Stats screen shows, per tag, how many words you have seen and mastered, and estimates the day the list is finished at your daily pace. Adding and editing offer dictionary shortcuts (Wiktionary, LEO, dict.cc or 德语助手), opened in a new tab; the app itself sends nothing to them
- Adding from elsewhere: select a word on a web page, tap a bookmark, and the Add screen opens with the word and the sentence around it as its example; iOS Shortcuts and your own tools can use the same link. The format and the bookmarklet are on the Import formats page
- Paste or file import (.txt, .csv, .tsv, or drop the file in), including this app's CSV export, Anki plain-text exports and GBK-encoded CSV from Excel. Understands common list formats: `der Tisch, -e - table`, `die Mutter, ¨ - mother`, `gehen, ging, ist gegangen = to go`, Goethe word lists, and two columns copied from a spreadsheet. Plural markers are expanded to full forms. Spreadsheet columns cover notes, tags and a suspended status, and word classes can be written out (noun, Verb, 名词). Words already in your list can be skipped, filled in (only what they lack, plus the tags) or updated from the file, with a preview of what changes; nothing is erased and progress stays, so a list can be exported, edited in a spreadsheet and imported again
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
| `SYNC_TOKEN` | not set | Sync password; each password is its own library. With none of the three sync variables set the app works, but sync is off |
| `SYNC_TOKENS` | not set | More passwords, separated by commas or spaces, one per person, each with a separate library |
| `SYNC_OPEN` | not set | Set to `1` and anyone who sends a password of 16+ characters gets a library of their own; for public instances |
| `PORT` | `8787` | HTTP port |
| `HOST` | `0.0.0.0` | Bind address; use `127.0.0.1` behind a local reverse proxy |
| `DB_PATH` | `vocab-de.sqlite` | SQLite database path, relative to the working directory |

The server compresses text files (brotli or gzip) and answers repeat requests with an ETag, so the first load drops from about 255 KB to about 80 KB (on Cloudflare, Cloudflare does this).

Use HTTPS for Service Workers and secure-context features such as clipboard access; localhost also works for development. When other devices connect over the network, put the server behind a reverse proxy with a certificate, for example [Caddy](https://caddyserver.com): `caddy reverse-proxy --from vocab.example.com --to localhost:8787`.

### Cloudflare Workers

Uses Workers static assets and D1 without a Node server to maintain. Every request goes through the Worker, which adds the security headers (a strict content security policy and others) to the pages; requests count as Worker requests, far below the free allowance for personal use, but check your account’s current usage limits when deploying.

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

For several people, `npx wrangler secret put SYNC_TOKENS` with a list of passwords, or set `SYNC_OPEN` to `"1"` under `vars` in `wrangler.jsonc`.

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

To enable sync, deploy a backend first. **One password opens one library**: use the same password on all your own devices in Settings → Sync, and have anyone else use theirs, so libraries stay separate. On a private deployment the administrator puts each person's password in `SYNC_TOKEN` / `SYNC_TOKENS`; on an open instance tap "Generate a new password" in Settings. The password is the key to your library, so keep it safe: a lost one cannot be recovered. To connect another device, tap "Copy password for another device" in Settings on one device and "Paste" on the other.

When you connect, and this device already has words while the library for that password also has words (or the device was connected to another password before), the app asks: **Merge** (keep both) or **Use cloud only** (clear the words on this device first). On a device somebody else has used, choose Use cloud only, or erase its data in Settings first. When the library is empty and it is the device's first connection, its words are simply uploaded without asking.

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

A lone `-` after a comma means "plural same as singular", not a separator. Lines ending in `.`, `?` or `!`, or longer lines, are treated as sentences; two or three words as a phrase. Lines without a meaning or article can be completed in the import preview.

File import (Import from file on the Add screen, or Settings → Word list → Import word list). The app has an Import formats page and a CSV template with examples filled in:

- CSV with a header: columns such as `lemma`/`word`/`german`, `meaning`/`translation`, `article`, `plural`, `example`, `tags` are recognized, so the app's own CSV export imports back as is. The plural column takes the full form or a marker such as `-e` or `¨-er`; `—` means no plural. After choosing a file you see which columns were recognized
- CSV or TSV without a header: German, meaning, then optionally example and its translation
- Anki: export with "Notes in Plain Text"; lines starting with `#` are skipped and HTML in fields is removed
- Any other text file is read line by line as above

## How sync works

Clients first pull changes by a server sequence number, then upload their own; sequence numbers and records are separate for each password. When a word was changed on two devices, the client merges the copies: text such as the meaning comes from the later edit, and each card from the later review, so an offline review on one device can't undo an edit made on another. The merge is uploaded again, so all devices converge. The server itself keeps the record with the newer update time. Device clocks that are far off can affect the result. Review logs sync by their own IDs, older ones as day summaries by date. A page left open polls every 5 minutes, slowing down to every 30 minutes while nothing changes; coming back to the page, or any change, syncs at once. When a library is erased, the server gives it a new generation; a device that still carries the old one finds out on its next sync and clears its own words instead of uploading the old data again. The Cloudflare Worker and the Node server serve the same API.

## Data and backup

Words, review history and settings are stored locally. JSON export includes words, review history and settings; deleted words are left out (the device and the sync server keep them only so the deletion reaches every device), fields that are still empty are not written, and the review history is stored as short rows grouped by word, one record per line. Import merges words and review history, and restores the settings when the backup's are newer. With sync off, the home screen reminds you once two weeks pass without a backup. CSV export is a word list with notes and tags but without review history; importing it again can fill in or update the words you have. Clearing site data or browser storage eviction can remove local data. Export a backup before changing domains or browser profiles.

Individual review entries are kept for the last 90 days; older ones are summarized into one row per day (answers, not known, time) once a sync has finished, and the streak and the total are unaffected. On the server individual entries are kept for 120 days, which leaves devices 30 days to produce the summaries before the originals go. A user who answers 250 cards a day then stays at about 8 MB in the cloud instead of growing by 35 MB a year. Settings → Storage shows what is stored on the device, the number of words in the cloud and whether the browser has agreed to keep the data, and has a Tidy up now button.

Erase in Settings clears only this device when sync is off. With sync on, clearing only the device would be undone by the next sync, so it erases the cloud library of that password as well (the server goes first; if it can't be reached, nothing is touched). Other devices clear their own words and progress the next time they sync, and this device stays connected and starts over on the empty library. To erase just one device, turn sync off first.

Each sync password is its own library; there are no accounts, e-mail addresses or password recovery. The server stores only a hash of the password and keeps all records apart by it, so whoever holds a password can read and change that library and cannot see anyone else's. The password protects `/api/*`; the app page itself is public. On an open instance each library has a size limit (200,000 records, 64 KB each, checked about every 1,000 writes) but there is no other rate limiting, so put a public deployment behind a reverse proxy or Cloudflare rules that limit requests. Use HTTPS in production. Sync is not end-to-end encrypted: the server's administrator can read the libraries.

Earlier versions did not separate users: all data was in one table. After upgrading, that data moves as a whole to the library of the `SYNC_TOKEN` password on the first request, and only people who know that password can see it. Every other password (those in `SYNC_TOKENS`, or newly generated ones on an open instance) is its own empty library and never sees this data. The old table is kept as `records_migrated`; nothing is deleted. Keep `SYNC_TOKEN` unchanged for the first start after upgrading, otherwise the old data has no password to open it. If the old password was given to several people they still share that data; each can generate a new password in Settings, and the data on their device is uploaded to their own new library.

The Node backend uses SQLite WAL mode. Use a consistent SQLite backup, or stop the server and preserve the database plus any remaining `-wal` file before restarting. Copying only the main database while it is running can omit recent writes. D1 backups are managed separately through Cloudflare.

## Development

```bash
npm install
npm start          # Node server on http://localhost:8787
npm run dev        # or the Cloudflare dev server (needs .dev.vars with SYNC_TOKEN)
npm test           # unit tests
npm run test:e2e   # browser smoke test; run npx playwright install chromium webkit once first
npm run screenshots # refresh the English and Chinese README screenshots with isolated example data
```

```
public/              Front end: plain HTML, CSS and ES modules, no bundler
  js/fsrs.js         FSRS scheduler
  js/german.js       Parsing, plural expansion, article rules, spelling check
  js/importer.js     File import: encoding detection, CSV, Anki text
  js/store.js        IndexedDB storage, card selection, statistics
  js/sync.js         Incremental sync
  js/i18n.js         English and Chinese strings
  js/dict.js         Links to online dictionaries
  js/sfx.js          Sound effects, synthesized with Web Audio
  js/app.js          UI
src/worker.js        Sync API (/api/sync), used by both backends
src/headers.js       Security headers, used by both backends
src/sw.js            Service worker template, built into public/sw.js
server/node.mjs      Self-hosted server
server/d1-sqlite.mjs SQLite adapter with the D1 interface the API expects
scripts/             Build helpers
test/                Unit tests (node --test)
e2e/                 Browser smoke test (Playwright)
```

## License

[MIT](LICENSE)
