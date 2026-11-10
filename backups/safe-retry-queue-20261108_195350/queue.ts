import type { DatabaseSync } from 'node:sqlite';

const MAX_ATTEMPTS = 3;

type QueueSettings = {
  automation_enabled: number;
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

export interface ClaimedTask extends QueuedTask {
  executionId: number;
  attempt: number;
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
    try {
      database.exec('ROLLBACK');
    } catch {
      // Preserve the original transaction error.
    }
    throw error;
  }
}

function readSettings(database: DatabaseSync): {
  automationEnabled: boolean;
  minReward: number;
  maxConcurrent: number;
  platformIds: number[];
} {
  const settings = database
    .prepare(
      `SELECT automation_enabled, min_reward, max_concurrent, platform_ids
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
    ![0, 1].includes(settings.automation_enabled) ||
    !Number.isFinite(settings.min_reward) ||
    settings.min_reward < 0 ||
    !Number.isInteger(settings.max_concurrent) ||
    settings.max_concurrent < 1
  ) {
    throw new Error('Invalid worker queue settings');
  }

  return {
    automationEnabled: settings.automation_enabled === 1,
    minReward: settings.min_reward,
    maxConcurrent: settings.max_concurrent,
    platformIds: [...new Set(platformIds as number[])],
  };
}

/**
 * Moves eligible tasks into the queue.
 * An empty platform selection intentionally queues nothing.
 */
export function enqueueEligibleTasks(
  database: DatabaseSync,
): number {
  return withImmediateTransaction(database, () => {
    const settings = readSettings(database);

    if (settings.platformIds.length === 0) {
      return 0;
    }

    const placeholders = settings.platformIds
      .map(() => '?')
      .join(', ');

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
 * Atomically claims one queued task and creates its execution record.
 * Maximum attempts: 3 per task.
 */
export function claimNextTask(
  database: DatabaseSync,
): ClaimedTask | null {
  return withImmediateTransaction(database, () => {
    const settings = readSettings(database);

    if (
      !settings.automationEnabled ||
      settings.platformIds.length === 0
    ) {
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

    const placeholders = settings.platformIds
      .map(() => '?')
      .join(', ');

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
           AND (
             SELECT COUNT(*)
             FROM task_executions e
             WHERE e.task_id = t.id
           ) < ?
         ORDER BY t.created_at ASC, t.id ASC
         LIMIT 1`,
      )
      .get(
        settings.minReward,
        ...settings.platformIds,
        MAX_ATTEMPTS,
      ) as QueuedTask | undefined;

    if (!task) {
      return null;
    }

    const previous = database
      .prepare(
        `SELECT COUNT(*) AS count
         FROM task_executions WHERE task_id = ?`,
      )
      .get(task.id) as { count: number };

    const attempt = previous.count + 1;

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

    const execution = database
      .prepare(
        `INSERT INTO task_executions (task_id, state, attempt)
         VALUES (?, 'executing', ?)`,
      )
      .run(task.id, attempt);

    return {
      ...task,
      executionId: Number(execution.lastInsertRowid),
      attempt,
    };
  });
}
