import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { post, serve, signIn, Session, PROD_PIN } from './helpers.js';

/**
 * Live test: sends each photo in tests/photos/manifest.json to Claude and checks the expected items came back.
 * Costs a few cents per photo. Runs only with `npm run test:photos` (RUN_PHOTO_TESTS=1 and ANTHROPIC_API_KEY set).
 */
const here = path.dirname(fileURLToPath(import.meta.url));
const photosDir = path.join(here, 'photos');
const manifestPath = path.join(photosDir, 'manifest.json');

type Expected = { name: string; count?: number };
type Case = { file: string; location: string; expect: Expected[] };

const live = !!process.env.RUN_PHOTO_TESTS && !!process.env.ANTHROPIC_API_KEY;
const MIN_RECALL = Number(process.env.PHOTO_MIN_RECALL || 0.8);
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
const sameItem = (a: string, b: string) => {
  const x = norm(a);
  const y = norm(b);
  return x === y || x.includes(y) || y.includes(x);
};

describe.skipIf(!live)('photo recognition (live Claude)', () => {
  let s: Session;
  const cases: Case[] = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, 'utf8')).photos ?? [] : [];

  beforeAll(async () => {
    await serve.startServer();
    s = await signIn(PROD_PIN, 'Photo test');
  });
  afterAll(async () => {
    await serve.stopServer();
  });

  it('has at least one photo in the manifest', () => {
    expect(cases.length, 'add photos and expected items to tests/photos/manifest.json').toBeGreaterThan(0);
  });

  it.skipIf(cases.length === 0)(`finds the expected items in at least ${MIN_RECALL * 100}% of listed items`, async () => {
    let expectedTotal = 0;
    let found = 0;
    const misses: string[] = [];

    for (const c of cases) {
      const file = path.join(photosDir, c.file);
      const ext = path.extname(c.file).toLowerCase();
      const mime = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
      const image = `data:${mime};base64,${fs.readFileSync(file).toString('base64')}`;

      const r = await post(s, '/api/scan', { location: c.location, image });
      expect(r.status, `scan of ${c.file}: ${JSON.stringify(r.body)}`).toBe(200);
      expect(r.body.demo).toBe(false);

      for (const e of c.expect) {
        expectedTotal++;
        const hit = r.body.results.find((x: any) => sameItem(x.name, e.name) && (e.count == null || x.count === e.count));
        if (hit) found++;
        else misses.push(`${c.file}: expected "${e.name}"${e.count != null ? ` ×${e.count}` : ''}, got ${JSON.stringify(r.body.results.map((x: any) => `${x.name} ×${x.count}`))}`);
      }
    }

    const recall = expectedTotal ? found / expectedTotal : 0;
    console.log(`photo recall: ${found}/${expectedTotal} = ${(recall * 100).toFixed(0)}%`);
    if (misses.length) console.log(misses.join('\n'));
    expect(recall).toBeGreaterThanOrEqual(MIN_RECALL);
  }, 600000);
});
