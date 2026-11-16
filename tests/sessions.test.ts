import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { sql } from '../server/db.js';
import { baseUrl, get, post, resetDb, serve, signIn, PROD, TEST } from './helpers.js';

const sessionId = (cookie: string) => cookie.split('=')[1];

beforeAll(async () => {
  await serve.startServer();
});
afterAll(async () => {
  await serve.stopServer();
});
beforeEach(async () => {
  await resetDb();
});

describe('sign-in sessions', () => {
  it('gives each sign-in its own random session, not a shared secret', async () => {
    const a = await signIn(PROD);
    const b = await signIn(PROD);
    expect(sessionId(a.cookie)).not.toBe(sessionId(b.cookie));
    expect(sessionId(a.cookie).length).toBeGreaterThanOrEqual(32);
  });

  it('remembers who signed in and which catalog their PIN opened', async () => {
    const s = await signIn(TEST);
    const me = await get(s, '/api/me');
    expect(me.body).toMatchObject({ name: 'Test Admin', catalog: 'test', role: 'admin', testing: true });
  });

  it('keeps the session for about eight hours', async () => {
    const before = Date.now();
    const s = await signIn(PROD);
    const row = (await sql('SELECT expires_at FROM sessions WHERE id = $1', [sessionId(s.cookie)])).rows[0];
    const eightHours = 8 * 60 * 60 * 1000;
    const remaining = new Date(row.expires_at).getTime() - before;
    expect(remaining).toBeGreaterThanOrEqual(eightHours - 5000);
    expect(remaining).toBeLessThanOrEqual(eightHours + 5000);
  });

  it('refuses a session once it has expired', async () => {
    const s = await signIn(PROD);
    expect((await get(s, '/api/items')).status).toBe(200);
    await sql('UPDATE sessions SET expires_at = $1 WHERE id = $2', [new Date(Date.now() - 1000), sessionId(s.cookie)]);
    expect((await get(s, '/api/items')).status).toBe(401);
    expect((await get(s, '/api/me')).body).toEqual({ name: null });
  });

  it('ends a session immediately on sign-out, even if the cookie is kept', async () => {
    const s = await signIn(PROD);
    await post(s, '/api/logout');
    expect((await get(s, '/api/items')).status).toBe(401);
  });

  it('refuses cookies that were not issued by sign-in', async () => {
    // The old cookie style, and a made-up session ID, must both be refused.
    const old = await fetch(`${baseUrl()}/api/items`, { headers: { Cookie: 'reviewer=Someone; catalog=prod' } });
    expect(old.status).toBe(401);
    const forged = await fetch(`${baseUrl()}/api/items`, { headers: { Cookie: `session=${'a'.repeat(43)}` } });
    expect(forged.status).toBe(401);
  });

  it('removes expired sessions when someone signs in again', async () => {
    const s = await signIn(PROD);
    await sql('UPDATE sessions SET expires_at = $1 WHERE id = $2', [new Date(Date.now() - 1000), sessionId(s.cookie)]);
    await signIn(PROD);
    const left = (await sql('SELECT COUNT(*) AS n FROM sessions WHERE id = $1', [sessionId(s.cookie)])).rows[0].n;
    expect(left).toBe(0);
  });
});
