import { describe, it, expect } from 'vitest';
import {
  TASK_STATUSES,
  TaskLifecycleError,
  canTransitionTask,
  getAllowedTransitions,
  isTaskStatus,
  transitionTaskStatus,
} from './lifecycle.ts';

describe('task lifecycle', () => {
  it('defines all existing database task statuses', () => {
    expect(TASK_STATUSES).toEqual([
      'discovered',
      'eligible',
      'ineligible',
      'queued',
      'executing',
      'validating',
      'awaiting_approval',
      'submitted',
      'completed',
      'failed',
      'rejected',
    ]);
  });

  it('recognizes valid task statuses', () => {
    expect(isTaskStatus('executing')).toBe(true);
    expect(isTaskStatus('unknown')).toBe(false);
  });

  it('allows valid transitions', () => {
    expect(transitionTaskStatus('discovered', 'eligible')).toBe('eligible');
    expect(transitionTaskStatus('eligible', 'queued')).toBe('queued');
    expect(transitionTaskStatus('queued', 'executing')).toBe('executing');
    expect(transitionTaskStatus('executing', 'validating')).toBe('validating');
    expect(
      transitionTaskStatus('validating', 'awaiting_approval'),
    ).toBe('awaiting_approval');
  });

  it('requires explicit approval before submission', () => {
    expect(
      canTransitionTask('awaiting_approval', 'submitted'),
    ).toBe(false);

    expect(() =>
      transitionTaskStatus('awaiting_approval', 'submitted'),
    ).toThrow(TaskLifecycleError);

    expect(
      transitionTaskStatus('awaiting_approval', 'submitted', {
        approved: true,
      }),
    ).toBe('submitted');
  });

  it('allows rejection while awaiting approval', () => {
    expect(
      transitionTaskStatus('awaiting_approval', 'rejected'),
    ).toBe('rejected');
  });

  it('allows retrying a failed task by returning it to the queue', () => {
    expect(transitionTaskStatus('failed', 'queued')).toBe('queued');
  });

  it('rejects invalid transitions', () => {
    expect(canTransitionTask('discovered', 'executing')).toBe(false);

    expect(() =>
      transitionTaskStatus('discovered', 'executing'),
    ).toThrow(TaskLifecycleError);
  });

  it('does not allow transitions from terminal states', () => {
    expect(getAllowedTransitions('completed')).toEqual([]);
    expect(getAllowedTransitions('rejected')).toEqual([]);
    expect(getAllowedTransitions('ineligible')).toEqual([]);

    expect(() =>
      transitionTaskStatus('completed', 'queued'),
    ).toThrow(TaskLifecycleError);
  });
});
