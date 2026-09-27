// The subset of the Cloudflare D1 API that src/worker.js uses, backed by node:sqlite.
import { DatabaseSync } from 'node:sqlite';

export function openD1(path) {
  const db = new DatabaseSync(path);
  if (path !== ':memory:') db.exec('PRAGMA journal_mode = WAL');
  // Bind numbered D1 placeholders by name; early node:sqlite versions do not
  // accept positional arguments for ?1, ?2, etc.
  const execute = (sql, args, method) => {
    const prepared = db.prepare(sql);
    if (/\?\d+/.test(sql)) {
      const bindings = Object.fromEntries(args.map((value, i) => ['?' + (i + 1), value]));
      return prepared[method](bindings);
    }
    return prepared[method](...args);
  };
  const statement = (sql, args = []) => ({
    bind: (...values) => statement(sql, values),
    all: async () => ({ results: execute(sql, args, 'all') }),
    run: async () => execute(sql, args, 'run'),
  });
  return {
    prepare: (sql) => statement(sql),
    async batch(list) {
      db.exec('BEGIN');
      try {
        for (const s of list) await s.run();
        db.exec('COMMIT');
      } catch (err) {
        db.exec('ROLLBACK');
        throw err;
      }
    },
    close: () => db.close(),
  };
}
