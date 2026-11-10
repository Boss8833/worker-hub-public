import Database from 'better-sqlite3';
import { join } from 'node:path';
import { config } from './config.ts';

export const db = new Database(join(config.dataDir, 'worker-hub.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

type Param = string | number | bigint | null;

export function all<T>(sql: string, ...p: Param[]): T[] {
  return db.prepare(sql).all(...p) as T[];
}

export function get<T>(sql: string, ...p: Param[]): T | undefined {
  return db.prepare(sql).get(...p) as T | undefined;
}

export function run(sql: string, ...p: Param[]) {
  return db.prepare(sql).run(...p);
}

export function tx<T>(fn: () => T): T {
  const transaction = db.transaction(fn);
  return transaction();
}
