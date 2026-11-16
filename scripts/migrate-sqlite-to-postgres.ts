/**
 * One-time copy of the SQLite catalogs (data/production.db and data/pantry.db) into Postgres.
 *
 * usage: DATABASE_URL=postgres://... node_modules/.bin/tsx scripts/migrate-sqlite-to-postgres.ts
 *
 * - Reads only. The SQLite files are not changed.
 * - Refuses to write into a catalog that already has items, so it can't double up.
 * - Sign-in sessions are not copied: everyone signs in again once.
 */
import 'dotenv/config';
import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { Catalog, closeDb, migrate, sql, tx } from '../server/db.js';

const DATA = path.resolve(process.env.SQLITE_DIR || 'data');
const FILES: Record<Catalog, string> = { prod: 'production.db', test: 'pantry.db' };

/** SQLite stores datetime('now') as UTC text, e.g. "2026-11-13 02:29:34". */
const toTs = (v: string | null) => (v ? new Date(v.replace(' ', 'T') + 'Z') : null);

async function migrateCatalog(catalog: Catalog) {
  const file = path.join(DATA, FILES[catalog]);
  if (!fs.existsSync(file)) {
    console.log(`${catalog}: no ${FILES[catalog]} found, skipping`);
    return;
  }
  const src = new Database(file, { readonly: true });
  const existing = (await sql('SELECT COUNT(*) AS n FROM items WHERE catalog = $1', [catalog])).rows[0].n as number;
  if (existing > 0) throw new Error(`${catalog}: Postgres already has ${existing} items. Refusing to copy on top of them.`);

  const items = src.prepare('SELECT * FROM items').all() as any[];
  const weeks = src.prepare('SELECT * FROM weeks').all() as any[];
  const entries = src.prepare('SELECT * FROM count_entries').all() as any[];
  const lines = src.prepare('SELECT * FROM list_lines').all() as any[];
  const photosMissing: string[] = [];

  await tx(async (s) => {
    const itemIds = new Map<number, number>();
    for (const it of items) {
      let photo: Buffer | null = null;
      if (it.image_file) {
        const p = path.join(DATA, 'product-images', catalog, it.image_file);
        if (fs.existsSync(p)) photo = fs.readFileSync(p);
        else photosMissing.push(`${it.name} (${it.image_file})`);
      }
      const r = await s(
        `INSERT INTO items (catalog, name, location, unit, mode, min_qty, target_qty, over_bought, expiry_date,
                            current_num, current_level, active, photo)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING id`,
        [catalog, it.name, it.location, it.unit, it.mode, it.min_qty, it.target_qty, it.over_bought, it.expiry_date,
         it.current_num, it.current_level, it.active, photo]
      );
      itemIds.set(it.id, r.rows[0].id);
    }

    const weekIds = new Map<number, number>();
    for (const w of weeks) {
      const r = await s(
        `INSERT INTO weeks (catalog, service_date, counted_by, count_finished_at, approved_by, approved_at, note, share_token)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
        [catalog, w.service_date, w.counted_by, toTs(w.count_finished_at), w.approved_by, toTs(w.approved_at), w.note, w.share_token]
      );
      weekIds.set(w.id, r.rows[0].id);
    }

    for (const c of entries) {
      const week = weekIds.get(c.week_id);
      const item = itemIds.get(c.item_id);
      if (!week || !item) continue;
      await s('INSERT INTO count_entries (week_id, item_id, counted_by, counted_at) VALUES ($1, $2, $3, $4)', [
        week, item, c.counted_by, toTs(c.counted_at)
      ]);
    }

    for (const l of lines) {
      const week = weekIds.get(l.week_id);
      if (!week) continue;
      await s(
        `INSERT INTO list_lines (week_id, item_id, name, unit, reason, suggested, qty, one_off, removed, bought, bought_qty)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [week, l.item_id == null ? null : itemIds.get(l.item_id) ?? null, l.name, l.unit, l.reason, l.suggested, l.qty,
         l.one_off, l.removed, l.bought, l.bought_qty]
      );
    }
  });

  // Check that what arrived matches what was there.
  const pg = async (q: string) => (await sql(q, [catalog])).rows[0].n as number;
  const expected = {
    items: items.length,
    activeItems: items.filter((i) => i.active === 1).length,
    weeks: weeks.length,
    countEntries: entries.filter((c) => weekIds_has(c, weeks, items)).length,
    listLines: lines.length,
    photos: items.filter((i) => i.image_file && fs.existsSync(path.join(DATA, 'product-images', catalog, i.image_file))).length
  };
  const got = {
    items: await pg('SELECT COUNT(*) AS n FROM items WHERE catalog = $1'),
    activeItems: await pg('SELECT COUNT(*) AS n FROM items WHERE catalog = $1 AND active = 1'),
    weeks: await pg('SELECT COUNT(*) AS n FROM weeks WHERE catalog = $1'),
    countEntries: await pg('SELECT COUNT(*) AS n FROM count_entries ce JOIN weeks w ON w.id = ce.week_id WHERE w.catalog = $1'),
    listLines: await pg('SELECT COUNT(*) AS n FROM list_lines l JOIN weeks w ON w.id = l.week_id WHERE w.catalog = $1'),
    photos: await pg('SELECT COUNT(*) AS n FROM items WHERE catalog = $1 AND photo IS NOT NULL')
  };
  const mismatches = Object.keys(expected).filter((k) => expected[k as keyof typeof expected] !== got[k as keyof typeof got]);
  console.log(`\n${catalog}:`);
  for (const k of Object.keys(expected)) {
    const ok = expected[k as keyof typeof expected] === got[k as keyof typeof got];
    console.log(`  ${ok ? '✓' : '✗'} ${k.padEnd(13)} sqlite ${String(expected[k as keyof typeof expected]).padStart(4)}   postgres ${got[k as keyof typeof got]}`);
  }
  if (photosMissing.length) console.log(`  ! photo files missing on disk: ${photosMissing.join(', ')}`);
  if (mismatches.length) throw new Error(`${catalog}: counts do not match (${mismatches.join(', ')})`);
}

/** Count entries whose week and item both exist in the source, i.e. the ones the copy keeps. */
function weekIds_has(c: any, weeks: any[], items: any[]) {
  return weeks.some((w) => w.id === c.week_id) && items.some((i) => i.id === c.item_id);
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not set.');
  const host = new URL(process.env.DATABASE_URL).hostname;
  console.log(`Copying SQLite data from ${DATA} into Postgres at host "${host}".`);
  await migrate();
  for (const catalog of ['prod', 'test'] as Catalog[]) await migrateCatalog(catalog);
  console.log('\nDone. The SQLite files were not changed.');
}

main()
  .catch((e) => {
    console.error(`\nStopped: ${e.message}`);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
