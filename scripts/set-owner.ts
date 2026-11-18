/**
 * Makes one person the owner. There is only one owner. The owner is the only one who can remove people or reset PINs.
 *
 * usage: npm run set-owner -- --phone 408-564-9615
 */
import 'dotenv/config';
import { closeDb, migrate, sql } from '../server/db.js';
import { normalizePhone } from '../server/people.js';

async function main() {
  const phone = normalizePhone(process.argv[process.argv.indexOf('--phone') + 1] ?? '');
  if (!phone) throw new Error('Give a US phone number: --phone 408-564-9615');
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not set.');
  await migrate();
  const found = await sql('SELECT name, role, active FROM people WHERE phone = $1', [phone]);
  if (!found.rowCount) throw new Error(`No one on the list has ${phone}. Add them first.`);
  const p = found.rows[0];
  if (p.role !== 'admin' || !p.active) throw new Error(`${p.name} must be an active admin to be the owner.`);
  await sql('UPDATE people SET owner = (phone = $1)', [phone]);
  console.log(`${p.name} (${phone}) is now the owner. No one else is.`);
}

main()
  .catch((e) => {
    console.error(`\nNot changed: ${e.message}`);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
