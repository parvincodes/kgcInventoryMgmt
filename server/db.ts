import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

// DATA_DIR lets tests point at a throwaway folder. Normally this is ./data.
const dataDir = path.resolve(process.env.DATA_DIR || path.join(process.cwd(), 'data'));
export const DATA_DIR = dataDir;
fs.mkdirSync(dataDir, { recursive: true });

/**
 * Two completely separate catalogs, each with its own database file.
 * The PIN a reviewer signs in with decides which one they get.
 * The testing file keeps the original pantry.db so existing test data is untouched.
 */
export type Catalog = 'prod' | 'test';
export const CATALOGS: Record<Catalog, { label: string; file: string }> = {
  prod: { label: 'Khalsa Gurmat School', file: 'production.db' },
  test: { label: 'Testing', file: 'pantry.db' }
};
export const CATALOG_IDS: Catalog[] = ['prod', 'test'];

export type Db = Database.Database;

/**
 * Sign-in sessions. Shared by both catalogs: a session records who signed in and which catalog their PIN opened.
 * The browser holds only a random session ID; the server checks it here on every request.
 */
const authFile = new Database(path.join(dataDir, 'auth.db'));
authFile.pragma('journal_mode = WAL');
authFile.exec(`
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  catalog TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
`);
export const authDb: Db = authFile;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  location TEXT NOT NULL DEFAULT 'Shelves',
  unit TEXT NOT NULL DEFAULT '',
  mode TEXT NOT NULL DEFAULT 'num' CHECK (mode IN ('num','lvl')),
  min_qty REAL,
  target_qty REAL,
  over_bought INTEGER NOT NULL DEFAULT 0,
  expiry_date TEXT,
  current_num REAL NOT NULL DEFAULT 0,
  current_level TEXT NOT NULL DEFAULT 'Full' CHECK (current_level IN ('Full','Half','Low','Out')),
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS weeks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  service_date TEXT NOT NULL UNIQUE,
  counted_by TEXT,
  count_finished_at TEXT,
  approved_by TEXT,
  approved_at TEXT,
  note TEXT NOT NULL DEFAULT '',
  share_token TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS count_entries (
  week_id INTEGER NOT NULL REFERENCES weeks(id) ON DELETE CASCADE,
  item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  counted_by TEXT,
  counted_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (week_id, item_id)
);

CREATE TABLE IF NOT EXISTS list_lines (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  week_id INTEGER NOT NULL REFERENCES weeks(id) ON DELETE CASCADE,
  item_id INTEGER REFERENCES items(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  unit TEXT NOT NULL DEFAULT '',
  reason TEXT NOT NULL DEFAULT '',
  suggested REAL NOT NULL DEFAULT 0,
  qty REAL NOT NULL DEFAULT 0,
  one_off INTEGER NOT NULL DEFAULT 0,
  removed INTEGER NOT NULL DEFAULT 0,
  bought INTEGER NOT NULL DEFAULT 0,
  bought_qty REAL
);
`;

function openDb(file: string): Db {
  const d = new Database(path.join(dataDir, file));
  d.pragma('journal_mode = WAL');
  d.pragma('foreign_keys = ON');
  d.exec(SCHEMA);
  // Migration: product photos. Older databases don't have this column yet.
  const cols = d.prepare('PRAGMA table_info(items)').all() as { name: string }[];
  if (!cols.some((c) => c.name === 'image_file')) d.exec('ALTER TABLE items ADD COLUMN image_file TEXT');
  return d;
}

const opened: Partial<Record<Catalog, Db>> = {};
export function dbFor(catalog: Catalog): Db {
  return (opened[catalog] ??= openDb(CATALOGS[catalog].file));
}

export type Item = {
  id: number;
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
  image_file: string | null;
};

export type Week = {
  id: number;
  service_date: string;
  counted_by: string | null;
  count_finished_at: string | null;
  approved_by: string | null;
  approved_at: string | null;
  note: string;
  share_token: string;
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

export const LOCATIONS = ['Kitchen', 'Shelves', 'Fridge', 'Freezer'] as const;
export const LEVELS = ['Full', 'Half', 'Low', 'Out'] as const;
