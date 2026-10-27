import { test } from 'node:test';
import assert from 'node:assert/strict';
import { roundedRect, overlayAt, fieldAt, overlayPixels, fieldPixels, toneTable, filterMarkup, Spring, SPRINGS, rubberBand } from '../public/js/glass.js';

const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} ≈ ${b}`);

test('rounded rectangles: distance and outward normal', () => {
  // a 100×40 capsule
  let p = roundedRect(0, 0, 50, 20, 20);
  near(p.d, -20);
  p = roundedRect(0, -20, 50, 20, 20);
  near(p.d, 0);
  assert.deepEqual([p.nx, p.ny], [0, -1]);
  p = roundedRect(55, 0, 50, 20, 20);
  near(p.d, 5);
  assert.deepEqual([p.nx, p.ny], [1, 0]);
  // on the round end, the normal points away from the center of the arc
  p = roundedRect(30 + 20 * Math.SQRT1_2, 20 * Math.SQRT1_2, 50, 20, 20);
  near(p.d, 0);
  near(p.nx, Math.SQRT1_2);
  near(p.ny, Math.SQRT1_2);
});

test('the rim is lit where it faces up or down and shaded where it faces sideways', () => {
  const aa = 1 / 3;
  const [topLight, topAlpha] = overlayAt(-0.3, 0, -1, aa, false);
  assert.ok(topLight > 0.99 && topAlpha > 0.5, 'a bright hairline along the top');
  const [, bottomAlpha] = overlayAt(-0.3, 0, 1, aa, false);
  near(bottomAlpha, topAlpha);
  // facing sideways: no light, a dark hairline just outside the outline
  const [sideLight, sideAlpha] = overlayAt(0.3, 1, 0, aa, false);
  assert.ok(sideLight < 0.01 && sideAlpha > 0.2, `shade ${sideAlpha}`);
  // the light fades out by about 62° off vertical
  const at = (deg) => overlayAt(-0.3, Math.sin((deg * Math.PI) / 180), -Math.cos((deg * Math.PI) / 180), aa, false)[0] * overlayAt(-0.3, Math.sin((deg * Math.PI) / 180), -Math.cos((deg * Math.PI) / 180), aa, false)[1];
  assert.ok(at(0) > at(40) && at(40) > at(60) && at(65) === 0);
  // deep inside and well outside, nothing
  assert.equal(overlayAt(-8, 0, -1, aa, false)[1], 0);
  assert.equal(overlayAt(3, 0, -1, aa, false)[1], 0);
  // dark glass: the light is 0.82 white
  near(overlayAt(-0.3, 0, -1, aa, true)[0], 0.82, 1e-3);
});

test('the field bends only near the edge, toward the inside', () => {
  assert.deepEqual(fieldAt(-25, 1, 0), [0.5, 0.5]);
  // at the right edge the backdrop is drawn from the left (inside)
  assert.deepEqual(fieldAt(0, 1, 0), [0, 0.5]);
  assert.deepEqual(fieldAt(0, 0, -1), [0.5, 1]);
  const [mid] = fieldAt(-5, 1, 0);
  assert.ok(mid > 0 && mid < 0.5);
});

test('maps cover the surface (the overlay 2px beyond it) at the pixel ratio', () => {
  const o = overlayPixels(44, 44, 22, 2, false);
  assert.equal(o.width, 96);
  assert.equal(o.height, 96);
  const alpha = (x, y) => o.data[(y * o.width + x) * 4 + 3];
  assert.equal(alpha(48, 48), 0, 'clear in the middle');
  assert.ok(alpha(48, 4) > 100, 'lit at the top');
  const f = fieldPixels(60.5, 30, 15);
  assert.equal(f.width, 61);
  assert.equal(f.height, 30);
  assert.ok(f.data.every((v, i) => i % 4 !== 3 || v === 255), 'opaque');
});

test('the material follows the calibrated tone curve', () => {
  const light = toneTable(false);
  assert.equal(light.length, 33);
  near(light[0], 0.288, 1e-4);
  near(light[32], 0.935, 1e-3);
  const dark = toneTable(true);
  near(dark[0], 0.0945, 1e-4);
  const markup = filterMarkup('f', 'data:,', 100, 40, false, 60);
  assert.match(markup, /feDisplacementMap in="mix" in2="field" scale="120"/);
  assert.match(markup, /stdDeviation="7.33"/);
  assert.match(markup, /mode="lighten"/);
});

test('springs settle and overshoot as named, rubber bands resist', () => {
  for (const [name, options] of Object.entries(SPRINGS)) {
    const s = new Spring(0, options);
    s.target = 1;
    let peak = 0;
    for (let i = 0; i < 240 && !s.settled; i++) peak = Math.max(peak, s.step(1 / 60).value);
    assert.ok(s.settled, `${name} settles`);
    if (options.bounce > 0) assert.ok(peak > 1, `${name} overshoots`);
    else assert.ok(peak <= 1 + 1e-9, `${name} does not overshoot`);
  }
  // one long frame lands where many short ones do
  const a = new Spring(0, SPRINGS.release);
  const b = new Spring(0, SPRINGS.release);
  a.target = b.target = 1;
  a.step(0.1);
  for (let i = 0; i < 10; i++) b.step(0.01);
  near(a.value, b.value, 1e-9);
  near(rubberBand(0, 10), 0);
  assert.ok(rubberBand(100, 10) < 10 && rubberBand(100, 10) > rubberBand(20, 10));
  assert.ok(rubberBand(-20, 10) < 0);
});
