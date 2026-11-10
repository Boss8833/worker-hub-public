import { db } from '../db.ts';
import { claimNextTask, requeueRetryableTasks } from './queue.ts';
import { executeClaimedTask } from './executor.ts';
import { validateTaskExecution } from './validator.ts';

export async function runNextTask() {
  requeueRetryableTasks(db);
  const task = claimNextTask(db);

  if (!task) {
    return null;
  }

  const execution = await executeClaimedTask(task);

  const validation = await validateTaskExecution(
    execution.taskId,
    execution.executionId,
  );

  return {
    execution,
    validation,
  };
}
