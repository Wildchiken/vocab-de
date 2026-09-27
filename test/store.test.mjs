import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { state, makeWord, pickNext, todayCounts, DEFAULT_SETTINGS } from '../public/js/store.js';
import { MIN, DAY } from '../public/js/fsrs.js';

const now = new Date('2026-09-27T10:00:00').getTime();

function setWords(list) {
  state.words = new Map(list.map((w) => [w.id, w]));
}
function noun(lemma, article, createdAt) {
  const w = makeWord({ lemma, article, pos: 'noun', zh: lemma });
  w.createdAt = createdAt;
  return w;
}
const session = (types = ['meaning', 'article', 'spell']) => ({ types, sinceNew: 0, lastWordId: null });

beforeEach(() => {
  state.settings = { ...DEFAULT_SETTINGS, newPerDay: 2 };
  state.logs = [];
});

test('new words come in creation order and respect the daily limit', () => {
  setWords([noun('Tisch', 'der', 3), noun('Tür', 'die', 1), noun('Haus', 'das', 2)]);
  assert.equal(pickNext(session(), now).w.lemma, 'Tür');
  assert.equal(todayCounts(now).newLeft.meaning, 2);
});

test('article card appears only after the meaning card was seen', () => {
  const w = noun('Tisch', 'der', 1);
  setWords([w]);
  assert.equal(pickNext(session(['article']), now), null);
  w.cards.meaning = { state: 'review', due: now + 3 * DAY, s: 5, d: 5, reps: 2, lapses: 0, step: 0, last: now - DAY, firstAt: now - 2 * DAY };
  assert.equal(pickNext(session(['article']), now).t, 'article');
});

test('learning cards that are due come first', () => {
  const a = noun('Tisch', 'der', 1);
  const b = noun('Tür', 'die', 2);
  b.cards.meaning = { state: 'learning', due: now - MIN, s: 1, d: 5, reps: 1, lapses: 0, step: 1, last: now - 10 * MIN, firstAt: now - 10 * MIN };
  setWords([a, b]);
  const next = pickNext(session(), now);
  assert.equal(next.w.lemma, 'Tür');
  assert.equal(next.t, 'meaning');
});

test('suspended and deleted words are skipped', () => {
  const a = noun('Tisch', 'der', 1);
  const b = noun('Tür', 'die', 2);
  a.suspended = true;
  b.deleted = true;
  setWords([a, b]);
  assert.equal(pickNext(session(), now), null);
});
