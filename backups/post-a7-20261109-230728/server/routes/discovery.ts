import { Router } from 'express';
import { z } from 'zod';
import { AppError } from '../errors.ts';
import { wrap } from '../util.ts';
import { audit } from '../audit.ts';
import {
  discoverEnabledPlatforms,
  discoverPlatform,
} from '../discovery/engine.ts';
import { listConnectorsWithDetails } from '../connectors/registry.ts';

export const discoveryRouter = Router();

const platformSchema = z.object({
  platformId: z.number().int().positive(),
});

discoveryRouter.get('/api/discovery/status', wrap((_req, res) => {
  res.json({
    engineImplemented: true,
    connectorRegistryImplemented: true,
    automaticScheduling: false,
    note: 'Discovery runs only when explicitly requested. No background job is running.',
  });
}));

discoveryRouter.post('/api/discovery/platform', wrap(async (req, res) => {
  const { platformId } = platformSchema.parse(req.body);
  const result = await discoverPlatform(platformId);

  audit('discovery.platform', 'platform', platformId);
  res.json({ result });
}));

discoveryRouter.post('/api/discovery/run', wrap(async (_req, res) => {
  const results = await discoverEnabledPlatforms();

  audit('discovery.run', 'worker', 1);
  res.json({
    results,
    totals: results.reduce(
      (total, item) => ({
        platforms: total.platforms + 1,
        fetched: total.fetched + item.fetched,
        inserted: total.inserted + item.inserted,
        skipped: total.skipped + item.skipped,
        errors: total.errors + item.errors.length,
      }),
      { platforms: 0, fetched: 0, inserted: 0, skipped: 0, errors: 0 },
    ),
  });
}));

// GET /api/discovery/connectors
// يعرض كل الـ connectors المسجلة + نوعها + capabilities
discoveryRouter.get('/api/discovery/connectors', wrap((_req, res) => {
  const connectors = listConnectorsWithDetails();
  res.json({
    connectors,
    count: connectors.length,
    note: 'Registered connectors only (no generic fallback shown here). Use /api/discovery/status for engine info.',
  });
}));
