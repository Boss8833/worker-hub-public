import { get, run, tx } from '../db.ts';
import { generateText } from '../ai/generate.ts';
import {
  isTaskStatus,
  transitionTaskStatus,
} from './lifecycle.ts';
import type { ClaimedTask } from './queue.ts';

export interface ExecutionResult {
  taskId: number;
  executionId: number;
  output: string;
  model: string;
  provider: string;
}

function updateFailure(task: ClaimedTask, error: unknown): void {
  try {
    tx(() => {
      const current = get<{ status: string }>(
        'SELECT status FROM tasks WHERE id = ?',
        task.id,
      );

      if (!current || current.status !== 'executing') return;

      if (!isTaskStatus(current.status)) {
        throw new Error('Invalid task status');
      }

      const next = transitionTaskStatus(current.status, 'failed');
      const message = error instanceof Error
        ? error.message.slice(0, 1000)
        : 'Execution failed';

      run(
        `UPDATE task_executions
         SET state = 'failed', error = ?, finished_at = CURRENT_TIMESTAMP
         WHERE id = ? AND task_id = ? AND state = 'executing'`,
        message,
        task.executionId,
        task.id,
      );

      run(
        `UPDATE tasks
         SET status = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND status = 'executing'`,
        next,
        task.id,
      );
    });
  } catch {
    // Preserve the original AI execution error.
  }
}

export async function executeClaimedTask(
  task: ClaimedTask,
): Promise<ExecutionResult> {
  if (
    !Number.isSafeInteger(task.id) || task.id < 1 ||
    !Number.isSafeInteger(task.executionId) || task.executionId < 1 ||
    !Number.isInteger(task.attempt) ||
    task.attempt < 1 || task.attempt > 3 ||
    !task.title.trim()
  ) {
    throw new Error('Invalid claimed task');
  }

  let result;

  try {
    result = await generateText({
      system:
        'You are a professional task execution assistant. ' +
        'Produce the requested deliverable according to the task requirements. ' +
        'Do not claim that you performed external actions, submitted work, ' +
        'or verified facts that you did not actually verify. ' +
        'If essential information is missing, state the limitation clearly.',
      prompt: [
        `Task: ${task.title}`,
        `Description: ${task.description || 'Not provided'}`,
        `Requirements: ${task.requirements || 'Not provided'}`,
        `Attempt: ${task.attempt} of 3`,
        'Produce the task deliverable only.',
      ].join('\n\n'),
      maxTokens: 1600,
      temperature: 0.2,
    });
  } catch (error) {
    updateFailure(task, error);
    throw error;
  }

  const current = get<{ status: string }>(
    'SELECT status FROM tasks WHERE id = ?',
    task.id,
  );

  if (!current || !isTaskStatus(current.status)) {
    throw new Error('Task status could not be verified');
  }

  const next = transitionTaskStatus(current.status, 'validating');

  tx(() => {
    const executionUpdate = run(
      `UPDATE task_executions
       SET state = 'validating', output = ?
       WHERE id = ? AND task_id = ? AND state = 'executing'`,
      result.text,
      task.executionId,
      task.id,
    );

    if (Number(executionUpdate.changes) !== 1) {
      throw new Error('Execution record could not be updated');
    }

    const taskUpdate = run(
      `UPDATE tasks
       SET status = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND status = 'executing'`,
      next,
      task.id,
    );

    if (Number(taskUpdate.changes) !== 1) {
      throw new Error('Task status could not be updated');
    }
  });

  return {
    taskId: task.id,
    executionId: task.executionId,
    output: result.text,
    model: result.model,
    provider: result.provider,
  };
}
