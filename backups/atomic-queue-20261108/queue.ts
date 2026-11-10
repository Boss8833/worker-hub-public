import type { DatabaseSync } from 'node:sqlite';

type QueueSettings = {
  min_reward: number;
  max_concurrent: number;
  platform_ids: string;
};

export interface QueuedTask {
  id: number;
  platform_id: number;
  external_id: string;
  title: string;
  description: string;
  requirements: string;
  reward: number;
  currency: string;
  deadline: string | null;
  ai_suitability: string | null;
  is_mock: number;
}

function withImmediateTransaction<T>(
  database: DatabaseSync,
  operation: () => T,
): T {
  database.exec('BEGIN IMMEDIATE');

  try {
    const result = operation();
    database.exec('COMMIT');
    return result;
  } catch (error) {
    database.exec('ROLLBACK');
    throw error;
  }
}

function readSettings(database: DatabaseSync): {
  minReward: number;
  maxConcurrent: number;
  platformIds: number[];
} {
  const settings = database
    .prepare(
      `SELECT min_reward, max_concurrent, platform_ids
       FROM worker_settings WHERE id = 1`,
    )
    .get() as QueueSettings | undefined;

  if (!settings) {
    throw new Error('Worker settings not found');
  }

  let platformIds: unknown;

  try {
    platformIds = JSON.parse(settings.platform_ids);
  } catch {
    throw new Error('Invalid worker platform configuration');
  }

  if (
    !Array.isArray(platformIds) ||
    !platformIds.every(
      (id) => Number.isSafeInteger(id) && id > 0,
    )
  ) {
    throw new Error('Invalid worker platform configuration');
  }

  if (
    !Number.isFinite(settings.min_reward) ||
    settings.min_reward < 0 ||
    !Number.isInteger(settings.max_concurrent) ||
    settings.max_concurrent < 1
  ) {
    throw new Error('Invalid worker queue settings');
  }

  return {
    minReward: settings.min_reward,
    maxConcurrent: settings.max_concurrent,
    platformIds: [...new Set(platformIds as number[])],
  };
}

/**
 * Moves eligible tasks into the queue.
 * An empty platform selection intentionally queues nothing.
 */
export function enqueueEligibleTasks(database: DatabaseSync): number {
  return withImmediateTransaction(database, () => {
    const settings = readSettings(database);

    if (settings.platformIds.length === 0) {
      return 0;
    }

    const placeholders = settings.platformIds.map(() => '?').join(', ');

    const result = database
      .prepare(
        `UPDATE tasks
         SET status = 'queued', updated_at = CURRENT_TIMESTAMP
         WHERE status = 'eligible'
           AND reward >= ?
           AND platform_id IN (${placeholders})
           AND platform_id IN (
             SELECT id FROM platforms WHERE enabled = 1
           )`,
      )
      .run(settings.minReward, ...settings.platformIds);

    return Number(result.changes);
  });
}

/**
 * Atomically claims one queued task.
 * Claiming does not create an execution record or run any worker.
 */
export function claimNextTask(
  database: DatabaseSync,
): QueuedTask | null {
  return withImmediateTransaction(database, () => {
    const settings = readSettings(database);

    if (settings.platformIds.length === 0) {
      return null;
    }

    const active = database
      .prepare(
        `SELECT COUNT(*) AS count
         FROM tasks WHERE status = 'executing'`,
      )
      .get() as { count: number };

    if (active.count >= settings.maxConcurrent) {
      return null;
    }

    const placeholders = settings.platformIds.map(() => '?').join(', ');

    const task = database
      .prepare(
        `SELECT
           t.id, t.platform_id, t.external_id, t.title,
           t.description, t.requirements, t.reward, t.currency,
           t.deadline, t.ai_suitability, t.is_mock
         FROM tasks t
         JOIN platforms p ON p.id = t.platform_id
         WHERE t.status = 'queued'
           AND t.reward >= ?
           AND t.platform_id IN (${placeholders})
           AND p.enabled = 1
         ORDER BY t.created_at ASC, t.id ASC
         LIMIT 1`,
      )
      .get(settings.minReward, ...settings.platformIds) as
      | QueuedTask
      | undefined;

    if (!task) {
      return null;
    }

    const update = database
      .prepare(
        `UPDATE tasks
         SET status = 'executing', updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND status = 'queued'`,
      )
      .run(task.id);

    if (Number(update.changes) !== 1) {
      return null;
    }

    return task;
  });
}
