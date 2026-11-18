import crypto from 'node:crypto';
import { Catalog, sql } from './db.js';

export type Role = 'admin' | 'reviewer';

/** Accepts a US number in most common forms and returns it as +1XXXXXXXXXX, or null if it isn't one. */
export function normalizePhone(raw: string): string | null {
  const digits = String(raw ?? '').replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return null;
}

/** A personal PIN is 4 to 8 digits. */
export function validPin(pin: string): boolean {
  return /^\d{4,8}$/.test(pin);
}

/** Stores a PIN as a salted scrypt hash. The PIN itself is never kept. */
export function hashPin(pin: string): string {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(pin, salt, 32);
  return `scrypt$${salt.toString('base64')}$${hash.toString('base64')}`;
}

export function checkPin(pin: string, stored: string): boolean {
  const [scheme, saltB64, hashB64] = stored.split('$');
  if (scheme !== 'scrypt' || !saltB64 || !hashB64) return false;
  const expected = Buffer.from(hashB64, 'base64');
  const actual = crypto.scryptSync(pin, Buffer.from(saltB64, 'base64'), expected.length);
  return crypto.timingSafeEqual(actual, expected);
}

/** A random 6-digit PIN, for the script that adds people. Shown once, then shared in person. */
export function randomPin(): string {
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
}

export async function addPerson(p: { name: string; phone: string; role: Role; catalog: Catalog; pin: string; owner?: boolean }) {
  const r = await sql(
    'INSERT INTO people (name, phone, role, catalog, pin_hash, owner) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id',
    [p.name, p.phone, p.role, p.catalog, hashPin(p.pin), p.owner ?? false]
  );
  return r.rows[0].id as number;
}

export const LOCK_ATTEMPTS = 5;
export const LOCK_MINUTES = 15;
