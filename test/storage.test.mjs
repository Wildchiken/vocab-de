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
  assert.equal(S.state.words.get(w.id).cards.meaning.state, 'new');
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
