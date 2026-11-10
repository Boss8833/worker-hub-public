import type {
  ConnectorContext,
  DiscoveredTask,
  DiscoveryConnector,
  EligibilityStatus,
} from '../discovery/types.ts';

// Official OpenAPI paths are relative to this base. Read-only: no credentials are sent.
const API_BASE = 'https://api.taskmarket.dev/api';
const USDC_UNITS = 1_000_000;
const PAGE_LIMIT = 50;
const MAX_TEXT = 10_000;

function str(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

function parseExpiry(v: unknown): number | null {
  if (typeof v === 'number' || (typeof v === 'string' && /^\d+$/.test(v.trim()))) {
    const n = Number(v);
    if (!Number.isFinite(n) || n <= 0) return null;
    return n < 1e12 ? n * 1000 : n;
  }
  if (typeof v === 'string') {
    const ms = Date.parse(v);
    return Number.isFinite(ms) ? ms : null;
  }
  return null;
}

function judge(
  raw: Record<string, unknown>,
  expiryMs: number | null,
): { eligibility: EligibilityStatus; reasons: string[] } {
  const reasons: string[] = [];
  if (raw.status !== 'open') reasons.push(`status is ${String(raw.status)}`);
  if (raw.mode !== 'bounty' && raw.mode !== 'claim') {
    reasons.push(`mode ${String(raw.mode)} is not supported yet`);
  }
  if (raw.stakeRequired === true) reasons.push('requires a stake');
  if (raw.taskVisibility !== undefined && raw.taskVisibility !== 'public') {
    reasons.push('task is not public');
  }
  if (expiryMs !== null && expiryMs <= Date.now()) reasons.push('expired');
  if (reasons.length > 0) return { eligibility: 'ineligible', reasons };
  if (expiryMs === null) {
    return { eligibility: 'unknown', reasons: ['expiry time could not be parsed'] };
  }
  return { eligibility: 'eligible', reasons: [] };
}

export const taskmarketConnector: DiscoveryConnector = {
  platformSlug: 'taskmarket',

  async discover(context: ConnectorContext): Promise<DiscoveredTask[]> {
    const res = await fetch(`${API_BASE}/tasks?limit=${PAGE_LIMIT}&sort=newest`, {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`Taskmarket responded with HTTP ${res.status}`);

    const body: unknown = await res.json();
    const list = (body as { tasks?: unknown } | null)?.tasks;
    if (!Array.isArray(list)) {
      throw new Error('Unexpected Taskmarket response: "tasks" array is missing');
    }

    const discoveredAt = new Date().toISOString();
    const out: DiscoveredTask[] = [];

    for (const item of list) {
      if (typeof item !== 'object' || item === null) continue;
      const raw = item as Record<string, unknown>;

      const id = str(raw.id).trim();
      const description = str(raw.description).slice(0, MAX_TEXT);
      const rawReward = raw.reward;
      const rewardText =
        typeof rawReward === 'number'
          ? String(rawReward)
          : typeof rawReward === 'string'
            ? rawReward.trim()
            : '';
      const parsedReward = rewardText === '' ? Number.NaN : Number(rewardText);
      const rewardKnown = Number.isFinite(parsedReward) && parsedReward >= 0;
      const rewardUnits = rewardKnown ? parsedReward : 0;

      if (!id || !description.trim()) continue;

      const expiryMs = parseExpiry(raw.expiryTime);
      const verdict = judge(raw, expiryMs);
      const eligibility =
        !rewardKnown && verdict.eligibility === 'eligible'
          ? 'unknown'
          : verdict.eligibility;
      const eligibilityReasons = [
        ...verdict.reasons,
        ...(!rewardKnown ? ['reward amount is missing or invalid'] : []),
      ];
      const firstLine = description.split('\n').find((l) => l.trim().length > 0) ?? description;

      out.push({
        externalId: id,
        title: firstLine.trim().slice(0, 120),
        description,
        reward: rewardUnits / USDC_UNITS,
        rewardKnown,
        currency: 'USDC',
        deadline: expiryMs === null ? null : new Date(expiryMs).toISOString(),
        category: str(raw.mode) || undefined,
        aiSuitability: null,
        eligibility,
        eligibilityReasons,
        platformId: context.platformId,
        platformSlug: context.platformSlug,
        discoveredAt,
      });
    }

    return out;
  },
};
