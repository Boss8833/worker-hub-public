import { get } from '../db.ts';
import { decrypt } from '../crypto.ts';

type CredRow = {
  ciphertext: string;
  iv: string;
  tag: string;
  header_name: string | null;
};

type PlatformAuthRow = {
  auth_type: 'bearer' | 'api_key' | 'custom' | 'api_key_query' | 'oauth2' | 'hmac' | 'wallet_signature';
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

  if (platform.auth_type === 'api_key_query') {
    // المفتاح بيتحط في الـ query (مش header) — نشيله من هنا
    return {};
  }

  if (platform.auth_type === 'oauth2' || platform.auth_type === 'wallet_signature') {
    return { [name || 'Authorization']: `Bearer ${secret}` };
  }

  if (platform.auth_type === 'hmac') {
    // HMAC: التوقيع بيتم في signer منفصل — هنا بنبعت الـ secret كـ header للاستخدام المؤقت
    return { [name || 'x-hmac-key']: secret };
  }
  // custom: header name is mandatory, the secret is sent as-is.
  if (!name) throw new Error('Custom auth requires a header name');
  return { [name]: secret };
}

/**
 * يرجع query params إضافية للـ URL (للأنواع اللي بتحط المفتاح في الـ query).
 * حالياً بيدعم api_key_query.
 */
export async function resolvePlatformAuthQuery(
  platformId: number,
): Promise<Record<string, string>> {
  const platform = get<PlatformAuthRow>(
    'SELECT auth_type FROM platforms WHERE id = ?',
    platformId,
  );
  if (!platform) return {};
  if (platform.auth_type !== 'api_key_query') return {};

  const cred = get<CredRow>(
    'SELECT ciphertext, iv, tag, header_name FROM encrypted_credentials WHERE platform_id = ?',
    platformId,
  );
  if (!cred) return {};

  const secret = decrypt(
    { ciphertext: cred.ciphertext, iv: cred.iv, tag: cred.tag },
    `platform:${platformId}`,
  );
  const paramName = cred.header_name?.trim() || 'api_key';
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(paramName)) {
    throw new Error('Invalid query param name');
  }
  return { [paramName]: secret };
}
