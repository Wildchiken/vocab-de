import { idb } from './db.js';
import { state, markSettingsClean, markAllDirty, onChange, reconcile } from './store.js';

const BATCH = 400;

export const sync = {
  token: '',
  cursor: 0,
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
  sync.lastSync = await idb.getKV('lastSync', 0);
  setStatus(sync.token ? 'idle' : 'off');

  onChange(() => {
    if (!sync.token) return;
    if (sync.status === 'idle') setStatus('pending');
    schedule(4000);
  });
  window.addEventListener('online', () => schedule(500));
  window.addEventListener('offline', () => sync.token && setStatus('offline'));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') schedule(300);
    else if (hasPending()) syncNow();
  });
  setInterval(() => document.visibilityState === 'visible' && schedule(0), 5 * 60_000);
  if (sync.token) schedule(0);
}

let timer = null;
let failures = 0;
function schedule(ms) {
  clearTimeout(timer);
  timer = setTimeout(syncNow, ms);
}

function hasPending() {
  if (state.settingsDirty) return true;
  for (const w of state.words.values()) if (w.dirty) return true;
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
  token = token.trim();
  if (token) {
    await api('/api/ping', null, token);
  }
  // A different password may mean a different server: pull from the start and push
  // everything, otherwise records synced to the old server would never reach the new one.
  if (token && token !== sync.token) {
    sync.cursor = 0;
    await idb.setKV('cursor', 0);
    await markAllDirty();
  }
  sync.token = token;
  await idb.setKV('token', token);
  setStatus(token ? 'idle' : 'off');
  if (token) await syncNow();
}

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
    } else if (c.kind === 'settings') {
      await markSettingsClean(c.updated_at);
    }
  }
  if (words.length) await idb.putMany('words', words);
  if (logs.length) await idb.putMany('logs', logs);
}

async function applyRows(rows) {
  const words = [];
  const logs = [];
  const knownLogs = new Set(state.logs.map((l) => l.id));
  let changed = false;
  for (const r of rows) {
    if (r.kind === 'word' && r.data) {
      const w = reconcile(state.words.get(r.id), { ...r.data, updatedAt: r.updated_at, deleted: r.deleted });
      if (w) {
        state.words.set(w.id, w);
        words.push(w);
      }
    } else if (r.kind === 'log' && r.data && !knownLogs.has(r.id)) {
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
  if (logs.length) {
    await idb.putMany('logs', logs);
    state.logs = [...state.logs, ...logs].sort((a, b) => a.ts - b.ts);
  }
  return changed || words.length > 0 || logs.length > 0;
}

let running = null;
export function syncNow() {
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
      const round = async (batch) => {
        const res = await api('/api/sync', { since: sync.cursor, changes: batch });
        await markSent(batch);
        if (await applyRows(res.rows)) changed = true;
        sync.cursor = res.cursor;
        await idb.setKV('cursor', sync.cursor);
        return res;
      };
      // Pull first: local edits are merged with anything newer from other devices before
      // they are sent, instead of overwriting it.
      while ((await round([])).more);
      const changes = collect();
      while (changes.length) await round(changes.splice(0, BATCH));
      sync.lastSync = Date.now();
      await idb.setKV('lastSync', sync.lastSync);
      failures = 0;
      setStatus(hasPending() ? 'pending' : 'idle');
      if (changed) emitRemote();
    } catch (err) {
      setStatus(navigator.onLine ? 'error' : 'offline', err.code || 'server');
      // A wrong password won't fix itself; anything else is retried with backoff.
      if (err.code !== 'token') schedule(Math.min(10 * 60_000, 15_000 * 2 ** failures++));
    } finally {
      running = null;
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
