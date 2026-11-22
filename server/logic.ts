import crypto from 'node:crypto';
import { Catalog, ITEM_COLS, Item, ListLine, Sql, tx, Week } from './db.js';

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

export async function getOrCreateWeek(s: Sql, catalog: Catalog, serviceDate = upcomingServiceDate()): Promise<Week> {
  const token = crypto.randomBytes(12).toString('base64url');
  await s(
    'INSERT INTO weeks (catalog, service_date, share_token) VALUES ($1, $2, $3) ON CONFLICT (catalog, service_date) DO NOTHING',
    [catalog, serviceDate, token]
  );
  return (await s('SELECT * FROM weeks WHERE catalog = $1 AND service_date = $2', [catalog, serviceDate])).rows[0] as Week;
}

export async function activeItems(s: Sql, catalog: Catalog): Promise<Item[]> {
  return (await s(`SELECT ${ITEM_COLS} FROM items WHERE catalog = $1 AND active = 1 ORDER BY location, lower(name)`, [catalog])).rows as Item[];
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

export async function weekStatus(s: Sql, w: Week): Promise<WeekStatus> {
  if (w.approved_at) return 'sent';
  if (w.count_finished_at) return 'drafted';
  const n = (await s('SELECT COUNT(*) AS n FROM count_entries WHERE week_id = $1', [w.id])).rows[0].n as number;
  return n > 0 ? 'counting' : 'count_due';
}

/**
 * Rebuild the auto-generated lines from the current counts. One-off lines and reviewer edits to unchanged items are kept.
 * Reviewer removals are kept too, unless the item is no longer below minimum.
 */
export async function draftList(s: Sql, week: Week) {
  // One draft at a time per week, so two people can't add the same item twice.
  await s('SELECT pg_advisory_xact_lock($1)', [week.id]);
  const items = await activeItems(s, week.catalog);
  const existing = (await s('SELECT * FROM list_lines WHERE week_id = $1 AND one_off = 0', [week.id])).rows as ListLine[];
  const byItem = new Map(existing.map((l) => [l.item_id, l]));
  const keep = new Set<number>();
  for (const it of items) {
    if (!isBelowMin(it)) continue;
    const sug = suggestedQty(it);
    const unit = it.mode === 'lvl' ? it.unit || 'pack' : it.unit;
    const prev = byItem.get(it.id);
    if (prev) {
      // Keep a reviewer's edited quantity if the suggestion hasn't changed.
      const qty = prev.qty !== prev.suggested && prev.suggested === sug ? prev.qty : sug;
      await s('UPDATE list_lines SET name = $1, unit = $2, reason = $3, suggested = $4, qty = $5 WHERE id = $6', [
        it.name,
        unit,
        reasonFor(it),
        sug,
        qty,
        prev.id
      ]);
      keep.add(prev.id);
    } else {
      const r = await s(
        'INSERT INTO list_lines (week_id, item_id, name, unit, reason, suggested, qty) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id',
        [week.id, it.id, it.name, unit, reasonFor(it), sug, sug]
      );
      keep.add(r.rows[0].id);
    }
  }
  for (const l of existing) {
    if (!keep.has(l.id)) await s('DELETE FROM list_lines WHERE id = $1', [l.id]);
  }
}

/**
 * Keep the list in step with the counts while it is still a draft: counts can be edited after
 * "Finish" and the list follows. Once the list is sent to families, it stops changing on its own.
 */
export async function refreshDraft(w: Week) {
  if (w.approved_at || !w.count_finished_at) return;
  await tx((s) => draftList(s, w));
}

export async function listLines(s: Sql, weekId: number): Promise<ListLine[]> {
  return (
    await s(
      'SELECT l.*, i.store, i.brand FROM list_lines l LEFT JOIN items i ON i.id = l.item_id WHERE l.week_id = $1 ORDER BY l.one_off, lower(l.name)',
      [weekId]
    )
  ).rows as ListLine[];
}
