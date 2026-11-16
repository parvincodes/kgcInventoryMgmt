/**
 * Adds someone to the allow list and prints their personal PIN once.
 *
 * usage: DATABASE_URL=... node_modules/.bin/tsx scripts/add-person.ts --name "Harpreet" --phone 202-555-0100 --role admin --catalog prod
 *
 * --role is admin or reviewer (default reviewer). --catalog is prod or test (default prod).
 * --pin sets the PIN (4 to 8 digits). Without it, a random 6-digit PIN is made and printed once.
 * Share the PIN with the person in person, or over WhatsApp. Admins can change it later from the People screen.
 */
import 'dotenv/config';
import { Catalog, closeDb, migrate } from '../server/db.js';
import { addPerson, normalizePhone, randomPin, Role, validPin } from '../server/people.js';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const name = arg('name')?.trim();
  const phone = normalizePhone(arg('phone') ?? '');
  const role = (arg('role') ?? 'reviewer') as Role;
  const catalog = (arg('catalog') ?? 'prod') as Catalog;
  if (!name) throw new Error('Give a name: --name "Harpreet"');
  if (!phone) throw new Error('Give a US phone number with the area code: --phone 202-555-0100');
  if (role !== 'admin' && role !== 'reviewer') throw new Error('--role must be admin or reviewer');
  if (catalog !== 'prod' && catalog !== 'test') throw new Error('--catalog must be prod or test');
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not set.');

  await migrate();
  const pin = arg('pin') ?? randomPin();
  if (!validPin(pin)) throw new Error('--pin must be 4 to 8 digits');
  await addPerson({ name, phone, role, catalog, pin });
  console.log(`\nAdded ${name} (${phone}), ${role}, ${catalog} catalog.`);
  console.log(`Personal PIN: ${pin}`);
  console.log('Share it with them now. It is not shown again.\n');
}

main()
  .catch((e) => {
    console.error(`\nNot added: ${e.message}`);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
