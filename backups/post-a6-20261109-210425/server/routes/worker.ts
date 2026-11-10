import { Router } from 'express';
import { z } from 'zod';
import { get, run } from '../db.ts';
import { AppError } from '../errors.ts';
import { audit } from '../audit.ts';
import { wrap } from '../util.ts';

export const workerRouter = Router();

export const WORKER_STATES = ['STOPPED', 'IDLE', 'DISCOVERING', 'ANALYZING', 'EXECUTING', 'VALIDATING', 'SUBMITTING', 'ERROR'];

type Row = {
  automation_enabled: number; min_reward: number; max_concurrent: number; max_runtime_sec: number;
  manual_approval: number; auto_submit: number; platform_ids: string; filters_json: string;
};

function readSettings() {
  const r = get<Row>('SELECT * FROM worker_settings WHERE id = 1')!;
  return {
    automationEnabled: !!r.automation_enabled, minReward: r.min_reward, maxConcurrent: r.max_concurrent, maxRuntimeSec: r.max_runtime_sec,
    manualApproval: !!r.manual_approval, autoSubmit: !!r.auto_submit, platformIds: JSON.parse(r.platform_ids) as number[],
    filters: JSON.parse(r.filters_json) as { include: string[]; exclude: string[] },
  };
}

// The worker engine does not exist yet (Phase 5). The status is therefore always honest: STOPPED.
workerRouter.get('/api/worker/status', wrap((_req, res) => {
  res.json({ state: 'STOPPED', running: false, engineImplemented: false, states: WORKER_STATES,
    note: 'The background worker engine is implemented in Phase 5. Nothing is running.' });
}));
workerRouter.post('/api/worker/start', wrap(() => {
  throw new AppError(501, 'NOT_IMPLEMENTED', 'The worker engine arrives in Phase 5. Nothing was started.');
}));
workerRouter.post('/api/worker/stop', wrap((_req, res) => res.json({ state: 'STOPPED', running: false })));

workerRouter.get('/api/worker/settings', wrap((_req, res) => res.json(readSettings())));

const schema = z.object({
  automationEnabled: z.boolean(), minReward: z.number().min(0), maxConcurrent: z.number().int().min(1).max(10),
  maxRuntimeSec: z.number().int().min(10).max(3600), manualApproval: z.boolean(), autoSubmit: z.boolean(),
  platformIds: z.array(z.number().int().positive()).max(100),
  filters: z.object({ include: z.array(z.string().max(60)).max(30), exclude: z.array(z.string().max(60)).max(30) }),
}).partial();

workerRouter.put('/api/worker/settings', wrap((req, res) => {
  const b = { ...readSettings(), ...schema.parse(req.body) };
  run(`UPDATE worker_settings SET automation_enabled=?, min_reward=?, max_concurrent=?, max_runtime_sec=?, manual_approval=?, auto_submit=?, platform_ids=?, filters_json=? WHERE id = 1`,
    b.automationEnabled ? 1 : 0, b.minReward, b.maxConcurrent, b.maxRuntimeSec, b.manualApproval ? 1 : 0, b.autoSubmit ? 1 : 0,
    JSON.stringify(b.platformIds), JSON.stringify(b.filters));
  audit('worker.settings', 'worker', 1);
  res.json(readSettings());
}));
