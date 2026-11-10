import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { config } from './config.ts';
import { AppError } from './errors.ts';

function keyBytes(): Buffer {
  const k = Buffer.from(config.encryptionKey, 'base64');
  if (k.length !== 32) {
    throw new AppError(503, 'ENCRYPTION_NOT_CONFIGURED',
      'Credential storage refused: WORKER_HUB_ENCRYPTION_KEY is missing or invalid (needs 32 bytes, base64). Run "npm run gen-key" and restart the server.');
  }
  return k;
}

export function encryptionReady(): boolean {
  return Buffer.from(config.encryptionKey, 'base64').length === 32;
}

export function encrypt(plain: string, aad: string) {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', keyBytes(), iv);
  c.setAAD(Buffer.from(aad));
  const ct = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return { ciphertext: ct.toString('base64'), iv: iv.toString('base64'), tag: c.getAuthTag().toString('base64') };
}

// Used only by server-side connectors (later phases). Never exposed through the API.
export function decrypt(p: { ciphertext: string; iv: string; tag: string }, aad: string): string {
  const d = createDecipheriv('aes-256-gcm', keyBytes(), Buffer.from(p.iv, 'base64'));
  d.setAAD(Buffer.from(aad));
  d.setAuthTag(Buffer.from(p.tag, 'base64'));
  return Buffer.concat([d.update(Buffer.from(p.ciphertext, 'base64')), d.final()]).toString('utf8');
}
