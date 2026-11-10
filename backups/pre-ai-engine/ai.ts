import { Router } from 'express';
import { z } from 'zod';
import { all, get, run, tx } from '../db.ts';
import { AppError } from '../errors.ts';
import { audit } from '../audit.ts';
import { wrap, idParam, httpUrl } from '../util.ts';

export const aiRouter = Router();

type Row = { id: number; name: string; kind: string; endpoint: string; model: string | null; timeout_ms: number; retries: number; enabled: number };

export function isLocalEndpoint(endpoint: string): boolean {
  try {
    const h = new URL(endpoint).hostname.replace(/^\[|\]$/g, '');
    return h === 'localhost' || h === '::1' || h.endsWith('.local') || /^127\./.test(h) || /^10\./.test(h) ||
      /^192\.168\./.test(h) || /^172\.(1[6-9]|2\d|3[01])\./.test(h);
  } catch { return false; }
}

const serialize = (r: Row) => ({
  id: r.id, name: r.name, kind: r.kind, endpoint: r.endpoint, model: r.model, timeoutMs: r.timeout_ms, retries: r.retries,
  enabled: !!r.enabled, isLocal: isLocalEndpoint(r.endpoint),
  models: all<{ name: string }>('SELECT name FROM ai_models WHERE provider_id = ? ORDER BY name', r.id).map((m) => m.name),
});
const find = (id: number) => {
  const r = get<Row>('SELECT * FROM ai_providers WHERE id = ?', id);
  if (!r) throw new AppError(404, 'NOT_FOUND', 'Provider not found');
  return r;
};

const base = z.object({
  name: z.string().trim().min(2).max(60), kind: z.enum(['ollama', 'openai_compatible']), endpoint: httpUrl,
  model: z.string().trim().max(120).nullable(), timeoutMs: z.number().int().min(1000).max(600000),
  retries: z.number().int().min(0).max(10), enabled: z.boolean(),
});
const createSchema = base.partial({ model: true, timeoutMs: true, retries: true, enabled: true });

aiRouter.get('/api/ai/providers', wrap((_req, res) => res.json(all<Row>('SELECT * FROM ai_providers ORDER BY id').map(serialize))));

aiRouter.post('/api/ai/providers', wrap((req, res) => {
  const b = createSchema.parse(req.body);
  const r = run('INSERT INTO ai_providers(name, kind, endpoint, model, timeout_ms, retries, enabled) VALUES (?, ?, ?, ?, ?, ?, ?)',
    b.name, b.kind, b.endpoint, b.model ?? null, b.timeoutMs ?? 60000, b.retries ?? 2, b.enabled === false ? 0 : 1);
  audit('ai.provider.create', 'ai_provider', Number(r.lastInsertRowid), b.name);
  res.status(201).json(serialize(find(Number(r.lastInsertRowid))));
}));

aiRouter.patch('/api/ai/providers/:id', wrap((req, res) => {
  const id = idParam(req);
  const cur = find(id);
  const b = { name: cur.name, kind: cur.kind, endpoint: cur.endpoint, model: cur.model, timeoutMs: cur.timeout_ms, retries: cur.retries, enabled: !!cur.enabled, ...base.partial().parse(req.body) };
  run('UPDATE ai_providers SET name=?, kind=?, endpoint=?, model=?, timeout_ms=?, retries=?, enabled=? WHERE id=?',
    b.name, b.kind, b.endpoint, b.model, b.timeoutMs, b.retries, b.enabled ? 1 : 0, id);
  audit('ai.provider.update', 'ai_provider', id);
  res.json(serialize(find(id)));
}));

aiRouter.delete('/api/ai/providers/:id', wrap((req, res) => {
  const id = idParam(req);
  find(id);
  run('DELETE FROM ai_providers WHERE id = ?', id);
  audit('ai.provider.delete', 'ai_provider', id);
  res.json({ ok: true });
}));

// Real probe of well-known model-listing endpoints (Ollama: /api/tags, OpenAI-compatible: /v1/models).
async function probe(kind: string, endpoint: string, timeoutMs: number): Promise<string[]> {
  const b = endpoint.replace(/\/+$/, '');
  const url = kind === 'ollama' ? `${b}/api/tags` : b.endsWith('/v1') ? `${b}/models` : `${b}/v1/models`;
  const r = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const j = (await r.json()) as { models?: { name: string }[]; data?: { id: string }[] };
  return kind === 'ollama' ? (j.models ?? []).map((m) => String(m.name)) : (j.data ?? []).map((m) => String(m.id));
}

const testSchema = z.object({ providerId: z.number().int().positive().optional(), kind: z.enum(['ollama', 'openai_compatible']), endpoint: httpUrl, timeoutMs: z.number().int().min(1000).max(60000).default(8000) });

aiRouter.post('/api/ai/test', wrap(async (req, res) => {
  const b = testSchema.parse(req.body);
  const isLocal = isLocalEndpoint(b.endpoint);
  try {
    const models = await probe(b.kind, b.endpoint, b.timeoutMs);
    if (b.providerId) {
      tx(() => {
        run('DELETE FROM ai_models WHERE provider_id = ?', b.providerId!);
        for (const m of models) run('INSERT OR IGNORE INTO ai_models(provider_id, name) VALUES (?, ?)', b.providerId!, m);
      });
    }
    res.json({ ok: true, isLocal, models, message: `Connected. ${models.length} model(s) found.${isLocal ? '' : ' Warning: this endpoint is NOT local and may be a paid cloud service.'}` });
  } catch (e) {
    res.json({ ok: false, isLocal, models: [], message: `Connection failed: ${e instanceof Error ? e.message : 'error'}` });
  }
}));

aiRouter.get('/api/ai/models', wrap((req, res) => {
  const pid = req.query.providerId ? Number(req.query.providerId) : null;
  res.json(pid
    ? all('SELECT provider_id AS providerId, name, available, checked_at AS checkedAt FROM ai_models WHERE provider_id = ? ORDER BY name', pid)
    : all('SELECT provider_id AS providerId, name, available, checked_at AS checkedAt FROM ai_models ORDER BY provider_id, name'));
}));
