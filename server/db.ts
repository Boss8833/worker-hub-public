import pg from 'pg';
import { config } from './config.ts';

const { Pool } = pg;

// حط رابط قاعدة البيانات هنا
const connectionString = process.env.DATABASE_URL || 'PASTE_HERE';

export const pool = new Pool({
  connectionString,
  ssl: { rejectUnauthorized: false },
});

type Param = string | number | bigint | null | boolean;

// دالة مساعدة لتحويل علامات الاستفهام (?) لعلامات PostgreSQL ($1, $2)
function convertSql(sql: string): string {
  let counter = 1;
  return sql.replace(/\?/g, () => `$${counter++}`);
}

// طبقة التوافق (Compatibility Layer) عشان الكود القديم يشتغل
export async function all<T>(sql: string, ...p: Param[]): Promise<T[]> {
  const res = await pool.query(convertSql(sql), p);
  return res.rows as T[];
}

export async function get<T>(sql: string, ...p: Param[]): Promise<T | undefined> {
  const res = await pool.query(convertSql(sql), p);
  return res.rows[0] as T | undefined;
}

export async function run(sql: string, ...p: Param[]) {
  return pool.query(convertSql(sql), p);
}

export async function tx<T>(fn: () => Promise<T> | T): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn();
    await client.query('COMMIT');
    return result;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

export const db = {}; // مؤقتاً لحد ما نظبط الـ migrations
