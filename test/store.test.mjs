import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { state, makeWord, pickNext, todayCounts, eligible, reconcile, mergeWord, estimateMinutes, DEFAULT_SETTINGS } from '../public/js/store.js';
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

test('the newest batch is learned first, each batch in its own order', () => {
  const list = [noun('A1', 'der', 1), noun('A2', 'der', 2), noun('B1', 'die', 50), noun('B2', 'die', 51)];
  list[0].batch = list[1].batch = 1;
  list[2].batch = list[3].batch = 50;
  setWords(list);
  const s = session(['meaning']);
  const first = pickNext(s, now);
  assert.equal(first.w.lemma, 'B1');
  s.lastWordId = first.w.id;
  assert.equal(pickNext(s, now).w.lemma, 'B2');
});

test('a backlog is spread over several days and pauses new words', () => {
  const review = (i) => {
    const w = noun(`R${i}`, 'der', i);
    w.cards.meaning = { state: 'review', due: now - DAY, s: 10, d: 5, reps: 3, lapses: 0, step: 0, last: now - 11 * DAY, firstAt: now - 30 * DAY };
    return w;
  };
  const list = Array.from({ length: 400 }, (_, i) => review(i));
  list.push(noun('Neu', 'das', 1000));
  setWords(list);
  state.settings.newPerDay = 20;
  let c = todayCounts(now);
  assert.equal(c.due.meaning, 300);
  assert.equal(c.overflow, 100);
  assert.equal(c.paused, true);
  assert.equal(c.newLeft.meaning, 0);
  state.extraNew = { day: dayStart(now), n: 0, force: true };
  c = todayCounts(now);
  assert.equal(c.newLeft.meaning, 1);
  state.extraNew = { day: 0, n: 0 };
  // reviews already done today count against the cap
  state.logs = Array.from({ length: 300 }, (_, i) => ({ id: `l${i}`, ts: now - i * 1000, st: 'review', t: 'meaning' }));
  assert.equal(todayCounts(now).due.meaning, 0);
});

test('an edit on one device and a review on another are both kept', () => {
  const base = noun('Tisch', 'der', 1);
  base.updatedAt = base.editedAt = 100;
  const mac = { ...structuredClone(base), zh: '桌子（新）', editedAt: 200, updatedAt: 200 };
  const phone = structuredClone(base);
  phone.cards.meaning = { ...phone.cards.meaning, state: 'review', reps: 3, s: 9, last: 300, due: 400 };
  phone.updatedAt = 300;
  // the phone pulls the Mac's edit while holding its own offline review
  const merged = reconcile(phone, mac);
  assert.equal(merged.zh, '桌子（新）');
  assert.equal(merged.cards.meaning.s, 9);
  assert.equal(merged.dirty, true);
  assert.ok(merged.updatedAt > 300);
  // the Mac then receives the merge unchanged
  const back = reconcile(mac, { ...merged, dirty: undefined });
  assert.equal(back.dirty, false);
  assert.equal(back.zh, '桌子（新）');
});

test('a reset wins over older reviews from another device', () => {
  const w = noun('Tür', 'die', 1);
  const reviewed = structuredClone(w);
  reviewed.cards.meaning = { ...reviewed.cards.meaning, state: 'review', reps: 4, s: 20, last: 500 };
  reviewed.cards.article = { ...reviewed.cards.meaning, last: 450 };
  reviewed.updatedAt = 500;
  const reset = structuredClone(w);
  reset.resetAt = 600;
  reset.updatedAt = 600;
  const merged = mergeWord(reviewed, reset);
  assert.equal(merged.cards.meaning.state, 'new');
  assert.equal(merged.cards.article, undefined);
});

test('an unchanged copy from the server is not re-sent', () => {
  const w = noun('Haus', 'das', 1);
  w.updatedAt = w.editedAt = 10;
  assert.equal(reconcile(w, { ...structuredClone(w), updatedAt: 5 }), null);
  const newer = { ...structuredClone(w), zh: 'house', editedAt: 20, updatedAt: 20 };
  assert.deepEqual(reconcile(w, newer), { ...newer, dirty: false });
});

test('the daily time estimate follows the number of new words', () => {
  setWords([noun('A', 'der', 1), makeWord({ lemma: 'gehen', pos: 'verb', zh: 'go' })]);
  state.settings.spell = true;
  const a = estimateMinutes(20);
  assert.ok(a > 30 && a < 70, String(a));
  assert.ok(estimateMinutes(10) < a);
  state.settings.spell = false;
  assert.ok(estimateMinutes(20) < a);
  state.settings.spell = true;
});
