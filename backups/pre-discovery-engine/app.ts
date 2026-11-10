import express from 'express';
import type { NextFunction, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { ZodError } from 'zod';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { timingSafeEqual } from 'node:crypto';
import { config } from './config.ts';
import { AppError } from './errors.ts';
import { platformsRouter } from './routes/platforms.ts';
import { workerRouter } from './routes/worker.ts';
import { aiRouter } from './routes/ai.ts';
import { financeRouter } from './routes/finance.ts';
import { systemRouter } from './routes/system.ts';

function tokenOk(given: string): boolean {
  const a = Buffer.from(given);
  const b = Buffer.from(config.accessToken);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '100kb' }));

  // Structured request log. Only method/path/status: never bodies, headers or query strings (may contain secrets).
  app.use((req, res, next) => {
    const t = Date.now();
    res.on('finish', () => console.log(JSON.stringify({
      t: new Date().toISOString(), level: 'info', method: req.method, path: req.path, status: res.statusCode, ms: Date.now() - t,
    })));
    next();
  });

  // Restricted CORS: same-origin and the configured dev origins only.
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin) {
      const same = origin === `http://${req.headers.host}`;
      if (same || config.corsOrigins.includes(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Vary', 'Origin');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Access-Token');
        res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
      } else if (req.path.startsWith('/api')) {
        return res.status(403).json({ error: { code: 'CORS', message: 'Origin not allowed' } });
      }
    }
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
  });

  app.use('/api', rateLimit({ windowMs: 60_000, limit: 300, standardHeaders: true, legacyHeaders: false }));

  app.use('/api', (req, _res, next) => {
    if (!config.accessToken || req.path === '/health') return next();
    const given = String(req.headers['x-access-token'] ?? '');
    if (!tokenOk(given)) return next(new AppError(401, 'UNAUTHORIZED', 'Missing or invalid access token'));
    next();
  });

  app.use(systemRouter);
  app.use(platformsRouter);
  app.use(workerRouter);
  app.use(aiRouter);
  app.use(financeRouter);
  app.use('/api', (_req, _res, next) => next(new AppError(404, 'NOT_FOUND', 'Unknown endpoint')));

  const dist = resolve('dist');
  if (existsSync(dist)) {
    app.use(express.static(dist));
    app.get(/^(?!\/api).*/, (_req, res) => res.sendFile(join(dist, 'index.html')));
  }

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof ZodError) {
      return res.status(400).json({ error: { code: 'VALIDATION', message: 'Invalid request', details: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })) } });
    }
    if (err instanceof AppError) return res.status(err.status).json({ error: { code: err.code, message: err.message } });
    if (err instanceof SyntaxError) return res.status(400).json({ error: { code: 'BAD_JSON', message: 'Malformed JSON body' } });
    console.error(JSON.stringify({ t: new Date().toISOString(), level: 'error', message: err instanceof Error ? err.message : 'unknown error' }));
    res.status(500).json({ error: { code: 'INTERNAL', message: 'Internal server error' } });
  });

  return app;
}
