export type EligibilityStatus = 'eligible' | 'ineligible' | 'unknown';

export type DiscoveryCapability =
  | 'supported'
  | 'unsupported'
  | 'unknown';

export interface DiscoveredTask {
  externalId: string;
  title: string;
  description?: string;
  requirements?: string;
  reward: number;
  rewardKnown?: boolean;
  currency: string;
  deadline?: string | null;
  category?: string;
  sourceUrl?: string;
  aiSuitability: number | null;
  eligibility: EligibilityStatus;
  eligibilityReasons: string[];
  platformId: number;
  platformSlug: string;
  discoveredAt: string;
}

export interface ConnectorContext {
  platformId: number;
  platformSlug: string;
  baseUrl: string;
}

export interface DiscoveryConnector {
  readonly platformSlug: string;
  discover(context: ConnectorContext): Promise<DiscoveredTask[]>;
}

export interface DiscoveryResult {
  platformId: number;
  platformSlug: string;
  fetched: number;
  inserted: number;
  updated: number;
  skipped: number;
  errors: string[];
  completedAt: string;
}
