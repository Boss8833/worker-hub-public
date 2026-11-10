import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import {
  claimNextTask,
  enqueueEligibleTasks,
} from './queue.ts';

describe('task queue', () => {
  let database: DatabaseSync;

  beforeEach(() => {
    database = new DatabaseSync(':memory:');

    database.exec(`
      CREATE TABLE platforms (
        id INTEGER PRIMARY KEY,
        enabled INTEGER NOT NULL
      );

      CREATE TABLE worker_settings (
        id INTEGER PRIMARY KEY,
        min_reward REAL NOT NULL,
        max_concurrent INTEGER NOT NULL,
        platform_ids TEXT NOT NULL
      );

      CREATE TABLE tasks (
        id INTEGER PRIMARY KEY,
        platform_id INTEGER NOT NULL,
        external_id TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT,
        requirements TEXT,
        reward REAL NOT NULL,
        currency TEXT NOT NULL,
        deadline TEXT,
        ai_suitability TEXT,
        is_mock INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      INSERT INTO platforms (id, enabled) VALUES (1, 1), (2, 1), (3, 0);

      INSERT INTO worker_settings
        (id, min_reward, max_concurrent, platform_ids)
      VALUES (1, 5, 1, '[1]');
    `);
  });

  afterEach(() => {
    database.close();
  });

  function addTask(
    id: number,
    platformId: number,
    status = 'eligible',
    reward = 10,
  ) {
    database
      .prepare(
        `INSERT INTO tasks (
          id, platform_id, external_id, title, description,
          requirements, reward, currency, status
        ) VALUES (?, ?, ?, ?, '', '', ?, 'USD', ?)`,
      )
      .run(id, platformId, `external-${id}`, `Task ${id}`, reward, status);
  }

  function updateSettings(
    minReward: number,
    maxConcurrent: number,
    platformIds: number[],
  ) {
    database
      .prepare(
        `UPDATE worker_settings
         SET min_reward = ?, max_concurrent = ?, platform_ids = ?
         WHERE id = 1`,
      )
      .run(minReward, maxConcurrent, JSON.stringify(platformIds));
  }

  it('queues only eligible tasks from selected enabled platforms', () => {
    addTask(1, 1, 'eligible', 10);
    addTask(2, 2, 'eligible', 10);
    addTask(3, 3, 'eligible', 10);
    addTask(4, 1, 'discovered', 10);
    addTask(5, 1, 'eligible', 3);

    expect(enqueueEligibleTasks(database)).toBe(1);

    const rows = database
      .prepare('SELECT id, status FROM tasks ORDER BY id')
      .all() as { id: number; status: string }[];

    expect(rows.map((row) => row.status)).toEqual([
      'queued',
      'eligible',
      'eligible',
      'discovered',
      'eligible',
    ]);
  });

  it('does not queue anything when no platform is selected', () => {
    updateSettings(0, 1, []);
    addTask(1, 1);

    expect(enqueueEligibleTasks(database)).toBe(0);
  });

  it('does not enqueue the same task twice', () => {
    addTask(1, 1);

    expect(enqueueEligibleTasks(database)).toBe(1);
    expect(enqueueEligibleTasks(database)).toBe(0);
  });

  it('claims the next queued task and changes its status', () => {
    addTask(1, 1);
    enqueueEligibleTasks(database);

    const task = claimNextTask(database);

    expect(task?.id).toBe(1);

    const row = database
      .prepare('SELECT status FROM tasks WHERE id = 1')
      .get() as { status: string };

    expect(row.status).toBe('executing');
  });

  it('does not claim when the concurrency limit is reached', () => {
    addTask(1, 1, 'executing');
    addTask(2, 1, 'queued');

    expect(claimNextTask(database)).toBeNull();
  });

  it('does not claim a task from a platform no longer selected', () => {
    addTask(1, 1, 'queued');
    updateSettings(0, 1, [2]);

    expect(claimNextTask(database)).toBeNull();
  });

  it('does not claim a task below the current minimum reward', () => {
    addTask(1, 1, 'queued', 3);

    expect(claimNextTask(database)).toBeNull();
  });

  it('returns null when the queue is empty', () => {
    expect(claimNextTask(database)).toBeNull();
  });
});
