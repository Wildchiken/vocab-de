// Store + IndexedDB round trips, using an in-memory IndexedDB.
import 'fake-indexeddb/auto';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as S from '../public/js/store.js';
import { idb } from '../public/js/db.js';

test('words survive a reload from IndexedDB', async () => {
  const w = S.makeWord({ lemma: 'Tisch', article: 'der', pos: 'noun', zh: 'table' });
  await S.addWords([w]);
  S.state.words = new Map();
  await S.load();
  assert.equal(S.state.words.get(w.id).lemma, 'Tisch');
  assert.equal(await idb.getKV('missing', 'fallback'), 'fallback');
});

test('answer records a log and undo restores the card', async () => {
  const w = S.makeWord({ lemma: 'Tür', article: 'die', pos: 'noun', zh: 'door' });
  await S.addWords([w]);
  const before = S.state.logs.length;
  const snap = await S.answer(w, 'meaning', 3, 1500);
  assert.equal(S.state.words.get(w.id).cards.meaning.state, 'review');
  assert.equal(S.state.logs.length, before + 1);
  await S.undo(snap);
  assert.equal(S.getCard(S.state.words.get(w.id), 'meaning').state, 'new');
  assert.equal(S.state.logs.length, before);
  assert.equal((await idb.all('logs')).length, before);
});

test('batch updates are saved and marked for sync', async () => {
  const a = S.makeWord({ lemma: 'Haus', article: 'das', pos: 'noun', zh: 'house' });
  const b = S.makeWord({ lemma: 'Auto', article: 'das', pos: 'noun', zh: 'car' });
  await S.addWords([a, b]);
  a.dirty = b.dirty = false;
  await S.updateWords([a, b], (w) => (w.deleted = true));
  const stored = await idb.all('words');
  for (const id of [a.id, b.id]) {
    const w = stored.find((x) => x.id === id);
    assert.ok(w.deleted && w.dirty);
  }
  assert.ok(!S.liveWords().some((w) => w.id === a.id));
});

test('backup import skips invalid records and wipe clears everything', async () => {
  const good = { ...S.makeWord({ lemma: 'Buch', zh: 'book' }), updatedAt: Date.now() + 1000 };
  const r = await S.importData({ app: 'vocab-de', words: [good, { id: 1 }, { id: 'x', lemma: '' }], logs: [{ id: 'l1', ts: 1 }, {}] });
  assert.deepEqual(r, { words: 1, logs: 1, settings: false });
  // settings from a newer backup are restored too
  const settings = { ...S.state.settings, newPerDay: 7, updatedAt: Date.now() + 5000 };
  assert.equal((await S.importData({ app: 'vocab-de', settings, words: [], logs: [] })).settings, true);
  assert.equal(S.state.settings.newPerDay, 7);
  await assert.rejects(S.importData({ app: 'other' }));
  await S.wipeLocal();
  assert.equal((await idb.all('words')).length, 0);
  assert.equal((await idb.all('logs')).length, 0);
});

test('an article picked on the meaning card is one log entry and is undone with it', async () => {
  const w = S.makeWord({ lemma: 'Brücke', article: 'die', pos: 'noun', zh: 'bridge' });
  await S.addWords([w]);
  const before = S.state.logs.length;
  const stored = (await idb.all('logs')).length;
  const snap = await S.answer(w, 'meaning', 2, 4000, Date.now(), { ok: false });
  const saved = S.state.words.get(w.id);
  assert.equal(saved.artMiss, 1);
  assert.equal(S.articleMisses(saved), 1);
  assert.deepEqual(S.state.logs.slice(before).map((l) => [l.t, l.st, l.g, l.a]), [['meaning', 'new', 2, 0]]);
  assert.ok(saved.cards.meaning.recheck > Date.now());
  await S.undo(snap);
  assert.equal(S.state.words.get(w.id).artMiss, undefined);
  assert.equal(S.state.logs.length, before);
  assert.equal((await idb.all('logs')).length, stored);
});

test('article recall counts picks from the log field and from older article cards', async () => {
  const now = Date.now();
  S.state.logs = [
    { id: 'a1', w: 'x', t: 'meaning', g: 3, ts: now, ms: 1, st: 'review', a: 1 },
    { id: 'a2', w: 'x', t: 'meaning', g: 1, ts: now, ms: 1, st: 'recheck', a: 0 },
    { id: 'a3', w: 'x', t: 'article', g: 3, ts: now, ms: 1, st: 'review' },
    { id: 'a4', w: 'x', t: 'article', g: 1, ts: now, ms: 1, st: 'pick' },
    { id: 'a5', w: 'x', t: 'meaning', g: 3, ts: now, ms: 1, st: 'new' },
  ];
  const st = S.stats(now);
  assert.equal(st.retention.article, 0.5);
  assert.equal(st.retention.meaning, 1);
  // pick entries were never answers of their own
  assert.equal(st.todayReviews, 4);
});

// --- old logs become day summaries ---

const DAY = 86_400_000;
const now = Date.now();
const logAt = (id, ageDays, g = 3, ms = 1000) => ({ id, w: 'w', t: 'meaning', g, ts: now - ageDays * DAY, ms, st: 'review', synced: true });
const { dayStart } = await import('../public/js/fsrs.js');
const { compactLogs, acceptDay, dayKey, exportData, importData, backupText } = S;

test('a backup leaves out deleted words and empty fields, and restores the rest as it was', async () => {
  await S.resetLocalLibrary();
  const kept = S.makeWord({ lemma: 'Tisch', article: 'der', pos: 'noun', zh: 'table', tags: ['A1'] });
  const gone = S.makeWord({ lemma: 'Stuhl', article: 'der', pos: 'noun', zh: 'chair' });
  const unseen = S.makeWord({ lemma: 'gehen' });
  gone.deleted = true;
  await S.addWords([kept, gone, unseen]);
  await S.answer(kept, 'meaning', 3, 1500, Date.now(), null, 'choice');
  await S.answer(kept, 'meaning', 1, 900, Date.now() + 1000, { ok: false });
  assert.match(S.state.logs[0].id, /^[a-z0-9]{12}$/);

  const data = exportData();
  assert.equal(data.version, 2);
  assert.deepEqual(data.words.map((w) => w.lemma).sort(), ['Tisch', 'gehen']);
  const w = data.words.find((x) => x.lemma === 'Tisch');
  for (const k of ['forms', 'example', 'exampleZh', 'notes', 'suspended', 'deleted', 'dirty']) assert.ok(!(k in w), `${k} is left out`);
  assert.ok(!('cards' in data.words.find((x) => x.lemma === 'gehen')), 'a word not studied yet has no cards to write');
  // review logs are short rows under their word; the meaning card's type is not repeated
  assert.deepEqual(
    data.logs[kept.id].map((row) => row.slice(2)),
    [
      [3, 1500, 'new', 'choice'],
      [1, 900, 'review', null, 0],
    ],
  );

  // one record per line, and still plain JSON
  const text = backupText(data);
  assert.deepEqual(JSON.parse(text), data);
  assert.ok(text.split('\n').some((line) => line.startsWith('{"id":') && line.includes('"Tisch"')));

  const strip = ({ dirty, synced, ...x }) => x;
  const words = [kept, unseen].map((x) => strip(S.state.words.get(x.id)));
  const logs = S.state.logs.map(strip);
  await S.resetLocalLibrary();
  assert.deepEqual(await importData(JSON.parse(text)), { words: 2, logs: 2, settings: false });
  assert.deepEqual([kept, unseen].map((x) => strip(S.state.words.get(x.id))), words);
  assert.deepEqual(S.state.logs.map(strip), logs);
  assert.ok(!S.state.words.has(gone.id));
  // importing the same backup again adds nothing
  assert.deepEqual(await importData(JSON.parse(text)), { words: 0, logs: 0, settings: false });
});

test('logs older than 90 days are folded into one summary per day', async () => {
  S.state.logs = [logAt('a', 200), logAt('b', 200, 1, 2000), logAt('c', 150), logAt('new', 3)].sort((x, y) => x.ts - y.ts);
  S.state.days = new Map();
  assert.equal(await compactLogs(now), 3);
  assert.deepEqual(S.state.logs.map((l) => l.id), ['new']);
  const d200 = S.state.days.get(dayKey(now - 200 * DAY));
  assert.deepEqual([d200.n, d200.again, d200.ms, d200.dirty], [2, 1, 3000, true]);
  assert.equal(S.state.days.size, 2);
  // nothing left to fold
  assert.equal(await compactLogs(now), 0);
});

test('a day that already has a summary is not counted twice', async () => {
  S.state.days = new Map();
  assert.ok(acceptDay({ id: dayKey(now - 120 * DAY), day: dayStart(now - 120 * DAY), n: 50, again: 5, ms: 1, updatedAt: 9 }));
  S.state.logs = [logAt('x', 120), logAt('y', 120)].sort((a, b) => a.ts - b.ts);
  await compactLogs(now);
  assert.equal(S.state.days.get(dayKey(now - 120 * DAY)).n, 50);
  assert.equal(S.state.logs.length, 0);
  // an older copy of the same summary does not replace a newer one
  assert.equal(acceptDay({ id: dayKey(now - 120 * DAY), day: 1, n: 1, updatedAt: 1 }), false);
});

test('backups carry the day summaries', async () => {
  S.state.days = new Map();
  acceptDay({ id: '2025-12-01', day: 1, n: 7, again: 1, ms: 5, updatedAt: 3 });
  const data = exportData();
  assert.deepEqual(data.days, [{ id: '2025-12-01', day: 1, n: 7, again: 1, ms: 5, updatedAt: 3 }]);
  S.state.days = new Map();
  await importData(data);
  assert.equal(S.state.days.get('2025-12-01').n, 7);
  assert.equal(S.state.days.get('2025-12-01').dirty, true);
});

