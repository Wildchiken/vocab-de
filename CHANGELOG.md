# Changelog

## 1.1.0

Study
- One card per word, rated Don't know / Fuzzy / Know it, as in MaiMemo. A word marked Don't know or Fuzzy comes back a few minutes later that day.
- Nouns are shown with their article the first time; after that the article is asked on the same card. There are no separate article cards any more, and the article drill is free practice.
- Spelling practice is optional and off by default; it can be answered without typing.
- Sentences and set phrases can be added like words.
- Free practice for a tag or a selection, and a list of the words missed at the end of a round.
- "Already know it" on new cards, a daily time estimate, and reviews that pile up after a break are spread over several days. The newest batch of words is learned first.
- Sound effects, with a switch in Settings.
- Dictionary links, adding words from a link or bookmarklet, and progress per word list.

Import and export
- Import .txt, .csv and .tsv files, including Anki text exports and GBK-encoded CSV, with a template and a formats page.
- Word list (CSV) and backup (JSON) are separate, and backups restore settings.

Sync
- Every password is its own library, with a private list of passwords or an open mode. The old shared table moves to the `SYNC_TOKEN` library on the first request.
- Words edited on one device and reviewed on another are merged instead of overwritten.
- Erasing with sync on also erases the cloud library, and other devices clear themselves on their next sync.
- A device with words asks before connecting to a library that already has some.

Hardening
- Strict content security policy and other security headers for the Node server and the Worker. With the Worker, every request now goes through it (`run_worker_first`).
- Double taps no longer rate the next card.
- A browser smoke test (`npm run test:e2e`) and a CI job for it.

## 1.0.0

First release.
