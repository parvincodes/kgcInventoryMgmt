import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { checkPin, hashPin, normalizePhone, randomPin, validPin } from '../server/people.js';
import { sql } from '../server/db.js';
import { addItem, get, post, put, del, resetDb, serve, signIn, PROD, REVIEWER, TEST } from './helpers.js';

const ADMIN2 = { phone: '202-555-0103', pin: '333444' };

beforeAll(async () => {
  await serve.startServer();
});
afterAll(async () => {
  await serve.stopServer();
});
beforeEach(async () => {
  await resetDb();
});

describe('phone numbers and PINs', () => {
  it('accepts US numbers in common forms', () => {
    expect(normalizePhone('202-555-0100')).toBe('+12025550100');
    expect(normalizePhone('(202) 555 0100')).toBe('+12025550100');
    expect(normalizePhone('+1 202 555 0100')).toBe('+12025550100');
    expect(normalizePhone('12025550100')).toBe('+12025550100');
  });

  it('rejects numbers that are not US numbers', () => {
    expect(normalizePhone('555-0100')).toBeNull();
    expect(normalizePhone('91 98765 43210')).toBeNull();
    expect(normalizePhone('')).toBeNull();
  });

  it('accepts 4 to 8 digit PINs only', () => {
    expect(validPin('1234')).toBe(true);
    expect(validPin('12345678')).toBe(true);
    expect(validPin('123')).toBe(false);
    expect(validPin('abcd')).toBe(false);
  });

  it('stores PINs as hashes that can be checked, but not read back', () => {
    const stored = hashPin('482913');
    expect(stored).not.toContain('482913');
    expect(checkPin('482913', stored)).toBe(true);
    expect(checkPin('482914', stored)).toBe(false);
  });

  it('makes random 6-digit PINs', () => {
    for (let i = 0; i < 20; i++) expect(randomPin()).toMatch(/^\d{6}$/);
  });
});

describe('signing in with phone and personal PIN', () => {
  it('signs in with the right phone and PIN', async () => {
    const r = await post(null, '/api/login', { phone: '(202) 555-0100', pin: PROD.pin });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ name: 'Prod Admin', catalog: 'prod', role: 'admin' });
  });

  it('gives the same message for a wrong PIN and an unknown number', async () => {
    const wrongPin = await post(null, '/api/login', { phone: PROD.phone, pin: '000000' });
    const unknown = await post(null, '/api/login', { phone: '202-555-0199', pin: '000000' });
    expect(wrongPin.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrongPin.body.error).toBe(unknown.body.error);
  });

  it('locks a person out after five wrong PINs in a row, even the right one', async () => {
    for (let i = 0; i < 5; i++) await post(null, '/api/login', { phone: REVIEWER.phone, pin: '999999' });
    const locked = await post(null, '/api/login', { phone: REVIEWER.phone, pin: REVIEWER.pin });
    expect(locked.status).toBe(429);
  });

  it('lets an admin unlock someone who is locked out', async () => {
    for (let i = 0; i < 5; i++) await post(null, '/api/login', { phone: REVIEWER.phone, pin: '999999' });
    const admin = await signIn(PROD);
    const people = (await get(admin, '/api/people')).body as any[];
    const reviewer = people.find((p) => p.phone === '+12025550102');
    expect(reviewer.locked).toBe(true);
    await put(admin, `/api/people/${reviewer.id}`, { unlock: true });
    expect((await post(null, '/api/login', { phone: REVIEWER.phone, pin: REVIEWER.pin })).status).toBe(200);
  });

  it('refuses a deactivated person, and ends their sessions at once', async () => {
    const reviewer = await signIn(REVIEWER);
    expect((await get(reviewer, '/api/items')).status).toBe(200);
    const admin = await signIn(PROD);
    const id = ((await get(admin, '/api/people')).body as any[]).find((p) => p.phone === '+12025550102').id;
    await put(admin, `/api/people/${id}`, { active: false });
    expect((await get(reviewer, '/api/items')).status).toBe(401);
    expect((await post(null, '/api/login', { phone: REVIEWER.phone, pin: REVIEWER.pin })).status).toBe(401);
  });
});

describe('roles', () => {
  it('lets a reviewer count, but not approve the list; an admin can approve', async () => {
    const reviewer = await signIn(REVIEWER);
    const approve = await post(reviewer, '/api/list/approve');
    expect(approve.status).toBe(403);
    expect(approve.body.error).toBe('Only an admin can do that.');
    expect((await post(await signIn(PROD), '/api/list/approve')).status).toBe(200);
  });

  it('lets a reviewer remove an item only if they are an admin', async () => {
    const admin = await signIn(PROD);
    const it = await addItem(admin, { name: 'Salt', location: 'Kitchen', mode: 'num', min: 1 });
    expect((await del(await signIn(REVIEWER), `/api/items/${it.id}`)).status).toBe(403);
    expect((await del(admin, `/api/items/${it.id}`)).status).toBe(200);
  });

  it('keeps people management to admins', async () => {
    const reviewer = await signIn(REVIEWER);
    expect((await get(reviewer, '/api/people')).status).toBe(403);
    const r = await post(reviewer, '/api/people', { name: 'Sneaky', phone: '202-555-0199', pin: '123456' });
    expect(r.status).toBe(403);
  });

  it('lets an admin add a person with a personal PIN, who can then sign in', async () => {
    const admin = await signIn(PROD);
    const r = await post(admin, '/api/people', { name: 'New Volunteer', phone: '202-555-0110', role: 'reviewer', pin: '480213' });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ name: 'New Volunteer', role: 'reviewer', catalog: 'prod' });
    expect((await post(null, '/api/login', { phone: '202-555-0110', pin: '480213' })).status).toBe(200);
  });

  it('refuses a duplicate phone number and a badly formed PIN', async () => {
    const admin = await signIn(PROD);
    expect((await post(admin, '/api/people', { name: 'Again', phone: PROD.phone, pin: '123456' })).status).toBe(409);
    expect((await post(admin, '/api/people', { name: 'Short PIN', phone: '202-555-0111', pin: '12' })).status).toBe(400);
    expect((await post(admin, '/api/people', { name: 'No number', phone: '555', pin: '123456' })).status).toBe(400);
  });

  it('changes a PIN, after which the old one stops working', async () => {
    const admin = await signIn(PROD);
    const id = ((await get(admin, '/api/people')).body as any[]).find((p) => p.phone === '+12025550102').id;
    expect((await put(admin, `/api/people/${id}`, { pin: '775533' })).status).toBe(200);
    expect((await post(null, '/api/login', { phone: REVIEWER.phone, pin: REVIEWER.pin })).status).toBe(401);
    expect((await post(null, '/api/login', { phone: REVIEWER.phone, pin: '775533' })).status).toBe(200);
  });

  it("stops an admin from demoting or deactivating their own account", async () => {
    const admin = await signIn(PROD);
    const id = ((await get(admin, '/api/people')).body as any[]).find((p) => p.phone === '+12025550100').id;
    expect((await put(admin, `/api/people/${id}`, { role: 'reviewer' })).status).toBe(400);
    expect((await put(admin, `/api/people/${id}`, { active: false })).status).toBe(400);
  });
});

describe('owner rules', () => {
  const idOf = async (admin: any, phone: string) => ((await get(admin, '/api/people')).body as any[]).find((p) => p.phone === normalizePhone(phone)).id;

  it('says who the owner is when signed in', async () => {
    expect((await get(await signIn(PROD), '/api/me')).body).toMatchObject({ owner: true });
    expect((await get(await signIn(ADMIN2), '/api/me')).body).toMatchObject({ owner: false, role: 'admin' });
  });

  it('lets any admin add people and change roles', async () => {
    const admin2 = await signIn(ADMIN2);
    const reviewerId = await idOf(admin2, REVIEWER.phone);
    expect((await put(admin2, `/api/people/${reviewerId}`, { role: 'admin' })).status).toBe(200);
    expect((await put(admin2, `/api/people/${reviewerId}`, { role: 'reviewer' })).status).toBe(200);
    expect((await post(admin2, '/api/people', { name: 'Helper', phone: '202-555-0111', role: 'reviewer', pin: '123123' })).status).toBe(200);
  });

  it('stops other admins from deactivating or resetting anyone, including other admins', async () => {
    const admin2 = await signIn(ADMIN2);
    const reviewerId = await idOf(admin2, REVIEWER.phone);
    const ownerId = await idOf(admin2, PROD.phone);
    expect((await put(admin2, `/api/people/${reviewerId}`, { active: false })).status).toBe(403);
    expect((await put(admin2, `/api/people/${reviewerId}`, { pin: '999111' })).status).toBe(403);
    expect((await put(admin2, `/api/people/${ownerId}`, { pin: '999111' })).status).toBe(403);
    expect((await put(admin2, `/api/people/${ownerId}`, { active: false })).status).toBe(403);
  });

  it("stops anyone changing the owner's role", async () => {
    const admin2 = await signIn(ADMIN2);
    const ownerId = await idOf(admin2, PROD.phone);
    expect((await put(admin2, `/api/people/${ownerId}`, { role: 'reviewer' })).status).toBe(400);
  });

  it('lets the owner deactivate and reactivate others', async () => {
    const owner = await signIn(PROD);
    const id = await idOf(owner, REVIEWER.phone);
    expect((await put(owner, `/api/people/${id}`, { active: false })).status).toBe(200);
    expect((await put(owner, `/api/people/${id}`, { active: true })).status).toBe(200);
  });
});

describe('changing my own PIN', () => {
  it('lets a signed-in person change their own PIN, after which the new one signs them in', async () => {
    const r = await signIn(REVIEWER);
    expect((await post(r, '/api/me/pin', { currentPin: REVIEWER.pin, newPin: '808080' })).status).toBe(200);
    expect((await post(null, '/api/login', { phone: REVIEWER.phone, pin: REVIEWER.pin })).status).toBe(401);
    expect((await post(null, '/api/login', { phone: REVIEWER.phone, pin: '808080' })).status).toBe(200);
  });

  it('needs the current PIN, and wrong tries count toward the lockout', async () => {
    const r = await signIn(REVIEWER);
    for (let i = 0; i < 5; i++) expect((await post(r, '/api/me/pin', { currentPin: '000000', newPin: '808080' })).status).toBe(401);
    expect((await post(r, '/api/me/pin', { currentPin: REVIEWER.pin, newPin: '808080' })).status).toBe(429);
  });

  it('checks the new PIN is 4 to 8 digits and different from the old one', async () => {
    const r = await signIn(REVIEWER);
    expect((await post(r, '/api/me/pin', { currentPin: REVIEWER.pin, newPin: '12' })).status).toBe(400);
    expect((await post(r, '/api/me/pin', { currentPin: REVIEWER.pin, newPin: REVIEWER.pin })).status).toBe(400);
  });

  it('refuses when not signed in', async () => {
    expect((await post(null, '/api/me/pin', { currentPin: REVIEWER.pin, newPin: '808080' })).status).toBe(401);
  });
});

