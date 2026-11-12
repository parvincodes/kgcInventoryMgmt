import 'dotenv/config';
import express, { NextFunction, Request, Response } from 'express';
import cookieParser from 'cookie-parser';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { db, Item, LEVELS, LOCATIONS, ListLine } from './db.js';
import {
  activeItems,
  dontBuy,
  draftList,
  getOrCreateWeek,
  isBelowMin,
  listLines,
  needsSetup,
  weekStatus
} from './logic.js';
import { scanPhoto } from './scan.js';

const PORT = Number(process.env.PORT || 3000);
const PIN = process.env.REVIEWER_PIN || '1234';
const SECRET = process.env.SESSION_SECRET || 'dev-secret-change-me';
if (!process.env.REVIEWER_PIN) console.warn('⚠  REVIEWER_PIN is not set. Using 1234. Set it in .env before sharing.');

const app = express();
app.use(express.json({ limit: '12mb' }));
app.use(cookieParser(SECRET));

// ---------- helpers ----------
const reviewer = (req: Request): string | null => {
  const v = req.signedCookies?.reviewer;
  return typeof v === 'string' && v ? v : null;
};
const requireReviewer = (req: Request, res: Response, next: NextFunction) => {
  if (!reviewer(req)) return res.status(401).json({ error: 'Sign in first.' });
  next();
};
const num = (v: unknown): number | null => (v === '' || v == null || Number.isNaN(Number(v)) ? null : Number(v));
const str = (v: unknown, max = 120) => String(v ?? '').trim().slice(0, max);

function itemView(it: Item) {
  return {
    id: it.id,
    name: it.name,
    location: it.location,
    unit: it.unit,
    mode: it.mode,
    min: it.min_qty,
    target: it.target_qty,
    overBought: !!it.over_bought,
    expiryDate: it.expiry_date,
    currentNum: it.current_num,
    currentLevel: it.current_level,
    needsSetup: needsSetup(it),
    belowMin: isBelowMin(it)
  };
}
function lineView(l: ListLine) {
  return {
    id: l.id,
    itemId: l.item_id,
    name: l.name,
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
function weekView() {
  const w = getOrCreateWeek();
  const items = activeItems();
  const counted = (db.prepare('SELECT COUNT(*) AS n FROM count_entries WHERE week_id = ?').get(w.id) as { n: number }).n;
  const lines = listLines(w.id).filter((l) => !l.removed);
  return {
    id: w.id,
    serviceDate: w.service_date,
    status: weekStatus(w),
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

// ---------- auth ----------
app.get('/api/me', (req, res) => res.json({ name: reviewer(req) }));
app.post('/api/login', (req, res) => {
  const pin = str(req.body?.pin, 40);
  const name = str(req.body?.name, 40) || 'Reviewer';
  const ok = pin.length === PIN.length && crypto.timingSafeEqual(Buffer.from(pin), Buffer.from(PIN));
  if (!ok) return res.status(401).json({ error: "That PIN didn't match." });
  res.cookie('reviewer', name, { signed: true, httpOnly: true, sameSite: 'lax', maxAge: 1000 * 60 * 60 * 24 * 180 });
  res.json({ name });
});
app.post('/api/logout', (_req, res) => {
  res.clearCookie('reviewer');
  res.json({ ok: true });
});

// ---------- items ----------
app.get('/api/items', requireReviewer, (_req, res) => res.json(activeItems().map(itemView)));

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
    overBought: b.overBought ? 1 : 0,
    expiryDate: /^\d{4}-\d{2}-\d{2}$/.test(String(b.expiryDate || '')) ? String(b.expiryDate) : null,
    currentNum: num(b.currentNum) ?? 0,
    currentLevel: LEVELS.includes(b.currentLevel) ? b.currentLevel : 'Full'
  };
}

app.post('/api/items', requireReviewer, (req, res) => {
  const b = readItemBody(req.body ?? {});
  if (!b.name) return res.status(400).json({ error: 'Enter a name.' });
  const r = db
    .prepare(
      `INSERT INTO items (name, location, unit, mode, min_qty, target_qty, over_bought, expiry_date, current_num, current_level)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(b.name, b.location, b.unit, b.mode, b.min, b.target, b.overBought, b.expiryDate, b.currentNum, b.currentLevel);
  res.json(itemView(db.prepare('SELECT * FROM items WHERE id = ?').get(r.lastInsertRowid) as Item));
});

app.put('/api/items/:id', requireReviewer, (req, res) => {
  const id = Number(req.params.id);
  const cur = db.prepare('SELECT * FROM items WHERE id = ?').get(id) as Item | undefined;
  if (!cur) return res.status(404).json({ error: 'Item not found.' });
  const b = readItemBody({ ...itemView(cur), ...req.body });
  if (!b.name) return res.status(400).json({ error: 'Enter a name.' });
  db.prepare(
    `UPDATE items SET name=?, location=?, unit=?, mode=?, min_qty=?, target_qty=?, over_bought=?, expiry_date=?, updated_at=datetime('now') WHERE id=?`
  ).run(b.name, b.location, b.unit, b.mode, b.min, b.target, b.overBought, b.expiryDate, id);
  res.json(itemView(db.prepare('SELECT * FROM items WHERE id = ?').get(id) as Item));
});

app.delete('/api/items/:id', requireReviewer, (req, res) => {
  db.prepare('UPDATE items SET active = 0 WHERE id = ?').run(Number(req.params.id));
  res.json({ ok: true });
});

// ---------- week + count ----------
app.get('/api/week', requireReviewer, (_req, res) => res.json(weekView()));

app.get('/api/count', requireReviewer, (_req, res) => {
  const w = getOrCreateWeek();
  const done = new Set(
    (db.prepare('SELECT item_id FROM count_entries WHERE week_id = ?').all(w.id) as { item_id: number }[]).map((r) => r.item_id)
  );
  res.json({ week: weekView(), items: activeItems().map((it) => ({ ...itemView(it), counted: done.has(it.id) })) });
});

app.post('/api/count/item/:itemId', requireReviewer, (req, res) => {
  const w = getOrCreateWeek();
  const id = Number(req.params.itemId);
  const it = db.prepare('SELECT * FROM items WHERE id = ? AND active = 1').get(id) as Item | undefined;
  if (!it) return res.status(404).json({ error: 'Item not found.' });
  const who = reviewer(req);
  const tx = db.transaction(() => {
    if (req.body?.counted === false) {
      db.prepare('DELETE FROM count_entries WHERE week_id = ? AND item_id = ?').run(w.id, id);
      return;
    }
    if (it.mode === 'num' && req.body?.value != null) {
      db.prepare("UPDATE items SET current_num = ?, updated_at=datetime('now') WHERE id = ?").run(Math.max(0, Number(req.body.value) || 0), id);
    }
    if (it.mode === 'lvl' && LEVELS.includes(req.body?.level)) {
      db.prepare("UPDATE items SET current_level = ?, updated_at=datetime('now') WHERE id = ?").run(req.body.level, id);
    }
    db.prepare(
      `INSERT INTO count_entries (week_id, item_id, counted_by) VALUES (?, ?, ?)
       ON CONFLICT(week_id, item_id) DO UPDATE SET counted_by = excluded.counted_by, counted_at = datetime('now')`
    ).run(w.id, id, who);
  });
  tx();
  const fresh = db.prepare('SELECT * FROM items WHERE id = ?').get(id) as Item;
  res.json({ ...itemView(fresh), counted: req.body?.counted !== false });
});

app.post('/api/count/finish', requireReviewer, (req, res) => {
  const w = getOrCreateWeek();
  db.prepare("UPDATE weeks SET count_finished_at = datetime('now'), counted_by = ? WHERE id = ?").run(reviewer(req), w.id);
  draftList(getOrCreateWeek());
  res.json(weekView());
});

// ---------- shopping list ----------
app.get('/api/list', requireReviewer, (_req, res) => {
  const w = getOrCreateWeek();
  res.json({ week: weekView(), lines: listLines(w.id).map(lineView), dontBuy: dontBuy() });
});

app.post('/api/list/redraft', requireReviewer, (_req, res) => {
  draftList(getOrCreateWeek());
  res.json({ ok: true });
});

app.post('/api/list/lines', requireReviewer, (req, res) => {
  const w = getOrCreateWeek();
  const name = str(req.body?.name);
  if (!name) return res.status(400).json({ error: 'Enter a name.' });
  const qty = Math.max(1, num(req.body?.qty) ?? 1);
  db.prepare(
    'INSERT INTO list_lines (week_id, name, unit, reason, suggested, qty, one_off) VALUES (?, ?, ?, ?, ?, ?, 1)'
  ).run(w.id, name, str(req.body?.unit, 40), str(req.body?.reason, 80) || 'This week only', qty, qty);
  res.json({ ok: true });
});

app.put('/api/list/lines/:id', requireReviewer, (req, res) => {
  const id = Number(req.params.id);
  const l = db.prepare('SELECT * FROM list_lines WHERE id = ?').get(id) as ListLine | undefined;
  if (!l) return res.status(404).json({ error: 'Line not found.' });
  const qty = num(req.body?.qty);
  db.prepare('UPDATE list_lines SET qty = ?, removed = ? WHERE id = ?').run(
    qty != null ? Math.max(1, qty) : l.qty,
    req.body?.removed != null ? (req.body.removed ? 1 : 0) : l.removed,
    id
  );
  res.json(lineView(db.prepare('SELECT * FROM list_lines WHERE id = ?').get(id) as ListLine));
});

app.delete('/api/list/lines/:id', requireReviewer, (req, res) => {
  db.prepare('DELETE FROM list_lines WHERE id = ? AND one_off = 1').run(Number(req.params.id));
  res.json({ ok: true });
});

app.put('/api/list/note', requireReviewer, (req, res) => {
  const w = getOrCreateWeek();
  db.prepare('UPDATE weeks SET note = ? WHERE id = ?').run(str(req.body?.note, 500), w.id);
  res.json({ ok: true });
});

app.post('/api/list/approve', requireReviewer, (req, res) => {
  const w = getOrCreateWeek();
  db.prepare("UPDATE weeks SET approved_at = COALESCE(approved_at, datetime('now')), approved_by = ? WHERE id = ?").run(reviewer(req), w.id);
  res.json(weekView());
});

// ---------- family (no sign-in, by link) ----------
function weekByToken(token: string) {
  return db.prepare('SELECT * FROM weeks WHERE share_token = ?').get(token) as import('./db.js').Week | undefined;
}
app.get('/api/family/:token', (req, res) => {
  const w = weekByToken(req.params.token);
  if (!w || !w.approved_at) return res.status(404).json({ error: "This list isn't ready yet. Check with the kitchen team." });
  const lines = listLines(w.id).filter((l) => !l.removed).map(lineView);
  res.json({ serviceDate: w.service_date, note: w.note, lines, dontBuy: dontBuy() });
});
app.post('/api/family/:token/lines/:id', (req, res) => {
  const w = weekByToken(req.params.token);
  if (!w || !w.approved_at) return res.status(404).json({ error: 'List not found.' });
  const id = Number(req.params.id);
  const l = db.prepare('SELECT * FROM list_lines WHERE id = ? AND week_id = ?').get(id, w.id) as ListLine | undefined;
  if (!l) return res.status(404).json({ error: 'Item not found.' });
  // Families only record what they bought. This never changes inventory counts.
  const bought = req.body?.bought != null ? (req.body.bought ? 1 : 0) : l.bought;
  const bq = num(req.body?.boughtQty);
  db.prepare('UPDATE list_lines SET bought = ?, bought_qty = ? WHERE id = ?').run(bought, bq != null ? Math.max(0, bq) : l.bought_qty, id);
  res.json(lineView(db.prepare('SELECT * FROM list_lines WHERE id = ?').get(id) as ListLine));
});

// ---------- add by photo ----------
app.post('/api/scan', requireReviewer, async (req, res) => {
  const location = LOCATIONS.includes(req.body?.location) ? req.body.location : 'Shelves';
  const dataUrl = String(req.body?.image || '');
  const m = /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/.exec(dataUrl);
  if (!m) return res.status(400).json({ error: 'Send the photo as a JPEG or PNG.' });
  try {
    res.json(await scanPhoto(location, m[2], m[1] as 'image/jpeg'));
  } catch (e: any) {
    console.error('scan failed', e);
    res.status(502).json({ error: e?.message?.startsWith('The photo') ? e.message : "Couldn't read the photo. Try again." });
  }
});

app.post('/api/scan/save', requireReviewer, (req, res) => {
  const location = LOCATIONS.includes(req.body?.location) ? req.body.location : 'Shelves';
  const rows = Array.isArray(req.body?.items) ? req.body.items : [];
  let added = 0, updated = 0;
  const tx = db.transaction(() => {
    for (const r of rows) {
      const name = str(r.name);
      if (!name) continue;
      const count = Math.max(0, Math.round(Number(r.count) || 0));
      if (r.matchId) {
        db.prepare("UPDATE items SET current_num = ?, updated_at = datetime('now') WHERE id = ? AND mode = 'num'").run(count, Number(r.matchId));
        updated++;
      } else {
        db.prepare('INSERT INTO items (name, location, unit, mode, current_num) VALUES (?, ?, ?, ?, ?)').run(
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

app.listen(PORT, '0.0.0.0', () => {
  const ips = Object.values(os.networkInterfaces())
    .flat()
    .filter((n) => n && n.family === 'IPv4' && !n.internal)
    .map((n) => n!.address);
  console.log(`\nLangar Pantry is running.`);
  console.log(`  On this computer:  http://localhost:${PORT}`);
  for (const ip of ips) console.log(`  On your phone:     http://${ip}:${PORT}   (same Wi-Fi)`);
  if (!process.env.ANTHROPIC_API_KEY) console.log('  Add by photo: demo mode (set ANTHROPIC_API_KEY in .env for real photo reading)');
  console.log('');
});
