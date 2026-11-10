import { db } from '../db.ts';
import { claimNextTask } from './queue.ts';
import { executeClaimedTask } from './executor.ts';

export async function runNextTask() {
  const task = claimNextTask(db);

  if (!task) {
    return null;
  }

  return executeClaimedTask(task);
}
