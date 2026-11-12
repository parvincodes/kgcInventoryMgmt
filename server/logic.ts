import crypto from 'node:crypto';
import { db, Item, ListLine, Week } from './db.js';

/** The weekend the reviewers are preparing for: the next Saturday after today (on a Saturday, the following one). */
export function upcomingServiceDate(now = new Date()): string {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const day = d.getDay(); // 0 Sun … 6 Sat
  let add = (6 - day + 7) % 7;
  if (add === 0) add = 7;
  d.setDate(d.getDate() + add);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

export function getOrCreateWeek(serviceDate = upcomingServiceDate()): Week {
  const found = db.prepare('SELECT * FROM weeks WHERE service_date = ?').get(serviceDate) as Week | undefined;
  if (found) return found;
  const token = crypto.randomBytes(12).toString('base64url');
  db.prepare('INSERT INTO weeks (service_date, share_token) VALUES (?, ?)').run(serviceDate, token);
  return db.prepare('SELECT * FROM weeks WHERE service_date = ?').get(serviceDate) as Week;
}

export function activeItems(): Item[] {
  return db.prepare('SELECT * FROM items WHERE active = 1 ORDER BY location, name COLLATE NOCASE').all() as Item[];
}

/** Numeric items need a minimum to be checked; level items go on the list at Low or Out. */
export function needsSetup(it: Item): boolean {
  return it.mode === 'num' && it.min_qty == null;
}

export function isBelowMin(it: Item): boolean {
  if (it.mode === 'lvl') return it.current_level === 'Low' || it.current_level === 'Out';
  if (it.min_qty == null) return false;
  return it.current_num < it.min_qty;
}

export function isStocked(it: Item): boolean {
  if (it.mode === 'lvl') return it.current_level === 'Full';
  const target = it.target_qty ?? it.min_qty;
  return target != null && it.current_num >= target;
}

export function suggestedQty(it: Item): number {
  if (it.mode === 'lvl') return 1;
  const target = it.target_qty ?? it.min_qty ?? 0;
  return Math.max(1, Math.ceil(target - it.current_num));
}

export function reasonFor(it: Item): string {
  if (it.mode === 'lvl') return `Level ${it.current_level}`;
  return `Have ${fmt(it.current_num)} · target ${fmt(it.target_qty ?? it.min_qty ?? 0)}`;
}

function fmt(n: number) {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

export type WeekStatus = 'count_due' | 'counting' | 'drafted' | 'sent';

export function weekStatus(w: Week): WeekStatus {
  if (w.approved_at) return 'sent';
  if (w.count_finished_at) return 'drafted';
  const n = (db.prepare('SELECT COUNT(*) AS n FROM count_entries WHERE week_id = ?').get(w.id) as { n: number }).n;
  return n > 0 ? 'counting' : 'count_due';
}

/** Rebuild the auto-generated lines from the current counts. One-off lines and reviewer edits to unchanged items are kept. */
export function draftList(week: Week) {
  const items = activeItems();
  const existing = db.prepare('SELECT * FROM list_lines WHERE week_id = ? AND one_off = 0').all(week.id) as ListLine[];
  const byItem = new Map(existing.map((l) => [l.item_id, l]));
  const keep = new Set<number>();
  const insert = db.prepare(
    'INSERT INTO list_lines (week_id, item_id, name, unit, reason, suggested, qty) VALUES (?, ?, ?, ?, ?, ?, ?)'
  );
  const update = db.prepare('UPDATE list_lines SET name = ?, unit = ?, reason = ?, suggested = ?, qty = ? WHERE id = ?');
  const tx = db.transaction(() => {
    for (const it of items) {
      if (!isBelowMin(it)) continue;
      const sug = suggestedQty(it);
      const unit = it.mode === 'lvl' ? it.unit || 'pack' : it.unit;
      const prev = byItem.get(it.id);
      if (prev) {
        // Keep a reviewer's edited quantity if the suggestion hasn't changed.
        const qty = prev.qty !== prev.suggested && prev.suggested === sug ? prev.qty : sug;
        update.run(it.name, unit, reasonFor(it), sug, qty, prev.id);
        keep.add(prev.id);
      } else {
        const r = insert.run(week.id, it.id, it.name, unit, reasonFor(it), sug, sug);
        keep.add(Number(r.lastInsertRowid));
      }
    }
    for (const l of existing) {
      if (!keep.has(l.id)) db.prepare('DELETE FROM list_lines WHERE id = ?').run(l.id);
    }
  });
  tx();
}

export function dontBuy(): string[] {
  return activeItems()
    .filter((it) => it.over_bought && isStocked(it))
    .map((it) => it.name);
}

export function listLines(weekId: number): ListLine[] {
  return db
    .prepare('SELECT * FROM list_lines WHERE week_id = ? ORDER BY one_off, name COLLATE NOCASE')
    .all(weekId) as ListLine[];
}
