/** Product photos are stored in the database as JPEG bytes, one per item. Keep them small: the upload is capped here. */
const MAX_BYTES = 4 * 1024 * 1024;

/** Checks a JPEG sent as a data URL and returns its bytes. Throws a message the reviewer can read. */
export function photoBytes(dataUrl: string): Buffer {
  const m = /^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!m) throw new Error('Send the product photo as a JPEG.');
  const buf = Buffer.from(m[1], 'base64');
  if (buf.length > MAX_BYTES) throw new Error('That photo is too large. Try again.');
  // JPEG files start with FF D8 FF.
  if (buf[0] !== 0xff || buf[1] !== 0xd8 || buf[2] !== 0xff) throw new Error('That file is not a JPEG photo.');
  return buf;
}
