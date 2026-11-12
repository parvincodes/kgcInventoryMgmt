import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

const dataDir = path.resolve(process.cwd(), 'data');
fs.mkdirSync(dataDir, { recursive: true });

export const db = new Database(path.join(dataDir, 'pantry.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
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
`);

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
