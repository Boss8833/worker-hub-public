import { get } from '../db.ts';
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

export async function generateText(
  input: GenerateTextInput,
): Promise<GenerateTextResult> {
  const provider = get<ProviderRow>(
    `SELECT id, name, kind, endpoint, model, timeout_ms, retries
     FROM ai_providers
     WHERE enabled = 1
     ORDER BY id
     LIMIT 1`,
  );

  if (!provider) {
    throw new AppError(
      503,
      'AI_PROVIDER_UNAVAILABLE',
      'No enabled AI provider is configured',
    );
  }

  if (!provider.model) {
    throw new AppError(
      400,
      'AI_MODEL_NOT_SELECTED',
      'Select a model before generating text',
    );
  }

  let apiKey: string | undefined;

  if (provider.kind === 'openai_compatible') {
    const credential = get<CredentialRow>(
      `SELECT ciphertext, iv, tag
       FROM ai_provider_credentials
       WHERE provider_id = ?`,
      provider.id,
    );

    if (!credential) {
      throw new AppError(
        400,
        'AI_CREDENTIAL_MISSING',
        'The provider API key is missing',
      );
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

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
  }

  const maxTokens = input.maxTokens ?? 1200;
  const temperature = input.temperature ?? 0.2;

  for (let attempt = 0; attempt <= provider.retries; attempt++) {
    try {
      const body = provider.kind === 'ollama'
        ? {
            model: provider.model,
            messages,
            stream: false,
            options: {
              temperature,
              num_predict: maxTokens,
            },
          }
        : {
            model: provider.model,
            messages,
            max_tokens: maxTokens,
            temperature,
            stream: false,
          };

      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(provider.timeout_ms),
      });

      if (!response.ok) {
        if (
          (response.status === 429 || response.status >= 500) &&
          attempt < provider.retries
        ) {
          continue;
        }

        throw new AppError(
          502,
          'AI_UPSTREAM_ERROR',
          `AI provider returned HTTP ${response.status}`,
        );
      }

      const data = await response.json() as {
        choices?: { message?: { content?: string } }[];
        message?: { content?: string };
        model?: string;
        usage?: unknown;
      };

      const text = provider.kind === 'ollama'
        ? data.message?.content
        : data.choices?.[0]?.message?.content;

      if (typeof text !== 'string' || !text.trim()) {
        throw new AppError(
          502,
          'AI_EMPTY_RESPONSE',
          'AI provider returned an empty response',
        );
      }

      audit('ai.generate', 'ai_provider', provider.id, provider.model);

      return {
        text,
        model: data.model ?? provider.model,
        provider: provider.name,
        usage: data.usage ?? null,
      };
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }

      if (attempt >= provider.retries) {
        throw new AppError(
          504,
          'AI_REQUEST_FAILED',
          'AI provider request failed or timed out',
        );
      }
    }
  }

  throw new AppError(
    502,
    'AI_REQUEST_FAILED',
    'AI generation failed',
  );
}
