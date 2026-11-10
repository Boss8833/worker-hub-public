import { get } from '../db.ts';
import { decrypt } from '../crypto.ts';

type CredRow = {
  ciphertext: string;
  iv: string;
  tag: string;
  header_name: string | null;
};

type PlatformAuthRow = {
  auth_type: 'bearer' | 'api_key' | 'custom';
};

// Header names must be plain tokens: blocks header injection.
const HEADER_NAME = /^[A-Za-z0-9-]{1,64}$/;

export async function resolvePlatformAuthHeaders(
  platformId: number,
): Promise<Record<string, string>> {
  const platform = get<PlatformAuthRow>(
    'SELECT auth_type FROM platforms WHERE id = ?',
    platformId,
  );
  if (!platform) throw new Error('Platform not found');

  const cred = get<CredRow>(
    'SELECT ciphertext, iv, tag, header_name FROM encrypted_credentials WHERE platform_id = ?',
    platformId,
  );
  // No credential saved: public API, send no auth header.
  if (!cred) return {};

  const secret = decrypt(
    { ciphertext: cred.ciphertext, iv: cred.iv, tag: cred.tag },
    `platform:${platformId}`,
  );

  const name = cred.header_name?.trim() || '';
  if (name && !HEADER_NAME.test(name)) {
    throw new Error('Invalid credential header name');
  }

  if (platform.auth_type === 'bearer') {
    return { [name || 'Authorization']: `Bearer ${secret}` };
  }
  if (platform.auth_type === 'api_key') {
    return { [name || 'x-api-key']: secret };
  }
  // custom: header name is mandatory, the secret is sent as-is.
  if (!name) throw new Error('Custom auth requires a header name');
  return { [name]: secret };
}
