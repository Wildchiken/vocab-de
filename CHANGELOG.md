# Changelog

## Unreleased

- Word lists (CSV) carry notes in import, export and the template. Word classes can be written out in English, German or Chinese (noun, Verb, 名词), and a status column can bring words in suspended.
- Importing a list with words already in your library: Skip, Fill in (only empty fields, plus the tags of the batch; the default) or Update (what the file has replaces what is there), with each row saying what it will change. Nothing is erased and review progress stays, so exporting a list, editing it in a spreadsheet and importing it again works.
- A line without an article is taken as the noun already in the list (Bahnhof is der Bahnhof) instead of adding it a second time.
- A plural given for the last part of a compound (das Fahrrad, -räder) now reads as Fahrräder, not Fahrradräder.
- Opening an existing library also repairs unambiguous duplicated-stem plurals from earlier imports, keeping word IDs, review cards, schedules and history.

- Study modes on the home screen: Recognize (default), Recall, Choice, Listen, Spell and Article. All of them ask about the same word and update the same schedule. Spelling is no longer a separate card that appears in the day's reviews, and "Pick the article first" is now the option "Ask the article of nouns when recognizing", off by default.
- Free practice uses the same modes and has an entry on the home screen; it replaces the article drill.
- Free practice asks how to practice each time it starts (from the home screen, a selection in the word list, or the words missed in a round) and remembers that apart from the study mode. The mode applies to words not studied yet too, Article practice takes only the nouns, and a finished round can be gone over again another way. Practice still leaves the schedule alone.
- The actions of the word list's selection bar have labels, and the dictionary shortcut on the Add screen says what it does.
- Settings: Backup, Word list and Storage sit together, and the sound switches share a group with the language.
- "Ask the article of nouns first" moved from Settings to the home screen, under the study mode it belongs to; it shows when that mode is Recognize. Free practice has its own row there.
- The word list can practice whatever a tag, status or search shows (Practice these), and the tags of a selection can be removed as well as added, with Undo. The selection stays after changing tags.
- The study screen shows the words left today ("12 left"), the same number as the home screen, instead of a count of answers. A round that stops with words due again in a minute offers to go on with them right away.
- Answers are counted as answers ("26 answers today"), not as cards, on the home screen and in Stats.
- The Add screen shows the preview, the tags and the Import button right under the pasted text; reading a file comes after them.
- A word's page says where it stands in plain words (status, reviews, times forgotten, next review), shows the plural only for nouns and the forms only for verbs and adjectives unless they are filled in, and deleting the word there can be undone.
- Messages are no longer squeezed into a narrow column, and a message with an Undo button no longer blocks the buttons under it after it fades.

- Individual review entries are kept for 90 days; older ones become one summary per day, so storage and first sync on a new device no longer grow with the years. The streak and totals are kept. On the server entries are kept for 120 days.
- Settings → Storage: what is stored here and in the cloud, whether the browser keeps the data, and a Tidy up now button.
- The Node server compresses text files and answers repeat requests with 304.
- A page left open polls less often while nothing changes.
- Records are a little smaller: rounded card numbers, no empty card for words not studied yet, and 12-character ids for new review entries.
- Backups leave out deleted words and fields that are still empty, store the review history as short rows grouped by word, and put one record on each line. With 2,000 words and five months of reviews that is 1.4 MB instead of 2.2 MB. Backups from earlier versions still import.

- Glass is a port of the Liquid Glass material (no WebGPU or new dependencies). Its rim is drawn from the same shader for each button and bar: lit where it faces up or down, a soft glow inside, a dark hairline where it faces sideways. In Chrome and Edge the edges also bend what is behind them, through the same frosted blur and tone curve; Safari and Firefox get the same material without the bending, since they cannot apply such a filter to the backdrop.
- Glass answers to a finger as in Liquid Glass: it swells by about 8px under a press, stretches toward a drag and rubber-bands, settles back with a slight overshoot, and lights up from where it is touched (and a little under a mouse). The switch thumb turns into a clear lens while pressed.
- Motion follows real springs (generated as CSS curves by `scripts/springs.mjs`): pressing is quick and firm, letting go settles with a slight overshoot. Browsers without `linear()` easing keep the previous curves.
- The selection in the tab bar and sidebar is a lens that springs from tab to tab, stretching as it moves, and can be dragged across the bar to choose a tab.
- Content scrolling under the nav bar or the tab bar is blurred progressively, more toward the edge. The effect grows in over the first 32px of scrolling and is gone at the top and at the end of the page.
- Messages appear below the nav bar instead of over its buttons, and messages and dialogs are frosted enough that nothing behind shows through their text.
- Dialogs open with their content coming out of a blur, and the corners of dialogs, the sidebar and the selection bar are concentric with the buttons inside them.

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
