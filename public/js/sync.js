import { idb } from './db.js';
import { state, markSettingsClean, markAllDirty, onChange, reconcile, resetLocalLibrary, compactLogs, acceptDay, saveDays, logCutoff } from './store.js';

const BATCH = 400;

export const sync = {
  token: '',
  cursor: 0,
  epoch: null, // which erase-generation of the library this device has seen; null: unknown yet
  lastSync: 0,
  status: 'off', // off | idle | syncing | pending | error | offline
  error: '', // token | server | network
};

const listeners = new Set();
export const onSyncChange = (fn) => listeners.add(fn);
function setStatus(status, error = '') {
  sync.status = status;
  sync.error = error;
  listeners.forEach((fn) => fn());
}

export async function initSync() {
  sync.token = await idb.getKV('token', '');
  sync.cursor = await idb.getKV('cursor', 0);
  sync.epoch = await idb.getKV('epoch', null);
  sync.lastSync = await idb.getKV('lastSync', 0);
  setStatus(sync.token ? 'idle' : 'off');

  onChange(() => {
    if (!sync.token) return;
    idlePolls = 0;
    if (sync.status === 'idle') setStatus('pending');
    schedule(4000);
  });
  window.addEventListener('online', () => schedule(500));
  window.addEventListener('offline', () => sync.token && setStatus('offline'));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') schedule(300);
    else if (hasPending()) syncNow();
  });
  polling = true;
  armPoll();
  if (sync.token) schedule(0);
}

// A page left open polls the server now and then. While nothing happens the gaps grow: 5, 10, 20,
// at most 30 minutes; any change on either side starts over at 5. Coming back to the page
// always syncs at once, so a longer gap only matters for pages nobody is looking at.
export const nextPollMinutes = (idle) => Math.min(30, 5 * 2 ** idle);
let idlePolls = 0;
let polling = false;
let pollTimer = null;
function armPoll() {
  if (!polling) return;
  clearTimeout(pollTimer);
  pollTimer = setTimeout(() => (document.visibilityState === 'visible' ? schedule(0) : armPoll()), nextPollMinutes(idlePolls) * 60_000);
}

let timer = null;
let failures = 0;
let changingToken = false;
function schedule(ms) {
  clearTimeout(timer);
  if (changingToken) return;
  timer = setTimeout(syncNow, ms);
}

function hasPending() {
  if (state.settingsDirty) return true;
  for (const w of state.words.values()) if (w.dirty) return true;
  for (const d of state.days.values()) if (d.dirty) return true;
  return state.logs.some((l) => !l.synced);
}

// Errors carry a code (token | server | network) that the UI translates.
async function api(path, body, token = sync.token) {
  let res;
  try {
    res = await fetch(path, {
      method: body ? 'POST' : 'GET',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
      keepalive: Boolean(body) && JSON.stringify(body).length < 60_000,
    });
  } catch {
    throw Object.assign(new Error('network error'), { code: 'network' });
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const code = res.status === 401 ? 'token' : 'server';
    throw Object.assign(new Error(data.error || `HTTP ${res.status}`), { code, status: res.status });
  }
  return data;
}

export async function setToken(token) {
  if (changingToken) throw Object.assign(new Error('library switch in progress'), { code: 'server' });
  token = token.trim();
  changingToken = true;
  clearTimeout(timer);
  try {
    // Finish the old library's requests before changing its token or cursor. A slow
    // background pull must never complete inside the newly selected library.
    if (running) await running;
    if (token) {
      await api('/api/ping', null, token);
    }
    // A different password may mean a different server: pull from the start and push
    // everything, otherwise records synced to the old server would never reach the new one.
    if (token && token !== sync.token) {
      sync.cursor = 0;
      sync.epoch = null;
      await idb.setKV('cursor', 0);
      await idb.setKV('epoch', null);
      await markAllDirty();
    }
    sync.token = token;
    await idb.setKV('token', token);
    setStatus(token ? 'idle' : 'off');
  } finally {
    changingToken = false;
    clearTimeout(timer);
    if (sync.token) schedule(500);
  }
  if (token) await syncNow();
}

/** What a password opens, before connecting: { ok, mode, words }. Also checks the password. */
export const peek = (token) => api('/api/ping', null, token);

/** Erases this password's library on the server. Waits for a running sync so it can't refill it. */
export async function wipeRemote() {
  await running;
  const res = await api('/api/wipe', {});
  sync.cursor = 0;
  sync.epoch = res.epoch ?? null;
  await idb.setKV('cursor', 0);
  await idb.setKV('epoch', sync.epoch);
}

// Called after a sync found that the library was erased from another device and this one
// cleared itself to match.
const resetListeners = new Set();
export const onLibraryReset = (fn) => resetListeners.add(fn);

function collect() {
  const changes = [];
  if (state.settingsDirty) {
    changes.push({ kind: 'settings', id: 'main', updated_at: state.settings.updatedAt, data: state.settings });
  }
  for (const w of state.words.values()) {
    if (!w.dirty) continue;
    const { dirty, ...data } = w;
    changes.push({ kind: 'word', id: w.id, updated_at: w.updatedAt, deleted: w.deleted, data });
  }
  for (const d of state.days.values()) {
    if (!d.dirty) continue;
    const { dirty, ...data } = d;
    changes.push({ kind: 'day', id: d.id, updated_at: d.updatedAt, data });
  }
  for (const l of state.logs) {
    if (l.synced) continue;
    const { synced, ...data } = l;
    changes.push({ kind: 'log', id: l.id, updated_at: l.ts, data });
  }
  return changes;
}

async function markSent(batch) {
  const words = [];
  const logs = [];
  let days = false;
  const byId = new Map(state.logs.map((l) => [l.id, l]));
  for (const c of batch) {
    if (c.kind === 'word') {
      const w = state.words.get(c.id);
      if (w && w.updatedAt === c.updated_at && w.dirty) {
        w.dirty = false;
        words.push(w);
      }
    } else if (c.kind === 'log') {
      const l = byId.get(c.id);
      if (l) {
        l.synced = true;
        logs.push(l);
      }
    } else if (c.kind === 'day') {
      const d = state.days.get(c.id);
      if (d && d.updatedAt === c.updated_at && d.dirty) {
        d.dirty = false;
        days = true;
      }
    } else if (c.kind === 'settings') {
      await markSettingsClean(c.updated_at);
    }
  }
  if (words.length) await idb.putMany('words', words);
  if (logs.length) await idb.putMany('logs', logs);
  if (days) await saveDays();
}

async function applyRows(rows) {
  const words = [];
  const logs = [];
  const knownLogs = new Set(state.logs.map((l) => l.id));
  const cutoff = logCutoff(Date.now());
  let changed = false;
  let days = false;
  for (const r of rows) {
    if (r.kind === 'word' && r.data) {
      const w = reconcile(state.words.get(r.id), { ...r.data, updatedAt: r.updated_at, deleted: r.deleted });
      if (w) {
        state.words.set(w.id, w);
        words.push(w);
      }
    } else if (r.kind === 'day' && r.data) {
      if (acceptDay({ ...r.data, updatedAt: r.updated_at })) days = changed = true;
      // logs older than this are only kept as day summaries; see compactLogs
    } else if (r.kind === 'log' && r.data && r.data.ts >= cutoff && !knownLogs.has(r.id)) {
      const l = { ...r.data, synced: true };
      logs.push(l);
      knownLogs.add(r.id);
    } else if (r.kind === 'settings' && r.data && r.updated_at > state.settings.updatedAt) {
      Object.assign(state.settings, r.data);
      state.settingsDirty = false;
      await idb.setKV('settings', { value: state.settings, dirty: false });
      changed = true;
    }
  }
  if (words.length) await idb.putMany('words', words);
  if (days) await saveDays();
  if (logs.length) {
    await idb.putMany('logs', logs);
    state.logs = [...state.logs, ...logs].sort((a, b) => a.ts - b.ts);
  }
  return changed || words.length > 0 || logs.length > 0;
}

let running = null;
export function syncNow() {
  if (changingToken) return running || Promise.resolve();
  if (!sync.token) return Promise.resolve();
  if (running) return running;
  running = (async () => {
    if (!navigator.onLine) {
      setStatus('offline');
      return;
    }
    setStatus('syncing');
    try {
      let changed = false;
      let wasReset = false;
      let sent = 0;
      const round = async (batch) => {
        sent += batch.length;
        const res = await api('/api/sync', { since: sync.cursor, epoch: sync.epoch, changes: batch });
        if (res.reset) {
          // The library was erased from another device: what is here belongs to the old one.
          await resetLocalLibrary();
          sync.cursor = 0;
          sync.epoch = res.epoch;
          await idb.setKV('cursor', 0);
          await idb.setKV('epoch', sync.epoch);
          changed = wasReset = true;
          return { reset: true, more: true };
        }
        await markSent(batch);
        if (await applyRows(res.rows)) changed = true;
        sync.cursor = res.cursor;
        await idb.setKV('cursor', sync.cursor);
        if (res.epoch !== undefined && sync.epoch === null) {
          sync.epoch = res.epoch;
          await idb.setKV('epoch', sync.epoch);
        }
        return res;
      };
      const pull = async () => {
        while ((await round([])).more);
      };
      // Pull first: local edits are merged with anything newer from other devices before
      // they are sent, instead of overwriting it.
      await pull();
      const changes = collect();
      while (changes.length) {
        if ((await round(changes.splice(0, BATCH))).reset) {
          // erased in the meantime: the rest of these changes belong to the old library
          changes.length = 0;
          await pull();
        }
      }
      sync.lastSync = Date.now();
      await idb.setKV('lastSync', sync.lastSync);
      failures = 0;
      setStatus(hasPending() ? 'pending' : 'idle');
      idlePolls = changed || sent ? 0 : idlePolls + 1;
      if (changed) emitRemote();
      if (wasReset) resetListeners.forEach((fn) => fn());
      // Everything is in sync, so old logs can safely become day summaries; the summaries are
      // uploaded by the sync this schedules.
      if (!hasPending()) await compactLogs();
    } catch (err) {
      setStatus(navigator.onLine ? 'error' : 'offline', err.code || 'server');
      // A wrong password won't fix itself; anything else is retried with backoff.
      if (err.code !== 'token') schedule(Math.min(10 * 60_000, 15_000 * 2 ** failures++));
    } finally {
      running = null;
      armPoll();
    }
  })();
  return running;
}

// Remote changes refresh the UI without marking anything dirty.
const remoteListeners = new Set();
export const onRemoteChange = (fn) => remoteListeners.add(fn);
function emitRemote() {
  remoteListeners.forEach((fn) => fn());
}
