import 'dotenv/config';
import express, { NextFunction, Request, Response } from 'express';
import cookieParser from 'cookie-parser';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { authDb, Catalog, CATALOGS, CATALOG_IDS, Db, dbFor, Item, LEVELS, LOCATIONS, ListLine, Week } from './db.js';
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
import { deletePhoto, photoPath, readPhotoBase64, savePhoto } from './product-photos.js';
import { canonicalName, punjabiName } from './grocery-glossary.js';

declare global {
  namespace Express {
    interface Request {
      reviewer?: string;
      catalog?: Catalog;
      db?: Db;
    }
  }
}

const PORT = Number(process.env.PORT || 3000);
const PROD_PIN = process.env.REVIEWER_PIN || '1234';
const TEST_PIN = process.env.TEST_PIN || '';
if (!process.env.REVIEWER_PIN) console.warn('⚠  REVIEWER_PIN is not set. Using 1234. Set it in .env before sharing.');
if (!TEST_PIN) console.warn('ℹ  TEST_PIN is not set, so the Testing catalog is locked. Set it in .env to use it.');
else if (TEST_PIN === PROD_PIN) console.warn('⚠  TEST_PIN matches REVIEWER_PIN. Use two different PINs; the production catalog wins for now.');

/** Which PIN opens which catalog. An unset test PIN opens nothing. */
const PINS: Record<Catalog, string | null> = { prod: PROD_PIN, test: TEST_PIN || null };

const app = express();
app.use(express.json({ limit: '12mb' }));
app.use(cookieParser());

// ---------- helpers ----------
const SESSION_COOKIE = 'session';
const SESSION_MS = Number(process.env.SESSION_HOURS || 8) * 60 * 60 * 1000;

type SessionRow = { id: string; name: string; catalog: Catalog; expires_at: number };

/** The signed-in session for this request, or null. Expired sessions are removed when found. */
function currentSession(req: Request): SessionRow | null {
  const id = req.cookies?.[SESSION_COOKIE];
  if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{32,64}$/.test(id)) return null;
  const s = authDb.prepare('SELECT id, name, catalog, expires_at FROM sessions WHERE id = ?').get(id) as SessionRow | undefined;
  if (!s) return null;
  if (s.expires_at <= Date.now()) {
    authDb.prepare('DELETE FROM sessions WHERE id = ?').run(id);
    return null;
  }
  return s;
}
const requireReviewer = (req: Request, res: Response, next: NextFunction) => {
  const s = currentSession(req);
  if (!s) return res.status(401).json({ error: 'Sign in first.' });
  req.reviewer = s.name;
  req.catalog = s.catalog;
  req.db = dbFor(s.catalog);
  next();
};
const num = (v: unknown): number | null => (v === '' || v == null || Number.isNaN(Number(v)) ? null : Number(v));
const str = (v: unknown, max = 120) => String(v ?? '').trim().slice(0, max);
const pinMatches = (pin: string, expected: string) => {
  const a = Buffer.from(pin);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};

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
    hasPhoto: !!it.image_file
  };
}
function lineView(l: ListLine) {
  return {
    id: l.id,
    itemId: l.item_id,
    name: l.name,
    namePa: punjabiName(l.name),
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
function weekView(d: Db) {
  const w = getOrCreateWeek(d);
  const items = activeItems(d);
  const counted = (d.prepare('SELECT COUNT(*) AS n FROM count_entries WHERE week_id = ?').get(w.id) as { n: number }).n;
  const lines = listLines(d, w.id).filter((l) => !l.removed);
  return {
    id: w.id,
    serviceDate: w.service_date,
    status: weekStatus(d, w),
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
function meView(name: string, catalog: Catalog) {
  return { name, catalog, catalogLabel: CATALOGS[catalog].label, testing: catalog === 'test' };
}

/** Family links carry no catalog, so look the token up in each catalog. Tokens are random and unique. */
function findFamilyWeek(token: string): { d: Db; w: Week; catalog: Catalog } | null {
  for (const catalog of CATALOG_IDS) {
    const d = dbFor(catalog);
    const w = d.prepare('SELECT * FROM weeks WHERE share_token = ?').get(token) as Week | undefined;
    if (w) return { d, w, catalog };
  }
  return null;
}

// ---------- auth ----------
// Secure cookies need HTTPS. Set COOKIE_SECURE=1 once the app is served over HTTPS.
const COOKIE_OPTS = { httpOnly: true, sameSite: 'lax' as const, secure: process.env.COOKIE_SECURE === '1' };

app.get('/api/me', (req, res) => {
  const s = currentSession(req);
  res.json(s ? meView(s.name, s.catalog) : { name: null });
});
app.post('/api/login', (req, res) => {
  const pin = str(req.body?.pin, 40);
  const name = str(req.body?.name, 40) || 'Reviewer';
  // Production is checked first, so a PIN that matches both opens production.
  const catalog = CATALOG_IDS.find((c) => {
    const expected = PINS[c];
    return expected != null && pinMatches(pin, expected);
  });
  if (!catalog) return res.status(401).json({ error: "That PIN didn't match." });
  // A random ID, not data: the server keeps who signed in and which catalog, for SESSION_MS.
  const id = crypto.randomBytes(32).toString('base64url');
  const now = Date.now();
  authDb.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(now);
  authDb.prepare('INSERT INTO sessions (id, name, catalog, created_at, expires_at) VALUES (?, ?, ?, ?, ?)').run(id, name, catalog, now, now + SESSION_MS);
  res.cookie(SESSION_COOKIE, id, { ...COOKIE_OPTS, maxAge: SESSION_MS });
  res.json(meView(name, catalog));
});
app.post('/api/logout', (req, res) => {
  const id = req.cookies?.[SESSION_COOKIE];
  if (typeof id === 'string') authDb.prepare('DELETE FROM sessions WHERE id = ?').run(id);
  res.clearCookie(SESSION_COOKIE, COOKIE_OPTS);
  res.json({ ok: true });
});

// ---------- items ----------
app.get('/api/items', requireReviewer, (req, res) => res.json(activeItems(req.db!).map(itemView)));

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
    currentLevel: LEVELS.includes(b.currentLevel) ? b.currentLevel : 'Full'
  };
}

app.post('/api/items', requireReviewer, (req, res) => {
  const d = req.db!;
  const b = readItemBody(req.body ?? {});
  if (!b.name) return res.status(400).json({ error: 'Enter a name.' });
  const r = d
    .prepare(
      `INSERT INTO items (name, location, unit, mode, min_qty, target_qty, expiry_date, current_num, current_level)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(b.name, b.location, b.unit, b.mode, b.min, b.target, b.expiryDate, b.currentNum, b.currentLevel);
  res.json(itemView(d.prepare('SELECT * FROM items WHERE id = ?').get(r.lastInsertRowid) as Item));
});

app.put('/api/items/:id', requireReviewer, (req, res) => {
  const d = req.db!;
  const id = Number(req.params.id);
  const cur = d.prepare('SELECT * FROM items WHERE id = ?').get(id) as Item | undefined;
  if (!cur) return res.status(404).json({ error: 'Item not found.' });
  const b = readItemBody({ ...itemView(cur), ...req.body });
  if (!b.name) return res.status(400).json({ error: 'Enter a name.' });
  d.prepare(
    `UPDATE items SET name=?, location=?, unit=?, mode=?, min_qty=?, target_qty=?, expiry_date=?, updated_at=datetime('now') WHERE id=?`
  ).run(b.name, b.location, b.unit, b.mode, b.min, b.target, b.expiryDate, id);
  res.json(itemView(d.prepare('SELECT * FROM items WHERE id = ?').get(id) as Item));
});

// ---------- product photos ----------
app.put('/api/items/:id/photo', requireReviewer, (req, res) => {
  const d = req.db!;
  const id = Number(req.params.id);
  const it = d.prepare('SELECT * FROM items WHERE id = ? AND active = 1').get(id) as Item | undefined;
  if (!it) return res.status(404).json({ error: 'Item not found.' });
  try {
    const file = savePhoto(req.catalog!, id, String(req.body?.image || ''));
    d.prepare('UPDATE items SET image_file = ? WHERE id = ?').run(file, id);
  } catch (e: any) {
    return res.status(400).json({ error: e.message });
  }
  res.json(itemView(d.prepare('SELECT * FROM items WHERE id = ?').get(id) as Item));
});

app.get('/api/items/:id/photo', requireReviewer, (req, res) => {
  const it = req.db!.prepare('SELECT * FROM items WHERE id = ?').get(Number(req.params.id)) as Item | undefined;
  if (!it?.image_file) return res.status(404).json({ error: 'No photo.' });
  res.setHeader('Cache-Control', 'private, no-cache');
  res.sendFile(photoPath(req.catalog!, it.image_file));
});

app.delete('/api/items/:id/photo', requireReviewer, (req, res) => {
  const d = req.db!;
  const it = d.prepare('SELECT * FROM items WHERE id = ?').get(Number(req.params.id)) as Item | undefined;
  if (!it) return res.status(404).json({ error: 'Item not found.' });
  if (it.image_file) deletePhoto(req.catalog!, it.image_file);
  d.prepare('UPDATE items SET image_file = NULL WHERE id = ?').run(it.id);
  res.json({ ok: true });
});

// Suggests a name for a single product, from a new photo (image) or the item's saved photo (itemId).
app.post('/api/identify', requireReviewer, async (req, res) => {
  let image = typeof req.body?.image === 'string' ? req.body.image : '';
  let base64 = '';
  let mime: 'image/jpeg' | 'image/png' | 'image/webp' = 'image/jpeg';
  const m = /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/.exec(image);
  if (m) {
    mime = m[1] as typeof mime;
    base64 = m[2];
  } else if (req.body?.itemId != null) {
    const it = req.db!.prepare('SELECT * FROM items WHERE id = ?').get(Number(req.body.itemId)) as Item | undefined;
    if (!it?.image_file) return res.status(400).json({ error: 'Take a photo of the product first.' });
    base64 = readPhotoBase64(req.catalog!, it.image_file);
  } else {
    return res.status(400).json({ error: 'Send a product photo.' });
  }
  try {
    res.json(await identifyProduct(base64, mime));
  } catch (e: any) {
    console.error('identify failed', e);
    res.status(502).json({ error: "Couldn't read the product. Type the name instead." });
  }
});

app.delete('/api/items/:id', requireReviewer, (req, res) => {
  req.db!.prepare('UPDATE items SET active = 0 WHERE id = ?').run(Number(req.params.id));
  res.json({ ok: true });
});

// ---------- week + count ----------
app.get('/api/week', requireReviewer, (req, res) => res.json(weekView(req.db!)));

app.get('/api/count', requireReviewer, (req, res) => {
  const d = req.db!;
  const w = getOrCreateWeek(d);
  const done = new Set(
    (d.prepare('SELECT item_id FROM count_entries WHERE week_id = ?').all(w.id) as { item_id: number }[]).map((r) => r.item_id)
  );
  res.json({ week: weekView(d), items: activeItems(d).map((it) => ({ ...itemView(it), counted: done.has(it.id) })) });
});

app.post('/api/count/item/:itemId', requireReviewer, (req, res) => {
  const d = req.db!;
  const w = getOrCreateWeek(d);
  const id = Number(req.params.itemId);
  const it = d.prepare('SELECT * FROM items WHERE id = ? AND active = 1').get(id) as Item | undefined;
  if (!it) return res.status(404).json({ error: 'Item not found.' });
  const who = req.reviewer ?? null;
  const tx = d.transaction(() => {
    if (req.body?.counted === false) {
      d.prepare('DELETE FROM count_entries WHERE week_id = ? AND item_id = ?').run(w.id, id);
      return;
    }
    if (it.mode === 'num' && req.body?.value != null) {
      d.prepare("UPDATE items SET current_num = ?, updated_at=datetime('now') WHERE id = ?").run(Math.max(0, Number(req.body.value) || 0), id);
    }
    if (it.mode === 'lvl' && LEVELS.includes(req.body?.level)) {
      d.prepare("UPDATE items SET current_level = ?, updated_at=datetime('now') WHERE id = ?").run(req.body.level, id);
    }
    d.prepare(
      `INSERT INTO count_entries (week_id, item_id, counted_by) VALUES (?, ?, ?)
       ON CONFLICT(week_id, item_id) DO UPDATE SET counted_by = excluded.counted_by, counted_at = datetime('now')`
    ).run(w.id, id, who);
  });
  tx();
  // Still a draft? Then the list follows the new count straight away.
  refreshDraft(d, w);
  const fresh = d.prepare('SELECT * FROM items WHERE id = ?').get(id) as Item;
  res.json({ ...itemView(fresh), counted: req.body?.counted !== false });
});

app.post('/api/count/finish', requireReviewer, (req, res) => {
  const d = req.db!;
  const w = getOrCreateWeek(d);
  d.prepare("UPDATE weeks SET count_finished_at = COALESCE(count_finished_at, datetime('now')), counted_by = ? WHERE id = ?").run(req.reviewer ?? null, w.id);
  // Finishing only drafts the list. Counts stay editable, and each change updates the draft.
  refreshDraft(d, getOrCreateWeek(d));
  res.json(weekView(d));
});

// ---------- shopping list ----------
app.get('/api/list', requireReviewer, (req, res) => {
  const d = req.db!;
  const w = getOrCreateWeek(d);
  refreshDraft(d, w);
  res.json({ week: weekView(d), lines: listLines(d, w.id).map(lineView) });
});

app.post('/api/list/redraft', requireReviewer, (req, res) => {
  const d = req.db!;
  refreshDraft(d, getOrCreateWeek(d));
  res.json({ ok: true });
});

app.post('/api/list/lines', requireReviewer, (req, res) => {
  const d = req.db!;
  const w = getOrCreateWeek(d);
  const name = str(req.body?.name);
  if (!name) return res.status(400).json({ error: 'Enter a name.' });
  const qty = Math.max(1, num(req.body?.qty) ?? 1);
  d.prepare(
    'INSERT INTO list_lines (week_id, name, unit, reason, suggested, qty, one_off) VALUES (?, ?, ?, ?, ?, ?, 1)'
  ).run(w.id, name, str(req.body?.unit, 40), str(req.body?.reason, 80) || 'This week only', qty, qty);
  res.json({ ok: true });
});

app.put('/api/list/lines/:id', requireReviewer, (req, res) => {
  const d = req.db!;
  const id = Number(req.params.id);
  const l = d.prepare('SELECT * FROM list_lines WHERE id = ?').get(id) as ListLine | undefined;
  if (!l) return res.status(404).json({ error: 'Line not found.' });
  const qty = num(req.body?.qty);
  d.prepare('UPDATE list_lines SET qty = ?, removed = ? WHERE id = ?').run(
    qty != null ? Math.max(1, qty) : l.qty,
    req.body?.removed != null ? (req.body.removed ? 1 : 0) : l.removed,
    id
  );
  res.json(lineView(d.prepare('SELECT * FROM list_lines WHERE id = ?').get(id) as ListLine));
});

app.delete('/api/list/lines/:id', requireReviewer, (req, res) => {
  req.db!.prepare('DELETE FROM list_lines WHERE id = ? AND one_off = 1').run(Number(req.params.id));
  res.json({ ok: true });
});

app.put('/api/list/note', requireReviewer, (req, res) => {
  const d = req.db!;
  const w = getOrCreateWeek(d);
  d.prepare('UPDATE weeks SET note = ? WHERE id = ?').run(str(req.body?.note, 500), w.id);
  res.json({ ok: true });
});

app.post('/api/list/approve', requireReviewer, (req, res) => {
  const d = req.db!;
  const w = getOrCreateWeek(d);
  d.prepare("UPDATE weeks SET approved_at = COALESCE(approved_at, datetime('now')), approved_by = ? WHERE id = ?").run(req.reviewer ?? null, w.id);
  res.json(weekView(d));
});

// ---------- family (no sign-in, by link) ----------
app.get('/api/family/:token', (req, res) => {
  const found = findFamilyWeek(req.params.token);
  if (!found || !found.w.approved_at) return res.status(404).json({ error: "This list isn't ready yet. Check with the kitchen team." });
  const { d, w, catalog } = found;
  const lines = listLines(d, w.id).filter((l) => !l.removed).map(lineView);
  res.json({ serviceDate: w.service_date, note: w.note, lines, testing: catalog === 'test' });
});
app.post('/api/family/:token/lines/:id', (req, res) => {
  const found = findFamilyWeek(req.params.token);
  if (!found || !found.w.approved_at) return res.status(404).json({ error: 'List not found.' });
  const { d, w } = found;
  const id = Number(req.params.id);
  const l = d.prepare('SELECT * FROM list_lines WHERE id = ? AND week_id = ?').get(id, w.id) as ListLine | undefined;
  if (!l) return res.status(404).json({ error: 'Item not found.' });
  // Families only record what they bought. This never changes inventory counts.
  const bought = req.body?.bought != null ? (req.body.bought ? 1 : 0) : l.bought;
  const bq = num(req.body?.boughtQty);
  d.prepare('UPDATE list_lines SET bought = ?, bought_qty = ? WHERE id = ?').run(bought, bq != null ? Math.max(0, bq) : l.bought_qty, id);
  res.json(lineView(d.prepare('SELECT * FROM list_lines WHERE id = ?').get(id) as ListLine));
});

// ---------- add by photo ----------
app.post('/api/scan', requireReviewer, async (req, res) => {
  const location = LOCATIONS.includes(req.body?.location) ? req.body.location : 'Shelves';
  const dataUrl = String(req.body?.image || '');
  const m = /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/.exec(dataUrl);
  if (!m) return res.status(400).json({ error: 'Send the photo as a JPEG or PNG.' });
  try {
    res.json(await scanPhoto(req.db!, location, m[2], m[1] as 'image/jpeg'));
  } catch (e: any) {
    console.error('scan failed', e);
    res.status(502).json({ error: e?.message?.startsWith('The photo') ? e.message : "Couldn't read the photo. Try again." });
  }
});

app.post('/api/scan/save', requireReviewer, (req, res) => {
  const d = req.db!;
  const location = LOCATIONS.includes(req.body?.location) ? req.body.location : 'Shelves';
  const rows = Array.isArray(req.body?.items) ? req.body.items : [];
  let added = 0, updated = 0;
  const tx = d.transaction(() => {
    for (const r of rows) {
      const name = canonicalName(str(r.name));
      if (!name) continue;
      const count = Math.max(0, Math.round(Number(r.count) || 0));
      if (r.matchId) {
        d.prepare("UPDATE items SET current_num = ?, updated_at = datetime('now') WHERE id = ? AND mode = 'num'").run(count, Number(r.matchId));
        updated++;
      } else {
        d.prepare('INSERT INTO items (name, location, unit, mode, current_num) VALUES (?, ?, ?, ?, ?)').run(
          name, location, str(r.unit, 40), 'num', count
        );
        added++;
      }
    }
  });
  tx();
  res.json({ added, updated });
});

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

// Only listen when run directly (npm start / tsx server/index.ts), so tests can import `app` without opening a port.
const isMain = process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  app.listen(PORT, '0.0.0.0', () => {
    const ips = Object.values(os.networkInterfaces())
      .flat()
      .filter((n) => n && n.family === 'IPv4' && !n.internal)
      .map((n) => n!.address);
    console.log(`\nLangar Pantry is running.`);
    console.log(`  On this computer:  http://localhost:${PORT}`);
    for (const ip of ips) console.log(`  On your phone:     http://${ip}:${PORT}   (same Wi-Fi)`);
    console.log(`  Catalogs:          ${CATALOGS.prod.label} (REVIEWER_PIN) · ${CATALOGS.test.label} (TEST_PIN${TEST_PIN ? '' : ', not set'})`);
    if (!process.env.ANTHROPIC_API_KEY) console.log('  Add by photo: demo mode (set ANTHROPIC_API_KEY in .env for real photo reading)');
    console.log('');
  });
}

export { app };
