import { get } from '../db.ts';
import { renderTemplate } from './generic-ext.ts';
import type { GenericExtendedConfig, GenericEndpoint } from './generic-ext.ts';
import type {
  ConnectorContext,
  DiscoveredTask,
  DiscoveryConnector,
  EligibilityStatus,
} from '../discovery/types.ts';

// Generic REST/JSON connector. Config lives in platform_settings.settings_json under "generic".
// Example:
// {"generic":{"list_path":"/tasks","method":"GET","query_params":"limit=50",
//   "list_key":"tasks","map":{"id":"id","title":"title","description":"description",
//   "reward":"reward","currency":"currency","deadline":"expiryTime","status":"status"},
//   "reward_divisor":1,"default_currency":"USD","open_values":["open"]}}

const MAX_TEXT = 10_000;
const MAX_ITEMS = 200;

type GenericConfig = {
  list_path: string;
  method: 'GET' | 'POST';
  query_params: string;
  list_key: string;
  map: {
    id: string;
    title: string;
    description: string;
    reward: string;
    currency: string;
    deadline: string;
    status: string;
  };
  reward_divisor: number;
  default_currency: string;
  open_values: string[];
};

export type AuthHeaderResolver = (
  platformId: number,
) => Promise<Record<string, string>>;

// Credentials are encrypted in the DB. The decryption module is injected from outside.
let resolveAuthHeaders: AuthHeaderResolver | null = null;
export function setAuthHeaderResolver(fn: AuthHeaderResolver): void {
  resolveAuthHeaders = fn;
}

function pick(obj: unknown, path: string): unknown {
  if (!path) return undefined;
  let cur: unknown = obj;
  for (const part of path.split('.')) {
    if (typeof cur !== 'object' || cur === null) return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}

function asString(v: unknown): string {
  if (typeof v === 'string') return v;
  if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  return '';
}

function parseTime(v: unknown): number | null {
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

function strField(v: unknown, fallback: string): string {
  return typeof v === 'string' && v.trim() ? v.trim() : fallback;
}

function loadConfig(platformId: number): GenericConfig {
  const row = get<{ settings_json: string }>(
    'SELECT settings_json FROM platform_settings WHERE platform_id = ?',
    platformId,
  );
  if (!row) throw new Error('Platform settings not found');

  let parsed: unknown;
  try {
    parsed = JSON.parse(row.settings_json);
  } catch {
    throw new Error('settings_json is not valid JSON');
  }

  const g = pick(parsed, 'generic');
  if (typeof g !== 'object' || g === null) {
    throw new Error('Missing "generic" configuration in settings_json');
  }
  const c = g as Record<string, unknown>;
  const m = (typeof c.map === 'object' && c.map !== null ? c.map : {}) as Record<string, unknown>;

  const method = c.method === 'POST' ? 'POST' : 'GET';
  const divisor = Number(c.reward_divisor ?? 1);

  const cfg: GenericConfig = {
    list_path: strField(c.list_path, ''),
    method,
    query_params: strField(c.query_params, ''),
    list_key: strField(c.list_key, ''),
    map: {
      id: strField(m.id, 'id'),
      title: strField(m.title, ''),
      description: strField(m.description, 'description'),
      reward: strField(m.reward, 'reward'),
      currency: strField(m.currency, ''),
      deadline: strField(m.deadline, ''),
      status: strField(m.status, ''),
    },
    reward_divisor: Number.isFinite(divisor) && divisor > 0 ? divisor : 1,
    default_currency: strField(c.default_currency, 'USD').toUpperCase(),
    open_values: Array.isArray(c.open_values)
      ? c.open_values.filter((v): v is string => typeof v === 'string')
      : ['open'],
  };

  if (!cfg.list_path.startsWith('/')) {
    throw new Error('list_path is required and must start with "/"');
  }
  return cfg;
}

function buildUrl(baseUrl: string, cfg: GenericConfig): string {
  let base: URL;
  try {
    base = new URL(baseUrl);
  } catch {
    throw new Error('base_url is missing or invalid');
  }
  if (base.protocol !== 'https:' && !['127.0.0.1','localhost'].includes(base.hostname)) throw new Error('base_url must use https');
  const root = base.toString().replace(/\/+$/, '');
  const qs = cfg.query_params.replace(/^\?/, '');
  return `${root}${cfg.list_path}${qs ? `?${qs}` : ''}`;
}

function judge(
  cfg: GenericConfig,
  rawStatus: string,
  expiryMs: number | null,
): { eligibility: EligibilityStatus; reasons: string[] } {
  const reasons: string[] = [];
  if (cfg.map.status && !cfg.open_values.includes(rawStatus)) {
    reasons.push(`status is ${rawStatus || 'empty'}`);
  }
  if (expiryMs !== null && expiryMs <= Date.now()) reasons.push('expired');
  if (reasons.length > 0) return { eligibility: 'ineligible', reasons };
  if (!cfg.map.status) {
    return { eligibility: 'unknown', reasons: ['no status field mapped'] };
  }
  return { eligibility: 'eligible', reasons: [] };
}

export function genericConnectorFor(platformSlug: string): DiscoveryConnector {
  return {
    platformSlug,

    async discover(context: ConnectorContext): Promise<DiscoveredTask[]> {
      const cfg = loadConfig(context.platformId);
      const url = buildUrl(context.baseUrl, cfg);

      const headers: Record<string, string> = { accept: 'application/json' };
      if (resolveAuthHeaders) {
        Object.assign(headers, await resolveAuthHeaders(context.platformId));
      }

      const res = await fetch(url, {
        method: cfg.method,
        headers,
        redirect: 'error',
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) throw new Error(`Platform responded with HTTP ${res.status}`);

      const body: unknown = await res.json();
      const list = cfg.list_key ? pick(body, cfg.list_key) : body;
      if (!Array.isArray(list)) {
        throw new Error('Unexpected response: tasks array not found (check list_key)');
      }

      const discoveredAt = new Date().toISOString();
      const out: DiscoveredTask[] = [];

      for (const raw of list.slice(0, MAX_ITEMS)) {
        if (typeof raw !== 'object' || raw === null) continue;

        const id = asString(pick(raw, cfg.map.id)).trim();
        const description = asString(pick(raw, cfg.map.description)).slice(0, MAX_TEXT);
        const titleRaw = cfg.map.title ? asString(pick(raw, cfg.map.title)).trim() : '';
        const firstLine =
          description.split('\n').find((l) => l.trim().length > 0)?.trim() ?? '';
        const title = (titleRaw || firstLine).slice(0, 120);

        const rewardRaw = Number(asString(pick(raw, cfg.map.reward)));
        if (!id || !title || !Number.isFinite(rewardRaw) || rewardRaw < 0) continue;

        const currency =
          (cfg.map.currency ? asString(pick(raw, cfg.map.currency)).trim() : '') ||
          cfg.default_currency;

        const expiryMs = cfg.map.deadline ? parseTime(pick(raw, cfg.map.deadline)) : null;
        const rawStatus = cfg.map.status ? asString(pick(raw, cfg.map.status)) : '';
        const verdict = judge(cfg, rawStatus, expiryMs);

        out.push({
          externalId: id,
          title,
          description,
          reward: rewardRaw / cfg.reward_divisor,
          currency: currency.toUpperCase(),
          deadline: expiryMs === null ? null : new Date(expiryMs).toISOString(),
          aiSuitability: null,
          eligibility: verdict.eligibility,
          eligibilityReasons: verdict.reasons,
          platformId: context.platformId,
          platformSlug: context.platformSlug,
          discoveredAt,
        });
      }

      return out;
    },
  };
}

/* ------------------------------------------------------------------ */
/* Extended config-driven operations (claim, submit, status, balance)  */
/* ------------------------------------------------------------------ */

function loadExtendedConfig(platformId: number): GenericExtendedConfig {
  const row = get<{ settings_json: string }>(
    'SELECT settings_json FROM platform_settings WHERE platform_id = ?',
    platformId,
  );
  if (!row) return {};
  try {
    const parsed = JSON.parse(row.settings_json) as Record<string, unknown>;
    const ext = parsed['generic-ext'];
    if (typeof ext === 'object' && ext !== null) {
      return ext as GenericExtendedConfig;
    }
  } catch {
    // ignore invalid JSON; extended operations just won't run
  }
  return {};
}

async function callEndpoint(
  baseUrl: string,
  endpoint: GenericEndpoint,
  vars: Record<string, string>,
  authHeaders: Record<string, string>,
): Promise<unknown> {
  const method = endpoint.method ?? 'POST';
  const path = renderTemplate(endpoint.path, vars);
  const url = new URL(path.startsWith('http') ? path : `${baseUrl.replace(/\/+$/, '')}${path}`);
  const headers: Record<string, string> = { accept: 'application/json', ...authHeaders };

  let body: string | undefined;
  if (endpoint.body !== undefined && method !== 'GET') {
    const renderedBody = JSON.parse(renderTemplate(JSON.stringify(endpoint.body), vars));
    body = JSON.stringify(renderedBody);
    headers['content-type'] = 'application/json';
  }

  const res = await fetch(url, {
    method,
    headers,
    body,
    redirect: 'error',
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) {
    throw new Error(`Platform responded with HTTP ${res.status}`);
  }
  if (res.status === 204) return {};
  return res.json();
}

export async function genericClaimTask(
  platformId: number,
  baseUrl: string,
  externalId: string,
): Promise<{ claimed: boolean; claimId?: string; message?: string }> {
  const cfg = loadExtendedConfig(platformId);
  if (!cfg.endpoints?.claim) {
    throw new Error('No claim endpoint configured for this platform');
  }
  const authHeaders = resolveAuthHeaders ? await resolveAuthHeaders(platformId) : {};
  const response = (await callEndpoint(baseUrl, cfg.endpoints.claim, { id: externalId }, authHeaders)) as Record<string, unknown>;
  const claimIdField = cfg.mappings?.claimId ?? 'claimId';
  const claimId = typeof response[claimIdField] === 'string' ? (response[claimIdField] as string) : undefined;
  return { claimed: true, claimId };
}

export async function genericSubmitWork(
  platformId: number,
  baseUrl: string,
  externalId: string,
  payload: import('../core/contracts.ts').SubmissionPayload,
): Promise<{ accepted: boolean; submissionId?: string; message?: string }> {
  const cfg = loadExtendedConfig(platformId);
  if (!cfg.endpoints?.submit) {
    throw new Error('No submit endpoint configured for this platform');
  }
  const authHeaders = resolveAuthHeaders ? await resolveAuthHeaders(platformId) : {};
  const vars: Record<string, string> = {
    id: externalId,
    text: payload.text,
    artifacts: JSON.stringify(payload.artifacts),
  };
  const response = (await callEndpoint(baseUrl, cfg.endpoints.submit, vars, authHeaders)) as Record<string, unknown>;
  const submissionIdField = cfg.mappings?.submissionId ?? 'submissionId';
  const submissionId = typeof response[submissionIdField] === 'string' ? (response[submissionIdField] as string) : undefined;
  return { accepted: true, submissionId };
}

export async function genericGetBalance(
  platformId: number,
  baseUrl: string,
): Promise<{ amount: number; currency: string }> {
  const cfg = loadExtendedConfig(platformId);
  if (!cfg.endpoints?.balance) {
    throw new Error('No balance endpoint configured for this platform');
  }
  const authHeaders = resolveAuthHeaders ? await resolveAuthHeaders(platformId) : {};
  const response = (await callEndpoint(baseUrl, cfg.endpoints.balance, {}, authHeaders)) as Record<string, unknown>;
  const amountField = cfg.mappings?.balanceAmount ?? 'amount';
  const currencyField = cfg.mappings?.balanceCurrency ?? 'currency';
  const amount = Number(response[amountField]);
  const currency = typeof response[currencyField] === 'string' ? (response[currencyField] as string) : 'USD';
  if (!Number.isFinite(amount)) {
    throw new Error('Balance response did not contain a valid amount');
  }
  return { amount, currency: currency.toUpperCase() };
}

/* ------------------------------------------------------------------ */
/* Full PlatformConnector wrapper (exposes extended ops)              */
/* ------------------------------------------------------------------ */

export function fullGenericConnectorFor(platformSlug: string): import('../core/contracts.ts').PlatformConnector {
  const discovery = genericConnectorFor(platformSlug);
  return {
    platformSlug,
    authStrategy: 'bearer',
    capabilities: {
      auth: 'supported',
      test: 'supported',
      fetchTasks: 'supported',
      taskDetails: 'unknown',
      acceptTask: 'unknown',
      submitResult: 'unknown',
      taskStatus: 'unknown',
      rewards: 'unknown',
      balances: 'unknown',
      withdrawals: 'unknown',
    },
    discover: discovery.discover,
    claimTask: async (ctx, externalId) => genericClaimTask(ctx.platformId, ctx.baseUrl, externalId),
    submitWork: async (ctx, externalId, payload) => genericSubmitWork(ctx.platformId, ctx.baseUrl, externalId, payload),
  };
}
