import { Router } from 'express';
import { z } from 'zod';
import { mkdirSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { config } from '../config.ts';
import { db, all, get, run } from '../db.ts';
import { encryptionReady } from '../crypto.ts';
import { audit } from '../audit.ts';
import { wrap } from '../util.ts';
import { earningsSummary } from './finance.ts';

export const systemRouter = Router();

systemRouter.get('/api/health', wrap((_req, res) => {
  db.prepare('SELECT 1').get();
  res.json({
    ok: true, version: config.version, time: new Date().toISOString(), node: process.version, db: 'ok',
    encryptionConfigured: encryptionReady(), accessTokenRequired: !!config.accessToken, workerEngine: 'not_implemented',
  });
}));

systemRouter.get('/api/dashboard', wrap((_req, res) => {
  const count = (statuses: string[]) =>
    get<{ n: number }>(`SELECT COUNT(*) AS n FROM tasks WHERE is_mock = 0 AND status IN (${statuses.map(() => '?').join(',')})`, ...statuses)!.n;
  const ai = get<{ name: string; model: string | null }>('SELECT name, model FROM ai_providers WHERE enabled = 1 ORDER BY id LIMIT 1');
  const p = get<{ total: number; connected: number; enabled: number }>(
    "SELECT COUNT(*) AS total, SUM(status='connected') AS connected, SUM(enabled) AS enabled FROM platforms")!;
  res.json({
    earnings: earningsSummary(),
    tasks: { completed: count(['completed', 'submitted']), active: count(['queued', 'executing', 'validating', 'awaiting_approval']), failed: count(['failed', 'rejected']) },
    platforms: { total: p.total, connected: p.connected ?? 0, enabled: p.enabled ?? 0 },
    worker: { state: 'STOPPED', running: false },
    ai: { configured: !!ai, provider: ai?.name ?? null, model: ai?.model ?? null },
    recentTasks: all('SELECT t.id, t.title, t.status, t.reward, t.currency, p.name AS platformName FROM tasks t JOIN platforms p ON p.id = t.platform_id WHERE t.is_mock = 0 ORDER BY t.updated_at DESC LIMIT 5'),
    recentTransactions: all('SELECT id, kind, amount, currency, reference, created_at AS createdAt FROM transactions WHERE is_mock = 0 ORDER BY id DESC LIMIT 5'),
  });
}));

const settingsSchema = z.object({ notifications: z.boolean().optional() });
const DEFAULTS = { notifications: true };

systemRouter.get('/api/settings', wrap((_req, res) => {
  const rows = all<{ key: string; value: string }>("SELECT key, value FROM application_settings WHERE key IN ('notifications')");
  const out: Record<string, unknown> = { ...DEFAULTS };
  for (const r of rows) out[r.key] = JSON.parse(r.value);
  res.json(out);
}));

systemRouter.put('/api/settings', wrap((req, res) => {
  const b = settingsSchema.parse(req.body);
  for (const [k, v] of Object.entries(b)) {
    if (v === undefined) continue;
    run("INSERT INTO application_settings(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')", k, JSON.stringify(v));
  }
  audit('settings.update', 'settings', 'app', Object.keys(b).join(','));
  res.json({ ok: true });
}));

const backupDir = () => join(config.dataDir, 'backups');

systemRouter.post('/api/settings/backup', wrap((_req, res) => {
  mkdirSync(backupDir(), { recursive: true });
  const name = `worker-hub-${new Date().toISOString().replace(/[:.]/g, '-')}.db`;
  const target = join(backupDir(), name).replace(/'/g, "''");
  db.exec(`VACUUM INTO '${target}'`); // path is generated server-side, never from user input
  audit('backup.create', 'database', name);
  res.status(201).json({ file: name, note: 'Credentials inside the backup stay encrypted; keep your .env key safe too.' });
}));

systemRouter.get('/api/settings/backups', wrap((_req, res) => {
  let files: { file: string; bytes: number }[] = [];
  try {
    files = readdirSync(backupDir()).filter((f) => f.endsWith('.db')).sort().reverse().slice(0, 20)
      .map((f) => ({ file: f, bytes: statSync(join(backupDir(), f)).size }));
  } catch { /* no backups yet */ }
  res.json(files);
}));
