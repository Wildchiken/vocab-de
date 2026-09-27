// FSRS-4.5 间隔重复调度。公式见
// https://github.com/open-spaced-repetition/fsrs4anki/wiki/The-Algorithm
// 学习阶段（新卡 / 遗忘后重学）用分钟级短步长，毕业后按记忆稳定性 S 排天数。

export const DEFAULT_W = [
  0.4872, 1.4003, 3.7145, 13.8206, 5.1618, 1.2298, 0.8975, 0.031, 1.6474,
  0.1367, 1.0461, 2.1072, 0.0793, 0.3246, 1.587, 0.2272, 2.8755,
];

const DECAY = -0.5;
const FACTOR = 19 / 81;
export const MIN = 60_000;
export const DAY = 86_400_000;
const ROLLOVER_H = 4; // 凌晨 4 点换日，熬夜复习不会算到第二天

export const DEFAULT_PARAMS = {
  w: DEFAULT_W,
  retention: 0.9,
  learnSteps: [1, 10],
  relearnSteps: [10],
  maxIvl: 3650,
};

export function dayStart(ts) {
  const d = new Date(ts - ROLLOVER_H * 3600_000);
  d.setHours(0, 0, 0, 0);
  return d.getTime() + ROLLOVER_H * 3600_000;
}

export function newCard() {
  return { state: 'new', due: 0, s: 0, d: 0, reps: 0, lapses: 0, step: 0, last: 0 };
}

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
  const easy = g === 4 ? w[16] : 1;
  return s * (1 + Math.exp(w[8]) * (11 - d) * Math.pow(s, -w[9]) * (Math.exp(w[10] * (1 - r)) - 1) * hard * easy);
}

function forgetS(w, d, s, r) {
  return Math.min(s, w[11] * Math.pow(d, -w[12]) * (Math.pow(s + 1, w[13]) - 1) * Math.exp(w[14] * (1 - r)));
}

function nextIvl(s, p) {
  return Math.min(p.maxIvl, Math.max(1, Math.round(intervalFor(s, p.retention))));
}

function graduate(c, easy, p) {
  c.state = 'review';
  c.step = 0;
  c.ivl = nextIvl(c.s, p);
  if (easy) c.ivl = Math.max(c.ivl, 2);
  return c;
}

function learnStep(c, g, now, steps, p) {
  if (!steps.length || g === 4) return graduate(c, g === 4, p);
  if (g === 1) {
    c.step = 0;
    c.due = now + steps[0] * MIN;
    return c;
  }
  if (g === 2) {
    const cur = steps[c.step] ?? steps[steps.length - 1];
    const nxt = steps[c.step + 1];
    c.due = now + (c.step === 0 && nxt != null ? (cur + nxt) / 2 : cur) * MIN;
    return c;
  }
  c.step += 1;
  if (c.step >= steps.length) return graduate(c, false, p);
  c.due = now + steps[c.step] * MIN;
  return c;
}

function core(card, g, now, p) {
  const w = p.w;
  const c = { ...card, reps: (card.reps || 0) + 1, lastRating: g, last: now };
  delete c.ivl;
  if (!card.state || card.state === 'new') {
    c.s = initS(w, g);
    c.d = initD(w, g);
    c.firstAt = now;
    c.state = 'learning';
    c.step = 0;
    return learnStep(c, g, now, p.learnSteps, p);
  }
  if (card.state === 'learning' || card.state === 'relearning') {
    return learnStep(c, g, now, card.state === 'learning' ? p.learnSteps : p.relearnSteps, p);
  }
  const elapsed = card.last ? Math.max(0, (now - card.last) / DAY) : 0;
  const r = retrievability(elapsed, card.s);
  c.d = nextD(w, card.d, g);
  if (g === 1) {
    c.s = forgetS(w, card.d, card.s, r);
    c.lapses = (card.lapses || 0) + 1;
    c.state = 'relearning';
    c.step = 0;
    return learnStep(c, 1, now, p.relearnSteps, p);
  }
  c.s = recallS(w, card.d, card.s, r, g);
  c.state = 'review';
  c.ivl = nextIvl(c.s, p);
  return c;
}

function rawAll(card, now, p) {
  const res = {};
  for (const g of [1, 2, 3, 4]) res[g] = core(card, g, now, p);
  const rv = (g) => res[g].state === 'review';
  // 保证 困难 < 良好 < 简单
  if (rv(2) && rv(3) && res[3].ivl <= res[2].ivl) res[3].ivl = res[2].ivl + 1;
  if (rv(3) && rv(4) && res[4].ivl <= res[3].ivl) res[4].ivl = res[3].ivl + 1;
  return res;
}

function finalize(c, now) {
  if (c.state === 'review') c.due = dayStart(now) + c.ivl * DAY;
  return c;
}

const withDefaults = (p) => ({ ...DEFAULT_PARAMS, ...p });

/** 四个评分各自的结果，用于按钮上显示下次间隔 */
export function previewAll(card, now, params) {
  const p = withDefaults(params);
  const res = rawAll(card, now, p);
  for (const g of [1, 2, 3, 4]) finalize(res[g], now);
  return res;
}

export function schedule(card, g, now, params, rand = Math.random) {
  const p = withDefaults(params);
  const c = rawAll(card, now, p)[g];
  if (c.state === 'review' && c.ivl >= 3) {
    c.ivl = Math.min(p.maxIvl, Math.max(2, Math.round(c.ivl * (0.95 + rand() * 0.1))));
  }
  return finalize(c, now);
}

export function formatIvl(ms) {
  const m = ms / MIN;
  if (m < 60) return `${Math.max(1, Math.round(m))}分钟`;
  const h = m / 60;
  if (h < 20) return `${Math.round(h)}小时`;
  const d = ms / DAY;
  if (d < 30) return `${Math.round(d)}天`;
  if (d < 365) return `${+(d / 30).toFixed(1)}个月`;
  return `${+(d / 365).toFixed(1)}年`;
}
