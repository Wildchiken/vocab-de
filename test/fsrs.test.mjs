import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newCard, schedule, previewAll, DAY, MIN } from '../public/js/fsrs.js';

const now = new Date('2026-09-27T10:00:00').getTime();
const fixed = () => 0.5;

test('new card learning steps', () => {
  let c = schedule(newCard(), 3, now, {}, fixed);
  assert.equal(c.state, 'learning');
  assert.equal(c.due - now, 10 * MIN);
  c = schedule(c, 3, now + 10 * MIN, {}, fixed);
  assert.equal(c.state, 'review');
  assert.ok(c.ivl >= 1 && c.ivl <= 5, `ivl ${c.ivl}`);
});

test('easy on new graduates with long interval', () => {
  const c = schedule(newCard(), 4, now, {}, fixed);
  assert.equal(c.state, 'review');
  assert.ok(c.ivl >= 10);
});

test('intervals grow on success and shrink on lapse', () => {
  let c = schedule(newCard(), 3, now, {}, fixed);
  c = schedule(c, 3, now + 10 * MIN, {}, fixed);
  let t = c.due;
  const ivls = [];
  for (let i = 0; i < 4; i++) {
    c = schedule(c, 3, t, {}, fixed);
    ivls.push(c.ivl);
    t = c.due;
  }
  for (let i = 1; i < ivls.length; i++) assert.ok(ivls[i] > ivls[i - 1], ivls.join(','));
  const s = c.s;
  c = schedule(c, 1, t, {}, fixed);
  assert.equal(c.state, 'relearning');
  assert.equal(c.lapses, 1);
  assert.ok(c.s < s);
});

test('preview ordering', () => {
  let c = schedule(newCard(), 3, now, {}, fixed);
  c = schedule(c, 3, now + 10 * MIN, {}, fixed);
  const p = previewAll(c, c.due + DAY, {});
  assert.ok(p[2].due < p[3].due && p[3].due < p[4].due);
  assert.ok(p[1].due < p[2].due);
});
