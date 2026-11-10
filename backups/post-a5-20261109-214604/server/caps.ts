export const CAPABILITY_KEYS = [
  'auth', 'test', 'fetchTasks', 'taskDetails', 'acceptTask', 'submitResult', 'taskStatus', 'rewards', 'balances', 'withdrawals',
] as const;

// Every capability starts as "unknown" until the official documentation of that platform has been reviewed.
export const UNKNOWN_CAPS: Record<string, 'supported' | 'unsupported' | 'unknown'> = Object.fromEntries(
  CAPABILITY_KEYS.map((k) => [k, 'unknown']),
);

export function slugify(s: string): string {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'platform';
}
