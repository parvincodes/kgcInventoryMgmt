import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { migrate, sql } from '../server/db.js';
import { addItem, countAll, get, post, resetDb, serve, signIn, PROD, REVIEWER } from './helpers.js';

beforeAll(async () => {
  await serve.startServer();
});
afterAll(async () => {
  await serve.stopServer();
});
beforeEach(async () => {
  await resetDb();
});

async function setUp() {
  const admin = await signIn(PROD);
  const reviewer = await signIn(REVIEWER);
  const atta = await addItem(admin, { name: 'Atta', location: 'Kitchen', unit: 'bags', mode: 'num', min: 5, target: 10, currentNum: 2 });
  await addItem(admin, { name: 'Rice', location: 'Shelves', unit: 'bags', mode: 'num', min: 3, target: 6, currentNum: 5 });
  await countAll(admin);
  await post(admin, '/api/count/finish');
  return { admin, reviewer, atta };
}

describe('the same item on the list only once', () => {
  it('never lists an item twice, even when two drafts run at the same moment', async () => {
    const { admin } = await setUp();
    const results = await Promise.all([post(admin, '/api/list/redraft'), post(admin, '/api/list/redraft'), post(admin, '/api/list/redraft')]);
    for (const r of results) expect(r.status).toBe(200);
    const lines = ((await get(admin, '/api/list')).body.lines as any[]).filter((l) => !l.oneOff);
    expect(lines.map((l) => l.name)).toEqual(['Atta']);
  });

  it('the database itself refuses a second line for the same item in the same week', async () => {
    const { admin, atta } = await setUp();
    const week = (await get(admin, '/api/week')).body;
    const weekId = week.id;
    await expect(
      sql('INSERT INTO list_lines (week_id, item_id, name) VALUES ($1, $2, $3)', [weekId, atta.id, 'Atta'])
    ).rejects.toThrow();
  });

  it('merges existing duplicate lines when the server starts, and leaves an alert', async () => {
    const { admin, atta } = await setUp();
    const weekId = (await get(admin, '/api/week')).body.id;
    await sql('DROP INDEX list_lines_one_per_item');
    await sql('INSERT INTO list_lines (week_id, item_id, name, qty, suggested) VALUES ($1, $2, $3, 8, 8)', [weekId, atta.id, 'Atta']);
    await migrate();
    const lines = (await sql('SELECT id FROM list_lines WHERE week_id = $1 AND item_id = $2', [weekId, atta.id])).rows;
    expect(lines).toHaveLength(1);
    const alerts = (await get(admin, '/api/alerts')).body as any[];
    expect(alerts.map((a) => a.kind)).toContain('duplicate_line');
  });
});

describe('two people counting the same item', () => {
  it('raises an alert naming both people and both counts, and keeps the later count', async () => {
    const { admin, reviewer, atta } = await setUp();
    await post(admin, `/api/count/item/${atta.id}`, { value: 3 });
    await post(reviewer, `/api/count/item/${atta.id}`, { value: 6 });
    const alerts = (await get(admin, '/api/alerts')).body as any[];
    const dc = alerts.find((a) => a.kind === 'double_count');
    expect(dc.detail).toContain('Atta was counted by Prod Admin and then by Prod Reviewer');
    expect(dc.detail).toContain('Before: 3. Now: 6');
    expect((await get(admin, '/api/items')).body.find((i: any) => i.id === atta.id).currentNum).toBe(6);
  });

  it('does not raise an alert when the same person counts again', async () => {
    const { admin, atta } = await setUp();
    await post(admin, `/api/count/item/${atta.id}`, { value: 3 });
    await post(admin, `/api/count/item/${atta.id}`, { value: 4 });
    expect((await get(admin, '/api/alerts')).body).toHaveLength(0);
  });

  it('will not approve the list until an admin has reviewed every alert', async () => {
    const { admin, reviewer, atta } = await setUp();
    await post(admin, `/api/count/item/${atta.id}`, { value: 3 });
    await post(reviewer, `/api/count/item/${atta.id}`, { value: 6 });
    const blocked = await post(admin, '/api/list/approve');
    expect(blocked.status).toBe(409);
    expect(blocked.body.error).toBe('Review 1 alert before approving the list.');

    const alert = ((await get(admin, '/api/alerts')).body as any[])[0];
    expect((await post(reviewer, `/api/alerts/${alert.id}/resolve`)).status).toBe(403);
    expect((await post(admin, `/api/alerts/${alert.id}/resolve`)).status).toBe(200);
    expect((await post(admin, '/api/list/approve')).status).toBe(200);
  });
});
