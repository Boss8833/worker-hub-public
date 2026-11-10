export type CapState = 'supported' | 'unsupported' | 'unknown';
export type Platform = {
  id: number; slug: string; name: string; baseUrl: string | null; authType: 'bearer' | 'api_key' | 'custom';
  connector: string; implemented: boolean; enabled: boolean; status: string; capabilities: Record<string, CapState>;
  lastSyncAt: string | null; archivedAt: string | null; hasCredential: boolean; submissionPolicy: 'auto' | 'manual' | 'both'; minReward: number;
  lastTest: { ok: boolean; message: string } | null; settingsJson: string;
};
export type Health = { ok: boolean; version: string; node: string; time: string; encryptionConfigured: boolean; accessTokenRequired: boolean };
export type TaskRow = {
  id: number | string; platformName: string; title: string; description: string | null; requirements: string | null;
  reward: number; currency: string; deadline: string | null; status: string; aiSuitability: string | null; demo?: boolean;
};
export type EarningTotals = { currency: string; available: number; pending: number; withdrawn: number; total: number };
export type Provider = { id: number; name: string; kind: 'ollama' | 'openai_compatible'; endpoint: string; model: string | null; timeoutMs: number; retries: number; enabled: boolean; isLocal: boolean; hasCredential: boolean; models: string[] };
