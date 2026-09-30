// FSRS-4.5 scheduler, see https://github.com/open-spaced-repetition/fsrs4anki/wiki/The-Algorithm
// Three grades, as in MaiMemo: 1 = don't know, 2 = fuzzy, 3 = know. Only the first answer of
// the day updates the memory state (FSRS-4.5 leaves same-day reviews out as well); a word
// that wasn't known comes back a few minutes later until it is.

export const DEFAULT_W = [
  0.4872, 1.4003, 3.7145, 13.8206, 5.1618, 1.2298, 0.8975, 0.031, 1.6474,
  0.1367, 1.0461, 2.1072, 0.0793, 0.3246, 1.587, 0.2272, 2.8755,
];

const DECAY = -0.5;
const FACTOR = 19 / 81;
export const MIN = 60_000;
export const DAY = 86_400_000;
const ROLLOVER_H = 4; // the day starts at 4 am, so late-night reviews count for the same day

export const DEFAULT_PARAMS = {
  w: DEFAULT_W,
  retention: 0.9,
  maxIvl: 3650,
};

// Minutes until a word that wasn't known comes back the same day, by grade.
export const RECHECK_MIN = { 1: 1, 2: 5 };

export function dayStart(ts) {
  const d = new Date(ts - ROLLOVER_H * 3600_000);
  d.setHours(0, 0, 0, 0);
  return d.getTime() + ROLLOVER_H * 3600_000;
}

export function newCard() {
  return { state: 'new', due: 0, s: 0, d: 0, reps: 0, lapses: 0, last: 0 };
}

// Answered today but not known yet: waiting to be seen again today.
export const rechecking = (c, now) => Boolean(c?.recheck) && c.last >= dayStart(now);

export function retrievability(elapsedDays, s) {
  return Math.pow(1 + (FACTOR * elapsedDays) / s, DECAY);
}

function intervalFor(s, r) {
  return (s / FACTOR) * (Math.pow(r, 1 / DECAY) - 1);
}

const clampD = (d) => Math.min(10, Math.max(1, d));
const initS = (w, g) => Math.max(0.1, w[g - 1]);
const initD = (w, g) => clampD(w[4] - (g - 3) * w[5]);
const nextD = (w, d, g) => clampD(w[7] * initD(w, 3) + (1 - w[7]) * (d - w[6] * (g - 3)));

function recallS(w, d, s, r, g) {
  const hard = g === 2 ? w[15] : 1;
  return s * (1 + Math.exp(w[8]) * (11 - d) * Math.pow(s, -w[9]) * (Math.exp(w[10] * (1 - r)) - 1) * hard);
}

function forgetS(w, d, s, r) {
  return Math.min(s, w[11] * Math.pow(d, -w[12]) * (Math.pow(s + 1, w[13]) - 1) * Math.exp(w[14] * (1 - r)));
}

function nextIvl(s, p) {
  return Math.min(p.maxIvl, Math.max(1, Math.round(intervalFor(s, p.retention))));
}

const withDefaults = (p) => ({ ...DEFAULT_PARAMS, ...p });

/** First answer of the day: updates stability and difficulty and sets the next due day. */
export function schedule(card, g, now, params, rand = Math.random) {
  const p = withDefaults(params);
  const w = p.w;
  const c = { ...card, reps: (card.reps || 0) + 1, lastRating: g, last: now };
  delete c.step;
  delete c.recheck;
  if (!card.state || card.state === 'new') {
    c.s = initS(w, g);
    c.d = initD(w, g);
    c.firstAt = now;
  } else {
    // Cards from older versions may still be in a learning state; they continue from here.
    const elapsed = card.last ? Math.max(0, (now - card.last) / DAY) : 0;
    const s = card.s || initS(w, 3);
    const d = card.d || initD(w, 3);
    const r = retrievability(elapsed, s);
    c.d = nextD(w, d, g);
    if (g === 1) {
      c.s = forgetS(w, d, s, r);
      c.lapses = (card.lapses || 0) + 1;
    } else c.s = recallS(w, d, s, r, g);
  }
  c.state = 'review';
  let ivl = nextIvl(c.s, p);
  if (ivl >= 3) ivl = Math.min(p.maxIvl, Math.max(2, Math.round(ivl * (0.95 + rand() * 0.1))));
  c.ivl = ivl;
  c.due = dayStart(now) + ivl * DAY;
  if (g < 3) c.recheck = now + RECHECK_MIN[g] * MIN;
  return c;
}

/** A later answer on the same day only decides whether the word comes back again today. */
export function recheck(card, g, now) {
  const c = { ...card };
  if (g >= 3) delete c.recheck;
  else c.recheck = now + RECHECK_MIN[g] * MIN;
  return c;
}
