import pg from 'pg';

/**
 * Two catalogs share one Postgres database. Every catalog row carries a `catalog` column, so the
 * production and testing catalogs never see each other's rows.
 */
export type Catalog = 'prod' | 'test';
export const CATALOGS: Record<Catalog, { label: string }> = {
  prod: { label: 'Khalsa Gurmat School' },
  test: { label: 'Testing' }
};
export const CATALOG_IDS: Catalog[] = ['prod', 'test'];

export const LOCATIONS = ['Kitchen', 'Shelves', 'Fridge', 'Freezer'] as const;
export const LEVELS = ['Full', 'Half', 'Low', 'Out'] as const;

/** Runs one SQL statement. Every query in the server goes through this, so transactions can swap in their own client. */
export type Sql = (text: string, params?: unknown[]) => Promise<{ rows: any[]; rowCount: number | null }>;

// Postgres sends BIGINT (ids and COUNT results) as strings. Ours are small, so read them as numbers.
pg.types.setTypeParser(20, (v) => Number(v));

let pool: pg.Pool | null = null;

function getPool(): pg.Pool {
  if (!pool) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('DATABASE_URL is not set. Add it to .env (see .env.example).');
    pool = new pg.Pool({
      connectionString: url,
      max: 5,
      // Tests set PG_SCHEMA so each test file works in its own schema.
      options: process.env.PG_SCHEMA ? `-c search_path=${process.env.PG_SCHEMA}` : undefined
    });
  }
  return pool;
}

export const sql: Sql = (text, params = []) => getPool().query(text, params as any[]) as any;

/** Runs the callback in one transaction. Everything inside commits together, or nothing does. */
export async function tx<T>(fn: (s: Sql) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  const s: Sql = (text, params = []) => client.query(text, params as any[]) as any;
  try {
    await client.query('BEGIN');
    const out = await fn(s);
    await client.query('COMMIT');
    return out;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

export async function closeDb() {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS items (
  id BIGSERIAL PRIMARY KEY,
  catalog TEXT NOT NULL CHECK (catalog IN ('prod', 'test')),
  name TEXT NOT NULL,
  location TEXT NOT NULL DEFAULT 'Shelves',
  unit TEXT NOT NULL DEFAULT '',
  mode TEXT NOT NULL DEFAULT 'num' CHECK (mode IN ('num', 'lvl')),
  min_qty DOUBLE PRECISION,
  target_qty DOUBLE PRECISION,
  over_bought INTEGER NOT NULL DEFAULT 0,
  expiry_date TEXT,
  current_num DOUBLE PRECISION NOT NULL DEFAULT 0,
  current_level TEXT NOT NULL DEFAULT 'Full' CHECK (current_level IN ('Full', 'Half', 'Low', 'Out')),
  active INTEGER NOT NULL DEFAULT 1,
  photo BYTEA,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS weeks (
  id BIGSERIAL PRIMARY KEY,
  catalog TEXT NOT NULL CHECK (catalog IN ('prod', 'test')),
  service_date TEXT NOT NULL,
  counted_by TEXT,
  count_finished_at TIMESTAMPTZ,
  approved_by TEXT,
  approved_at TIMESTAMPTZ,
  note TEXT NOT NULL DEFAULT '',
  share_token TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (catalog, service_date)
);
CREATE TABLE IF NOT EXISTS count_entries (
  week_id BIGINT NOT NULL REFERENCES weeks(id) ON DELETE CASCADE,
  item_id BIGINT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  counted_by TEXT,
  counted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (week_id, item_id)
);
CREATE TABLE IF NOT EXISTS list_lines (
  id BIGSERIAL PRIMARY KEY,
  week_id BIGINT NOT NULL REFERENCES weeks(id) ON DELETE CASCADE,
  item_id BIGINT REFERENCES items(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  unit TEXT NOT NULL DEFAULT '',
  reason TEXT NOT NULL DEFAULT '',
  suggested DOUBLE PRECISION NOT NULL DEFAULT 0,
  qty DOUBLE PRECISION NOT NULL DEFAULT 0,
  one_off INTEGER NOT NULL DEFAULT 0,
  removed INTEGER NOT NULL DEFAULT 0,
  bought INTEGER NOT NULL DEFAULT 0,
  bought_qty DOUBLE PRECISION
);
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  catalog TEXT NOT NULL CHECK (catalog IN ('prod', 'test')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL
);
CREATE TABLE IF NOT EXISTS people (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL CHECK (role IN ('admin', 'reviewer')),
  catalog TEXT NOT NULL CHECK (catalog IN ('prod', 'test')),
  pin_hash TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  failed_count INTEGER NOT NULL DEFAULT 0,
  locked_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS person_id BIGINT REFERENCES people(id) ON DELETE CASCADE;
ALTER TABLE people ADD COLUMN IF NOT EXISTS owner BOOLEAN NOT NULL DEFAULT false;
`;

/** Creates any missing tables. Safe to run on every start. */
export async function migrate() {
  await sql(SCHEMA);
}

/** Columns for an item as the app reads them. The photo itself is left out, since it is large. */
export const ITEM_COLS =
  'id, catalog, name, location, unit, mode, min_qty, target_qty, over_bought, expiry_date, current_num, current_level, active, (photo IS NOT NULL) AS has_photo';

export type Item = {
  id: number;
  catalog: Catalog;
  name: string;
  location: string;
  unit: string;
  mode: 'num' | 'lvl';
  min_qty: number | null;
  target_qty: number | null;
  over_bought: number;
  expiry_date: string | null;
  current_num: number;
  current_level: 'Full' | 'Half' | 'Low' | 'Out';
  active: number;
  has_photo: boolean;
};

export type Week = {
  id: number;
  catalog: Catalog;
  service_date: string;
  counted_by: string | null;
  count_finished_at: Date | null;
  approved_by: string | null;
  approved_at: Date | null;
  note: string;
  share_token: string;
};

export type Person = {
  id: number;
  name: string;
  phone: string;
  role: 'admin' | 'reviewer';
  catalog: Catalog;
  owner: boolean;
  pin_hash: string;
  active: boolean;
  failed_count: number;
  locked_until: Date | null;
};

export type ListLine = {
  id: number;
  week_id: number;
  item_id: number | null;
  name: string;
  unit: string;
  reason: string;
  suggested: number;
  qty: number;
  one_off: number;
  removed: number;
  bought: number;
  bought_qty: number | null;
};
