import { Router } from 'express';
import { z } from 'zod';
import { all, get, run, tx } from '../db.ts';
import { AppError } from '../errors.ts';
import { audit } from '../audit.ts';
import { encrypt, encryptionReady } from '../crypto.ts';
import { slugify, UNKNOWN_CAPS } from '../caps.ts';
import { wrap, idParam, httpUrl } from '../util.ts';

export const platformsRouter = Router();

const SELECT = `
SELECT p.*, (c.platform_id IS NOT NULL) AS has_credential, s.submission_policy, s.min_reward,
  (SELECT message FROM connection_tests t WHERE t.platform_id = p.id ORDER BY t.id DESC LIMIT 1) AS last_test_message,
  (SELECT ok FROM connection_tests t WHERE t.platform_id = p.id ORDER BY t.id DESC LIMIT 1) AS last_test_ok
FROM platforms p
LEFT JOIN encrypted_credentials c ON c.platform_id = p.id
LEFT JOIN platform_settings s ON s.platform_id = p.id`;

type Row = {
  id: number; slug: string; name: string; base_url: string | null; auth_type: string; connector: string; enabled: number;
  status: string; capabilities: string; last_sync_at: string | null; has_credential: number;
  submission_policy: string | null; min_reward: number | null; last_test_message: string | null; last_test_ok: number | null;
};

// Secrets are never part of this shape: only a boolean "hasCredential".
function serialize(r: Row) {
  return {
    id: r.id, slug: r.slug, name: r.name, baseUrl: r.base_url, authType: r.auth_type,
    connector: r.connector, implemented: r.connector !== 'template',
    enabled: !!r.enabled, status: r.status, capabilities: JSON.parse(r.capabilities), lastSyncAt: r.last_sync_at,
    hasCredential: !!r.has_credential, submissionPolicy: r.submission_policy ?? 'both', minReward: r.min_reward ?? 0,
    lastTest: r.last_test_message === null ? null : { ok: !!r.last_test_ok, message: r.last_test_message },
  };
}

function find(id: number): Row {
  const r = get<Row>(`${SELECT} WHERE p.id = ?`, id);
  if (!r) throw new AppError(404, 'NOT_FOUND', 'Platform not found');
  return r;
}

const authType = z.enum(['bearer', 'api_key', 'custom']);
const createSchema = z.object({ name: z.string().trim().min(2).max(60), baseUrl: httpUrl.nullable().optional(), authType: authType.default('bearer') });
const patchSchema = z.object({
  name: z.string().trim().min(2).max(60).optional(), baseUrl: httpUrl.nullable().optional(), authType: authType.optional(),
  enabled: z.boolean().optional(), submissionPolicy: z.enum(['auto', 'manual', 'both']).optional(), minReward: z.number().min(0).optional(),
});
const credSchema = z.object({ secret: z.string().min(8).max(4096), headerName: z.string().regex(/^[A-Za-z0-9-]{1,64}$/).optional() });

platformsRouter.get('/api/platforms', wrap((_req, res) => {
  res.json(all<Row>(`${SELECT} ORDER BY p.id`).map(serialize));
}));

platformsRouter.post('/api/platforms', wrap((req, res) => {
  const b = createSchema.parse(req.body);
  const base = slugify(b.name);
  let slug = base;
  for (let i = 2; get('SELECT 1 AS x FROM platforms WHERE slug = ?', slug); i++) slug = `${base}-${i}`;
  const id = tx(() => {
    const r = run('INSERT INTO platforms(slug, name, base_url, auth_type, connector, capabilities) VALUES (?, ?, ?, ?, ?, ?)',
      slug, b.name, b.baseUrl ?? null, b.authType, 'template', JSON.stringify(UNKNOWN_CAPS));
    run('INSERT INTO platform_settings(platform_id) VALUES (?)', Number(r.lastInsertRowid));
    return Number(r.lastInsertRowid);
  });
  audit('platform.create', 'platform', id, b.name);
  res.status(201).json(serialize(find(id)));
}));

platformsRouter.get('/api/platforms/:id', wrap((req, res) => res.json(serialize(find(idParam(req))))));

platformsRouter.patch('/api/platforms/:id', wrap((req, res) => {
  const id = idParam(req);
  find(id);
  const b = patchSchema.parse(req.body);
  tx(() => {
    const sets: string[] = [];
    const vals: (string | number | null)[] = [];
    if (b.name !== undefined) { sets.push('name = ?'); vals.push(b.name); }
    if (b.baseUrl !== undefined) { sets.push('base_url = ?'); vals.push(b.baseUrl); }
    if (b.authType !== undefined) { sets.push('auth_type = ?'); vals.push(b.authType); }
    if (b.enabled !== undefined) { sets.push('enabled = ?'); vals.push(b.enabled ? 1 : 0); }
    if (sets.length) run(`UPDATE platforms SET ${sets.join(', ')}, updated_at = datetime('now') WHERE id = ?`, ...vals, id);
    run('INSERT OR IGNORE INTO platform_settings(platform_id) VALUES (?)', id);
    if (b.submissionPolicy !== undefined) run('UPDATE platform_settings SET submission_policy = ? WHERE platform_id = ?', b.submissionPolicy, id);
    if (b.minReward !== undefined) run('UPDATE platform_settings SET min_reward = ? WHERE platform_id = ?', b.minReward, id);
  });
  audit('platform.update', 'platform', id, Object.keys(b).join(','));
  res.json(serialize(find(id)));
}));

platformsRouter.delete('/api/platforms/:id', wrap((req, res) => {
  const id = idParam(req);
  const p = find(id);
  run('DELETE FROM platforms WHERE id = ?', id);
  audit('platform.delete', 'platform', id, p.name);
  res.json({ ok: true });
}));

// API Manager: write-only credential storage (encrypted at rest, AES-256-GCM).
platformsRouter.put('/api/platforms/:id/credentials', wrap((req, res) => {
  const id = idParam(req);
  find(id);
  if (!encryptionReady()) {
    throw new AppError(503, 'ENCRYPTION_NOT_CONFIGURED',
      'Credential storage refused: WORKER_HUB_ENCRYPTION_KEY is missing or invalid. Run "npm run gen-key", then restart the server.');
  }
  const b = credSchema.parse(req.body);
  const enc = encrypt(b.secret, `platform:${id}`);
  run(`INSERT INTO encrypted_credentials(platform_id, ciphertext, iv, tag, header_name) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(platform_id) DO UPDATE SET ciphertext = excluded.ciphertext, iv = excluded.iv, tag = excluded.tag,
       header_name = excluded.header_name, updated_at = datetime('now')`, id, enc.ciphertext, enc.iv, enc.tag, b.headerName ?? null);
  run("UPDATE platforms SET status = CASE WHEN status = 'not_configured' THEN 'configured' ELSE status END, updated_at = datetime('now') WHERE id = ?", id);
  audit('credentials.set', 'platform', id);
  res.json(serialize(find(id)));
}));

platformsRouter.delete('/api/platforms/:id/credentials', wrap((req, res) => {
  const id = idParam(req);
  find(id);
  run('DELETE FROM encrypted_credentials WHERE platform_id = ?', id);
  run("UPDATE platforms SET status = 'not_configured', updated_at = datetime('now') WHERE id = ?", id);
  audit('credentials.delete', 'platform', id);
  res.json(serialize(find(id)));
}));

// Honest connection test: no connector exists yet, so we only check that the base URL answers.
// Credentials are NEVER sent here, and the result is never reported as "authenticated".
platformsRouter.post('/api/platforms/:id/test', wrap(async (req, res) => {
  const id = idParam(req);
  const p = find(id);
  let ok = false;
  let message: string;
  if (!p.base_url) {
    message = 'No API base URL configured. Add the base URL from the platform official documentation first.';
  } else {
    try {
      const r = await fetch(p.base_url, { method: 'GET', redirect: 'manual', signal: AbortSignal.timeout(8000) });
      ok = true;
      message = `Server reachable (HTTP ${r.status}). Credentials were NOT verified: this platform has no implemented connector yet.`;
    } catch (e) {
      message = `Unreachable (${e instanceof Error ? e.name : 'error'}).`;
    }
  }
  run('INSERT INTO connection_tests(platform_id, ok, message) VALUES (?, ?, ?)', id, ok ? 1 : 0, message);
  audit('platform.test', 'platform', id, ok ? 'reachable' : 'failed');
  res.json({ ok, reachable: ok, verified: false, message });
}));
