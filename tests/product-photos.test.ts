import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { addItem, api, baseUrl, del, get, put, resetDb, serve, signIn, Session, PROD, TEST } from './helpers.js';

// Bytes that start like a JPEG (FF D8 FF). The server only checks the header, so this is enough for tests.
const jpegBytes = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0xff, 0xd9]);
const jpegUrl = `data:image/jpeg;base64,${jpegBytes.toString('base64')}`;

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
  prod = await signIn(PROD);
  test = await signIn(TEST);
});

describe('product photos', () => {
  it('saves a photo for an item and shows it in the catalog', async () => {
    const it = await addItem(prod, { name: 'Ghee', location: 'Shelves', mode: 'num', min: 1 });
    expect(it.hasPhoto).toBe(false);

    const r = await put(prod, `/api/items/${it.id}/photo`, { image: jpegUrl });
    expect(r.status).toBe(200);
    expect(r.body.hasPhoto).toBe(true);

    const list = (await get(prod, '/api/items')).body.find((x: any) => x.id === it.id);
    expect(list.hasPhoto).toBe(true);
  });

  it('returns the saved photo bytes', async () => {
    const it = await addItem(prod, { name: 'Ghee', location: 'Shelves', mode: 'num' });
    await put(prod, `/api/items/${it.id}/photo`, { image: jpegUrl });

    const res = await fetch(`${baseUrl()}/api/items/${it.id}/photo`, { headers: { Cookie: prod.cookie } });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('image/jpeg');
    expect(Buffer.from(await res.arrayBuffer()).equals(jpegBytes)).toBe(true);
  });

  it('replaces a photo when a new one is taken', async () => {
    const it = await addItem(prod, { name: 'Ghee', location: 'Shelves', mode: 'num' });
    await put(prod, `/api/items/${it.id}/photo`, { image: jpegUrl });
    const again = await put(prod, `/api/items/${it.id}/photo`, { image: jpegUrl });
    expect(again.body.hasPhoto).toBe(true);
  });

  it('removes a photo', async () => {
    const it = await addItem(prod, { name: 'Ghee', location: 'Shelves', mode: 'num' });
    await put(prod, `/api/items/${it.id}/photo`, { image: jpegUrl });
    const r = await del(prod, `/api/items/${it.id}/photo`);
    expect(r.status).toBe(200);
    expect((await get(prod, '/api/items')).body[0].hasPhoto).toBe(false);
    expect((await get(prod, `/api/items/${it.id}/photo`)).status).toBe(404);
  });

  it('refuses files that are not JPEG photos', async () => {
    const it = await addItem(prod, { name: 'Ghee', location: 'Shelves', mode: 'num' });
    const png = await put(prod, `/api/items/${it.id}/photo`, { image: 'data:image/png;base64,iVBORw0KGgo=' });
    expect(png.status).toBe(400);
    const fake = await put(prod, `/api/items/${it.id}/photo`, { image: `data:image/jpeg;base64,${Buffer.from('hello').toString('base64')}` });
    expect(fake.status).toBe(400);
    expect(fake.body.error).toBe('That file is not a JPEG photo.');
  });

  it('will not attach a photo to an item that does not exist', async () => {
    const r = await put(prod, '/api/items/9999/photo', { image: jpegUrl });
    expect(r.status).toBe(404);
  });

  it('keeps photos separate between the production and testing catalogs', async () => {
    const it = await addItem(prod, { name: 'Ghee', location: 'Shelves', mode: 'num' });
    await put(prod, `/api/items/${it.id}/photo`, { image: jpegUrl });
    const testItem = await addItem(test, { name: 'Ghee', location: 'Shelves', mode: 'num' });
    expect(testItem.hasPhoto).toBe(false);
    expect((await get(test, `/api/items/${testItem.id}/photo`)).status).toBe(404);
  });
});

describe('identify a product from a photo', () => {
  it('reports demo mode when there is no Claude key', async () => {
    const r = await api(prod, 'POST', '/api/identify', { image: jpegUrl });
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ demo: true, name: null, unit: '', confidence: 'low' });
  });

  it('can identify from the photo saved on an item', async () => {
    const it = await addItem(prod, { name: 'Ghee', location: 'Shelves', mode: 'num' });
    await put(prod, `/api/items/${it.id}/photo`, { image: jpegUrl });
    const r = await api(prod, 'POST', '/api/identify', { itemId: it.id });
    expect(r.status).toBe(200);
    expect(r.body.demo).toBe(true);
  });

  it('asks for a photo when there is none', async () => {
    const r = await api(prod, 'POST', '/api/identify', {});
    expect(r.status).toBe(400);
  });
});
