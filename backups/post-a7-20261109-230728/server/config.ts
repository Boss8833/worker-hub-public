import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

export const config = {
  port: Number(process.env.PORT ?? 8787),
  host: process.env.HOST ?? '127.0.0.1',
  dataDir: resolve(process.env.DATA_DIR ?? './data'),
  encryptionKey: process.env.WORKER_HUB_ENCRYPTION_KEY ?? '',
  accessToken: process.env.WORKER_HUB_ACCESS_TOKEN ?? '',
  corsOrigins: (process.env.CORS_ORIGINS ?? 'http://127.0.0.1:5173,http://localhost:5173').split(',').map((s) => s.trim()),
  version: '0.1.0',
};
mkdirSync(config.dataDir, { recursive: true });
