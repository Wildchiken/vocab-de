import { idb } from './db.js';
import { newCard, schedule, recheck, rechecking, dayStart, DAY, MIN } from './fsrs.js';
import { ARTICLES } from './german.js';

// Scheduled cards. A noun's article is asked on its meaning card, not on a card of its own.
export const CARD_TYPES = ['meaning', 'spell'];
// What statistics report on: article picks are counted separately.
export const STAT_TYPES = ['meaning', 'article', 'spell'];

export const DEFAULT_SETTINGS = {
  newPerDay: 20,
  spell: false,
  articleFirst: true,
  retention: 0.9,
  autoSpeak: true,
  sound: true,
  updatedAt: 0,
};

export const state = {
  words: new Map(),
  logs: [],
  settings: { ...DEFAULT_SETTINGS },
  settingsDirty: false,
  extraNew: { day: 0, n: 0, force: false }, // "study more" on top of today's limit, per device
  lastBackup: 0,
};

const listeners = new Set();
export const onChange = (fn) => listeners.add(fn);
const emit = () => listeners.forEach((fn) => fn());

const uid = () =>
  crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2);

export async function load() {
  const [words, logs, settings, extraNew, lastBackup] = await Promise.all([
    idb.all('words'),
    idb.all('logs'),
    idb.getKV('settings', null),
    idb.getKV('extraNew', null),
    idb.getKV('lastBackup', 0),
  ]);
  if (extraNew) state.extraNew = extraNew;
  state.lastBackup = lastBackup;
  guessBatches(words);
  state.words = new Map(words.map((w) => [w.id, w]));
  state.logs = logs.sort((a, b) => a.ts - b.ts);
  if (settings) {
    state.settings = { ...DEFAULT_SETTINGS, ...settings.value };
    state.settingsDirty = settings.dirty;
  }
}

// Words saved before batches existed: an import gave consecutive rows consecutive
// milliseconds, so runs of those belong together.
function guessBatches(words) {
  let batch = 0;
  let prev = -Infinity;
  for (const w of [...words].sort((a, b) => a.createdAt - b.createdAt)) {
    if (w.createdAt - prev > 1) batch = w.createdAt;
    prev = w.createdAt;
    w.batch ??= batch;
  }
}

export const liveWords = () => [...state.words.values()].filter((w) => !w.deleted);

// Tags in use, most recently used first.
export function allTags() {
  const last = new Map();
  for (const w of liveWords()) {
    for (const tag of w.tags || []) last.set(tag, Math.max(last.get(tag) || 0, w.createdAt || 0));
  }
  return [...last.keys()].sort((a, b) => last.get(b) - last.get(a));
}

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
    tags: f.tags || [],
    createdAt: now,
    updatedAt: now,
    editedAt: now,
    batch: f.batch || now,
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

export async function updateWords(list, change) {
  const now = Date.now();
  for (const w of list) {
    change(w);
    w.editedAt = now;
    w.updatedAt = Math.max(now, (w.updatedAt || 0) + 1);
    w.dirty = true;
  }
  await idb.putMany('words', list);
  emit();
}

// Queue everything for upload again, e.g. after switching to another sync server.
export async function markAllDirty() {
  const words = [...state.words.values()];
  for (const w of words) w.dirty = true;
  for (const l of state.logs) l.synced = false;
  state.settingsDirty = true;
  await Promise.all([
    idb.putMany('words', words),
    idb.putMany('logs', state.logs),
    idb.setKV('settings', { value: state.settings, dirty: true }),
  ]);
}

export async function addWords(list) {
  for (const w of list) state.words.set(w.id, w);
  await idb.putMany('words', list);
  emit();
}

export async function deleteWord(w) {
  w.deleted = true;
  w.editedAt = Date.now();
  await saveWord(w);
}

export async function resetProgress(w) {
  w.cards = { meaning: newCard() };
  w.artMiss = 0;
  w.resetAt = Date.now();
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

export const hasArticle = (w) => w.pos === 'noun' && ARTICLES.includes(w.article);

// Article mistakes, including those from article cards of earlier versions.
export const articleMisses = (w) => (w.artMiss || 0) + (w.cards.article?.lapses || 0);

export function eligible(w, type) {
  if (type === 'meaning') return true;
  const m = getCard(w, 'meaning');
  // Spelling is the hardest direction, so it waits until the meaning has held for a while.
  if (type === 'spell') return state.settings.spell && Boolean(w.zh) && m.state === 'review' && m.reps >= 2 && m.s >= 7;
  return false;
}

// Newest batch first, so this week's lesson or a word met today doesn't wait behind a
// long list imported earlier; within a batch, the list's own order.
export const newOrder = (a, b) => (b.batch ?? b.createdAt) - (a.batch ?? a.createdAt) || a.createdAt - b.createdAt;

// Reviews per day. Past this, the rest wait for the next days and no new words are added,
// so coming back after a break doesn't mean one enormous session.
export const reviewCap = () => Math.max(150, 15 * state.settings.newPerDay);

function reviewsDone(since) {
  let n = 0;
  for (let i = state.logs.length - 1; i >= 0 && state.logs[i].ts >= since; i--) if (state.logs[i].st === 'review') n++;
  return n;
}

function scan(types, now) {
  const today = dayStart(now);
  const introduced = { meaning: 0, spell: 0 };
  const news = { meaning: [], spell: [] };
  const reviews = [];
  const rechecks = [];
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
      else if (rechecking(c, now)) rechecks.push({ w, t, c });
      else if (c.due <= now) reviews.push({ w, t, c });
    }
  }
  const s = state.settings;
  const ex = state.extraNew.day === today ? state.extraNew : { n: 0, force: false };
  const capLeft = Math.max(0, reviewCap() - reviewsDone(today));
  const allDue = reviews.length;
  reviews.sort((a, b) => a.c.due - b.c.due || a.w.createdAt - b.w.createdAt);
  reviews.length = Math.min(reviews.length, capLeft);
  const overflow = allDue - reviews.length;
  const paused = overflow > 0 && !ex.force;
  // Article cards follow the nouns just learned, so their limit moves with the new words.
  const limits = paused ? { meaning: ex.n, spell: 0 } : { meaning: s.newPerDay + ex.n, spell: s.spell ? s.newPerDay : 0 };
  const newLeft = {};
  for (const t of CARD_TYPES) newLeft[t] = Math.max(0, Math.min(news[t].length, limits[t] - introduced[t]));
  return { news, reviews, rechecks, newLeft, overflow, paused };
}

export function todayCounts(now = Date.now()) {
  const { reviews, rechecks, newLeft, news, overflow, paused } = scan(CARD_TYPES, now);
  const due = { meaning: 0, spell: 0 };
  for (const r of reviews) due[r.t]++;
  for (const r of rechecks) due[r.t]++;
  const total = due.meaning + due.spell + newLeft.meaning + newLeft.spell;
  // Answers still needed today: a new word is usually not known at first sight and comes back
  // once more, so it counts twice; counting answers keeps the progress bar from sliding back.
  const answersLeft = { meaning: 0, spell: 0 };
  for (const t of CARD_TYPES) answersLeft[t] = due[t] + 2 * newLeft[t];
  return { due, newLeft, total, unseen: news.meaning.length, answersLeft, overflow, paused };
}

export async function addExtraNew(n, now = Date.now(), force = false) {
  const day = dayStart(now);
  const cur = state.extraNew.day === day ? state.extraNew : { n: 0, force: false };
  state.extraNew = { day, n: cur.n + n, force: cur.force || force };
  await idb.setKV('extraNew', state.extraNew);
}

const NEW_ORDER = ['meaning', 'spell'];

// session: { types, sinceNew, lastWordId }
export function pickNext(session, now = Date.now()) {
  const { news, reviews, rechecks, newLeft } = scan(session.types, now);
  const notLast = (x) => x.w.id !== session.lastWordId;

  rechecks.sort((a, b) => a.c.recheck - b.c.recheck);
  const again = rechecks.find((r) => r.c.recheck <= now && notLast(r));
  if (again) return again;

  const review = reviews.find(notLast);

  let fresh = null;
  for (const t of NEW_ORDER) {
    if (!session.types.includes(t) || !newLeft[t]) continue;
    const list = news[t].filter((w) => w.id !== session.lastWordId);
    if (!list.length) continue;
    list.sort(t === 'spell' ? (a, b) => getCard(a, 'meaning').firstAt - getCard(b, 'meaning').firstAt : newOrder);
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
  // Nothing else left: words to see again soon can come a little early, but never the one
  // just answered twice in a row.
  return rechecks.find((r) => r.c.recheck <= now + 20 * MIN && notLast(r)) || null;
}

// Returns a snapshot for undo. `article` is the article picked on a noun's card, if one was
// asked: it is stored on the same log entry (a: 1 right, 0 wrong or skipped).
export async function answer(w, type, rating, elapsedMs, now = Date.now(), article = null) {
  // Sync may have replaced the object since the card was shown; build on the latest copy.
  w = state.words.get(w.id) || w;
  const before = JSON.parse(JSON.stringify(w));
  const prev = getCard(w, type);
  const same = rechecking(prev, now);
  w.cards = { ...w.cards, [type]: same ? recheck(prev, rating, now) : schedule(prev, rating, now, params()) };
  const log = {
    id: uid(),
    w: w.id,
    t: type,
    g: rating,
    ts: now,
    ms: Math.round(Math.min(elapsedMs, 120_000)),
    st: same ? 'recheck' : prev.state,
    synced: false,
  };
  if (article) {
    log.a = article.ok ? 1 : 0;
    if (!article.ok) w.artMiss = (w.artMiss || 0) + 1;
  }
  state.logs.push(log);
  await idb.put('logs', log);
  await saveWord(w);
  return { before, logIds: [log.id] };
}

export async function undo(snap) {
  const w = snap.before;
  await saveWord(w);
  const ids = new Set(snap.logIds);
  state.logs = state.logs.filter((l) => !ids.has(l.id));
  await Promise.all(snap.logIds.map((id) => idb.del('logs', id)));
  return w;
}

// A missed article in free practice: counted, but the schedule is left alone.
export async function missArticle(w) {
  w = state.words.get(w.id) || w;
  w.artMiss = (w.artMiss || 0) + 1;
  await saveWord(w);
}

// Weighted random pick for free article practice: frequently missed nouns come up more.
export function drillPool() {
  return liveWords().filter((w) => !w.suspended && hasArticle(w) && getCard(w, 'meaning').state !== 'new');
}

export function pickDrill(pool, recent) {
  const cand = pool.filter((w) => !recent.includes(w.id));
  const list = cand.length ? cand : pool;
  if (!list.length) return null;
  const weight = (w) => 1 + 2 * articleMisses(w);
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
  if (m.state !== 'review' || m.s < 3) return 'learning';
  return m.s >= 21 ? 'mature' : 'young';
}

export const STATUSES = ['new', 'learning', 'young', 'mature', 'suspended'];

/**
 * Progress of each word list (tag): words seen at least once, and the day the last unseen
 * one should come up at the current pace. New words are taken newest batch first, so a list
 * waiting behind a newer one is estimated accordingly.
 */
export function tagProgress(now = Date.now()) {
  const today = dayStart(now);
  const words = liveWords();
  const queue = words.filter((w) => !w.suspended && getCard(w, 'meaning').state === 'new').sort(newOrder);
  const lastPos = new Map();
  queue.forEach((w, i) => {
    for (const tag of w.tags || []) lastPos.set(tag, i + 1);
  });
  const perDay = Math.max(1, state.settings.newPerDay);
  const introduced = words.filter((w) => w.cards.meaning?.firstAt >= today).length;
  const left = Math.max(0, perDay - introduced);
  const rows = new Map();
  for (const w of words) {
    for (const tag of w.tags || []) {
      const r = rows.get(tag) ?? { tag, total: 0, seen: 0, mature: 0, days: null };
      r.total++;
      if (getCard(w, 'meaning').state !== 'new') r.seen++;
      if (wordStatus(w) === 'mature') r.mature++;
      rows.set(tag, r);
    }
  }
  for (const r of rows.values()) {
    const k = lastPos.get(r.tag);
    if (k) r.days = k <= left ? 0 : Math.ceil((k - left) / perDay);
    if (r.days !== null) r.date = today + r.days * DAY;
  }
  return allTags().map((tag) => rows.get(tag));
}

export function stats(now = Date.now()) {
  const today = dayStart(now);
  const words = liveWords();
  const byStatus = { new: 0, learning: 0, young: 0, mature: 0, suspended: 0 };
  for (const w of words) byStatus[wordStatus(w)]++;

  const since30 = now - 30 * DAY;
  const firstDay = today - 13 * DAY;
  const perDay = Array.from({ length: 14 }, () => 0);
  const ret = { meaning: [0, 0], article: [0, 0], spell: [0, 0] };
  const add = (type, ok) => {
    ret[type][0]++;
    if (ok) ret[type][1]++;
  };
  const days = new Set();
  let todayReviews = 0;
  let todayMs = 0;
  for (const l of state.logs) {
    days.add(dayStart(l.ts));
    if (l.ts >= since30) {
      // An article is picked on the meaning card (a); older versions had article cards and,
      // briefly, separate pick entries.
      if (l.a !== undefined) add('article', l.a === 1);
      if (l.t === 'article') {
        if (l.st === 'review' || l.st === 'pick') add('article', l.g > 1);
      } else if (l.st === 'review' && ret[l.t]) add(l.t, l.g > 1);
    }
    if (l.st === 'pick') continue;
    if (l.ts >= today) {
      todayReviews++;
      todayMs += l.ms || 0;
    }
    if (l.ts >= firstDay) {
      const i = Math.floor((dayStart(l.ts) - firstDay) / DAY + 0.5);
      if (i >= 0 && i < 14) perDay[i]++;
    }
  }
  let streak = 0;
  let d = days.has(today) ? today : dayStart(today - DAY / 2);
  while (days.has(d)) {
    streak++;
    d = dayStart(d - DAY / 2);
  }
  const retention = {};
  for (const t of STAT_TYPES) retention[t] = ret[t][0] ? ret[t][1] / ret[t][0] : null;

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

  const lapsesOf = (w) => (w.cards.meaning?.lapses || 0) + (w.cards.spell?.lapses || 0) + articleMisses(w);
  const hardWords = words
    .filter((w) => lapsesOf(w) >= 3)
    .sort((a, b) => lapsesOf(b) - lapsesOf(a))
    .slice(0, 20);

  return {
    total: words.length,
    byStatus,
    todayReviews,
    todayMinutes: Math.round(todayMs / 60000),
    streak,
    retention,
    forecast,
    hardWords,
    perDay,
  };
}

// Rough daily minutes about two months in, for a given number of new words a day. The
// per-word factors come from simulating this scheduler at 90% recall; answer times are the
// user's own once there are enough of them.
const MEANING_PER_WORD = 10.5;
const SPELL_PER_WORD = 7;

export function estimateMinutes(newPerDay = state.settings.newPerDay) {
  const secs = { meaning: 7.5, spell: 14 };
  for (const t of CARD_TYPES) {
    const ms = [];
    for (let i = state.logs.length - 1; i >= 0 && ms.length < 300; i--) {
      const l = state.logs[i];
      if (l.t === t && l.ms > 0) ms.push(l.ms);
    }
    if (ms.length >= 30) secs[t] = ms.sort((a, b) => a - b)[ms.length >> 1] / 1000;
  }
  const perWord = MEANING_PER_WORD * secs.meaning + (state.settings.spell ? SPELL_PER_WORD * secs.spell : 0);
  return Math.round((newPerDay * perWord * 1.1) / 60);
}

// Merging two copies of a word edited on different devices: the text and flags come from
// the later edit, each card from the later review, so an offline review can't undo an edit
// made elsewhere and vice versa.
const META = ['lemma', 'article', 'plural', 'pos', 'forms', 'zh', 'example', 'exampleZh', 'notes', 'tags', 'suspended', 'deleted', 'batch'];
const editTime = (w) => w.editedAt ?? w.updatedAt ?? 0;

export function mergeWord(local, remote) {
  const src = editTime(local) > editTime(remote) ? local : remote;
  const resetAt = Math.max(local.resetAt || 0, remote.resetAt || 0);
  const cards = {};
  for (const t of new Set([...Object.keys(local.cards || {}), ...Object.keys(remote.cards || {})])) {
    const a = local.cards?.[t];
    const b = remote.cards?.[t];
    const c = !a ? b : !b ? a : (a.last || 0) > (b.last || 0) ? a : b;
    if (c && (c.state === 'new' || (c.last || 0) >= resetAt)) cards[t] = c;
  }
  cards.meaning ??= newCard();
  const merged = { ...remote, cards, createdAt: Math.min(local.createdAt, remote.createdAt), editedAt: editTime(src) };
  for (const k of META) if (k in src) merged[k] = src[k];
  if (resetAt) merged.resetAt = resetAt;
  // Article misses only grow, except that a reset starts them over.
  const lr = local.resetAt || 0;
  const rr = remote.resetAt || 0;
  const misses = lr === rr ? Math.max(local.artMiss || 0, remote.artMiss || 0) : ((lr > rr ? local : remote).artMiss || 0);
  if (misses) merged.artMiss = misses;
  else delete merged.artMiss;
  return merged;
}

const stable = (v) =>
  Array.isArray(v)
    ? `[${v.map(stable).join(',')}]`
    : v && typeof v === 'object'
      ? `{${Object.keys(v)
          .filter((k) => k !== 'dirty' && k !== 'updatedAt' && v[k] !== undefined)
          .sort()
          .map((k) => `${k}:${stable(v[k])}`)
          .join(',')}}`
      : JSON.stringify(v);

/** What to store when another copy of a word arrives; null when nothing changes. */
export function reconcile(local, remote) {
  if (!local) return { ...remote, dirty: false };
  if (remote.updatedAt === local.updatedAt) return null;
  const merged = mergeWord(local, remote);
  if (stable(merged) === stable(remote)) return remote.updatedAt > local.updatedAt ? { ...remote, dirty: false } : null;
  if (stable(merged) === stable(local) && local.updatedAt > remote.updatedAt) return local.dirty ? null : { ...local, dirty: true };
  // Both sides had something new: keep the merge and send it back so every device converges.
  return { ...merged, updatedAt: Math.max(local.updatedAt, remote.updatedAt) + 1, dirty: true };
}

export async function markBackedUp(now = Date.now()) {
  state.lastBackup = now;
  await idb.setKV('lastBackup', now);
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
    const next = reconcile(state.words.get(w.id), w);
    if (next) words.push({ ...next, dirty: true });
  }
  let settings = false;
  const s = data.settings;
  if (s && typeof s === 'object' && Number.isFinite(s.updatedAt) && s.updatedAt > state.settings.updatedAt) {
    state.settings = { ...DEFAULT_SETTINGS, ...s };
    state.settingsDirty = true;
    await idb.setKV('settings', { value: state.settings, dirty: true });
    settings = true;
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
  return { words: words.length, logs: logs.length, settings };
}

// Erases this device. `keep` lists kv entries that survive, such as the sync password and
// epoch, so a device that has just erased the library stays connected to it.
export async function wipeLocal(keep = []) {
  const kept = [];
  for (const key of keep) {
    const row = await idb.get('kv', key);
    if (row) kept.push(row);
  }
  await Promise.all([idb.clear('words'), idb.clear('logs'), idb.clear('kv')]);
  if (kept.length) await idb.putMany('kv', kept);
}

// Empties the words and review history, here and in memory. Settings stay and are sent to
// the library again.
export async function resetLocalLibrary() {
  await Promise.all([idb.clear('words'), idb.clear('logs')]);
  state.words = new Map();
  state.logs = [];
  state.settingsDirty = true;
  await idb.setKV('settings', { value: state.settings, dirty: true });
  emit();
}

