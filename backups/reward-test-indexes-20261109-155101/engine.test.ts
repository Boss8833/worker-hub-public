import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  all: vi.fn(),
  get: vi.fn(),
  run: vi.fn(),
  discover: vi.fn(),
}));

vi.mock('../db.ts', () => ({
  all: mocks.all,
  get: mocks.get,
  run: mocks.run,
}));

vi.mock('../connectors/registry.ts', () => ({
  getConnector: () => ({
    platformSlug: 'taskmarket',
    discover: mocks.discover,
  }),
}));

import { discoverEnabledPlatforms, discoverPlatform } from './engine.ts';

const platform = {
  id: 1,
  slug: 'taskmarket',
  base_url: '',
  enabled: 1,
  connector: 'taskmarket',
  archived_at: null,
};

const settings = {
  min_reward: 5,
  filters_json: '{"include":[],"exclude":[]}',
};

const task = {
  externalId: 'external-1',
  title: 'Write a security report',
  description: 'Prepare a security report',
  requirements: '',
  reward: 10,
  currency: 'USDC',
  deadline: null,
  aiSuitability: null,
  eligibility: 'eligible' as const,
  eligibilityReasons: [],
  platformId: 1,
  platformSlug: 'taskmarket',
  discoveredAt: new Date().toISOString(),
};

describe('discovery eligibility', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.get.mockImplementation((sql: string) => {
      if (sql.includes('FROM platforms')) return platform;
      if (sql.includes('FROM worker_settings')) return settings;
      if (sql.includes('FROM tasks')) return undefined;
      return undefined;
    });

    mocks.discover.mockResolvedValue([task]);
    mocks.run.mockReturnValue({ changes: 1 });
  });

  it('stores an eligible discovered task as eligible', async () => {
    const result = await discoverPlatform(1);

    expect(result.inserted).toBe(1);
    expect(mocks.run).toHaveBeenCalledOnce();

    const call = mocks.run.mock.calls[0];
    expect(call[10]).toBe('eligible');
    expect(call[12]).toBe('eligible');
  });

  it('stores an ineligible discovered task', async () => {
    mocks.discover.mockResolvedValue([{
      ...task,
      eligibility: 'ineligible',
      eligibilityReasons: ['expired'],
    }]);

    const result = await discoverPlatform(1);

    expect(result.inserted).toBe(1);
    expect(result.skipped).toBe(0);
    expect(mocks.run).toHaveBeenCalledOnce();

    const call = mocks.run.mock.calls[0];
    expect(call[10]).toBe('ineligible');
    expect(call[13]).toContain('expired');
  });

  it('keeps a very small reward eligible', async () => {
    mocks.discover.mockResolvedValue([{
      ...task,
      reward: 0.0001,
      rewardKnown: true,
    }]);

    const result = await discoverPlatform(1);

    expect(result.inserted).toBe(1);
    const call = mocks.run.mock.calls[0];
    expect(call[5]).toBe(0.0001);
    expect(call[6]).toBe(1);
    expect(call[11]).toBe('eligible');
  });

  it('stores an unknown reward as unknown eligibility', async () => {
    mocks.discover.mockResolvedValue([{
      ...task,
      reward: 0,
      rewardKnown: false,
    }]);

    const result = await discoverPlatform(1);

    expect(result.inserted).toBe(1);
    const call = mocks.run.mock.calls[0];
    expect(call[6]).toBe(0);
    expect(call[9]).toBe('discovered');
    expect(call[11]).toBe('unknown');
    expect(call[12]).toContain('Reward amount is missing or invalid');
  });

  it('does not discover an archived platform', async () => {
    mocks.get.mockImplementation((sql: string) => {
      if (sql.includes('FROM platforms')) {
        return { ...platform, archived_at: '2026-11-09 12:00:00' };
      }
      if (sql.includes('FROM worker_settings')) return settings;
      return undefined;
    });

    const result = await discoverPlatform(1);

    expect(result.errors).toContain('Platform is archived');
    expect(mocks.discover).not.toHaveBeenCalled();
    expect(mocks.run).not.toHaveBeenCalled();
  });

  it('does not insert a duplicate task', async () => {
    mocks.get.mockImplementation((sql: string) => {
      if (sql.includes('FROM platforms')) return platform;
      if (sql.includes('FROM worker_settings')) return settings;
      if (sql.includes('FROM tasks')) return { id: 99 };
      return undefined;
    });

    const result = await discoverPlatform(1);

    expect(result.inserted).toBe(0);
    expect(result.updated).toBe(1);
    expect(result.skipped).toBe(0);
    expect(mocks.run).toHaveBeenCalledOnce();
  });

  it('discovers every enabled platform', async () => {
    mocks.all.mockReturnValue([platform]);

    const results = await discoverEnabledPlatforms();

    expect(results).toHaveLength(1);
    expect(results[0].inserted).toBe(1);
  });

  it('excludes archived platforms from batch discovery', async () => {
    mocks.all.mockReturnValue([]);

    await discoverEnabledPlatforms();

    expect(mocks.all).toHaveBeenCalledOnce();
    expect(mocks.all.mock.calls[0][0]).toContain('archived_at IS NULL');
  });

  it('returns no results when no platform is enabled', async () => {
    mocks.all.mockReturnValue([]);

    const results = await discoverEnabledPlatforms();

    expect(results).toEqual([]);
    expect(mocks.discover).not.toHaveBeenCalled();
  });
});
