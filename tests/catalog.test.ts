import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { addItem, api, del, get, post, put, resetDb, serve, signIn, Session, TEST_PIN, PROD_PIN } from './helpers.js';

const tinyJpeg = 'data:image/jpeg;base64,/9j/4AAQSkZJRg=='; // content is irrelevant in demo mode

let prod: Session;
let test: Session;

beforeAll(async () => {
  await serve.startServer();
});
afterAll(async () => {
  await serve.stopServer();
});
beforeEach(async () => {
  await resetDb();
  prod = await signIn(PROD_PIN, 'Harpreet');
  test = await signIn(TEST_PIN, 'Harpreet');
});

describe('building the catalog by hand', () => {
  it('adds an item with a minimum and target, and reports it below minimum', async () => {
    const it = await addItem(prod, { name: 'Atta', location: 'Kitchen', unit: 'bags', mode: 'num', min: 5, target: 10, currentNum: 2 });
    expect(it.name).toBe('Atta');
    expect(it.needsSetup).toBe(false);
    expect(it.belowMin).toBe(true);
  });

  it('flags a numeric item with no minimum as needing setup', async () => {
    const it = await addItem(prod, { name: 'Dal', location: 'Shelves', mode: 'num', currentNum: 4 });
    expect(it.needsSetup).toBe(true);
    expect(it.belowMin).toBe(false);
  });

  it('adds level-tracked items with no minimum', async () => {
    const it = await addItem(prod, { name: 'Ghee', location: 'Fridge', mode: 'lvl', currentLevel: 'Low', unit: 'jars' });
    expect(it.needsSetup).toBe(false);
    expect(it.belowMin).toBe(true);
  });

  it('rejects an item with no name', async () => {
    const r = await post(prod, '/api/items', { name: '   ', location: 'Shelves', mode: 'num' });
    expect(r.status).toBe(400);
    expect(r.body.error).toBe('Enter a name.');
  });

  it('falls back to Shelves for an unknown location', async () => {
    const it = await addItem(prod, { name: 'Haldi', location: 'Garage', mode: 'num', min: 1, target: 2, currentNum: 3 });
    const { body } = await get(prod, '/api/items');
    expect(body.find((x: any) => x.id === it.id)).toBeTruthy();
    expect(body.find((x: any) => x.id === it.id).location).toBe('Shelves');
  });

  it('edits an item’s name, minimum and target', async () => {
    const it = await addItem(prod, { name: 'Salt', location: 'Kitchen', mode: 'num', min: 2, target: 4, currentNum: 1 });
    const r = await put(prod, `/api/items/${it.id}`, { name: 'Sea salt', min: 3, target: 6 });
    expect(r.status).toBe(200);
    expect(r.body.name).toBe('Sea salt');
    expect(r.body.min).toBe(3);
    expect(r.body.target).toBe(6);
  });

  it('removes an item from the catalog without deleting its history', async () => {
    const it = await addItem(prod, { name: 'Old jam', location: 'Shelves', mode: 'num', min: 1 });
    await del(prod, `/api/items/${it.id}`);
    const { body } = await get(prod, '/api/items');
    expect(body.find((x: any) => x.id === it.id)).toBeUndefined();
  });

  it('keeps the production and testing catalogs separate', async () => {
    await addItem(prod, { name: 'Production only', location: 'Shelves', mode: 'num', min: 1 });
    await addItem(test, { name: 'Test only', location: 'Shelves', mode: 'num', min: 1 });
    expect((await get(prod, '/api/items')).body.map((x: any) => x.name)).toEqual(['Production only']);
    expect((await get(test, '/api/items')).body.map((x: any) => x.name)).toEqual(['Test only']);
  });

  it('includes a Punjabi display name for glossary products', async () => {
    await addItem(prod, { name: 'Toor Dal', location: 'Shelves', mode: 'num', min: 1 });
    await addItem(prod, { name: 'Aashirvaad Atta', location: 'Kitchen', mode: 'num', min: 1 });
    const items = (await get(prod, '/api/items')).body;
    expect(items.find((x: any) => x.name === 'Toor Dal').namePa).toBe('ਤੂਰ ਦਾਲ');
    expect(items.find((x: any) => x.name === 'Aashirvaad Atta').namePa).toBeNull();
  });

  it('requires sign-in', async () => {
    const r = await get(null, '/api/items');
    expect(r.status).toBe(401);
  });
});

describe('building the catalog with photo capture (demo mode, no Claude key)', () => {
  it('returns the demo reading for a photo', async () => {
    const r = await post(prod, '/api/scan', { location: 'Shelves', image: tinyJpeg });
    expect(r.status).toBe(200);
    expect(r.body.demo).toBe(true);
    expect(r.body.results.map((x: any) => x.name)).toContain('Atta (whole wheat flour)');
    expect(r.body.results.every((x: any) => x.matchId === null)).toBe(true);
  });

  it('rejects a photo that is not a JPEG, PNG or WebP image', async () => {
    const r = await post(prod, '/api/scan', { location: 'Shelves', image: 'data:text/plain;base64,aGk=' });
    expect(r.status).toBe(400);
  });

  it('saves confirmed photo results as new items, with no minimum yet', async () => {
    const scan = await post(prod, '/api/scan', { location: 'Shelves', image: tinyJpeg });
    const chosen = scan.body.results.slice(0, 2).map((x: any) => ({ ...x, count: x.count }));
    const save = await post(prod, '/api/scan/save', { location: 'Shelves', items: chosen });
    expect(save.body).toEqual({ added: 2, updated: 0 });

    const items = (await get(prod, '/api/items')).body;
    expect(items.map((x: any) => x.name).sort()).toEqual(chosen.map((x: any) => x.name).sort());
    for (const it of items) {
      expect(it.needsSetup).toBe(true);
      expect(it.location).toBe('Shelves');
    }
  });

  it('updates an existing item when a photo result is matched, instead of adding a duplicate', async () => {
    const first = await post(prod, '/api/scan', { location: 'Shelves', image: tinyJpeg });
    await post(prod, '/api/scan/save', { location: 'Shelves', items: [first.body.results[0]] });

    const second = await post(prod, '/api/scan', { location: 'Shelves', image: tinyJpeg });
    const match = second.body.results.find((x: any) => x.name === first.body.results[0].name);
    expect(match.matchId).not.toBeNull();

    const save = await post(prod, '/api/scan/save', { location: 'Shelves', items: [{ ...match, count: 7 }] });
    expect(save.body).toEqual({ added: 0, updated: 1 });
    const updated = (await get(prod, '/api/items')).body.find((x: any) => x.id === match.matchId);
    expect(updated.currentNum).toBe(7);
  });

  it('clamps counts from a photo to whole non-negative numbers', async () => {
    const save = await post(prod, '/api/scan/save', {
      location: 'Kitchen',
      items: [{ name: 'Sugar', unit: 'bags', count: -3 }, { name: 'Oats', unit: 'packs', count: 2.6 }]
    });
    expect(save.body.added).toBe(2);
    const items = (await get(prod, '/api/items')).body;
    expect(items.find((x: any) => x.name === 'Sugar').currentNum).toBe(0);
    expect(items.find((x: any) => x.name === 'Oats').currentNum).toBe(3);
  });

  it('saves glossary names in their canonical form', async () => {
    await post(prod, '/api/scan/save', { location: 'Shelves', items: [{ name: 'arhar dal', unit: 'packs', count: 2 }] });
    const items = (await get(prod, '/api/items')).body;
    expect(items.map((x: any) => x.name)).toEqual(['Toor Dal']);
    expect(items[0].currentNum).toBe(2);
  });

  it('ignores photo results with no name', async () => {
    const save = await post(prod, '/api/scan/save', { location: 'Kitchen', items: [{ name: '  ', count: 1 }] });
    expect(save.body).toEqual({ added: 0, updated: 0 });
  });
});
