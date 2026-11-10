import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  run: vi.fn(),
  tx: vi.fn((operation: () => unknown) => operation()),
  generateText: vi.fn(),
}));

vi.mock('../db.ts', () => ({
  get: mocks.get,
  run: mocks.run,
  tx: mocks.tx,
}));

vi.mock('../ai/generate.ts', () => ({
  generateText: mocks.generateText,
}));

import { executeClaimedTask } from './executor.ts';
import { AppError } from '../errors.ts';
import type { ClaimedTask } from './queue.ts';

const task: ClaimedTask = {
  id: 10,
  platform_id: 1,
  external_id: 'external-10',
  title: 'Write a security report',
  description: 'Prepare a security report',
  requirements: 'Include recommendations',
  reward: 10,
  currency: 'USDC',
  deadline: null,
  ai_suitability: null,
  is_mock: 0,
  executionId: 20,
  attempt: 1,
};

describe('task executor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.get.mockReturnValue({ status: 'executing' });
    mocks.run.mockReturnValue({ changes: 1 });
    mocks.generateText.mockResolvedValue({
      text: 'Security report output',
      model: 'test-model',
      provider: 'test-provider',
      usage: null,
    });
  });

  it('generates output and moves the task to validating', async () => {
    const result = await executeClaimedTask(task);

    expect(result.output).toBe('Security report output');
    expect(result.taskId).toBe(10);
    expect(result.executionId).toBe(20);
    expect(mocks.generateText).toHaveBeenCalledOnce();

    expect(mocks.run).toHaveBeenCalledTimes(2);
    expect(mocks.run.mock.calls[0][0]).toContain(
      "SET state = 'validating', output = ?",
    );
    expect(mocks.run.mock.calls[1][0]).toContain(
      "SET status = ?",
    );
    expect(mocks.run.mock.calls[1][1]).toBe('validating');
  });

  it('records failure when AI generation fails', async () => {
    mocks.generateText.mockRejectedValueOnce(
      new Error('AI provider unavailable'),
    );

    await expect(executeClaimedTask(task)).rejects.toThrow(
      'AI provider unavailable',
    );

    expect(mocks.run).toHaveBeenCalledTimes(2);
    expect(mocks.run.mock.calls[0][0]).toContain(
      "SET state = 'failed'",
    );
    expect(mocks.run.mock.calls[1][1]).toBe('failed');
  });

  it('stores retryable AppError classification without its raw message', async () => {
    const sensitiveMessage = 'secret-token upstream response';
    mocks.generateText.mockRejectedValueOnce(
      new AppError(503, 'AI_UPSTREAM_FAILED', sensitiveMessage, true),
    );

    await expect(executeClaimedTask(task)).rejects.toThrow(sensitiveMessage);

    const savedError = mocks.run.mock.calls[0][1];
    expect(savedError).toBe('AI_UPSTREAM_FAILED:retryable');
    expect(savedError).not.toContain(sensitiveMessage);
  });

  it('stores permanent AppError classification', async () => {
    mocks.generateText.mockRejectedValueOnce(
      new AppError(401, 'AI_AUTH_FAILED', 'private provider details', false),
    );

    await expect(executeClaimedTask(task)).rejects.toThrow(
      'private provider details',
    );

    expect(mocks.run.mock.calls[0][1]).toBe('AI_AUTH_FAILED:permanent');
  });

  it('stores unknown errors as permanent without exposing raw messages', async () => {
    const sensitiveMessage = 'private secret response';
    mocks.generateText.mockRejectedValueOnce(new Error(sensitiveMessage));

    await expect(executeClaimedTask(task)).rejects.toThrow(sensitiveMessage);

    const savedError = mocks.run.mock.calls[0][1];
    expect(savedError).toBe('EXECUTION_FAILED:permanent');
    expect(savedError).not.toContain(sensitiveMessage);
  });

  it('rejects attempts outside the three-attempt limit', async () => {
    await expect(
      executeClaimedTask({ ...task, attempt: 4 }),
    ).rejects.toThrow('Invalid claimed task');

    expect(mocks.generateText).not.toHaveBeenCalled();
  });

  it('does not execute a task with an empty title', async () => {
    await expect(
      executeClaimedTask({ ...task, title: '   ' }),
    ).rejects.toThrow('Invalid claimed task');

    expect(mocks.generateText).not.toHaveBeenCalled();
  });
});
