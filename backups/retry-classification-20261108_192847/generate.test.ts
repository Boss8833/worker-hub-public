import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockGet, mockAudit, mockDecrypt, mockFetch } = vi.hoisted(() => ({
  mockGet: vi.fn(),
  mockAudit: vi.fn(),
  mockDecrypt: vi.fn(),
  mockFetch: vi.fn(),
}));

vi.mock('../db.ts', () => ({
  get: mockGet,
}));

vi.mock('../audit.ts', () => ({
  audit: mockAudit,
}));

vi.mock('../crypto.ts', () => ({
  decrypt: mockDecrypt,
}));

import { generateText } from './generate.ts';

function ollamaProvider(overrides = {}) {
  return {
    id: 1,
    name: 'Local Ollama',
    kind: 'ollama',
    endpoint: 'http://localhost:11434',
    model: 'llama3',
    timeout_ms: 5000,
    retries: 1,
    ...overrides,
  };
}

function successResponse(content = 'Generated text') {
  return new Response(
    JSON.stringify({
      message: { content },
      model: 'llama3',
    }),
    {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    },
  );
}

describe('generateText', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockReset();
    mockAudit.mockReset();
    mockDecrypt.mockReset();

    vi.stubGlobal('fetch', mockFetch);
  });

  it('rejects when no enabled provider exists', async () => {
    mockGet.mockReturnValue(null);

    await expect(
      generateText({ prompt: 'Test prompt' }),
    ).rejects.toMatchObject({
      status: 503,
      code: 'AI_PROVIDER_UNAVAILABLE',
    });

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('rejects when the provider has no selected model', async () => {
    mockGet.mockReturnValue(
      ollamaProvider({ model: null }),
    );

    await expect(
      generateText({ prompt: 'Test prompt' }),
    ).rejects.toMatchObject({
      status: 400,
      code: 'AI_MODEL_NOT_SELECTED',
    });

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('generates text using Ollama successfully', async () => {
    mockGet.mockReturnValue(ollamaProvider());
    mockFetch.mockResolvedValue(successResponse());

    const result = await generateText({
      prompt: 'Explain cybersecurity',
      system: 'You are a helpful assistant',
      maxTokens: 500,
      temperature: 0.4,
    });

    expect(result).toMatchObject({
      text: 'Generated text',
      model: 'llama3',
      provider: 'Local Ollama',
      usage: null,
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);

    const [url, options] = mockFetch.mock.calls[0];

    expect(url).toBe('http://localhost:11434/api/chat');
    expect(options.method).toBe('POST');

    const body = JSON.parse(options.body);

    expect(body.model).toBe('llama3');
    expect(body.stream).toBe(false);
    expect(body.options.num_predict).toBe(500);
    expect(body.options.temperature).toBe(0.4);
    expect(body.messages).toHaveLength(2);

    expect(mockAudit).toHaveBeenCalledTimes(1);
  });

  it('rejects OpenAI-compatible providers without credentials', async () => {
    mockGet.mockImplementation((sql: string) => {
      if (sql.includes('ai_provider_credentials')) {
        return null;
      }

      return ollamaProvider({
        kind: 'openai_compatible',
        endpoint: 'https://api.example.com/v1',
      });
    });

    await expect(
      generateText({ prompt: 'Test prompt' }),
    ).rejects.toMatchObject({
      status: 400,
      code: 'AI_CREDENTIAL_MISSING',
    });

    expect(mockFetch).not.toHaveBeenCalled();
    expect(mockDecrypt).not.toHaveBeenCalled();
  });

  it('uses decrypted credentials for OpenAI-compatible providers', async () => {
    mockGet.mockImplementation((sql: string) => {
      if (sql.includes('ai_provider_credentials')) {
        return {
          ciphertext: 'encrypted',
          iv: 'iv',
          tag: 'tag',
        };
      }

      return ollamaProvider({
        kind: 'openai_compatible',
        endpoint: 'https://api.example.com/v1',
      });
    });

    mockDecrypt.mockReturnValue('test-secret');
    mockFetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [
            { message: { content: 'OpenAI response' } },
          ],
          model: 'gpt-test',
          usage: { total_tokens: 20 },
        }),
        { status: 200 },
      ),
    );

    const result = await generateText({
      prompt: 'Test prompt',
    });

    expect(result.text).toBe('OpenAI response');
    expect(result.model).toBe('gpt-test');

    const [url, options] = mockFetch.mock.calls[0];

    expect(url).toBe(
      'https://api.example.com/v1/chat/completions',
    );

    expect(options.headers.Authorization).toBe(
      'Bearer test-secret',
    );

    expect(mockDecrypt).toHaveBeenCalledTimes(1);
  });

  it('retries after a temporary network failure', async () => {
    mockGet.mockReturnValue(
      ollamaProvider({ retries: 1 }),
    );

    mockFetch
      .mockRejectedValueOnce(new Error('Network failure'))
      .mockResolvedValueOnce(successResponse('Recovered'));

    const result = await generateText({
      prompt: 'Retry test',
    });

    expect(result.text).toBe('Recovered');
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('rejects an empty AI response', async () => {
    mockGet.mockReturnValue(ollamaProvider());

    mockFetch.mockResolvedValue(
      successResponse('   '),
    );

    await expect(
      generateText({ prompt: 'Test prompt' }),
    ).rejects.toMatchObject({
      status: 502,
      code: 'AI_EMPTY_RESPONSE',
    });
  });
});
