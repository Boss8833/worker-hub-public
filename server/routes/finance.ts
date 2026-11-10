import { Router } from 'express';
import { z } from 'zod';
import { all, get, run, tx } from '../db.ts';
import { AppError } from '../errors.ts';
import { audit } from '../audit.ts';
import { wrap, idParam } from '../util.ts';

export const financeRouter = Router();

// Only REAL rows (is_mock = 0). "available" counts confirmed rewards only; pending is never available.
export function earningsSummary() {
  const totals = all<{ currency: string; available: number; pending: number; withdrawn: number }>(`
    SELECT currency,
      COALESCE(SUM(CASE WHEN status='confirmed' THEN amount END), 0) AS available,
      COALESCE(SUM(CASE WHEN status='pending' THEN amount END), 0) AS pending,
      COALESCE(SUM(CASE WHEN status='withdrawn' THEN amount END), 0) AS withdrawn
    FROM earnings WHERE is_mock = 0 GROUP BY currency`).map((t) => ({ ...t, total: t.available + t.withdrawn }));
  const byPlatform = all(`
    SELECT p.name, e.currency, SUM(e.amount) AS amount FROM earnings e JOIN platforms p ON p.id = e.platform_id
    WHERE e.is_mock = 0 AND e.status IN ('confirmed','withdrawn') GROUP BY p.id, e.currency`);
  return { totals, byPlatform };
}

financeRouter.get('/api/earnings', wrap((_req, res) => res.json(earningsSummary())));

financeRouter.get('/api/transactions', wrap((_req, res) => {
  res.json(all(`SELECT t.id, t.kind, t.amount, t.currency, t.reference, t.created_at AS createdAt, p.name AS platformName
    FROM transactions t LEFT JOIN platforms p ON p.id = t.platform_id WHERE t.is_mock = 0 ORDER BY t.id DESC LIMIT 100`));
}));

const TASK_SELECT = `SELECT t.id, t.platform_id AS platformId, p.name AS platformName, t.external_id AS externalId, t.title, t.description,
  t.requirements, t.reward, t.currency, t.deadline, t.status, t.ai_suitability AS aiSuitability, t.created_at AS createdAt
  FROM tasks t JOIN platforms p ON p.id = t.platform_id`;

financeRouter.get('/api/tasks', wrap((req, res) => {
  const q = z.object({ status: z.string().max(200).optional(), platformId: z.coerce.number().int().optional() }).parse(req.query);
  const where = ['t.is_mock = 0'];
  const vals: (string | number)[] = [];
  if (q.status) { const l = q.status.split(','); where.push(`t.status IN (${l.map(() => '?').join(',')})`); vals.push(...l); }
  if (q.platformId) { where.push('t.platform_id = ?'); vals.push(q.platformId); }
  res.json(all(`${TASK_SELECT} WHERE ${where.join(' AND ')} ORDER BY t.created_at DESC LIMIT 200`, ...vals));
}));


const taskCreateSchema = z.object({
  platformId: z.number().int().positive(),
  externalId: z.string().trim().min(1).max(200),
  title: z.string().trim().min(2).max(200),
  description: z.string().max(10000).nullable().optional(),
  requirements: z.string().max(10000).nullable().optional(),
  reward: z.number().finite().min(0).max(1000000000).default(0),
  currency: z.string().regex(/^[A-Z]{3,8}$/).default('USD'),
  deadline: z.string().max(80).nullable().optional(),
  aiSuitability: z.string().max(200).nullable().optional(),
}).strict();

financeRouter.post('/api/tasks', wrap((req, res) => {
  const b = taskCreateSchema.parse(req.body);

  const platform = get<{ id: number }>(
    'SELECT id FROM platforms WHERE id = ?', b.platformId
  );
  if (!platform) {
    throw new AppError(404, 'PLATFORM_NOT_FOUND', 'Platform not found');
  }

  const id = tx(() => {
    const duplicate = get<{ id: number }>(
      'SELECT id FROM tasks WHERE platform_id = ? AND external_id = ?',
      b.platformId, b.externalId
    );
    if (duplicate) {
      throw new AppError(409, 'TASK_EXISTS', 'This external task already exists on this platform');
    }

    const result = run(
      `INSERT INTO tasks (
        platform_id, external_id, title, description, requirements,
        reward, currency, deadline, status, ai_suitability, is_mock
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'discovered', ?, 0)`,
      b.platformId, b.externalId, b.title,
      b.description ?? null, b.requirements ?? null,
      b.reward, b.currency, b.deadline ?? null,
      b.aiSuitability ?? null
    );

    const taskId = Number(result.lastInsertRowid);
    audit('task.create', 'task', taskId, `platform:${b.platformId}`);
    return taskId;
  });

  const created = get(
    `${TASK_SELECT} WHERE t.id = ? AND t.is_mock = 0`, id
  );
  res.status(201).json(created);
}));

const taskUpdateSchema = z.object({
  title: z.string().trim().min(2).max(200).optional(),
  description: z.string().max(10000).nullable().optional(),
  requirements: z.string().max(10000).nullable().optional(),
  reward: z.number().finite().min(0).max(1000000000).optional(),
  currency: z.string().regex(/^[A-Z]{3,8}$/).optional(),
  deadline: z.string().max(80).nullable().optional(),
  aiSuitability: z.string().max(200).nullable().optional(),
}).strict();

financeRouter.patch('/api/tasks/:id', wrap((req, res) => {
  const id = idParam(req);
  const b = taskUpdateSchema.parse(req.body);

  if (Object.keys(b).length === 0) {
    throw new AppError(400, 'EMPTY_UPDATE', 'At least one task field must be provided');
  }

  const existing = get<{ id: number }>(
    'SELECT id FROM tasks WHERE id = ? AND is_mock = 0', id
  );
  if (!existing) throw new AppError(404, 'NOT_FOUND', 'Task not found');

  tx(() => {
    const sets: string[] = [];
    const vals: (string | number | null)[] = [];

    if (b.title !== undefined) { sets.push('title = ?'); vals.push(b.title); }
    if (b.description !== undefined) { sets.push('description = ?'); vals.push(b.description); }
    if (b.requirements !== undefined) { sets.push('requirements = ?'); vals.push(b.requirements); }
    if (b.reward !== undefined) { sets.push('reward = ?'); vals.push(b.reward); }
    if (b.currency !== undefined) { sets.push('currency = ?'); vals.push(b.currency); }
    if (b.deadline !== undefined) { sets.push('deadline = ?'); vals.push(b.deadline); }
    if (b.aiSuitability !== undefined) { sets.push('ai_suitability = ?'); vals.push(b.aiSuitability); }

    run(
      `UPDATE tasks SET ${sets.join(', ')}, updated_at = datetime('now') WHERE id = ?`,
      ...vals, id
    );
    audit('task.update', 'task', id, Object.keys(b).join(','));
  });

  const updated = get(`${TASK_SELECT} WHERE t.id = ? AND t.is_mock = 0`, id);
  res.json(updated);
}));

financeRouter.get('/api/tasks/:id', wrap((req, res) => {
  const id = idParam(req);
  const t = get(`${TASK_SELECT} WHERE t.id = ? AND t.is_mock = 0`, id);
  if (!t) throw new AppError(404, 'NOT_FOUND', 'Task not found');
  res.json({
    ...t,
    executions: all('SELECT id, state, attempt, error, started_at AS startedAt, finished_at AS finishedAt FROM task_executions WHERE task_id = ? ORDER BY id DESC', id),
    validations: all('SELECT id, passed, details, created_at AS createdAt FROM task_validations WHERE task_id = ? ORDER BY id DESC', id),
    submissions: all('SELECT id, status, submitted_at AS submittedAt FROM task_submissions WHERE task_id = ? ORDER BY id DESC', id),
  });
}));

// Task execution is implemented in Phases 4-5. These endpoints exist but refuse honestly.
financeRouter.post('/api/tasks/:id/:action(execute|approve|submit|reject)', wrap((req, res) => {
  const id = Number(req.params.id);
  const action = req.params.action;
  if (!Number.isSafeInteger(id) || id < 1) {
    throw new AppError(400, 'INVALID_ID', 'Invalid task ID');
  }

  const task = get<{ id: number; status: string; platform_id: number; external_id: string }>(
    'SELECT id, status, platform_id, external_id FROM tasks WHERE id = ?',
    id,
  );
  if (!task) throw new AppError(404, 'NOT_FOUND', 'Task not found');

  if (action === 'approve') {
    if (task.status !== 'awaiting_approval') {
      throw new AppError(409, 'INVALID_STATE', `Task is in "${task.status}", expected "awaiting_approval"`);
    }
    run("UPDATE tasks SET status = 'submitted', updated_at = datetime('now') WHERE id = ?", id);
    audit('task.approve', 'task', id, 'submitted');
    return res.json({ ok: true, status: 'submitted' });
  }

  if (action === 'execute') {
    if (!['discovered', 'eligible', 'queued', 'failed'].includes(task.status)) {
      throw new AppError(409, 'INVALID_STATE', `Task is in "${task.status}", cannot execute`);
    }
    run("UPDATE tasks SET status = 'queued', updated_at = datetime('now') WHERE id = ?", id);
    audit('task.execute', 'task', id, 'queued');
    return res.json({ ok: true, status: 'queued', note: 'Worker engine will pick it up on its next tick' });
  }

  if (action === 'submit') {
    if (task.status !== 'submitted') {
      throw new AppError(409, 'INVALID_STATE', `Task is in "${task.status}", expected "submitted"`);
    }
    // TODO: call the platform connector's submitWork here
    run("UPDATE tasks SET status = 'completed', updated_at = datetime('now') WHERE id = ?", id);
    audit('task.submit', 'task', id, 'completed');
    return res.json({ ok: true, status: 'completed', note: 'Marked as completed (connector submission is a future enhancement)' });
  }

  if (action === 'reject') {
    if (task.status !== 'awaiting_approval') {
      throw new AppError(409, 'INVALID_STATE', `Task is in "${task.status}", expected "awaiting_approval"`);
    }
    run("UPDATE tasks SET status = 'rejected', updated_at = datetime('now') WHERE id = ?", id);
    audit('task.reject', 'task', id, 'rejected');
    return res.json({ ok: true, status: 'rejected' });
  }

  throw new AppError(400, 'INVALID_ACTION', 'Unknown action');
}));

financeRouter.get('/api/withdrawals', wrap((_req, res) => {
  res.json(all(`SELECT w.id, w.amount, w.fee, w.currency, w.status, w.tx_reference AS txReference, w.created_at AS createdAt, m.label AS methodLabel, m.kind AS methodKind
    FROM withdrawal_requests w JOIN withdrawal_methods m ON m.id = w.method_id ORDER BY w.id DESC LIMIT 100`));
}));

financeRouter.get('/api/withdrawals/methods', wrap((_req, res) => {
  res.json(all('SELECT id, kind, label, network, token, address, email, verified, masked_card AS maskedCard FROM withdrawal_methods ORDER BY id'));
}));

// Never accepts full card numbers or CVV: only the last 4 digits.
const methodSchema = z.object({
  kind: z.enum(['usdt', 'usdc', 'paypal', 'visa']), label: z.string().trim().min(2).max(60),
  network: z.string().trim().max(40).optional(), token: z.string().trim().max(20).optional(),
  address: z.string().trim().max(200).optional(), email: z.string().email().max(120).optional(),
  cardLast4: z.string().regex(/^\d{4}$/).optional(),
}).strict();

financeRouter.post('/api/withdrawals/methods', wrap((req, res) => {
  const b = methodSchema.parse(req.body);
  const r = run('INSERT INTO withdrawal_methods(kind, label, network, token, address, email, masked_card) VALUES (?, ?, ?, ?, ?, ?, ?)',
    b.kind, b.label, b.network ?? null, b.token ?? null, b.address ?? null, b.email ?? null, b.cardLast4 ? `**** ${b.cardLast4}` : null);
  audit('withdrawal.method.create', 'withdrawal_method', Number(r.lastInsertRowid), b.kind);
  res.status(201).json({ id: Number(r.lastInsertRowid) });
}));

financeRouter.delete('/api/withdrawals/methods/:id', wrap((req, res) => {
  const id = idParam(req);
  try { run('DELETE FROM withdrawal_methods WHERE id = ?', id); }
  catch { throw new AppError(409, 'IN_USE', 'This method is used by withdrawal requests and cannot be deleted.'); }
  audit('withdrawal.method.delete', 'withdrawal_method', id);
  res.json({ ok: true });
}));
