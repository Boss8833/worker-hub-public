import { Router } from 'express';
import { z } from 'zod';
import { all, get, run, tx } from '../db.ts';
import { AppError } from '../errors.ts';
import { audit } from '../audit.ts';
import { generateText } from '../ai/generate.ts';
import { wrap, idParam, httpUrl } from '../util.ts';
import { encrypt, decrypt, encryptionReady } from '../crypto.ts';

export const aiRouter = Router();

type Row = {
  id: number;
  name: string;
  kind: 'ollama' | 'openai_compatible';
  endpoint: string;
  model: string | null;
  timeout_ms: number;
  retries: number;
  enabled: number;
  has_credential: number;
};

type CredentialRow = {
  ciphertext: string;
  iv: string;
  tag: string;
};

export function isLocalEndpoint(endpoint: string): boolean {
  try {
    const h = new URL(endpoint).hostname.replace(/^\[|\]$/g, '');
    return h === 'localhost' || h === '::1' || h.endsWith('.local') ||
      /^127\./.test(h) || /^10\./.test(h) || /^192\.168\./.test(h) ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(h);
  } catch {
    return false;
  }
}

const providerSelect = `
  SELECT p.*,
    CASE WHEN c.provider_id IS NULL THEN 0 ELSE 1 END AS has_credential
  FROM ai_providers p
  LEFT JOIN ai_provider_credentials c ON c.provider_id = p.id
`;

const serialize = (r: Row) => ({
  id: r.id,
  name: r.name,
  kind: r.kind,
  endpoint: r.endpoint,
  model: r.model,
  timeoutMs: r.timeout_ms,
  retries: r.retries,
  enabled: !!r.enabled,
  isLocal: isLocalEndpoint(r.endpoint),
  hasCredential: !!r.has_credential,
  models: all<{ name: string }>(
    'SELECT name FROM ai_models WHERE provider_id = ? ORDER BY name',
    r.id,
  ).map((m) => m.name),
});

const find = (id: number) => {
  const r = get<Row>(`${providerSelect} WHERE p.id = ?`, id);
  if (!r) throw new AppError(404, 'NOT_FOUND', 'Provider not found');
  return r;
};

const base = z.object({
  name: z.string().trim().min(2).max(60),
  kind: z.enum(['ollama', 'openai_compatible']),
  endpoint: httpUrl,
  model: z.string().trim().max(120).nullable(),
  timeoutMs: z.number().int().min(1000).max(600000),
  retries: z.number().int().min(0).max(10),
  enabled: z.boolean(),
});

const createSchema = base.partial({
  model: true,
  timeoutMs: true,
  retries: true,
  enabled: true,
});

aiRouter.get('/api/ai/providers', wrap((_req, res) => {
  const providers = all<Row>(`${providerSelect} ORDER BY p.id`);
  res.json(providers.map(serialize));
}));

aiRouter.post('/api/ai/providers', wrap((req, res) => {
  const b = createSchema.parse(req.body);

  const r = run(
    `INSERT INTO ai_providers
    (name, kind, endpoint, model, timeout_ms, retries, enabled)
    VALUES (?, ?, ?, ?, ?, ?, ?)`,
    b.name,
    b.kind,
    b.endpoint,
    b.model ?? null,
    b.timeoutMs ?? 60000,
    b.retries ?? 2,
    b.enabled === false ? 0 : 1,
  );

  const id = Number(r.lastInsertRowid);
  audit('ai.provider.create', 'ai_provider', id, b.name);

  res.status(201).json(serialize(find(id)));
}));

aiRouter.patch('/api/ai/providers/:id', wrap((req, res) => {
  const id = idParam(req);
  const cur = find(id);

  const b = {
    name: cur.name,
    kind: cur.kind,
    endpoint: cur.endpoint,
    model: cur.model,
    timeoutMs: cur.timeout_ms,
    retries: cur.retries,
    enabled: !!cur.enabled,
    ...base.partial().parse(req.body),
  };

  run(
    `UPDATE ai_providers
    SET name=?, kind=?, endpoint=?, model=?, timeout_ms=?, retries=?, enabled=?
    WHERE id=?`,
    b.name,
    b.kind,
    b.endpoint,
    b.model,
    b.timeoutMs,
    b.retries,
    b.enabled ? 1 : 0,
    id,
  );

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

const credentialSchema = z.object({
  secret: z.string().min(8).max(4096),
});

// Save or replace an AI provider API key.
// The plaintext key is never returned by this API.
aiRouter.put('/api/ai/providers/:id/credentials', wrap((req, res) => {
  const id = idParam(req);
  const provider = find(id);
  const { secret } = credentialSchema.parse(req.body);

  if (provider.kind !== 'openai_compatible') {
    throw new AppError(400, 'CREDENTIAL_NOT_REQUIRED', 'This provider does not require an API key');
  }

  if (!encryptionReady()) {
    throw new AppError(503, 'ENCRYPTION_NOT_CONFIGURED', 'Encrypted credential storage is unavailable');
  }

  const encrypted = encrypt(secret, `ai-provider:${id}`);

  run(
    `INSERT INTO ai_provider_credentials
    (provider_id, ciphertext, iv, tag, updated_at)
    VALUES (?, ?, ?, ?, datetime('now'))
    ON CONFLICT(provider_id) DO UPDATE SET
      ciphertext = excluded.ciphertext,
      iv = excluded.iv,
      tag = excluded.tag,
      updated_at = datetime('now')`,
    id,
    encrypted.ciphertext,
    encrypted.iv,
    encrypted.tag,
  );

  audit('ai.provider.credential.save', 'ai_provider', id);

  res.json({ ok: true, hasCredential: true });
}));

// Delete a saved API key.
aiRouter.delete('/api/ai/providers/:id/credentials', wrap((req, res) => {
  const id = idParam(req);
  find(id);

  run('DELETE FROM ai_provider_credentials WHERE provider_id = ?', id);
  audit('ai.provider.credential.delete', 'ai_provider', id);

  res.json({ ok: true, hasCredential: false });
}));

// Probe model-listing endpoints.
// Ollama: /api/tags
// OpenAI-compatible: /v1/models
async function probe(
  kind: string,
  endpoint: string,
  timeoutMs: number,
  apiKey?: string,
): Promise<string[]> {
  const b = endpoint.replace(/\/+$/, '');

  const url = kind === 'ollama'
    ? `${b}/api/tags`
    : b.endsWith('/v1') ? `${b}/models` : `${b}/v1/models`;

  const headers: Record<string, string> = {};

  if (kind === 'openai_compatible' && apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
  }

  const r = await fetch(url, {
    headers,
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!r.ok) {
    throw new Error(`HTTP ${r.status}`);
  }

  const j = await r.json() as {
    models?: { name: string }[];
    data?: { id: string }[];
  };

  return kind === 'ollama'
    ? (j.models ?? []).map((m) => String(m.name))
    : (j.data ?? []).map((m) => String(m.id));
}

const testSchema = z.object({
  providerId: z.number().int().positive().optional(),
  kind: z.enum(['ollama', 'openai_compatible']),
  endpoint: httpUrl,
  timeoutMs: z.number().int().min(1000).max(60000).default(8000),
});

aiRouter.post('/api/ai/test', wrap(async (req, res) => {
  const b = testSchema.parse(req.body);

  let kind = b.kind;
  let endpoint = b.endpoint;
  let isLocal = isLocalEndpoint(endpoint);

  try {
    let apiKey: string | undefined;

    if (b.providerId) {
      const provider = find(b.providerId);

      // Use the saved provider configuration, not client-supplied values.
      kind = provider.kind;
      endpoint = provider.endpoint;
      isLocal = isLocalEndpoint(endpoint);

      if (kind === 'openai_compatible') {
        const credential = get<CredentialRow>(
          `SELECT ciphertext, iv, tag
           FROM ai_provider_credentials
           WHERE provider_id = ?`,
          b.providerId,
        );

        if (credential) {
          apiKey = decrypt(credential, `ai-provider:${b.providerId}`);
        }
      }
    }

    const models = await probe(kind, endpoint, b.timeoutMs, apiKey);

    if (b.providerId) {
      tx(() => {
        run('DELETE FROM ai_models WHERE provider_id = ?', b.providerId!);

        for (const model of models) {
          run(
            'INSERT OR IGNORE INTO ai_models(provider_id, name) VALUES (?, ?)',
            b.providerId!,
            model,
          );
        }
      });
    }

    res.json({
      ok: true,
      isLocal,
      models,
      message: `Connected. ${models.length} model(s) found.${isLocal ? '' : ' Warning: this endpoint is NOT local and may be a paid cloud service.'}`,
    });
  } catch (e) {
    res.json({
      ok: false,
      isLocal,
      models: [],
      message: `Connection failed: ${e instanceof Error ? e.message : 'error'}`,
    });
  }
}));


// Generate text using the enabled, saved AI provider.
const generateSchema = z.object({
  prompt: z.string().trim().min(1).max(20000),
  system: z.string().max(4000).optional(),
  maxTokens: z.number().int().min(1).max(4096).default(1200),
  temperature: z.number().min(0).max(2).default(0.2),
});

aiRouter.post('/api/ai/generate', wrap(async (req, res) => {
  const input = generateSchema.parse(req.body);
  const result = await generateText(input);
  res.json({ ok: true, ...result });
}));
aiRouter.get('/api/ai/models', wrap((req, res) => {
  const pid = req.query.providerId ? Number(req.query.providerId) : null;

  res.json(
    pid
      ? all(
          'SELECT provider_id AS providerId, name, available, checked_at AS checkedAt FROM ai_models WHERE provider_id = ? ORDER BY name',
          pid,
        )
      : all(
          'SELECT provider_id AS providerId, name, available, checked_at AS checkedAt FROM ai_models ORDER BY provider_id, name',
        ),
  );
}));
