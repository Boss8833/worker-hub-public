export class ApiError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export async function api<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const headers: Record<string, string> = {};
  if (init.body !== undefined) headers['Content-Type'] = 'application/json';
  const token = sessionStorage.getItem('wh_token');
  if (token) headers['X-Access-Token'] = token;
  let res: Response;
  try {
    res = await fetch(path, { method: init.method ?? 'GET', headers, body: init.body !== undefined ? JSON.stringify(init.body) : undefined });
  } catch {
    throw new ApiError(0, 'NETWORK', 'Cannot reach the WORKER HUB server. Is "npm start" running?');
  }
  const text = await res.text();
  let json: any = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* non-JSON */ }
  if (!res.ok) throw new ApiError(res.status, json?.error?.code ?? 'ERROR', json?.error?.message ?? `HTTP ${res.status}`);
  return json as T;
}
