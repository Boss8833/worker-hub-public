import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  claimNextTask: vi.fn(),
  requeueRetryableTasks: vi.fn(),
  executeClaimedTask: vi.fn(),
  validateTaskExecution: vi.fn(),
}));

vi.mock('../db.ts', () => ({
  db: {},
}));

vi.mock('./queue.ts', () => ({
  claimNextTask: mocks.claimNextTask,
  requeueRetryableTasks: mocks.requeueRetryableTasks,
}));

vi.mock('./executor.ts', () => ({
  executeClaimedTask: mocks.executeClaimedTask,
}));

vi.mock('./validator.ts', () => ({
  validateTaskExecution: mocks.validateTaskExecution,
}));

import { runNextTask } from './runner.ts';

const task = {
  id: 10,
  platform_id: 1,
  external_id: 'external-10',
  title: 'Test task',
  description: '',
  requirements: 'Include recommendations',
  reward: 10,
  currency: 'USDC',
  deadline: null,
  ai_suitability: null,
  is_mock: 0,
  executionId: 20,
  attempt: 1,
};

const execution = {
  taskId: 10,
  executionId: 20,
  output: 'Generated output',
  model: 'test-model',
  provider: 'test-provider',
};

const validation = {
  taskId: 10,
  executionId: 20,
  passed: true,
  details: {
    checks: ['output_length', 'requirements_review'],
    reasons: [],
    confidence: 0.95,
  },
};

describe('task runner', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requeueRetryableTasks.mockReturnValue(0);
    mocks.executeClaimedTask.mockResolvedValue(execution);
    mocks.validateTaskExecution.mockResolvedValue(validation);
  });

  it('executes then validates one task', async () => {
    mocks.claimNextTask.mockReturnValue(task);

    const order: string[] = [];

    mocks.executeClaimedTask.mockImplementation(async () => {
      order.push('execute');
      return execution;
    });

    mocks.validateTaskExecution.mockImplementation(async () => {
      order.push('validate');
      return validation;
    });

    const result = await runNextTask();

    expect(order).toEqual(['execute', 'validate']);
    expect(mocks.requeueRetryableTasks).toHaveBeenCalledOnce();
    expect(mocks.requeueRetryableTasks).toHaveBeenCalledWith({});
    expect(mocks.requeueRetryableTasks.mock.invocationCallOrder[0])
      .toBeLessThan(mocks.claimNextTask.mock.invocationCallOrder[0]);
    expect(mocks.claimNextTask).toHaveBeenCalledOnce();
    expect(mocks.executeClaimedTask).toHaveBeenCalledWith(task);
    expect(mocks.validateTaskExecution).toHaveBeenCalledWith(10, 20);
    expect(result?.execution).toEqual(execution);
    expect(result?.validation).toEqual(validation);
  });

  it('returns validation failure without treating execution as successful', async () => {
    mocks.claimNextTask.mockReturnValue(task);

    const failedValidation = {
      ...validation,
      passed: false,
      details: {
        checks: [],
        reasons: ['Requirements not satisfied'],
        confidence: null,
      },
    };

    mocks.validateTaskExecution.mockResolvedValue(failedValidation);

    const result = await runNextTask();

    expect(result?.validation.passed).toBe(false);
    expect(mocks.validateTaskExecution).toHaveBeenCalledOnce();
  });

  it('does not validate when execution fails', async () => {
    mocks.claimNextTask.mockReturnValue(task);
    mocks.executeClaimedTask.mockRejectedValue(
      new Error('Execution failed'),
    );

    await expect(runNextTask()).rejects.toThrow('Execution failed');

    expect(mocks.validateTaskExecution).not.toHaveBeenCalled();
  });

  it('does nothing when the queue is empty', async () => {
    mocks.claimNextTask.mockReturnValue(null);

    const result = await runNextTask();

    expect(result).toBeNull();
    expect(mocks.executeClaimedTask).not.toHaveBeenCalled();
    expect(mocks.validateTaskExecution).not.toHaveBeenCalled();
  });

  it('propagates validation errors', async () => {
    mocks.claimNextTask.mockReturnValue(task);
    mocks.validateTaskExecution.mockRejectedValue(
      new Error('Validation could not be saved'),
    );

    await expect(runNextTask()).rejects.toThrow(
      'Validation could not be saved',
    );
  });
});
