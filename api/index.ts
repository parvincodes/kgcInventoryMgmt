import type { IncomingMessage, ServerResponse } from 'node:http';
import { app } from '../server/index.js';
import { migrate } from '../server/db.js';

// Vercel starts new instances on demand. Each instance creates the tables once, then reuses them.
// If the first attempt fails, the next request tries again.
let ready: Promise<void> | null = null;
function ensureTables(): Promise<void> {
  if (!ready) {
    ready = migrate().catch((e) => {
      ready = null;
      throw e;
    });
  }
  return ready;
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  try {
    await ensureTables();
  } catch (e) {
    console.error('database setup failed', e);
    res.statusCode = 503;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'The database is not reachable. Try again in a minute.' }));
    return;
  }
  return app(req as any, res as any);
}
