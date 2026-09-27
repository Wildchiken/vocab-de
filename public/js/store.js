import { idb } from './db.js';
import { newCard, schedule, previewAll, dayStart, DAY, MIN } from './fsrs.js';
import { ARTICLES } from './german.js';

export const CARD_TYPES = ['meaning', 'article', 'spell'];
export const SOURCES = ['exam', 'book', 'daily', 'other'];

export const DEFAULT_SETTINGS = {
  newPerDay: 20,
  articleNewPerDay: 40,
  spell: true,
  spellNewPerDay: 15,
  retention: 0.9,
  autoSpeak: true,
  updatedAt: 0,
};

export const state = {
  words: new Map(),
  logs: [],
  settings: { ...DEFAULT_SETTINGS },
  settingsDirty: false,
  extraNew: { day: 0, n: 0 }, // "study more" on top of today's limit, per device
};

const listeners = new Set();
export const onChange = (fn) => listeners.add(fn);
const emit = () => listeners.forEach((fn) => fn());

const uid = () =>
  crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2);

export async function load() {
  const [words, logs, settings, extraNew] = await Promise.all([
    idb.all('words'),
    idb.all('logs'),
    idb.getKV('settings', null),
    idb.getKV('extraNew', null),
  ]);
  if (extraNew) state.extraNew = extraNew;
  state.words = new Map(words.map((w) => [w.id, w]));
  state.logs = logs.sort((a, b) => a.ts - b.ts);
  if (settings) {
    state.settings = { ...DEFAULT_SETTINGS, ...settings.value };
    state.settingsDirty = settings.dirty;
  }
}

export const liveWords = () => [...state.words.values()].filter((w) => !w.deleted);

function params() {
  return { retention: state.settings.retention };
}

export function makeWord(f) {
  const now = Date.now();
  return {
    id: uid(),
    lemma: f.lemma.trim(),
    article: ARTICLES.includes(f.article) ? f.article : '',
    plural: f.plural || '',
    pos: f.pos || '',
    forms: f.forms || '',
    zh: f.zh || '',
    example: f.example || '',
    exampleZh: f.exampleZh || '',
    notes: f.notes || '',
    source: f.source || 'daily',
    tags: f.tags || [],
    createdAt: now,
    updatedAt: now,
    suspended: false,
    deleted: false,
    cards: { meaning: newCard() },
    dirty: true,
  };
}

const dupKey = (lemma, article) => `${(article || '').toLowerCase()}|${lemma.trim().toLowerCase()}`;

export function findDuplicate(lemma, article) {
  const key = dupKey(lemma, article);
  for (const w of state.words.values()) {
    if (!w.deleted && dupKey(w.lemma, w.pos === 'noun' ? w.article : article) === key) return w;
  }
  return null;
}

export async function saveWord(w) {
  w.updatedAt = Math.max(Date.now(), (w.updatedAt || 0) + 1);
  w.dirty = true;
  state.words.set(w.id, w);
  await idb.put('words', w);
  emit();
}

export async function addWords(list) {
  for (const w of list) state.words.set(w.id, w);
  await idb.putMany('words', list);
  emit();
}

export async function deleteWord(w) {
  w.deleted = true;
  await saveWord(w);
}

export async function resetProgress(w) {
  w.cards = { meaning: newCard() };
  await saveWord(w);
}

export async function saveSettings(patch) {
  Object.assign(state.settings, patch, { updatedAt: Date.now() });
  state.settingsDirty = true;
  await idb.setKV('settings', { value: state.settings, dirty: true });
  emit();
}

export async function markSettingsClean(updatedAt) {
  if (state.settings.updatedAt !== updatedAt) return;
  state.settingsDirty = false;
  await idb.setKV('settings', { value: state.settings, dirty: false });
}

export function getCard(w, type) {
  return w.cards[type] || newCard();
}

export function eligible(w, type) {
  if (type === 'meaning') return true;
  const m = getCard(w, 'meaning');
  if (type === 'article') return w.pos === 'noun' && ARTICLES.includes(w.article) && m.reps > 0;
  if (type === 'spell') return state.settings.spell && m.state === 'review' && m.s >= 3;
  return false;
}

function scan(types, now) {
  const today = dayStart(now);
  const introduced = { meaning: 0, article: 0, spell: 0 };
  const news = { meaning: [], article: [], spell: [] };
  const reviews = [];
  const learning = [];
  for (const w of state.words.values()) {
    if (w.deleted) continue;
    for (const t of CARD_TYPES) {
      const c = w.cards[t];
      if (c?.firstAt >= today) introduced[t]++;
    }
    if (w.suspended) continue;
    for (const t of types) {
      if (!eligible(w, t)) continue;
      const c = getCard(w, t);
      if (c.state === 'new') news[t].push(w);
      else if (c.state === 'learning' || c.state === 'relearning') learning.push({ w, t, c });
      else if (c.due <= now) reviews.push({ w, t, c });
    }
  }
  const s = state.settings;
  const extra = state.extraNew.day === today ? state.extraNew.n : 0;
  const limits = {
    meaning: s.newPerDay + extra,
    article: s.articleNewPerDay + extra,
    spell: s.spell ? s.spellNewPerDay : 0,
  };
  const newLeft = {};
  for (const t of CARD_TYPES) newLeft[t] = Math.max(0, Math.min(news[t].length, limits[t] - introduced[t]));
  return { news, reviews, learning, newLeft, introduced };
}

export function todayCounts(now = Date.now()) {
  const { reviews, learning, newLeft, news } = scan(CARD_TYPES, now);
  const due = { meaning: 0, article: 0, spell: 0 };
  for (const r of reviews) due[r.t]++;
  for (const l of learning) if (l.c.due <= now + 20 * MIN) due[l.t]++;
  const total = due.meaning + due.article + due.spell + newLeft.meaning + newLeft.article + newLeft.spell;
  return { due, newLeft, total, unseen: news.meaning.length };
}

export async function addExtraNew(n, now = Date.now()) {
  const day = dayStart(now);
  state.extraNew = { day, n: (state.extraNew.day === day ? state.extraNew.n : 0) + n };
  await idb.setKV('extraNew', state.extraNew);
}

const NEW_ORDER = ['article', 'meaning', 'spell'];

// session: { types, sinceNew, lastWordId }
export function pickNext(session, now = Date.now()) {
  const { news, reviews, learning, newLeft } = scan(session.types, now);
  const notLast = (x) => x.w.id !== session.lastWordId;

  const learnDue = learning.filter((l) => l.c.due <= now).sort((a, b) => a.c.due - b.c.due);
  const ld = learnDue.find(notLast);
  if (ld) return ld;

  reviews.sort((a, b) => a.c.due - b.c.due || a.w.createdAt - b.w.createdAt);
  const review = reviews.find(notLast);

  let fresh = null;
  for (const t of NEW_ORDER) {
    if (!session.types.includes(t) || !newLeft[t]) continue;
    const list = news[t].filter((w) => w.id !== session.lastWordId);
    if (!list.length) continue;
    if (t === 'article') list.sort((a, b) => getCard(a, 'meaning').firstAt - getCard(b, 'meaning').firstAt);
    else list.sort((a, b) => a.createdAt - b.createdAt);
    fresh = { w: list[0], t, c: getCard(list[0], t) };
    break;
  }

  if (review && (!fresh || session.sinceNew < 4)) {
    session.sinceNew++;
    return review;
  }
  if (fresh) {
    session.sinceNew = 0;
    return fresh;
  }
  if (learnDue[0]) return learnDue[0];
  // Nothing else left: show learning cards due within the next 20 minutes early.
  const soon = learning.filter((l) => l.c.due <= now + 20 * MIN).sort((a, b) => a.c.due - b.c.due);
  return soon.find(notLast) || soon[0] || null;
}

export function preview(w, type, now = Date.now()) {
  return previewAll(getCard(w, type), now, params());
}

// Returns a snapshot for undo.
export async function answer(w, type, rating, elapsedMs, now = Date.now()) {
  const before = JSON.parse(JSON.stringify(w));
  const prev = getCard(w, type);
  const next = schedule(prev, rating, now, params());
  w.cards = { ...w.cards, [type]: next };
  const log = {
    id: uid(),
    w: w.id,
    t: type,
    g: rating,
    ts: now,
    ms: Math.round(Math.min(elapsedMs, 120_000)),
    st: prev.state,
    synced: false,
  };
  state.logs.push(log);
  await idb.put('logs', log);
  await saveWord(w);
  return { before, logId: log.id };
}

export async function undo(snap) {
  const w = snap.before;
  await saveWord(w);
  state.logs = state.logs.filter((l) => l.id !== snap.logId);
  await idb.del('logs', snap.logId);
  return w;
}

// Weighted random pick for free article practice: frequently missed nouns come up more.
export function drillPool() {
  return liveWords().filter((w) => !w.suspended && eligible(w, 'article'));
}

export function pickDrill(pool, recent) {
  const cand = pool.filter((w) => !recent.includes(w.id));
  const list = cand.length ? cand : pool;
  if (!list.length) return null;
  const weight = (w) => 1 + 2 * (getCard(w, 'article').lapses || 0) + (getCard(w, 'article').state === 'new' ? 1 : 0);
  let total = list.reduce((s, w) => s + weight(w), 0);
  let r = Math.random() * total;
  for (const w of list) {
    r -= weight(w);
    if (r <= 0) return w;
  }
  return list[list.length - 1];
}

export function wordStatus(w) {
  if (w.suspended) return 'suspended';
  const m = getCard(w, 'meaning');
  if (m.state === 'new') return 'new';
  if (m.state !== 'review') return 'learning';
  return m.s >= 21 ? 'mature' : 'young';
}

export const STATUSES = ['new', 'learning', 'young', 'mature', 'suspended'];

export function stats(now = Date.now()) {
  const today = dayStart(now);
  const words = liveWords();
  const byStatus = { new: 0, learning: 0, young: 0, mature: 0, suspended: 0 };
  for (const w of words) byStatus[wordStatus(w)]++;

  const since30 = now - 30 * DAY;
  const firstDay = today - 13 * DAY;
  const perDay = Array.from({ length: 14 }, () => 0);
  const ret = { meaning: [0, 0], article: [0, 0], spell: [0, 0] };
  const days = new Set();
  let todayReviews = 0;
  let todayMs = 0;
  for (const l of state.logs) {
    days.add(dayStart(l.ts));
    if (l.ts >= today) {
      todayReviews++;
      todayMs += l.ms || 0;
    }
    if (l.ts >= firstDay) {
      const i = Math.floor((dayStart(l.ts) - firstDay) / DAY + 0.5);
      if (i >= 0 && i < 14) perDay[i]++;
    }
    if (l.ts >= since30 && l.st === 'review' && ret[l.t]) {
      ret[l.t][0]++;
      if (l.g > 1) ret[l.t][1]++;
    }
  }
  let streak = 0;
  let d = days.has(today) ? today : dayStart(today - DAY / 2);
  while (days.has(d)) {
    streak++;
    d = dayStart(d - DAY / 2);
  }
  const retention = {};
  for (const t of CARD_TYPES) retention[t] = ret[t][0] ? ret[t][1] / ret[t][0] : null;

  const forecast = Array.from({ length: 7 }, () => 0);
  for (const w of words) {
    if (w.suspended) continue;
    for (const t of CARD_TYPES) {
      const c = w.cards[t];
      if (!c || c.state === 'new') continue;
      const idx = Math.max(0, Math.floor((dayStart(c.due) - today) / DAY + 0.5));
      if (idx < 7) forecast[idx]++;
    }
  }

  const hardArticles = words
    .filter((w) => w.cards.article?.lapses >= 2)
    .sort((a, b) => b.cards.article.lapses - a.cards.article.lapses)
    .slice(0, 20);

  return {
    total: words.length,
    byStatus,
    todayReviews,
    todayMinutes: Math.round(todayMs / 60000),
    streak,
    retention,
    forecast,
    hardArticles,
    perDay,
  };
}

export function exportData() {
  return {
    app: 'vocab-de',
    version: 1,
    exportedAt: new Date().toISOString(),
    settings: state.settings,
    words: [...state.words.values()].map(({ dirty, ...w }) => w),
    logs: state.logs.map(({ synced, ...l }) => l),
  };
}

function isWordRecord(w) {
  return (
    typeof w?.id === 'string' &&
    typeof w.lemma === 'string' &&
    w.lemma.trim() !== '' &&
    typeof w.cards === 'object' &&
    w.cards !== null &&
    Number.isFinite(w.updatedAt)
  );
}

export async function importData(data) {
  if (data?.app !== 'vocab-de') throw Object.assign(new Error('not a vocab-de backup'), { code: 'notBackup' });
  const words = [];
  for (const w of Array.isArray(data.words) ? data.words : []) {
    if (!isWordRecord(w)) continue;
    const local = state.words.get(w.id);
    if (!local || w.updatedAt > local.updatedAt) words.push({ ...w, dirty: true });
  }
  const known = new Set(state.logs.map((l) => l.id));
  const logs = (Array.isArray(data.logs) ? data.logs : [])
    .filter((l) => typeof l?.id === 'string' && Number.isFinite(l.ts) && !known.has(l.id))
    .map((l) => ({ ...l, synced: false }));
  await addWords(words);
  if (logs.length) {
    await idb.putMany('logs', logs);
    state.logs = [...state.logs, ...logs].sort((a, b) => a.ts - b.ts);
  }
  emit();
  return { words: words.length, logs: logs.length };
}

export async function wipeLocal() {
  await Promise.all([idb.clear('words'), idb.clear('logs'), idb.clear('kv')]);
}

