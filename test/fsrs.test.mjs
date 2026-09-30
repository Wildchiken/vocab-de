import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newCard, schedule, recheck, rechecking, dayStart, DAY, MIN } from '../public/js/fsrs.js';

const now = new Date('2026-09-27T10:00:00').getTime();
const fixed = () => 0.5;

test('a new word known at first sight is done for the day', () => {
  const c = schedule(newCard(), 3, now, {}, fixed);
  assert.equal(c.state, 'review');
  assert.equal(c.recheck, undefined);
  assert.equal(c.ivl, 4);
  assert.equal(c.due, dayStart(now) + 4 * DAY);
});

test('fuzzy and unknown words come back the same day and again soon after', () => {
  const fuzzy = schedule(newCard(), 2, now, {}, fixed);
  assert.equal(fuzzy.recheck, now + 5 * MIN);
  assert.equal(fuzzy.ivl, 1);
  const unknown = schedule(newCard(), 1, now, {}, fixed);
  assert.equal(unknown.recheck, now + MIN);
  assert.ok(rechecking(unknown, now + MIN));
  assert.ok(!rechecking(unknown, now + DAY));
});

test('answers later the same day only change when the word comes back', () => {
  const first = schedule(newCard(), 1, now, {}, fixed);
  const again = recheck(first, 2, now + MIN);
  assert.equal(again.s, first.s);
  assert.equal(again.due, first.due);
  assert.equal(again.recheck, now + 6 * MIN);
  const done = recheck(again, 3, now + 6 * MIN);
  assert.equal(done.recheck, undefined);
  assert.equal(done.reps, first.reps);
});

test('intervals grow on success and shrink on a lapse', () => {
  let c = schedule(newCard(), 3, now, {}, fixed);
  let t = c.due;
  const ivls = [];
  for (let i = 0; i < 4; i++) {
    c = schedule(c, 3, t, {}, fixed);
    ivls.push(c.ivl);
    t = c.due;
  }
  for (let i = 1; i < ivls.length; i++) assert.ok(ivls[i] > ivls[i - 1], ivls.join(','));
  const s = c.s;
  const fuzzy = schedule(c, 2, t, {}, fixed);
  assert.ok(fuzzy.ivl < schedule(c, 3, t, {}, fixed).ivl);
  c = schedule(c, 1, t, {}, fixed);
  assert.equal(c.lapses, 1);
  assert.ok(c.s < s);
  assert.ok(c.recheck > t);
});

test('cards left in a learning state by older versions carry on', () => {
  const old = { state: 'learning', due: now - MIN, s: 3.7, d: 5, reps: 1, lapses: 0, step: 1, last: now - 10 * MIN };
  const c = schedule(old, 3, now, {}, fixed);
  assert.equal(c.state, 'review');
  assert.equal(c.step, undefined);
  assert.ok(c.ivl >= 1);
});

test('"already know it" on a new card starts about two weeks out', () => {
  const c = schedule(newCard(), 4, now, {}, fixed);
  assert.equal(c.state, 'review');
  assert.equal(c.recheck, undefined);
  assert.ok(c.ivl >= 12 && c.ivl <= 16, `ivl ${c.ivl}`);
});
