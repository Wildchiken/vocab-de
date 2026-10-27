import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SPRINGS, springAt, settleTime, springCSS } from '../scripts/springs.mjs';

test('app.css has the spring curves the script generates', () => {
  assert.ok(readFileSync('public/app.css', 'utf8').includes(springCSS()), 'run node scripts/springs.mjs and paste its output into app.css');
});

test('springs start at rest, settle at their target, and bounce as much as they say', () => {
  for (const [name, spring] of Object.entries(SPRINGS)) {
    assert.equal(springAt(spring, 0), 0, name);
    assert.ok(Math.abs(springAt(spring, settleTime(spring)) - 1) <= 0.002, `${name} has settled`);
    let peak = 0;
    for (let t = 0; t < 2; t += 0.001) peak = Math.max(peak, springAt(spring, t));
    assert.ok(peak > 1 && peak < 1 + spring.bounce / 2, `${name} overshoots a little: ${peak}`);
  }
  // pressing is firm, letting go is the gel-like one
  assert.ok(settleTime(SPRINGS.press) < settleTime(SPRINGS.release));
});
