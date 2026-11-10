// server/connectors/registry.ts
//
// Connector Registry — يسجل ويدير الـ connectors.
//
// يدعم نوعين:
//   1. DiscoveryConnector (مبسط) — discover فقط
//   2. PlatformConnector (كامل) — discover + claim + submit + balance + withdraw + ...
//
// الـ routes والـ engine الحالية تستخدم getConnector() — توقيعه زي ما هو.
// الأكواد الجديدة اللي محتاجة capabilities تستخدم getPlatformConnector().

import type { DiscoveryConnector } from '../discovery/types.ts';
import type { PlatformConnector } from '../core/contracts.ts';
import { fullGenericConnectorFor } from './generic.ts';

/** أي نوع connector — مبسط أو كامل. */
export type AnyConnector = DiscoveryConnector | PlatformConnector;

const connectors = new Map<string, AnyConnector>();

/**
 * يسجل connector جديد.
 * يقبل DiscoveryConnector (مبسط) أو PlatformConnector (كامل).
 */
export function registerConnector(connector: AnyConnector): void {
  const slug = connector.platformSlug.trim().toLowerCase();
  if (!slug) {
    throw new Error('Connector platform slug is required');
  }
  if (connectors.has(slug)) {
    throw new Error(`Connector already registered: ${slug}`);
  }
  connectors.set(slug, connector);
}

/**
 * يجيب connector بالـ slug.
 * - لو مسجل صراحةً → يرجعه
 * - لو مش مسجل → fallback لـ generic (config-driven)
 *
 * التوقيع زي ما هو — لا كسر للكود القديم.
 */
export function getConnector(slug: string): AnyConnector | undefined {
  const key = slug.trim().toLowerCase();
  if (!key) return undefined;
  // Specific connector first; otherwise fall back to the generic (config-driven) one.
  return connectors.get(key) ?? fullGenericConnectorFor(key);
}

/**
 * يجيب connector كـ PlatformConnector كامل.
 * - لو الـ connector يدعم capabilities → يرجعه
 * - لو مبسط بس (DiscoveryConnector) → يرجع null
 *
 * يُستخدم في الأكواد الجديدة اللي محتاجة claim/submit/balance/withdraw.
 */
export function getPlatformConnector(slug: string): PlatformConnector | null {
  const connector = getConnector(slug);
  if (!connector) return null;
  // PlatformConnector عنده 'capabilities' و 'authStrategy'
  if ('capabilities' in connector && 'authStrategy' in connector) {
    return connector as PlatformConnector;
  }
  return null;
}

/**
 * فحص هل المنصة عندها connector كامل (PlatformConnector).
 * مفيد للـ UI عشان يعرض "إيه اللي ممكن نعمله على المنصة دي".
 */
export function isFullConnector(slug: string): boolean {
  return getPlatformConnector(slug) !== null;
}

/** كل الـ connectors المسجلة صراحةً (بدون generic fallback). */
export function listConnectors(): string[] {
  return [...connectors.keys()];
}

/** كل الـ connectors مع تفاصيلها (مفيد للـ UI والتشخيص). */
export function listConnectorsWithDetails(): Array<{
  slug: string;
  type: 'discovery' | 'platform';
  capabilities: Record<string, string> | null;
}> {
  return [...connectors.entries()].map(([slug, connector]) => {
    const isFull = 'capabilities' in connector && 'authStrategy' in connector;
    const platformConnector = isFull ? (connector as PlatformConnector) : null;
    return {
      slug,
      type: isFull ? 'platform' : 'discovery',
      capabilities: platformConnector
        ? (platformConnector.capabilities as unknown as Record<string, string>)
        : null,
    };
  });
}

/** يمسح كل الـ connectors (للاستخدام في الاختبارات فقط). */
export function clearConnectors(): void {
  connectors.clear();
}
