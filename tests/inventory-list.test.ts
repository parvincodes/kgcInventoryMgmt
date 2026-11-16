import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { addItem, countAll, get, post, put, del, resetDb, serve, signIn, Session, PROD } from './helpers.js';

let s: Session;

beforeAll(async () => {
  await serve.startServer();
});
afterAll(async () => {
  await serve.stopServer();
});
beforeEach(async () => {
  await resetDb();
  s = await signIn(PROD);
  await addItem(s, { name: 'Atta', location: 'Kitchen', unit: 'bags', mode: 'num', min: 5, target: 10, currentNum: 2 });
  await addItem(s, { name: 'Rice', location: 'Shelves', unit: 'bags', mode: 'num', min: 3, target: 6, currentNum: 5 });
  await addItem(s, { name: 'Ghee', location: 'Fridge', unit: 'jars', mode: 'lvl', currentLevel: 'Low' });
  await addItem(s, { name: 'Dal', location: 'Shelves', unit: 'bags', mode: 'num', currentNum: 1 }); // no minimum: stays off the list
});

async function finishCount() {
  await countAll(s);
  const r = await post(s, '/api/count/finish');
  expect(r.body.status).toBe('drafted');
  return r.body;
}

describe('reviewing the inventory and sending the list', () => {
  it('moves the week from count due to counting to drafted', async () => {
    expect((await get(s, '/api/week')).body.status).toBe('count_due');
    await post(s, '/api/count/item/1', { value: 2 });
    expect((await get(s, '/api/week')).body.status).toBe('counting');
    await finishCount();
  });

  it('drafts a list with only the items below minimum, sized to target', async () => {
    await finishCount();
    const { body } = await get(s, '/api/list');
    const names = body.lines.map((l: any) => l.name).sort();
    expect(names).toEqual(['Atta', 'Ghee']);
    const atta = body.lines.find((l: any) => l.name === 'Atta');
    expect(atta.suggested).toBe(8); // target 10 - have 2
    expect(atta.qty).toBe(8);
    expect(atta.reason).toBe('Have 2 · target 10');
    const ghee = body.lines.find((l: any) => l.name === 'Ghee');
    expect(ghee.suggested).toBe(1);
    expect(ghee.reason).toBe('Level Low');
  });

  it('keeps a reviewer’s edited quantity, and removes an item they take off', async () => {
    await finishCount();
    const { body } = await get(s, '/api/list');
    const atta = body.lines.find((l: any) => l.name === 'Atta');
    const ghee = body.lines.find((l: any) => l.name === 'Ghee');

    await put(s, `/api/list/lines/${atta.id}`, { qty: 9 });
    await put(s, `/api/list/lines/${ghee.id}`, { removed: true });

    const after = (await get(s, '/api/list')).body;
    expect(after.lines.find((l: any) => l.name === 'Atta').qty).toBe(9);
    expect(after.lines.find((l: any) => l.name === 'Ghee').removed).toBe(true);
    expect(after.week.lineCount).toBe(1);
  });

  it('adds a one-off item and removes it again', async () => {
    await finishCount();
    const add = await post(s, '/api/list/lines', { name: 'Marigold flowers', qty: 3, unit: 'boxes', reason: 'Gurpurab' });
    expect(add.status).toBe(200);

    const oneOff = (await get(s, '/api/list')).body.lines.find((l: any) => l.name === 'Marigold flowers');
    expect(oneOff.oneOff).toBe(true);
    expect(oneOff.qty).toBe(3);

    await del(s, `/api/list/lines/${oneOff.id}`);
    expect((await get(s, '/api/list')).body.lines.find((l: any) => l.name === 'Marigold flowers')).toBeUndefined();
  });

  it('will not show the family the list until it is approved', async () => {
    await finishCount();
    const token = (await get(s, '/api/week')).body.shareToken;
    const early = await get(null, `/api/family/${token}`);
    expect(early.status).toBe(404);
  });

  it('approves the list, and the family sees the latest version with the note', async () => {
    await finishCount();
    const { body: list } = await get(s, '/api/list');
    const atta = list.lines.find((l: any) => l.name === 'Atta');
    await put(s, `/api/list/lines/${atta.id}`, { qty: 9 });
    await put(s, '/api/list/note', { note: 'Whole milk in 1-gallon jugs, please.' });
    await post(s, '/api/list/approve');

    const week = (await get(s, '/api/week')).body;
    expect(week.status).toBe('sent');

    const family = await get(null, `/api/family/${week.shareToken}`);
    expect(family.status).toBe(200);
    expect(family.body.note).toBe('Whole milk in 1-gallon jugs, please.');
    expect(family.body.lines.find((l: any) => l.name === 'Atta').qty).toBe(9);
    expect(family.body.testing).toBe(false);
  });

  it('answers unknown family links with not found', async () => {
    const r = await get(null, '/api/family/not-a-real-token');
    expect(r.status).toBe(404);
  });

  it('lets the family record what they bought without changing the inventory', async () => {
    await finishCount();
    await post(s, '/api/list/approve');
    const week = (await get(s, '/api/week')).body;
    const family = (await get(null, `/api/family/${week.shareToken}`)).body;
    const atta = family.lines.find((l: any) => l.name === 'Atta');

    const r = await post(null, `/api/family/${week.shareToken}/lines/${atta.id}`, { bought: true, boughtQty: 7 });
    expect(r.body.bought).toBe(true);
    expect(r.body.boughtQty).toBe(7);

    const stock = (await get(s, '/api/items')).body.find((x: any) => x.name === 'Atta');
    expect(stock.currentNum).toBe(2); // unchanged: only the weekly count changes stock
  });

  it('counts bought items on the week summary', async () => {
    await finishCount();
    await post(s, '/api/list/approve');
    const week = (await get(s, '/api/week')).body;
    const family = (await get(null, `/api/family/${week.shareToken}`)).body;
    await post(null, `/api/family/${week.shareToken}/lines/${family.lines[0].id}`, { bought: true });
    expect((await get(s, '/api/week')).body.boughtCount).toBe(1);
  });
});
