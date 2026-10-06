import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { state, getCard, acceptDay, dayKey, stats, makeWord, pickNext, todayCounts, eligible, reconcile, mergeWord, estimateMinutes, tagProgress, practicePool, DEFAULT_SETTINGS } from '../public/js/store.js';
import { MIN, DAY, dayStart, newCard } from '../public/js/fsrs.js';

const now = new Date('2026-09-27T10:00:00').getTime();

function setWords(list) {
  state.words = new Map(list.map((w) => [w.id, w]));
}
function noun(lemma, article, createdAt) {
  const w = makeWord({ lemma, article, pos: 'noun', zh: lemma });
  w.createdAt = createdAt;
  return w;
}
const session = (types = ['meaning', 'spell']) => ({ types, sinceNew: 0, lastWordId: null });

beforeEach(() => {
  state.settings = { ...DEFAULT_SETTINGS, newPerDay: 2 };
  state.logs = [];
});

test('new words come in creation order and respect the daily limit', () => {
  setWords([noun('Tisch', 'der', 3), noun('Tür', 'die', 1), noun('Haus', 'das', 2)]);
  assert.equal(pickNext(session(), now).w.lemma, 'Tür');
  assert.equal(todayCounts(now).newLeft.meaning, 2);
});

test('words to see again today come first', () => {
  const a = noun('Tisch', 'der', 1);
  const b = noun('Tür', 'die', 2);
  b.cards.meaning = { state: 'review', due: now + DAY, s: 1, d: 5, reps: 1, lapses: 0, last: now - 10 * MIN, recheck: now - MIN, firstAt: now - 10 * MIN };
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

test('the card just answered is not shown again right away', () => {
  const w = noun('Tisch', 'der', 1);
  w.cards.meaning = { state: 'review', due: now + DAY, s: 1, d: 5, reps: 1, lapses: 0, last: now, recheck: now + 5 * MIN, firstAt: now };
  setWords([w]);
  state.settings.newPerDay = 0;
  assert.equal(pickNext({ ...session(), lastWordId: w.id }, now), null);
  // with another word answered last, it may be done early
  assert.equal(pickNext({ ...session(), lastWordId: 'other' }, now).w.id, w.id);
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
  assert.equal(getCard(merged, 'meaning').state, 'new');
  assert.equal(merged.cards.article, undefined);
});

test('an unchanged copy from the server is not re-sent', () => {
  const w = noun('Haus', 'das', 1);
  w.updatedAt = w.editedAt = 10;
  assert.equal(reconcile(w, { ...structuredClone(w), updatedAt: 5 }), null);
  const newer = { ...structuredClone(w), zh: 'house', editedAt: 20, updatedAt: 20 };
  assert.deepEqual(reconcile(w, newer), { ...newer, dirty: false });
});

test('article misses only grow when merging, and a reset starts them over', () => {
  const a = noun('Tisch', 'der', 1);
  const b = structuredClone(a);
  a.artMiss = 3;
  b.artMiss = 1;
  assert.equal(mergeWord(a, b).artMiss, 3);
  // a reset on one device wins over older misses from another
  b.resetAt = 500;
  b.artMiss = 0;
  a.resetAt = 0;
  assert.equal(mergeWord(a, b).artMiss, undefined);
  // misses made after the reset are kept
  b.artMiss = 2;
  assert.equal(mergeWord(a, b).artMiss, 2);
});

test('word list progress follows the queue of new words', () => {
  const day = dayStart(now);
  const list = [];
  const add = (lemma, tag, batch, seen) => {
    const w = noun(lemma, 'der', batch);
    w.batch = batch;
    w.tags = [tag];
    if (seen) w.cards.meaning = { state: 'review', due: now + DAY, s: 30, d: 5, reps: 3, lapses: 0, last: now - DAY, firstAt: now - 40 * DAY };
    list.push(w);
  };
  // "Old" was imported first, "New" later, so New is learned first
  for (let i = 0; i < 6; i++) add(`O${i}`, 'Old', 1, i < 2);
  for (let i = 0; i < 5; i++) add(`N${i}`, 'New', 100, false);
  setWords(list);
  state.settings.newPerDay = 3;
  const rows = Object.fromEntries(tagProgress(now).map((r) => [r.tag, r]));
  assert.deepEqual([rows.New.total, rows.New.seen, rows.Old.total, rows.Old.seen, rows.Old.mature], [5, 0, 6, 2, 2]);
  // 3 a day starting today: New (5 words) needs today and tomorrow; Old's last unseen word
  // is number 5 + 4 = 9 in the queue, so the day after that
  assert.equal(rows.New.days, 1);
  assert.equal(rows.Old.days, 2);
  assert.equal(rows.Old.date, day + 2 * DAY);
  // everything seen: no date
  for (const w of list) w.cards.meaning = { state: 'review', due: now + DAY, s: 1, d: 5, reps: 1, lapses: 0, last: now, firstAt: now };
  assert.equal(tagProgress(now).find((r) => r.tag === 'New').days, null);
});

// --- old logs become day summaries ---

const logAt = (id, ageDays, g = 3, ms = 1000) => ({ id, w: 'w', t: 'meaning', g, ts: now - ageDays * DAY, ms, st: 'review', synced: true });

test('the streak counts summarized days and statistics ignore logs past the cutoff', () => {
  state.days = new Map();
  state.logs = [];
  // studied every day from 120 days ago to 100 days ago and yesterday and today
  for (let age = 100; age <= 120; age++) acceptDay({ id: dayKey(now - age * DAY), day: dayStart(now - age * DAY), n: 10, again: 0, ms: 1, updatedAt: 1 });
  state.logs = [logAt('t', 0), logAt('y', 1)];
  const st = stats(now);
  assert.equal(st.streak, 2);
  // a leftover log that is still waiting to be folded is not counted twice
  state.logs.push(logAt('old', 110));
  state.logs.sort((a, b) => a.ts - b.ts);
  assert.equal(stats(now).todayReviews, 1);
  // with the gap closed the earlier days join the streak
  for (let age = 2; age < 100; age++) acceptDay({ id: dayKey(now - age * DAY), day: dayStart(now - age * DAY), n: 1, again: 0, ms: 1, updatedAt: 1 });
  assert.equal(stats(now).streak, 121);
});

test('stored card numbers are short and an unseen word has no card yet', async () => {
  const w = makeWord({ lemma: 'Tisch', pos: 'noun', article: 'der', zh: 'table' });
  assert.deepEqual(w.cards, {});
  const card = (await import('../public/js/fsrs.js')).schedule(newCard(), 3, now, {}, () => 0.5);
  for (const v of [card.s, card.d]) assert.ok(String(v).replace(/^\d+\./, '').length <= 4, `${v}`);
});

test('a new word counts as two answers for the progress bar', () => {
  setWords([noun('Tisch', 'der', 1), makeWord({ lemma: 'gehen', pos: 'verb', zh: 'go' })]);
  state.settings.newPerDay = 5;
  const c = todayCounts(now);
  assert.equal(c.newLeft.meaning, 2);
  assert.equal(c.answersLeft.meaning, 4);
  assert.deepEqual(Object.keys(c.due), ['meaning']);
});

test('the daily time estimate follows the number of new words', () => {
  setWords([noun('A', 'der', 1)]);
  const a = estimateMinutes(20);
  assert.ok(a > 20 && a < 45, String(a));
  assert.ok(estimateMinutes(10) < a);
  // slower answers, longer days: the estimate uses the user's own median
  state.logs = Array.from({ length: 40 }, (_, i) => ({ id: `s${i}`, t: 'meaning', ms: 15000, ts: now - i, g: 3, st: 'review' }));
  assert.ok(estimateMinutes(20) > a * 1.5);
});

test('free practice draws learned words, more often the ones that were forgotten', () => {
  const learned = (lemma, lapses = 0, misses = 0) => {
    const w = noun(lemma, 'der', 1);
    w.cards.meaning = { state: 'review', due: now + DAY, s: 5, d: 5, reps: 3, lapses, last: now - DAY, firstAt: now - 9 * DAY };
    w.artMiss = misses;
    return w;
  };
  const fresh = noun('Neu', 'die', 2);
  const hard = learned('Schwer', 4, 3);
  const easy = Array.from({ length: 9 }, (_, i) => learned(`Leicht${i}`));
  const paused = learned('Pause');
  paused.suspended = true;
  setWords([fresh, hard, paused, ...easy]);
  assert.equal(practicePool(50).length, 10, 'unseen and suspended words are left out');
  assert.ok(!practicePool(50).some((w) => w.lemma === 'Neu' || w.lemma === 'Pause'));
  assert.equal(practicePool(3).length, 3);
  // the forgotten word is in a pool of 3 out of 10 much more often than chance (30%)
  let hits = 0;
  for (let i = 0; i < 400; i++) if (practicePool(3).includes(hard)) hits++;
  assert.ok(hits > 400 * 0.5, `hits ${hits}`);
  // filters: only nouns with a given tag, say
  assert.deepEqual(practicePool(50, (w) => w.lemma === 'Schwer'), [hard]);
});
