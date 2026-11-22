import 'dotenv/config';
import crypto from 'node:crypto';
import os from 'node:os';
import pg from 'pg';
import { afterAll } from 'vitest';
import { closeDb, migrate } from '../server/db.js';
import { seedPeople } from './seed.js';

// Tests only ever use a local Postgres. The hosted DATABASE_URL in .env is deliberately ignored here.
const url = process.env.TEST_DATABASE_URL || `postgres://${os.userInfo().username}@localhost:5433/langar_test`;
const host = new URL(url).hostname;
if (host !== 'localhost' && host !== '127.0.0.1') {
  throw new Error(`Tests refuse to run against a non-local database (host "${host}"). Set TEST_DATABASE_URL to a local database.`);
}

// Each test file gets its own schema, so files can run in parallel without touching each other's rows.
const schema = `t_${crypto.randomBytes(6).toString('hex')}`;
const admin = new pg.Client({ connectionString: url });
await admin.connect();
await admin.query(`CREATE SCHEMA "${schema}"`);
await admin.end();

process.env.DATABASE_URL = url;
// The tests always use their own database, even if DATABASE_TEST_URL is set for local runs.
delete process.env.DATABASE_TEST_URL;
process.env.PG_SCHEMA = schema;
// Tests never call Claude. The photo-recognition suite opts in with RUN_PHOTO_TESTS=1.
if (!process.env.RUN_PHOTO_TESTS) process.env.ANTHROPIC_API_KEY = '';

await migrate();

// Test accounts: production admins and reviewers, and a testing admin (see seed.ts).
await seedPeople();

afterAll(async () => {
  await closeDb();
  const c = new pg.Client({ connectionString: url });
  await c.connect();
  await c.query(`DROP SCHEMA "${schema}" CASCADE`);
  await c.end();
});
