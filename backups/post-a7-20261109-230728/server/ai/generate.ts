import { all, get } from '../db.ts';
import { AppError } from '../errors.ts';
import { audit } from '../audit.ts';
import { decrypt } from '../crypto.ts';

type ProviderRow = {
  id: number;
  name: string;
  kind: 'ollama' | 'openai_compatible';
  endpoint: string;
  model: string | null;
  timeout_ms: number;
  retries: number;
};

type CredentialRow = {
  ciphertext: string;
  iv: string;
  tag: string;
};

export interface GenerateTextInput {
  prompt: string;
  system?: string;
  maxTokens?: number;
  temperature?: number;
}

export interface GenerateTextResult {
  text: string;
  model: string;
  provider: string;
  usage: unknown;
}

interface TryProviderResult {
  text: string;
  model: string;
  provider: string;
  usage: unknown;
}

/**
 * يحاول توليد نص من مزود واحد.
 * بيرمي خطأ لو فشل تماماً (بعد كل الـ retries).
 */
async function tryProvider(
  provider: ProviderRow,
  input: GenerateTextInput,
): Promise<TryProviderResult> {
  let apiKey: string | undefined;
  if (provider.kind === 'openai_compatible') {
    const credential = get<CredentialRow>(
      `SELECT ciphertext, iv, tag
       FROM ai_provider_credentials
       WHERE provider_id = ?`,
      provider.id,
    );
    if (!credential) {
      throw new AppError(400, 'AI_CREDENTIAL_MISSING', `Provider "${provider.name}" API key is missing`);
    }
    apiKey = decrypt(credential, `ai-provider:${provider.id}`);
  }

  const messages = [
    ...(input.system ? [{ role: 'system', content: input.system }] : []),
    { role: 'user', content: input.prompt },
  ];

  const base = provider.endpoint.replace(/\/+$/, '');
  const url = provider.kind === 'ollama'
    ? `${base}/api/chat`
    : base.endsWith('/v1')
    ? `${base}/chat/completions`
    : `${base}/v1/chat/completions`;

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

  const maxTokens = input.maxTokens ?? 1200;
  const temperature = input.temperature ?? 0.2;

  for (let attempt = 0; attempt <= provider.retries; attempt++) {
    try {
      const body = provider.kind === 'ollama'
        ? { model: provider.model, messages, stream: false, options: { temperature, num_predict: maxTokens } }
        : { model: provider.model, messages, max_tokens: maxTokens, temperature, stream: false };

      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(provider.timeout_ms),
      });

      if (!response.ok) {
        if ((response.status === 429 || response.status >= 500) && attempt < provider.retries) {
          continue;
        }
        throw new AppError(502, 'AI_UPSTREAM_ERROR', `Provider "${provider.name}" returned HTTP ${response.status}`);
      }

      const data = await response.json() as {
        choices?: { message?: { content?: string } }[];
        message?: { content?: string };
        model?: string;
        usage?: unknown;
      };

      const text = provider.kind === 'ollama' ? data.message?.content : data.choices?.[0]?.message?.content;

      if (typeof text !== 'string' || !text.trim()) {
        throw new AppError(502, 'AI_EMPTY_RESPONSE', `Provider "${provider.name}" returned an empty response`);
      }

      audit('ai.generate', 'ai_provider', provider.id, provider.model ?? undefined);
      return { text, model: data.model ?? provider.model ?? 'unknown', provider: provider.name, usage: data.usage ?? null };
    } catch (error) {
      if (error instanceof AppError) throw error;
      if (attempt >= provider.retries) {
        throw new AppError(504, 'AI_REQUEST_FAILED', `Provider "${provider.name}" failed or timed out`);
      }
    }
  }

  throw new AppError(502, 'AI_REQUEST_FAILED', `Provider "${provider.name}" exhausted all retries`);
}

/**
 * يولد نص من أول مزود مفعّل ينجح.
 * لو مزود فشل، يجرب اللي بعده تلقائياً (fallback).
 */
export async function generateText(input: GenerateTextInput): Promise<GenerateTextResult> {
  const providers = all<ProviderRow>(
    `SELECT p.id, p.name, p.kind, p.endpoint, p.model,
            p.timeout_ms, p.retries
     FROM ai_providers p
     WHERE p.enabled = 1 AND p.model IS NOT NULL
     ORDER BY p.id`,
  );

  if (!providers || providers.length === 0) {
    throw new AppError(503, 'AI_PROVIDER_UNAVAILABLE', 'No enabled AI provider with a model is configured');
  }

  const errors: string[] = [];

  for (const provider of providers) {
    try {
      const result = await tryProvider(provider, input);
      if (errors.length > 0) {
        console.log(JSON.stringify({
          t: new Date().toISOString(),
          level: 'info',
          message: `AI fallback succeeded with "${provider.name}" after ${errors.length} failure(s)`,
        }));
      }
      return result;
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'unknown';
      errors.push(`${provider.name}: ${msg}`);
      console.log(JSON.stringify({
        t: new Date().toISOString(),
        level: 'warn',
        message: `AI provider "${provider.name}" failed, trying next`,
        error: msg,
      }));
    }
  }

  throw new AppError(502, 'AI_ALL_PROVIDERS_FAILED', `All ${providers.length} AI provider(s) failed: ${errors.join('; ')}`);
}
