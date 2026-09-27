import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { state, makeWord, pickNext, todayCounts, eligible, DEFAULT_SETTINGS } from '../public/js/store.js';
import { MIN, DAY, dayStart } from '../public/js/fsrs.js';

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

test('extra new words raise today\'s limit only for today', () => {
  setWords([noun('A', 'der', 1), noun('B', 'die', 2), noun('C', 'das', 3), noun('D', 'der', 4)]);
  assert.equal(todayCounts(now).newLeft.meaning, 2);
  state.extraNew = { day: dayStart(now), n: 2 };
  assert.equal(todayCounts(now).newLeft.meaning, 4);
  state.extraNew = { day: dayStart(now) - DAY, n: 2 };
  assert.equal(todayCounts(now).newLeft.meaning, 2);
  state.extraNew = { day: 0, n: 0 };
});

test('no spelling card for a word without a meaning', () => {
  const w = noun('Tisch', 'der', 1);
  w.cards.meaning = { state: 'review', due: now + 9 * DAY, s: 10, d: 5, reps: 3, lapses: 0, step: 0, last: now - DAY, firstAt: now - 20 * DAY };
  setWords([w]);
  assert.equal(eligible(w, 'spell'), true);
  w.zh = '';
  assert.equal(eligible(w, 'spell'), false);
});

test('the card just answered is not shown again right away', () => {
  const w = noun('Tisch', 'der', 1);
  w.cards.meaning = { state: 'learning', due: now + 10 * MIN, s: 1, d: 5, reps: 1, lapses: 0, step: 1, last: now, firstAt: now };
  setWords([w]);
  state.settings.newPerDay = 0;
  state.settings.articleNewPerDay = 0;
  assert.equal(pickNext({ ...session(), lastWordId: w.id }, now), null);
  // with another word answered last, it may be done early
  assert.equal(pickNext({ ...session(), lastWordId: 'other' }, now).w.id, w.id);
});

test('spelling unlocks only once the meaning has held for a while', () => {
  const w = noun('Tisch', 'der', 1);
  const review = (reps, s) => ({ state: 'review', due: now + DAY, s, d: 5, reps, lapses: 0, step: 0, last: now, firstAt: now - DAY });
  w.cards.meaning = review(2, 3.7); // new card, two Goods on day one
  assert.equal(eligible(w, 'spell'), false);
  w.cards.meaning = review(4, 12);
  assert.equal(eligible(w, 'spell'), true);
});

test('article cards unlocked by today\'s new nouns are counted up front', () => {
  setWords([noun('Tisch', 'der', 1), noun('Tür', 'die', 2), makeWord({ lemma: 'gehen', pos: 'verb', zh: 'go' })]);
  state.settings.newPerDay = 3;
  const c = todayCounts(now);
  assert.equal(c.newLeft.meaning, 3);
  assert.equal(c.upcomingArticles, 2);
  // every new card is answered once per learning step
  assert.equal(c.answersLeft.meaning, 6);
  assert.equal(c.upcomingAnswers, 4);
});
