import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, appendFileSync, writeFileSync } from 'node:fs';

const file = '.env';
if (existsSync(file) && /^WORKER_HUB_ENCRYPTION_KEY=.+/m.test(readFileSync(file, 'utf8'))) {
  console.log('An encryption key already exists in .env. Not overwriting it (stored credentials would become unreadable).');
  process.exit(0);
}
const line = `WORKER_HUB_ENCRYPTION_KEY=${randomBytes(32).toString('base64')}\n`;
if (existsSync(file)) appendFileSync(file, line); else writeFileSync(file, line, { mode: 0o600 });
console.log('Encryption key written to .env. Back this file up somewhere private: without it, saved credentials cannot be decrypted.');
