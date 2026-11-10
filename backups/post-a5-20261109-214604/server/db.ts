import { DatabaseSync } from 'node:sqlite';
import { join } from 'node:path';
import { config } from './config.ts';

export const db = new DatabaseSync(join(config.dataDir, 'worker-hub.db'));
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');

type Param = string | number | bigint | null;

export function all<T>(sql: string, ...p: Param[]): T[] {
  return db.prepare(sql).all(...p) as unknown as T[];
}
export function get<T>(sql: string, ...p: Param[]): T | undefined {
  return db.prepare(sql).get(...p) as unknown as T | undefined;
}
export function run(sql: string, ...p: Param[]) {
  return db.prepare(sql).run(...p);
}
export function tx<T>(fn: () => T): T {
  db.exec('BEGIN');
  try {
    const r = fn();
    db.exec('COMMIT');
    return r;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}
