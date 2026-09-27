import { idb } from './db.js';
import { state, markSettingsClean, onChange } from './store.js';

const BATCH = 400;

export const sync = {
  token: '',
  cursor: 0,
  lastSync: 0,
  status: 'off', // off | idle | syncing | pending | error | offline
  error: '',
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
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') schedule(300);
    else if (hasPending()) syncNow();
  });
  setInterval(() => document.visibilityState === 'visible' && schedule(0), 5 * 60_000);
  if (sync.token) schedule(0);
}

let timer = null;
function schedule(ms) {
  clearTimeout(timer);
  timer = setTimeout(syncNow, ms);
}

function hasPending() {
  if (state.settingsDirty) return true;
  for (const w of state.words.values()) if (w.dirty) return true;
  return state.logs.some((l) => !l.synced);
}

async function api(path, body, token = sync.token) {
  const res = await fetch(path, {
    method: body ? 'POST' : 'GET',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
    keepalive: Boolean(body) && JSON.stringify(body).length < 60_000,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(res.status === 401 ? '同步口令不对' : data.error || `服务器错误 ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return data;
}

export async function setToken(token) {
  token = token.trim();
  if (token) {
    await api('/api/ping', null, token);
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
      const local = state.words.get(r.id);
      if (!local || r.updated_at > local.updatedAt) {
        const w = { ...r.data, updatedAt: r.updated_at, deleted: r.deleted, dirty: false };
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
      const changes = collect();
      let changed = false;
      for (;;) {
        const batch = changes.splice(0, BATCH);
        const res = await api('/api/sync', { since: sync.cursor, changes: batch });
        await markSent(batch);
        if (await applyRows(res.rows)) changed = true;
        sync.cursor = res.cursor;
        await idb.setKV('cursor', sync.cursor);
        if (!changes.length && !res.more) break;
      }
      sync.lastSync = Date.now();
      await idb.setKV('lastSync', sync.lastSync);
      setStatus(hasPending() ? 'pending' : 'idle');
      if (changed) emitRemote();
    } catch (err) {
      setStatus(navigator.onLine ? 'error' : 'offline', err.message);
    } finally {
      running = null;
    }
  })();
  return running;
}

// 远端数据写入后通知界面刷新，但不要触发新一轮上传
const remoteListeners = new Set();
export const onRemoteChange = (fn) => remoteListeners.add(fn);
function emitRemote() {
  remoteListeners.forEach((fn) => fn());
}
