import express from 'express';
import { createServer, type Server } from 'node:http';
import { beforeAll, afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  all: vi.fn(),
  get: vi.fn(),
  run: vi.fn(),
  tx: vi.fn(),
  audit: vi.fn(),
  encrypt: vi.fn(),
  encryptionReady: vi.fn(),
  platform: {
    id: 7,
    slug: 'archive-test',
    name: 'Archive Test',
    base_url: 'https://example.invalid',
    auth_type: 'bearer',
    connector: 'template',
    enabled: 1,
    archived_at: null as string | null,
    status: 'configured',
    capabilities: '{}',
    last_sync_at: null,
    has_credential: 1,
    submission_policy: 'both',
    min_reward: 0,
    last_test_message: null,
    last_test_ok: null,
  },
}));

vi.mock('../db.ts', () => ({
  all: mocks.all,
  get: mocks.get,
  run: mocks.run,
  tx: mocks.tx,
}));

vi.mock('../audit.ts', () => ({
  audit: mocks.audit,
}));

vi.mock('../crypto.ts', () => ({
  encrypt: mocks.encrypt,
  encryptionReady: mocks.encryptionReady,
}));

import { platformsRouter } from './platforms.ts';
import { AppError } from '../errors.ts';

let server: Server;
let baseUrl = '';

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use(platformsRouter);

  app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (err instanceof AppError) {
      return res.status(err.status).json({
        error: { code: err.code, message: err.message },
      });
    }
    return res.status(500).json({ error: { code: 'INTERNAL' } });
  });

  server = createServer(app);
  server.listen(0, '127.0.0.1');

  await new Promise<void>((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });

  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Could not determine test server address');
  }

  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  if (server?.listening) {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  }
});

beforeEach(() => {
  mocks.platform.archived_at = null;
  mocks.platform.enabled = 1;
  mocks.platform.name = 'Archive Test';

  mocks.all.mockReset().mockReturnValue([]);
  mocks.get.mockReset().mockImplementation((sql: string) => {
    if (sql.includes('FROM platforms p')) {
      return { ...mocks.platform };
    }
    return undefined;
  });

  mocks.run.mockReset().mockImplementation((sql: string, ...params: unknown[]) => {
    if (sql.includes('SET archived_at = datetime')) {
      mocks.platform.archived_at = '2026-11-09 12:00:00';
    } else if (sql.includes('SET archived_at = NULL')) {
      mocks.platform.archived_at = null;
    } else if (sql.includes('SET name = ?')) {
      mocks.platform.name = String(params[0]);
    }
    return { changes: 1, lastInsertRowid: 7 };
  });

  mocks.tx.mockReset().mockImplementation((callback: () => unknown) => callback());
  mocks.audit.mockReset();
  mocks.encrypt.mockReset();
  mocks.encryptionReady.mockReset().mockReturnValue(false);
});

async function request(path: string, method: string, body?: unknown) {
  return fetch(`${baseUrl}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

describe('platform archive API', () => {
  it('archives a platform without changing its enabled state', async () => {
    const response = await request('/api/platforms/7', 'DELETE');

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, archived: true });
    expect(mocks.platform.archived_at).not.toBeNull();
    expect(mocks.platform.enabled).toBe(1);
    expect(mocks.audit).toHaveBeenCalledWith(
      'platform.archive',
      'platform',
      7,
      'Archive Test',
    );
  });

  it('does not modify an already archived platform again', async () => {
    mocks.platform.archived_at = '2026-11-09 12:00:00';

    const response = await request('/api/platforms/7', 'DELETE');

    expect(response.status).toBe(200);
    expect(mocks.run).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it('blocks editing an archived platform', async () => {
    mocks.platform.archived_at = '2026-11-09 12:00:00';

    const response = await request('/api/platforms/7', 'PATCH', {
      name: 'Should Not Change',
    });

    expect(response.status).toBe(409);
    expect(mocks.platform.name).toBe('Archive Test');
    expect(mocks.run).not.toHaveBeenCalled();
  });

  it('blocks credential changes and deletion while archived', async () => {
    mocks.platform.archived_at = '2026-11-09 12:00:00';

    const update = await request('/api/platforms/7/credentials', 'PUT', {
      secret: 'test-secret-value',
    });

    const remove = await request('/api/platforms/7/credentials', 'DELETE');

    expect(update.status).toBe(409);
    expect(remove.status).toBe(409);
    expect(mocks.encrypt).not.toHaveBeenCalled();
    expect(mocks.encryptionReady).not.toHaveBeenCalled();
    expect(mocks.run).not.toHaveBeenCalled();
  });

  it('blocks connection tests before any outbound request is recorded', async () => {
    mocks.platform.archived_at = '2026-11-09 12:00:00';

    const response = await request('/api/platforms/7/test', 'POST');

    expect(response.status).toBe(409);
    expect(mocks.run).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it('restores the platform and preserves its enabled state', async () => {
    mocks.platform.archived_at = '2026-11-09 12:00:00';

    const response = await request('/api/platforms/7/restore', 'POST');

    expect(response.status).toBe(200);

    const body = await response.json() as {
      archivedAt: string | null;
      enabled: boolean;
      hasCredential: boolean;
    };

    expect(body.archivedAt).toBeNull();
    expect(body.enabled).toBe(true);
    expect(body.hasCredential).toBe(true);
    expect(mocks.platform.archived_at).toBeNull();
    expect(mocks.audit).toHaveBeenCalledWith(
      'platform.restore',
      'platform',
      7,
      'Archive Test',
    );
  });

  it('allows editing again after restoration', async () => {
    const response = await request('/api/platforms/7', 'PATCH', {
      name: 'Restored Platform',
    });

    expect(response.status).toBe(200);
    expect(mocks.platform.name).toBe('Restored Platform');
  });
});
