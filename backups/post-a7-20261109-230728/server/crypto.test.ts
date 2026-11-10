import { describe, it, expect } from 'vitest';
import { randomBytes } from 'node:crypto';
import { tmpdir } from 'node:os';

process.env.WORKER_HUB_ENCRYPTION_KEY = randomBytes(32).toString('base64');
process.env.DATA_DIR = tmpdir();

describe('credential encryption', () => {
  it('round-trips and binds to the platform id', async () => {
    const { encrypt, decrypt } = await import('./crypto.ts');
    const enc = encrypt('super-secret-token', 'platform:1');
    expect(enc.ciphertext).not.toContain('super-secret-token');
    expect(decrypt(enc, 'platform:1')).toBe('super-secret-token');
    expect(() => decrypt(enc, 'platform:2')).toThrow();
  });
  it('slugifies names', async () => {
    const { slugify } = await import('./caps.ts');
    expect(slugify('PR.SOCIAL')).toBe('pr-social');
    expect(slugify('منصة')).toBe('platform');
  });
});
