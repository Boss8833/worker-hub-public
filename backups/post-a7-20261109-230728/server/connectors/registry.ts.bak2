import type { DiscoveryConnector } from '../discovery/types.ts';
import { genericConnectorFor } from './generic.ts';

const connectors = new Map<string, DiscoveryConnector>();

export function registerConnector(connector: DiscoveryConnector): void {
  const slug = connector.platformSlug.trim().toLowerCase();
  if (!slug) {
    throw new Error('Connector platform slug is required');
  }
  if (connectors.has(slug)) {
    throw new Error(`Connector already registered: ${slug}`);
  }
  connectors.set(slug, connector);
}

export function getConnector(slug: string): DiscoveryConnector | undefined {
  const key = slug.trim().toLowerCase();
  if (!key) return undefined;
  // Specific connector first; otherwise fall back to the generic (config-driven) one.
  return connectors.get(key) ?? genericConnectorFor(key);
}

export function listConnectors(): string[] {
  return [...connectors.keys()];
}

export function clearConnectors(): void {
  connectors.clear();
}
