export const TASK_STATUSES = [
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
] as const;

export type TaskStatus = (typeof TASK_STATUSES)[number];

export interface TransitionOptions {
  approved?: boolean;
}

const TRANSITIONS: Readonly<Record<TaskStatus, readonly TaskStatus[]>> = {
  discovered: ['eligible', 'ineligible'],
  eligible: ['queued', 'ineligible'],
  ineligible: [],
  queued: ['executing', 'failed'],
  executing: ['validating', 'failed'],
  validating: ['awaiting_approval', 'failed'],
  awaiting_approval: ['submitted', 'rejected'],
  submitted: ['completed', 'failed'],
  completed: [],
  failed: ['queued'],
  rejected: [],
};

export class TaskLifecycleError extends Error {
  constructor(
    public readonly current: TaskStatus,
    public readonly next: TaskStatus,
    message: string,
  ) {
    super(message);
    this.name = 'TaskLifecycleError';
  }
}

export function isTaskStatus(value: string): value is TaskStatus {
  return (TASK_STATUSES as readonly string[]).includes(value);
}

export function getAllowedTransitions(
  current: TaskStatus,
): readonly TaskStatus[] {
  return TRANSITIONS[current];
}

export function canTransitionTask(
  current: TaskStatus,
  next: TaskStatus,
  options: TransitionOptions = {},
): boolean {
  if (!TRANSITIONS[current].includes(next)) {
    return false;
  }

  if (current === 'awaiting_approval' && next === 'submitted') {
    return options.approved === true;
  }

  return true;
}

export function transitionTaskStatus(
  current: TaskStatus,
  next: TaskStatus,
  options: TransitionOptions = {},
): TaskStatus {
  if (!TRANSITIONS[current].includes(next)) {
    throw new TaskLifecycleError(
      current,
      next,
      `Transition from "${current}" to "${next}" is not allowed`,
    );
  }

  if (
    current === 'awaiting_approval' &&
    next === 'submitted' &&
    options.approved !== true
  ) {
    throw new TaskLifecycleError(
      current,
      next,
      'Explicit user approval is required before submission',
    );
  }

  return next;
}
