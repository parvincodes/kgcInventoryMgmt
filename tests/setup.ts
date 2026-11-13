import 'dotenv/config';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Every test file gets a fresh database folder, fixed PINs, and no real Claude key.
// The photo-recognition suite is the only one that calls Claude; it sets RUN_PHOTO_TESTS=1 to opt in.
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'langar-test-'));
process.env.REVIEWER_PIN = '1111';
process.env.TEST_PIN = '2222';
process.env.SESSION_SECRET = 'test-secret';
if (!process.env.RUN_PHOTO_TESTS) process.env.ANTHROPIC_API_KEY = '';
