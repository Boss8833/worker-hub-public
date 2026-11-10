import { all, get, run } from '../db.ts';
import { getConnector } from '../connectors/registry.ts';
import type {
  ConnectorContext,
  DiscoveredTask,
  DiscoveryResult,
} from './types.ts';

type PlatformRow = {
  id: number;
  slug: string;
  base_url: string;
  enabled: number;
  connector: string;
};

type SettingsRow = {
  min_reward: number;
  filters_json: string;
};

type Filters = {
  include: string[];
  exclude: string[];
};

function validTask(task: DiscoveredTask): boolean {
  return (
    typeof task.externalId === 'string' &&
    task.externalId.trim().length > 0 &&
    typeof task.title === 'string' &&
    task.title.trim().length > 0 &&
    Number.isFinite(task.reward) &&
    task.reward >= 0 &&
    typeof task.currency === 'string' &&
    ['eligible', 'ineligible', 'unknown'].includes(task.eligibility) &&
    Array.isArray(task.eligibilityReasons)
  );
}

function getFilterMismatch(
  task: DiscoveredTask,
  filters: Filters,
): string | null {
  const content =
    `${task.title} ${task.description ?? ''} ${task.requirements ?? ''}`.toLowerCase();

  const excluded = filters.exclude.find((word) =>
    content.includes(word.toLowerCase()),
  );

  if (excluded) return `Excluded by filter: ${excluded}`;

  if (
    filters.include.length > 0 &&
    !filters.include.some((word) =>
      content.includes(word.toLowerCase()),
    )
  ) {
    return 'Does not match include filters';
  }

  return null;
}

export async function discoverPlatform(
  platformId: number,
): Promise<DiscoveryResult> {
  const result: DiscoveryResult = {
    platformId,
    platformSlug: '',
    fetched: 0,
    inserted: 0,
    updated: 0,
    skipped: 0,
    errors: [],
    completedAt: new Date().toISOString(),
  };

  const platform = get<PlatformRow>(
    `SELECT id, slug, base_url, enabled, connector
     FROM platforms WHERE id = ?`,
    platformId,
  );

  if (!platform) {
    result.errors.push('Platform not found');
    return result;
  }

  result.platformSlug = platform.slug;

  if (!platform.enabled) {
    result.errors.push('Platform is disabled');
    return result;
  }

  const connector = getConnector(platform.slug);

  if (!connector) {
    result.errors.push('No discovery connector is registered');
    return result;
  }

  const settings = get<SettingsRow>(
    'SELECT min_reward, filters_json FROM worker_settings WHERE id = 1',
  );

  if (!settings) {
    result.errors.push('Worker settings not found');
    return result;
  }

  let filters: Filters;

  try {
    const parsed: unknown = JSON.parse(settings.filters_json);

    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      !Array.isArray((parsed as Filters).include) ||
      !Array.isArray((parsed as Filters).exclude) ||
      !(parsed as Filters).include.every((v) => typeof v === 'string') ||
      !(parsed as Filters).exclude.every((v) => typeof v === 'string')
    ) {
      throw new Error('Invalid filters');
    }

    filters = parsed as Filters;
  } catch {
    result.errors.push('Invalid worker filters configuration');
    return result;
  }

  const context: ConnectorContext = {
    platformId: platform.id,
    platformSlug: platform.slug,
    baseUrl: platform.base_url,
  };

  let tasks: DiscoveredTask[];

  try {
    tasks = await connector.discover(context);
  } catch (error) {
    result.errors.push(
      error instanceof Error
        ? error.message
        : 'Connector discovery failed',
    );
    return result;
  }

  result.fetched = tasks.length;

  for (const task of tasks) {
    if (!validTask(task)) {
      result.skipped++;
      result.errors.push('A connector returned an invalid task');
      continue;
    }

    if (
      task.platformId !== platform.id ||
      task.platformSlug !== platform.slug
    ) {
      result.skipped++;
      result.errors.push('Task platform identity mismatch');
      continue;
    }

    let eligibility = task.eligibility;

    if (task.reward < settings.min_reward) {
      eligibility = 'ineligible';
    }

    if (getFilterMismatch(task, filters)) {
      eligibility = 'ineligible';
    }

    const discoveryStatus =
      eligibility === 'eligible'
        ? 'eligible'
        : eligibility === 'ineligible'
          ? 'ineligible'
          : 'discovered';

    const existing = get<{ id: number; status: string }>(
      `SELECT id, status FROM tasks
       WHERE platform_id = ? AND external_id = ?`,
      platform.id,
      task.externalId.trim(),
    );

    try {
      if (existing) {
        run(
          `UPDATE tasks SET
            title = ?,
            description = ?,
            requirements = ?,
            reward = ?,
            currency = ?,
            deadline = ?,
            ai_suitability = ?,
            eligibility_status = ?,
            eligibility_reasons = ?,
            category = ?,
            source_url = ?,
            discovered_at = ?,
            reward_asset = ?,
            status = CASE
              WHEN status IN ('discovered', 'eligible', 'ineligible')
              THEN ?
              ELSE status
            END,
            updated_at = CURRENT_TIMESTAMP
           WHERE id = ?`,
          task.title.trim(),
          task.description ?? '',
          task.requirements ?? '',
          task.reward,
          task.currency.toUpperCase(),
          task.deadline ?? null,
          task.aiSuitability === null
            ? null
            : String(task.aiSuitability),
          eligibility,
          JSON.stringify([
            ...new Set([
              ...task.eligibilityReasons,
              ...(task.reward < settings.min_reward
                ? [`Below minimum reward (${settings.min_reward})`]
                : []),
              ...(getFilterMismatch(task, filters)
                ? [getFilterMismatch(task, filters)!]
                : []),
            ]),
          ]),
          task.category ?? null,
          task.sourceUrl ?? null,
          task.discoveredAt,
          task.currency.toUpperCase(),
          discoveryStatus,
          existing.id,
        );

        result.updated++;
      } else {
        run(
          `INSERT INTO tasks (
            platform_id,
            external_id,
            title,
            description,
            requirements,
            reward,
            currency,
            deadline,
            status,
            ai_suitability,
            is_mock,
            eligibility_status,
            eligibility_reasons,
            category,
            source_url,
            discovered_at,
            reward_asset,
            created_at,
            updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?,
            CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
          platform.id,
          task.externalId.trim(),
          task.title.trim(),
          task.description ?? '',
          task.requirements ?? '',
          task.reward,
          task.currency.toUpperCase(),
          task.deadline ?? null,
          discoveryStatus,
          task.aiSuitability === null
            ? null
            : String(task.aiSuitability),
          eligibility,
          JSON.stringify([
            ...new Set([
              ...task.eligibilityReasons,
              ...(task.reward < settings.min_reward
                ? [`Below minimum reward (${settings.min_reward})`]
                : []),
              ...(getFilterMismatch(task, filters)
                ? [getFilterMismatch(task, filters)!]
                : []),
            ]),
          ]),
          task.category ?? null,
          task.sourceUrl ?? null,
          task.discoveredAt,
          task.currency.toUpperCase(),
        );

        result.inserted++;
      }
    } catch (error) {
      result.errors.push(
        error instanceof Error
          ? error.message
          : 'Task persistence failed',
      );
    }
  }

  return result;
}

export async function discoverEnabledPlatforms(): Promise<DiscoveryResult[]> {
  const platforms = all<PlatformRow[]>(
    `SELECT id, slug, base_url, enabled, connector
     FROM platforms WHERE enabled = 1 ORDER BY id`,
  );

  const results: DiscoveryResult[] = [];

  for (const platform of platforms ?? []) {
    results.push(await discoverPlatform(platform.id));
  }

  return results;
}
