import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { addItem, countAll, get, post, put, resetDb, serve, signIn, Session, PROD_PIN } from './helpers.js';

let s: Session;

beforeAll(async () => {
  await serve.startServer();
});
afterAll(async () => {
  await serve.stopServer();
});
beforeEach(async () => {
  await resetDb();
  s = await signIn(PROD_PIN, 'Harpreet');
  await addItem(s, { name: 'Atta', location: 'Kitchen', unit: 'bags', mode: 'num', min: 5, target: 10, currentNum: 2 });
  await addItem(s, { name: 'Ghee', location: 'Fridge', unit: 'jars', mode: 'lvl', currentLevel: 'Low' });
  await countAll(s);
  await post(s, '/api/count/finish');
});

const names = async () => (await get(s, '/api/list')).body.lines.map((l: any) => l.name);

describe('refilling the inventory', () => {
  it('takes an item off the draft once a recount shows it is back above minimum', async () => {
    expect(await names()).toContain('Atta');
    await post(s, '/api/count/item/1', { value: 10 }); // restocked to target
    expect(await names()).not.toContain('Atta');
    expect((await get(s, '/api/week')).body.status).toBe('drafted');
  });

  it('keeps an item on the draft while it is still below minimum, with a smaller suggestion', async () => {
    await post(s, '/api/count/item/1', { value: 4 }); // bought some, still short
    const atta = (await get(s, '/api/list')).body.lines.find((l: any) => l.name === 'Atta');
    expect(atta.suggested).toBe(6); // target 10 - have 4
  });

  it('takes a level item off the draft once it is refilled to Full', async () => {
    expect(await names()).toContain('Ghee');
    await post(s, '/api/count/item/2', { level: 'Half' });
    expect(await names()).not.toContain('Ghee'); // Half is above the Low/Out line, so it comes off the draft
  });

  it('keeps a quantity the reviewer set, while the item is still short', async () => {
    const atta = (await get(s, '/api/list')).body.lines.find((l: any) => l.name === 'Atta');
    await put(s, `/api/list/lines/${atta.id}`, { qty: 12 });
    await post(s, '/api/count/item/2', { level: 'Full' }); // unrelated item changes
    const after = (await get(s, '/api/list')).body.lines.find((l: any) => l.name === 'Atta');
    expect(after.qty).toBe(12);
  });

  it('does not change a list that has already been sent, even when stock is recounted', async () => {
    await post(s, '/api/list/approve');
    const before = (await get(s, '/api/list')).body.lines.map((l: any) => [l.name, l.qty]);
    await post(s, '/api/count/item/1', { value: 10 });
    const after = (await get(s, '/api/list')).body.lines.map((l: any) => [l.name, l.qty]);
    expect(after).toEqual(before);
    expect((await get(s, '/api/week')).body.status).toBe('sent');
  });

  it('keeps counting after a list is drafted, so the reviewer can go back and fix a count', async () => {
    await post(s, '/api/count/item/1', { value: 3 });
    await post(s, '/api/count/item/1', { value: 1 });
    const atta = (await get(s, '/api/list')).body.lines.find((l: any) => l.name === 'Atta');
    expect(atta.suggested).toBe(9);
    expect((await get(s, '/api/items')).body.find((x: any) => x.name === 'Atta').currentNum).toBe(1);
  });
});
