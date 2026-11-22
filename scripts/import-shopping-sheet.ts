/**
 * Adds the stores and preferred brands from the shopping sheets to the production catalog.
 *
 * usage: npm run import-sheet            (dry run: shows what would change)
 *        npm run import-sheet -- --apply (writes the changes)
 *
 * Items that already exist (matched by name, or by the glossary) are updated with their store and brand.
 * Items that don't exist are added. Minimums and targets are left alone.
 */
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { closeDb, ITEM_COLS, Item, migrate, sql } from '../server/db.js';
import { sameProduct } from '../server/grocery-glossary.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const apply = process.argv.includes('--apply');

/** Each sheet is one store. The Indian Store tab is bought from Punjab Trading. */
const SHEETS = [
  { file: 'costco.csv', store: 'Costco' },
  { file: 'indian-store.csv', store: 'Punjab Trading' },
  { file: 'cash-and-carry.csv', store: 'US Chef Store' }
];

/** Spelling fixes for names on the sheet. */
const NAME_FIXES: Record<string, string> = {
  'Choclate Muffins': 'Chocolate Muffins',
  'Serano Pepper (Green chilli)': 'Serrano Pepper (Green chilli)',
  'Chanda Dal': 'Chana Dal',
  'Toor Daal': 'Toor Dal',
  'ColeSlaw': 'Coleslaw',
  'Pachrange Acchar': 'Pachranga Achar',
  'Jalebi/BesanBurfi or Milk cake': 'Jalebi / Besan Burfi / Milk Cake',
  'besan super fine (sher)': 'Besan (super fine, Sher)',
  'ladoo besan': 'Besan for Ladoo',
  'Mota atta (whole wheat hi)': 'Mota Atta (whole wheat)',
  'Potatoes ': 'Potatoes',
  'Romaine lettuce ': 'Romaine lettuce',
  'Royal Basmati Rice': 'Royal Basmati Rice',
  'Sher Atta (Green handle)': 'Sher Atta (Green handle)'
};
const BRAND_FIXES: Record<string, string> = { Kirland: 'Kirkland', 'Organic english': 'Organic English', 'Royal ': 'Royal' };

/** The place each item is kept at home, guessed from its name. Change it in the app if it's wrong. */
function locationFor(name: string): 'Kitchen' | 'Shelves' | 'Fridge' {
  const n = name.toLowerCase();
  if (/milk|cream|cheese|butter|paneer|yogurt|yoghurt|dahi/.test(n)) return 'Fridge';
  if (/tomato|onion|potato|ginger|garlic|pepper|mint|spinach|cilantro|gobi|carrot|cucumber|cantaloupe|grape|strawberr|lettuce|cherry|coleslaw|beans|ghiya|eggplant|chilli|serrano/.test(n)) return 'Kitchen';
  return 'Shelves';
}

/** A small CSV reader that handles quoted fields. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
    else if (c !== '\r') cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

type Planned = { name: string; store: string; brand: string | null; location: string; from: string[] };

function readSheets(): Planned[] {
  const byName = new Map<string, Planned>();
  for (const sheet of SHEETS) {
    const rows = parseCsv(fs.readFileSync(path.join(here, 'import', sheet.file), 'utf8'));
    for (const r of rows.slice(1)) {
      const raw = (r[0] ?? '').trim();
      if (!raw || raw === 'Item') continue;
      const name = (NAME_FIXES[r[0]] ?? NAME_FIXES[raw] ?? raw).trim();
      const brandRaw = (r[2] ?? '').trim();
      const brand = brandRaw ? (BRAND_FIXES[brandRaw] ?? BRAND_FIXES[r[2]] ?? brandRaw) : null;
      const key = name.toLowerCase();
      const existing = byName.get(key);
      if (existing) {
        // The same item on more than one sheet: keep the first store, and fill in a brand if one is missing.
        existing.from.push(sheet.file);
        if (!existing.brand && brand) existing.brand = brand;
        continue;
      }
      byName.set(key, { name, store: sheet.store, brand, location: locationFor(name), from: [sheet.file] });
    }
  }
  return [...byName.values()];
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not set.');
  const host = new URL(process.env.DATABASE_URL).pathname.replace('/', '');
  console.log(`${apply ? 'Writing to' : 'Dry run against'} database "${host}", production catalog.\n`);
  await migrate();

  const plan = readSheets();
  const current = (await sql(`SELECT ${ITEM_COLS} FROM items WHERE catalog = 'prod' AND active = 1`)).rows as Item[];
  const updates: { id: number; name: string; store: string; brand: string | null }[] = [];
  const inserts: Planned[] = [];
  for (const p of plan) {
    const hit = current.find((i) => i.name.toLowerCase() === p.name.toLowerCase()) ?? current.find((i) => sameProduct(i.name, p.name));
    if (hit) updates.push({ id: hit.id, name: hit.name, store: p.store, brand: p.brand });
    else inserts.push(p);
  }

  console.log(`Existing items to update: ${updates.length}`);
  for (const u of updates) console.log(`  ${u.name}  →  ${u.store}${u.brand ? ` · ${u.brand}` : ''}`);
  console.log(`\nNew items to add: ${inserts.length}`);
  for (const p of inserts) console.log(`  ${p.name}  (${p.location})  →  ${p.store}${p.brand ? ` · ${p.brand}` : ''}`);

  if (!apply) {
    console.log('\nNothing written. Run with -- --apply to make these changes.');
    return;
  }
  await sql('BEGIN');
  try {
    for (const u of updates) {
      await sql('UPDATE items SET store = $1, brand = COALESCE($2, brand), updated_at = now() WHERE id = $3', [u.store, u.brand, u.id]);
    }
    for (const p of inserts) {
      await sql(
        "INSERT INTO items (catalog, name, location, unit, mode, store, brand) VALUES ('prod', $1, $2, '', 'num', $3, $4)",
        [p.name, p.location, p.store, p.brand]
      );
    }
    await sql('COMMIT');
  } catch (e) {
    await sql('ROLLBACK');
    throw e;
  }
  console.log(`\nDone: ${updates.length} updated, ${inserts.length} added.`);
}

main()
  .catch((e) => {
    console.error(`\nStopped: ${e.message}`);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
