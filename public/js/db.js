// Minimal promise wrapper around IndexedDB. Stores: words, logs (keyPath id), kv (keyPath key).

const NAME = 'vocab-de';
const VERSION = 1;
let dbp;

function open() {
  dbp ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('words')) db.createObjectStore('words', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('logs')) db.createObjectStore('logs', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv', { keyPath: 'key' });
    };
    req.onsuccess = () => {
      const db = req.result;
      // Let another tab upgrade or delete the database instead of blocking it forever.
      db.onversionchange = () => {
        db.close();
        dbp = undefined;
      };
      resolve(db);
    };
    req.onerror = () => reject(req.error);
  });
  return dbp;
}

const done = (req) =>
  new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

async function tx(store, mode, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const result = fn(t.objectStore(store));
    t.oncomplete = () => resolve(result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

export const idb = {
  async all(store) {
    const db = await open();
    return done(db.transaction(store).objectStore(store).getAll());
  },
  async get(store, key) {
    const db = await open();
    return done(db.transaction(store).objectStore(store).get(key));
  },
  put: (store, value) => tx(store, 'readwrite', (s) => s.put(value)),
  putMany: (store, values) => tx(store, 'readwrite', (s) => values.forEach((v) => s.put(v))),
  del: (store, key) => tx(store, 'readwrite', (s) => s.delete(key)),
  clear: (store) => tx(store, 'readwrite', (s) => s.clear()),
  async getKV(key, fallback) {
    const row = await this.get('kv', key);
    return row ? row.value : fallback;
  },
  setKV: (key, value) => tx('kv', 'readwrite', (s) => s.put({ key, value })),
};
