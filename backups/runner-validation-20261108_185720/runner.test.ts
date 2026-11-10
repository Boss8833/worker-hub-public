import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  claimNextTask: vi.fn(),
  executeClaimedTask: vi.fn(),
}));

vi.mock('../db.ts', () => ({
  db: {},
}));

vi.mock('./queue.ts', () => ({
  claimNextTask: mocks.claimNextTask,
}));

vi.mock('./executor.ts', () => ({
  executeClaimedTask: mocks.executeClaimedTask,
}));

import { runNextTask } from './runner.ts';

const task = {
  id: 10,
  platform_id: 1,
  external_id: 'external-10',
  title: 'Test task',
  description: '',
  requirements: '',
  reward: 10,
  currency: 'USDC',
  deadline: null,
  ai_suitability: null,
  is_mock: 0,
  executionId: 20,
  attempt: 1,
};

describe('task runner', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('claims and executes one task', async () => {
    mocks.claimNextTask.mockReturnValue(task);
    mocks.executeClaimedTask.mockResolvedValue({
      taskId: 10,
      executionId: 20,
      output: 'Generated output',
      model: 'test-model',
      provider: 'test-provider',
    });

    const result = await runNextTask();

    expect(mocks.claimNextTask).toHaveBeenCalledOnce();
    expect(mocks.executeClaimedTask).toHaveBeenCalledWith(task);
    expect(result?.taskId).toBe(10);
  });

  it('does nothing when the queue is empty', async () => {
    mocks.claimNextTask.mockReturnValue(null);

    const result = await runNextTask();

    expect(result).toBeNull();
    expect(mocks.executeClaimedTask).not.toHaveBeenCalled();
  });

  it('propagates execution errors', async () => {
    mocks.claimNextTask.mockReturnValue(task);
    mocks.executeClaimedTask.mockRejectedValue(
      new Error('Execution failed'),
    );

    await expect(runNextTask()).rejects.toThrow(
      'Execution failed',
    );
  });
});
