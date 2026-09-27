# vocab-de

English | [中文](README.zh-CN.md)

A web app for learning German vocabulary in Safari on iPhone, iPad and Mac, with progress synced across devices. The interface is available in English and Chinese, and you can write meanings in any language. The backend runs on Cloudflare Workers and D1 and fits in the free tier for personal use.

## Features

- Every word gets three kinds of cards, each scheduled on its own:
  - Meaning: see the German word, recall what it means, rate yourself
  - Article: see only the noun and pick der / die / das; graded automatically by correctness and speed
  - Spelling: see the meaning and type the German (nouns with their article); unlocked once the meaning is well learned
- Scheduling uses [FSRS](https://github.com/open-spaced-repetition/fsrs4anki/wiki/The-Algorithm), with a target recall of 85%, 90% or 95%
- When you miss an article, you get the relevant ending rule (-ung → die, -chen → das, ...), the head noun of a compound (Haustür → die Tür), or a note that the word is an exception
- Free article practice that favors the nouns you get wrong most
- Paste import that understands common list formats: `der Tisch, -e - table`, `die Mutter, ¨ - mother`, `gehen, ging, ist gegangen = to go`, Goethe word lists, and two columns copied from a spreadsheet. Plural markers are expanded to full forms
- Works offline: every release is precached, updates install in the background and apply when you are not in the middle of a session. Changes made offline sync when you are back online, with automatic retries
- iOS 26 style interface: floating tab bar that becomes a sidebar on wide screens, dark mode, Dynamic Type, Reduce Motion and Reduce Transparency
- German text-to-speech using the voices built into Safari, keyboard shortcuts on Mac

## Deploy

You need Node.js 22 or later and a Cloudflare account.

```bash
npm install
npx wrangler login
npx wrangler d1 create vocab-de
```

Put the `database_id` from the output into `wrangler.jsonc`, then set a sync password and deploy:

```bash
npx wrangler secret put SYNC_TOKEN
npx wrangler deploy
```

Use a random string for the password, for example `openssl rand -hex 16`. The database table is created on the first request. Each deploy regenerates `public/sw.js` with a content hash, so clients update automatically.

## Using it on your devices

1. Open the deployed URL in Safari and add it to your Home Screen (iPhone / iPad: Share → Add to Home Screen; Mac: File → Add to Dock)
2. Open the app from the Home Screen or Dock, go to Settings → Sync and enter your `SYNC_TOKEN`
3. On your next device, tap "Copy password for another device" on the first one, then "Paste" in Settings on the new one. With Universal Clipboard this works straight from Mac to iPhone

Do step 2 inside the installed app, not in Safari: Home Screen apps keep their data separate from Safari. Installed apps also work offline and are not affected by Safari clearing data for sites you have not visited in a while.

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

## Development

```bash
echo 'SYNC_TOKEN=dev-token-123' > .dev.vars
npm run dev
npm test
```

## Layout

```
public/            Front end: plain HTML, CSS and ES modules, no bundler
  js/fsrs.js       FSRS scheduler
  js/german.js     Parsing, plural expansion, article rules, spelling check
  js/store.js      IndexedDB storage, card selection, statistics
  js/sync.js       Incremental sync
  js/i18n.js       English and Chinese strings
  js/app.js        UI
src/worker.js      Sync API (/api/sync)
src/sw.js          Service worker template (built into public/sw.js)
scripts/           Build helpers
test/              Unit tests (node --test)
```

Sync: every record carries an update time, the server keeps the most recent write, and clients pull changes by a server sequence number. If two offline devices change the same word, the version with the newer update time wins, so device clocks that are far off can affect the result. Review logs sync by their own IDs.

## License

[MIT](LICENSE)
