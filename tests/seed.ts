import { addPerson, Role } from '../server/people.js';
import { Catalog } from '../server/db.js';

/** The three test accounts. setup.ts creates them once, and resetDb puts them back before each test. */
export const SEED: { name: string; phone: string; role: Role; catalog: Catalog; pin: string; owner?: boolean }[] = [
  { name: 'Prod Admin', phone: '+12025550100', role: 'admin', catalog: 'prod', pin: '123456', owner: true },
  { name: 'Prod Admin 2', phone: '+12025550103', role: 'admin', catalog: 'prod', pin: '333444' },
  { name: 'Prod Reviewer', phone: '+12025550102', role: 'reviewer', catalog: 'prod', pin: '111222' },
  { name: 'Test Admin', phone: '+12025550101', role: 'admin', catalog: 'test', pin: '654321' }
];

export async function seedPeople() {
  for (const p of SEED) await addPerson(p);
}
