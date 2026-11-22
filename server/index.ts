import 'dotenv/config';

// On your Mac, DATABASE_TEST_URL (if set) takes over from DATABASE_URL, so local runs use the local database.
// Vercel sets VERCEL, so the hosted site always uses DATABASE_URL.
if (!process.env.VERCEL && process.env.DATABASE_TEST_URL) process.env.DATABASE_URL = process.env.DATABASE_TEST_URL;
import express, { NextFunction, Request, Response } from 'express';
import cookieParser from 'cookie-parser';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Catalog, CATALOGS, ITEM_COLS, Item, LEVELS, LOCATIONS, ListLine, migrate, Person, sql, tx, Week } from './db.js';
import { addPerson, checkPin, LOCK_ATTEMPTS, LOCK_MINUTES, normalizePhone, Role, validPin, hashPin } from './people.js';
import {
  activeItems,
  getOrCreateWeek,
  isBelowMin,
  listLines,
  needsSetup,
  refreshDraft,
  weekStatus
} from './logic.js';
import { identifyProduct, scanPhoto } from './scan.js';
import { photoBytes } from './product-photos.js';
import { canonicalName, punjabiName } from './grocery-glossary.js';

declare global {
  namespace Express {
    interface Request {
      reviewer?: string;
      catalog?: Catalog;
      role?: Role;
      owner?: boolean;
    }
  }
}

const PORT = Number(process.env.PORT || 3000);

const app = express();
app.use(express.json({ limit: '12mb' }));
app.use(cookieParser());

// ---------- helpers ----------
const SESSION_COOKIE = 'session';
const SESSION_MS = Number(process.env.SESSION_HOURS || 8) * 60 * 60 * 1000;

type SessionRow = { id: string; name: string; catalog: Catalog; role: Role; owner: boolean };

/** The signed-in session for this request, or null. Expired sessions never match, and deactivated people lose access at once. */
async function currentSession(req: Request): Promise<SessionRow | null> {
  const id = req.cookies?.[SESSION_COOKIE];
  if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{32,64}$/.test(id)) return null;
  const r = await sql(
    `SELECT p.name, p.catalog, p.role, p.owner, s.id FROM sessions s JOIN people p ON p.id = s.person_id
     WHERE s.id = $1 AND s.expires_at > now() AND p.active`,
    [id]
  );
  return (r.rows[0] as SessionRow) ?? null;
}
const requireReviewer = async (req: Request, res: Response, next: NextFunction) => {
  const s = await currentSession(req);
  if (!s) return res.status(401).json({ error: 'Sign in first.' });
  req.reviewer = s.name;
  req.catalog = s.catalog;
  req.role = s.role;
  req.owner = s.owner;
  next();
};
/** Only admins: approving the list, removing items, and managing people. */
const requireAdmin = async (req: Request, res: Response, next: NextFunction) => {
  const s = await currentSession(req);
  if (!s) return res.status(401).json({ error: 'Sign in first.' });
  if (s.role !== 'admin') return res.status(403).json({ error: 'Only an admin can do that.' });
  req.reviewer = s.name;
  req.catalog = s.catalog;
  req.role = s.role;
  req.owner = s.owner;
  next();
};
const num = (v: unknown): number | null => (v === '' || v == null || Number.isNaN(Number(v)) ? null : Number(v));
const str = (v: unknown, max = 120) => String(v ?? '').trim().slice(0, max);
/** Wraps an async route so an unexpected error reaches the error handler instead of hanging the request. */
const route = (fn: (req: Request, res: Response) => Promise<unknown>) => (req: Request, res: Response, next: NextFunction) =>
  fn(req, res).catch(next);

function itemView(it: Item) {
  return {
    id: it.id,
    name: it.name,
    namePa: punjabiName(it.name),
    location: it.location,
    unit: it.unit,
    mode: it.mode,
    min: it.min_qty,
    target: it.target_qty,
    expiryDate: it.expiry_date,
    currentNum: it.current_num,
    currentLevel: it.current_level,
    needsSetup: needsSetup(it),
    belowMin: isBelowMin(it),
    store: it.store,
    brand: it.brand,
    hasPhoto: !!it.has_photo
  };
}
function lineView(l: ListLine) {
  return {
    id: l.id,
    itemId: l.item_id,
    name: l.name,
    namePa: punjabiName(l.name),
    store: l.store ?? null,
    brand: l.brand ?? null,
    unit: l.unit,
    reason: l.reason,
    suggested: l.suggested,
    qty: l.qty,
    oneOff: !!l.one_off,
    removed: !!l.removed,
    bought: !!l.bought,
    boughtQty: l.bought_qty
  };
}
function countText(it: Item): string {
  return it.mode === 'lvl' ? it.current_level : String(it.current_num);
}

/** One open alert per item per week. It isn't repeated while the first one is still waiting for review. */
async function raiseDoubleCount(weekId: number, itemId: number, name: string, first: string, second: string, before: string, after: string) {
  const open = await sql(
    "SELECT 1 FROM review_alerts WHERE week_id = $1 AND item_id = $2 AND kind = 'double_count' AND resolved_at IS NULL",
    [weekId, itemId]
  );
  if (open.rowCount) return;
  await sql("INSERT INTO review_alerts (week_id, item_id, kind, detail) VALUES ($1, $2, 'double_count', $3)", [
    weekId,
    itemId,
    `${name} was counted by ${first} and then by ${second}. Before: ${before}. Now: ${after}. The later count is kept.`
  ]);
}

async function weekView(catalog: Catalog) {
  const w = await getOrCreateWeek(sql, catalog);
  const items = await activeItems(sql, catalog);
  const counted = (await sql('SELECT COUNT(*) AS n FROM count_entries WHERE week_id = $1', [w.id])).rows[0].n as number;
  const lines = (await listLines(sql, w.id)).filter((l) => !l.removed);
  return {
    id: w.id,
    serviceDate: w.service_date,
    status: await weekStatus(sql, w),
    countedBy: w.counted_by,
    countFinishedAt: w.count_finished_at,
    approvedBy: w.approved_by,
    approvedAt: w.approved_at,
    note: w.note,
    shareToken: w.share_token,
    itemCount: items.length,
    needsSetup: items.filter(needsSetup).length,
    counted,
    belowMin: items.filter(isBelowMin).length,
    lineCount: lines.length,
    boughtCount: lines.filter((l) => l.bought).length
  };
}
function meView(name: string, catalog: Catalog, role: Role, owner: boolean) {
  return { name, catalog, role, owner, catalogLabel: CATALOGS[catalog].label, testing: catalog === 'test' };
}

// ---------- auth ----------
// Secure cookies need HTTPS. Set COOKIE_SECURE=1 once the app is served over HTTPS.
const COOKIE_OPTS = { httpOnly: true, sameSite: 'lax' as const, secure: process.env.COOKIE_SECURE === '1' };

app.get('/api/me', route(async (req, res) => {
  const s = await currentSession(req);
  res.json(s ? meView(s.name, s.catalog, s.role, s.owner) : { name: null });
}));

app.post('/api/login', route(async (req, res) => {
  const phone = normalizePhone(str(req.body?.phone, 30));
  const pin = str(req.body?.pin, 12);
  if (!phone || !pin) return res.status(401).json({ error: "That phone and PIN didn't match." });
  const person = (await sql('SELECT * FROM people WHERE phone = $1 AND active', [phone])).rows[0] as Person | undefined;
  // Same message for an unknown number and a wrong PIN, so the form doesn't reveal who is on the list.
  if (!person) return res.status(401).json({ error: "That phone and PIN didn't match." });
  if (person.locked_until && new Date(person.locked_until) > new Date()) {
    return res.status(429).json({ error: `Too many tries. Wait ${LOCK_MINUTES} minutes, or ask an admin to unlock you.` });
  }
  if (!validPin(pin) || !checkPin(pin, person.pin_hash)) {
    // Count the miss. After enough misses in a row, lock the person out for a while.
    await sql(
      `UPDATE people SET
         failed_count = CASE WHEN failed_count + 1 >= $2 THEN 0 ELSE failed_count + 1 END,
         locked_until = CASE WHEN failed_count + 1 >= $2 THEN now() + ($3 || ' minutes')::interval ELSE locked_until END
       WHERE id = $1`,
      [person.id, LOCK_ATTEMPTS, String(LOCK_MINUTES)]
    );
    return res.status(401).json({ error: "That phone and PIN didn't match." });
  }
  await sql('UPDATE people SET failed_count = 0, locked_until = NULL WHERE id = $1', [person.id]);
  // A random ID, not data: the server keeps who signed in and their role, for SESSION_MS.
  const id = crypto.randomBytes(32).toString('base64url');
  await sql('DELETE FROM sessions WHERE expires_at <= now()');
  await sql('INSERT INTO sessions (id, name, catalog, person_id, expires_at) VALUES ($1, $2, $3, $4, $5)', [
    id,
    person.name,
    person.catalog,
    person.id,
    new Date(Date.now() + SESSION_MS)
  ]);
  res.cookie(SESSION_COOKIE, id, { ...COOKIE_OPTS, maxAge: SESSION_MS });
  res.json(meView(person.name, person.catalog, person.role, person.owner));
}));

app.post('/api/logout', route(async (req, res) => {
  const id = req.cookies?.[SESSION_COOKIE];
  if (typeof id === 'string') await sql('DELETE FROM sessions WHERE id = $1', [id]);
  res.clearCookie(SESSION_COOKIE, COOKIE_OPTS);
  res.json({ ok: true });
}));

// ---------- items ----------
app.get('/api/items', requireReviewer, route(async (req, res) => {
  res.json((await activeItems(sql, req.catalog!)).map(itemView));
}));

function readItemBody(b: any) {
  const location = LOCATIONS.includes(b.location) ? b.location : 'Shelves';
  const mode = b.mode === 'lvl' ? 'lvl' : 'num';
  return {
    name: str(b.name),
    location,
    unit: str(b.unit, 40),
    mode,
    min: mode === 'num' ? num(b.min) : null,
    target: mode === 'num' ? num(b.target) : null,
    expiryDate: /^\d{4}-\d{2}-\d{2}$/.test(String(b.expiryDate || '')) ? String(b.expiryDate) : null,
    currentNum: num(b.currentNum) ?? 0,
    currentLevel: LEVELS.includes(b.currentLevel) ? b.currentLevel : 'Full',
    store: str(b.store, 60) || null,
    brand: str(b.brand, 60) || null
  };
}

app.post('/api/items', requireReviewer, route(async (req, res) => {
  const b = readItemBody(req.body ?? {});
  if (!b.name) return res.status(400).json({ error: 'Enter a name.' });
  const r = await sql(
    `INSERT INTO items (catalog, name, location, unit, mode, min_qty, target_qty, expiry_date, current_num, current_level, store, brand)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING ${ITEM_COLS}`,
    [req.catalog, b.name, b.location, b.unit, b.mode, b.min, b.target, b.expiryDate, b.currentNum, b.currentLevel, b.store, b.brand]
  );
  res.json(itemView(r.rows[0] as Item));
}));

app.put('/api/items/:id', requireReviewer, route(async (req, res) => {
  const id = Number(req.params.id);
  const cur = (await sql(`SELECT ${ITEM_COLS} FROM items WHERE id = $1 AND catalog = $2`, [id, req.catalog])).rows[0] as Item | undefined;
  if (!cur) return res.status(404).json({ error: 'Item not found.' });
  const b = readItemBody({ ...itemView(cur), ...req.body });
  if (!b.name) return res.status(400).json({ error: 'Enter a name.' });
  const r = await sql(
    `UPDATE items SET name = $1, location = $2, unit = $3, mode = $4, min_qty = $5, target_qty = $6, expiry_date = $7, store = $8, brand = $9, updated_at = now()
     WHERE id = $10 AND catalog = $11 RETURNING ${ITEM_COLS}`,
    [b.name, b.location, b.unit, b.mode, b.min, b.target, b.expiryDate, b.store, b.brand, id, req.catalog]
  );
  res.json(itemView(r.rows[0] as Item));
}));

// ---------- product photos ----------
app.put('/api/items/:id/photo', requireReviewer, route(async (req, res) => {
  const id = Number(req.params.id);
  const exists = await sql('SELECT 1 FROM items WHERE id = $1 AND catalog = $2 AND active = 1', [id, req.catalog]);
  if (!exists.rowCount) return res.status(404).json({ error: 'Item not found.' });
  let bytes: Buffer;
  try {
    bytes = photoBytes(String(req.body?.image || ''));
  } catch (e: any) {
    return res.status(400).json({ error: e.message });
  }
  const r = await sql(`UPDATE items SET photo = $1, updated_at = now() WHERE id = $2 AND catalog = $3 RETURNING ${ITEM_COLS}`, [bytes, id, req.catalog]);
  res.json(itemView(r.rows[0] as Item));
}));

app.get('/api/items/:id/photo', requireReviewer, route(async (req, res) => {
  const r = await sql('SELECT photo FROM items WHERE id = $1 AND catalog = $2', [Number(req.params.id), req.catalog]);
  const photo: Buffer | null = r.rows[0]?.photo ?? null;
  if (!photo) return res.status(404).json({ error: 'No photo.' });
  res.setHeader('Content-Type', 'image/jpeg');
  res.setHeader('Cache-Control', 'private, no-cache');
  res.send(photo);
}));

app.delete('/api/items/:id/photo', requireReviewer, route(async (req, res) => {
  const r = await sql('UPDATE items SET photo = NULL, updated_at = now() WHERE id = $1 AND catalog = $2', [Number(req.params.id), req.catalog]);
  if (!r.rowCount) return res.status(404).json({ error: 'Item not found.' });
  res.json({ ok: true });
}));

// Suggests a name for a single product, from a new photo (image) or the item's saved photo (itemId).
app.post('/api/identify', requireReviewer, route(async (req, res) => {
  let base64 = '';
  let mime: 'image/jpeg' | 'image/png' | 'image/webp' = 'image/jpeg';
  const m = /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/.exec(typeof req.body?.image === 'string' ? req.body.image : '');
  if (m) {
    mime = m[1] as typeof mime;
    base64 = m[2];
  } else if (req.body?.itemId != null) {
    const r = await sql('SELECT photo FROM items WHERE id = $1 AND catalog = $2', [Number(req.body.itemId), req.catalog]);
    const photo: Buffer | null = r.rows[0]?.photo ?? null;
    if (!photo) return res.status(400).json({ error: 'Take a photo of the product first.' });
    base64 = photo.toString('base64');
  } else {
    return res.status(400).json({ error: 'Send a product photo.' });
  }
  try {
    res.json(await identifyProduct(base64, mime));
  } catch (e: any) {
    console.error('identify failed', e);
    res.status(502).json({ error: "Couldn't read the product. Type the name instead." });
  }
}));

app.delete('/api/items/:id', requireAdmin, route(async (req, res) => {
  await sql('UPDATE items SET active = 0, updated_at = now() WHERE id = $1 AND catalog = $2', [Number(req.params.id), req.catalog]);
  res.json({ ok: true });
}));

// ---------- week + count ----------
app.get('/api/week', requireReviewer, route(async (req, res) => {
  res.json(await weekView(req.catalog!));
}));

app.get('/api/count', requireReviewer, route(async (req, res) => {
  const w = await getOrCreateWeek(sql, req.catalog!);
  const done = new Set(((await sql('SELECT item_id FROM count_entries WHERE week_id = $1', [w.id])).rows as { item_id: number }[]).map((r) => r.item_id));
  res.json({
    week: await weekView(req.catalog!),
    items: (await activeItems(sql, req.catalog!)).map((it) => ({ ...itemView(it), counted: done.has(it.id) }))
  });
}));

app.post('/api/count/item/:itemId', requireReviewer, route(async (req, res) => {
  const catalog = req.catalog!;
  const w = await getOrCreateWeek(sql, catalog);
  const id = Number(req.params.itemId);
  const it = (await sql(`SELECT ${ITEM_COLS} FROM items WHERE id = $1 AND catalog = $2 AND active = 1`, [id, catalog])).rows[0] as Item | undefined;
  if (!it) return res.status(404).json({ error: 'Item not found.' });
  const before = countText(it);
  const earlier = (await sql('SELECT counted_by FROM count_entries WHERE week_id = $1 AND item_id = $2', [w.id, id])).rows[0] as
    | { counted_by: string | null }
    | undefined;
  await tx(async (s) => {
    if (req.body?.counted === false) {
      await s('DELETE FROM count_entries WHERE week_id = $1 AND item_id = $2', [w.id, id]);
      return;
    }
    if (it.mode === 'num' && req.body?.value != null) {
      await s('UPDATE items SET current_num = $1, updated_at = now() WHERE id = $2', [Math.max(0, Number(req.body.value) || 0), id]);
    }
    if (it.mode === 'lvl' && LEVELS.includes(req.body?.level)) {
      await s('UPDATE items SET current_level = $1, updated_at = now() WHERE id = $2', [req.body.level, id]);
    }
    await s(
      `INSERT INTO count_entries (week_id, item_id, counted_by) VALUES ($1, $2, $3)
       ON CONFLICT (week_id, item_id) DO UPDATE SET counted_by = EXCLUDED.counted_by, counted_at = now()`,
      [w.id, id, req.reviewer ?? null]
    );
  });
  // Still a draft? Then the list follows the new count straight away.
  await refreshDraft(w);
  const fresh = (await sql(`SELECT ${ITEM_COLS} FROM items WHERE id = $1`, [id])).rows[0] as Item;
  // Two people counted the same item this week: keep the later count, and ask an admin to check it.
  if (req.body?.counted !== false && earlier?.counted_by && req.reviewer && earlier.counted_by !== req.reviewer) {
    await raiseDoubleCount(w.id, id, it.name, earlier.counted_by, req.reviewer, before, countText(fresh));
  }
  res.json({ ...itemView(fresh), counted: req.body?.counted !== false });
}));

app.post('/api/count/finish', requireReviewer, route(async (req, res) => {
  const catalog = req.catalog!;
  const w = await getOrCreateWeek(sql, catalog);
  await sql("UPDATE weeks SET count_finished_at = COALESCE(count_finished_at, now()), counted_by = $1 WHERE id = $2", [req.reviewer ?? null, w.id]);
  // Finishing only drafts the list. Counts stay editable, and each change updates the draft.
  await refreshDraft(await getOrCreateWeek(sql, catalog));
  res.json(await weekView(catalog));
}));

// ---------- shopping list ----------
app.get('/api/list', requireReviewer, route(async (req, res) => {
  const w = await getOrCreateWeek(sql, req.catalog!);
  await refreshDraft(w);
  res.json({ week: await weekView(req.catalog!), lines: (await listLines(sql, w.id)).map(lineView) });
}));

app.post('/api/list/redraft', requireReviewer, route(async (req, res) => {
  await refreshDraft(await getOrCreateWeek(sql, req.catalog!));
  res.json({ ok: true });
}));

app.post('/api/list/lines', requireReviewer, route(async (req, res) => {
  const w = await getOrCreateWeek(sql, req.catalog!);
  const name = str(req.body?.name);
  if (!name) return res.status(400).json({ error: 'Enter a name.' });
  const qty = Math.max(1, num(req.body?.qty) ?? 1);
  await sql(
    'INSERT INTO list_lines (week_id, name, unit, reason, suggested, qty, one_off) VALUES ($1, $2, $3, $4, $5, $6, 1)',
    [w.id, name, str(req.body?.unit, 40), str(req.body?.reason, 80) || 'This week only', qty, qty]
  );
  res.json({ ok: true });
}));

/** A list line, only if it belongs to this catalog. */
async function ownLine(id: number, catalog: Catalog): Promise<ListLine | undefined> {
  return (
    await sql('SELECT l.* FROM list_lines l JOIN weeks w ON w.id = l.week_id WHERE l.id = $1 AND w.catalog = $2', [id, catalog])
  ).rows[0] as ListLine | undefined;
}

app.put('/api/list/lines/:id', requireReviewer, route(async (req, res) => {
  const id = Number(req.params.id);
  const l = await ownLine(id, req.catalog!);
  if (!l) return res.status(404).json({ error: 'Line not found.' });
  const qty = num(req.body?.qty);
  const r = await sql('UPDATE list_lines SET qty = $1, removed = $2 WHERE id = $3 RETURNING *', [
    qty != null ? Math.max(1, qty) : l.qty,
    req.body?.removed != null ? (req.body.removed ? 1 : 0) : l.removed,
    id
  ]);
  res.json(lineView(r.rows[0] as ListLine));
}));

app.delete('/api/list/lines/:id', requireReviewer, route(async (req, res) => {
  await sql(
    'DELETE FROM list_lines l USING weeks w WHERE l.id = $1 AND w.id = l.week_id AND w.catalog = $2 AND l.one_off = 1',
    [Number(req.params.id), req.catalog]
  );
  res.json({ ok: true });
}));

app.put('/api/list/note', requireReviewer, route(async (req, res) => {
  const w = await getOrCreateWeek(sql, req.catalog!);
  await sql('UPDATE weeks SET note = $1 WHERE id = $2', [str(req.body?.note, 500), w.id]);
  res.json({ ok: true });
}));

app.post('/api/list/approve', requireAdmin, route(async (req, res) => {
  const w = await getOrCreateWeek(sql, req.catalog!);
  const open = Number((await sql('SELECT COUNT(*) AS n FROM review_alerts WHERE week_id = $1 AND resolved_at IS NULL', [w.id])).rows[0].n);
  if (open > 0) {
    return res.status(409).json({ error: `Review ${open} alert${open === 1 ? '' : 's'} before approving the list.` });
  }
  await sql('UPDATE weeks SET approved_at = COALESCE(approved_at, now()), approved_by = $1 WHERE id = $2', [req.reviewer ?? null, w.id]);
  res.json(await weekView(req.catalog!));
}));

// ---------- review alerts ----------
app.get('/api/alerts', requireReviewer, route(async (req, res) => {
  const w = await getOrCreateWeek(sql, req.catalog!);
  const rows = (await sql('SELECT id, kind, detail, created_at FROM review_alerts WHERE week_id = $1 AND resolved_at IS NULL ORDER BY created_at', [w.id])).rows;
  res.json(rows);
}));

app.post('/api/alerts/:id/resolve', requireAdmin, route(async (req, res) => {
  const r = await sql(
    `UPDATE review_alerts a SET resolved_at = now(), resolved_by = $1 FROM weeks w
     WHERE a.id = $2 AND w.id = a.week_id AND w.catalog = $3 AND a.resolved_at IS NULL`,
    [req.reviewer ?? null, Number(req.params.id), req.catalog]
  );
  if (!r.rowCount) return res.status(404).json({ error: 'Alert not found, or already reviewed.' });
  res.json({ ok: true });
}));

// ---------- family (no sign-in, by link) ----------
/** Family links carry no catalog. The token is random and unique, and the week tells us its catalog. */
async function findFamilyWeek(token: string): Promise<Week | undefined> {
  return (await sql('SELECT * FROM weeks WHERE share_token = $1', [token])).rows[0] as Week | undefined;
}

app.get('/api/family/:token', route(async (req, res) => {
  const w = await findFamilyWeek(String(req.params.token));
  if (!w || !w.approved_at) return res.status(404).json({ error: "This list isn't ready yet. Check with the kitchen team." });
  const lines = (await listLines(sql, w.id)).filter((l) => !l.removed).map(lineView);
  res.json({ serviceDate: w.service_date, note: w.note, lines, testing: w.catalog === 'test' });
}));

app.post('/api/family/:token/lines/:id', route(async (req, res) => {
  const w = await findFamilyWeek(String(req.params.token));
  if (!w || !w.approved_at) return res.status(404).json({ error: 'List not found.' });
  const id = Number(req.params.id);
  const l = (await sql('SELECT * FROM list_lines WHERE id = $1 AND week_id = $2', [id, w.id])).rows[0] as ListLine | undefined;
  if (!l) return res.status(404).json({ error: 'Item not found.' });
  // Families only record what they bought. This never changes inventory counts.
  const bought = req.body?.bought != null ? (req.body.bought ? 1 : 0) : l.bought;
  const bq = num(req.body?.boughtQty);
  const r = await sql('UPDATE list_lines SET bought = $1, bought_qty = $2 WHERE id = $3 RETURNING *', [
    bought,
    bq != null ? Math.max(0, bq) : l.bought_qty,
    id
  ]);
  res.json(lineView(r.rows[0] as ListLine));
}));

// ---------- add by photo ----------
app.post('/api/scan', requireReviewer, route(async (req, res) => {
  const location = LOCATIONS.includes(req.body?.location) ? req.body.location : 'Shelves';
  const dataUrl = String(req.body?.image || '');
  const m = /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/.exec(dataUrl);
  if (!m) return res.status(400).json({ error: 'Send the photo as a JPEG or PNG.' });
  try {
    res.json(await scanPhoto(req.catalog!, location, m[2], m[1] as 'image/jpeg'));
  } catch (e: any) {
    console.error('scan failed', e);
    res.status(502).json({ error: e?.message?.startsWith('The photo') ? e.message : "Couldn't read the photo. Try again." });
  }
}));

app.post('/api/scan/save', requireReviewer, route(async (req, res) => {
  const catalog = req.catalog!;
  const location = LOCATIONS.includes(req.body?.location) ? req.body.location : 'Shelves';
  const rows = Array.isArray(req.body?.items) ? req.body.items : [];
  let added = 0, updated = 0;
  await tx(async (s) => {
    for (const r of rows) {
      const name = canonicalName(str(r.name));
      if (!name) continue;
      const count = Math.max(0, Math.round(Number(r.count) || 0));
      if (r.matchId) {
        // Only update an item that belongs to this catalog.
        const u = await s("UPDATE items SET current_num = $1, updated_at = now() WHERE id = $2 AND catalog = $3 AND mode = 'num'", [
          count,
          Number(r.matchId),
          catalog
        ]);
        if (u.rowCount) updated++;
      } else {
        await s(
          "INSERT INTO items (catalog, name, location, unit, mode, current_num) VALUES ($1, $2, $3, $4, 'num', $5)",
          [catalog, name, location, str(r.unit, 40), count]
        );
        added++;
      }
    }
  });
  res.json({ added, updated });
}));

// ---------- my own PIN (anyone signed in) ----------
// Changing your own PIN needs your current PIN, so a signed-in browser alone isn't enough.
app.post('/api/me/pin', requireReviewer, route(async (req, res) => {
  const r = await sql(
    `SELECT p.id, p.pin_hash, p.locked_until FROM sessions s JOIN people p ON p.id = s.person_id
     WHERE s.id = $1 AND s.expires_at > now() AND p.active`,
    [req.cookies?.[SESSION_COOKIE]]
  );
  const me = r.rows[0] as { id: number; pin_hash: string; locked_until: Date | null } | undefined;
  if (!me) return res.status(401).json({ error: 'Sign in first.' });
  if (me.locked_until && new Date(me.locked_until) > new Date()) {
    return res.status(429).json({ error: `Too many tries. Wait ${LOCK_MINUTES} minutes, or ask the owner to unlock you.` });
  }
  const current = str(req.body?.currentPin, 12);
  const next = str(req.body?.newPin, 12);
  if (!checkPin(current, me.pin_hash)) {
    await sql(
      `UPDATE people SET
         failed_count = CASE WHEN failed_count + 1 >= $2 THEN 0 ELSE failed_count + 1 END,
         locked_until = CASE WHEN failed_count + 1 >= $2 THEN now() + ($3 || ' minutes')::interval ELSE locked_until END
       WHERE id = $1`,
      [me.id, LOCK_ATTEMPTS, String(LOCK_MINUTES)]
    );
    return res.status(401).json({ error: 'Your current PIN is not right.' });
  }
  if (!validPin(next)) return res.status(400).json({ error: 'The new PIN must be 4 to 8 digits.' });
  if (next === current) return res.status(400).json({ error: 'Choose a PIN that is different from the current one.' });
  await sql('UPDATE people SET pin_hash = $1, failed_count = 0, locked_until = NULL WHERE id = $2', [hashPin(next), me.id]);
  res.json({ ok: true });
}));

// ---------- people (admins only) ----------
const PEOPLE_COLS = 'id, name, phone, role, catalog, active, owner, failed_count, locked_until';
const ROLES: Role[] = ['admin', 'reviewer'];

app.get('/api/people', requireAdmin, route(async (_req, res) => {
  const rows = (await sql(`SELECT ${PEOPLE_COLS} FROM people ORDER BY active DESC, lower(name)`)).rows;
  res.json(rows.map((p) => ({ ...p, locked: !!p.locked_until && new Date(p.locked_until) > new Date() })));
}));

app.post('/api/people', requireAdmin, route(async (req, res) => {
  const name = str(req.body?.name, 60);
  const phone = normalizePhone(str(req.body?.phone, 30));
  const role = ROLES.includes(req.body?.role) ? (req.body.role as Role) : 'reviewer';
  const catalog: Catalog = req.body?.catalog === 'test' ? 'test' : 'prod';
  const pin = str(req.body?.pin, 12);
  if (!name) return res.status(400).json({ error: 'Enter a name.' });
  if (!phone) return res.status(400).json({ error: 'Enter a US phone number, with the area code.' });
  if (!validPin(pin)) return res.status(400).json({ error: 'The PIN must be 4 to 8 digits.' });
  if ((await sql('SELECT 1 FROM people WHERE phone = $1', [phone])).rowCount) {
    return res.status(409).json({ error: 'That phone number is already on the list.' });
  }
  const id = await addPerson({ name, phone, role, catalog, pin });
  res.json((await sql(`SELECT ${PEOPLE_COLS} FROM people WHERE id = $1`, [id])).rows[0]);
}));

app.put('/api/people/:id', requireAdmin, route(async (req, res) => {
  const id = Number(req.params.id);
  const p = (await sql('SELECT * FROM people WHERE id = $1', [id])).rows[0] as Person | undefined;
  if (!p) return res.status(404).json({ error: 'Person not found.' });
  const isSelf = ((await sql('SELECT 1 FROM sessions s WHERE s.person_id = $1 AND s.id = $2', [id, req.cookies?.[SESSION_COOKIE]])).rowCount ?? 0) > 0;
  const wantsDeactivate = typeof req.body?.active === 'boolean' && req.body.active !== p.active;
  const wantsPinReset = req.body?.pin != null && req.body.pin !== '';
  // Only the owner can remove someone or reset a PIN, for anyone (including other admins).
  if ((wantsDeactivate || wantsPinReset) && !req.owner) {
    return res.status(403).json({ error: 'Only the owner can remove people or reset PINs.' });
  }
  const role: Role = ROLES.includes(req.body?.role) ? (req.body.role as Role) : p.role;
  const active = typeof req.body?.active === 'boolean' ? req.body.active : p.active;
  if (p.owner && role !== p.role) return res.status(400).json({ error: "The owner's role can't be changed." });
  if (p.owner && !active) return res.status(400).json({ error: "The owner can't be deactivated." });
  // Nobody can demote or deactivate their own account, so the last way in can't be removed by accident.
  if (isSelf && (role !== p.role || !active)) {
    return res.status(400).json({ error: "You can't demote or deactivate your own account." });
  }
  const catalog: Catalog = req.body?.catalog === 'test' || req.body?.catalog === 'prod' ? req.body.catalog : p.catalog;
  await sql('UPDATE people SET role = $1, active = $2, catalog = $3 WHERE id = $4', [role, active, catalog, id]);
  if (wantsPinReset) {
    const pin = str(req.body.pin, 12);
    if (!validPin(pin)) return res.status(400).json({ error: 'The PIN must be 4 to 8 digits.' });
    await sql('UPDATE people SET pin_hash = $1, failed_count = 0, locked_until = NULL WHERE id = $2', [hashPin(pin), id]);
  }
  // Anyone who is an admin can unlock someone who is locked out.
  if (req.body?.unlock === true) await sql('UPDATE people SET failed_count = 0, locked_until = NULL WHERE id = $1', [id]);
  // Deactivated people lose their sessions straight away.
  if (!active) await sql('DELETE FROM sessions WHERE person_id = $1', [id]);
  res.json((await sql(`SELECT ${PEOPLE_COLS} FROM people WHERE id = $1`, [id])).rows[0]);
}));

// ---------- UI ----------
const clientDir = path.resolve(process.cwd(), 'dist/client');
if (fs.existsSync(clientDir)) {
  app.use(express.static(clientDir));
  app.use((req, res, next) => {
    if (req.method !== 'GET' || req.path.startsWith('/api/')) return next();
    res.sendFile(path.join(clientDir, 'index.html'));
  });
}
app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found.' }));

// Last resort: an unexpected error gets a readable message, and the details go to the server log.
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  console.error('request failed', err);
  if (res.headersSent) return;
  res.status(500).json({ error: 'Something went wrong. Try again.' });
});

// Only listen when run directly (npm start / tsx server/index.ts), so tests can import `app` without opening a port.
const isMain = process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  migrate()
    .then(() => {
      app.listen(PORT, '0.0.0.0', () => {
        const ips = Object.values(os.networkInterfaces())
          .flat()
          .filter((n) => n && n.family === 'IPv4' && !n.internal)
          .map((n) => n!.address);
        console.log(`\nLangar Pantry is running.`);
    const db = process.env.DATABASE_URL ? new URL(process.env.DATABASE_URL) : null;
    const local = db && ['localhost', '127.0.0.1'].includes(db.hostname);
    console.log(`  Database:          ${local ? 'local' : 'hosted'} ${db ? db.pathname.replace('/', '') : '(not set)'}`);
        console.log(`  On this computer:  http://localhost:${PORT}`);
        for (const ip of ips) console.log(`  On your phone:     http://${ip}:${PORT}   (same Wi-Fi)`);
        console.log('  Sign-in: people on the allow list, each with a personal PIN.');
        if (!process.env.ANTHROPIC_API_KEY) console.log('  Add by photo: demo mode (set ANTHROPIC_API_KEY in .env for real photo reading)');
        console.log('');
      });
    })
    .catch((e) => {
      console.error('Could not start: the database is not reachable. Check DATABASE_URL in .env.', e.message);
      process.exit(1);
    });
}

export { app };
