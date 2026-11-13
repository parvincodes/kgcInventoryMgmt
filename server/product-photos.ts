import fs from 'node:fs';
import path from 'node:path';
import { Catalog, DATA_DIR } from './db.js';

/** Product photos live outside the database, one JPEG per item, in a folder per catalog. */
const MAX_BYTES = 4 * 1024 * 1024;

const dirFor = (catalog: Catalog) => path.join(DATA_DIR, 'product-images', catalog);

/** Saves a JPEG sent as a data URL for an item. Returns the stored file name. */
export function savePhoto(catalog: Catalog, itemId: number, dataUrl: string): string {
  const m = /^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!m) throw new Error('Send the product photo as a JPEG.');
  const buf = Buffer.from(m[1], 'base64');
  if (buf.length > MAX_BYTES) throw new Error('That photo is too large. Try again.');
  // JPEG files start with FF D8 FF.
  if (buf[0] !== 0xff || buf[1] !== 0xd8 || buf[2] !== 0xff) throw new Error('That file is not a JPEG photo.');
  fs.mkdirSync(dirFor(catalog), { recursive: true });
  const file = `${itemId}.jpg`;
  fs.writeFileSync(path.join(dirFor(catalog), file), buf);
  return file;
}

export function photoPath(catalog: Catalog, file: string): string {
  return path.join(dirFor(catalog), path.basename(file));
}

export function readPhotoBase64(catalog: Catalog, file: string): string {
  return fs.readFileSync(photoPath(catalog, file)).toString('base64');
}

export function deletePhoto(catalog: Catalog, file: string) {
  fs.rmSync(photoPath(catalog, file), { force: true });
}
