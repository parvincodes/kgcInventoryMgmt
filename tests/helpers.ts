import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { app } from '../server/index.js';
import { sql } from '../server/db.js';

export const PROD_PIN = '1111';
export const TEST_PIN = '2222';

let server: http.Server;
let base = '';

export async function startServer() {
  server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

export async function stopServer() {
  await new Promise<void>((resolve) => server.close(() => resolve()));
}

/** Empty every table and restart id counting, so tests can rely on ids. Call in beforeEach. */
export async function resetDb() {
  await sql('TRUNCATE items, weeks, count_entries, list_lines, sessions RESTART IDENTITY CASCADE');
}

export type Session = { cookie: string };

export async function signIn(pin: string, name = 'Tester'): Promise<Session> {
  const res = await fetch(`${base}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, pin })
  });
  if (!res.ok) throw new Error(`sign-in failed: ${res.status}`);
  const cookie = res.headers
    .getSetCookie()
    .map((c) => c.split(';')[0])
    .join('; ');
  return { cookie };
}

export type ApiResult<T = any> = { status: number; body: T };

export async function api<T = any>(
  session: Session | null,
  method: string,
  path: string,
  body?: unknown
): Promise<ApiResult<T>> {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: {
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(session ? { Cookie: session.cookie } : {})
    },
    body: body !== undefined ? JSON.stringify(body) : undefined
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, body: data as T };
}

export function baseUrl() {
  return base;
}

export const get = <T = any>(s: Session | null, path: string) => api<T>(s, 'GET', path);
export const post = <T = any>(s: Session | null, path: string, body: unknown = {}) => api<T>(s, 'POST', path, body);
export const put = <T = any>(s: Session | null, path: string, body: unknown = {}) => api<T>(s, 'PUT', path, body);
export const del = <T = any>(s: Session | null, path: string) => api<T>(s, 'DELETE', path);

/** Add an item through the catalog API and return it. */
export async function addItem(s: Session, fields: Record<string, unknown>) {
  const r = await post(s, '/api/items', fields);
  if (r.status !== 200) throw new Error(`addItem failed: ${JSON.stringify(r.body)}`);
  return r.body as { id: number; name: string; belowMin: boolean; needsSetup: boolean; currentNum: number; currentLevel: string };
}

/** Count every active item at its current value so the week is ready to finish. */
export async function countAll(s: Session) {
  const { body } = await get(s, '/api/count');
  for (const it of body.items) {
    await post(s, `/api/count/item/${it.id}`, it.mode === 'lvl' ? { level: it.currentLevel } : { value: it.currentNum });
  }
}

export const serve = { startServer, stopServer, resetDb };
