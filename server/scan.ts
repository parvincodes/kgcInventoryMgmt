import Anthropic from '@anthropic-ai/sdk';
import type { Db } from './db.js';
import { activeItems } from './logic.js';

export type ScanResult = {
  name: string;
  unit: string;
  count: number;
  confidence: 'high' | 'low';
  matchId: number | null;
  matchName: string | null;
};

const DEMO: Omit<ScanResult, 'matchId' | 'matchName'>[] = [
  { name: 'Atta flour', unit: '20 lb bags', count: 2, confidence: 'high' },
  { name: 'Basmati rice', unit: '10 lb bags', count: 1, confidence: 'high' },
  { name: 'Chana dal', unit: '4 lb bags', count: 2, confidence: 'high' },
  { name: 'Ghee', unit: 'jars', count: 2, confidence: 'high' },
  { name: 'White tub, no label', unit: 'tubs', count: 1, confidence: 'low' }
];

function matchCatalog(d: Db, name: string, location: string) {
  const n = name.trim().toLowerCase();
  const items = activeItems(d);
  const hit =
    items.find((i) => i.name.toLowerCase() === n && i.location === location) ??
    items.find((i) => i.name.toLowerCase() === n);
  return hit ? { matchId: hit.id, matchName: hit.name } : { matchId: null, matchName: null };
}

export async function scanPhoto(
  d: Db,
  location: string,
  imageBase64: string,
  mediaType: 'image/jpeg' | 'image/png' | 'image/webp'
): Promise<{ demo: boolean; results: ScanResult[] }> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { demo: true, results: DEMO.map((r) => ({ ...r, ...matchCatalog(d, r.name, location) })) };
  }

  const catalog = activeItems(d).map((i) => `${i.id}: ${i.name} (${i.location}, ${i.unit || 'level'})`);
  const client = new Anthropic({ apiKey });
  const model = process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5';

  const prompt = `This photo shows the "${location}" area of a community (langar) kitchen pantry.
List each distinct product you can see. For each one give:
- "name": a short generic shopping name a volunteer would recognise (e.g. "Atta flour", "Basmati rice", "Dish soap", "Haldi"). Use the brand only if it matters.
- "unit": how it sits on the shelf, plural (e.g. "20 lb bags", "bottles", "packs", "jars").
- "count": your best estimate of how many units are visible (integer).
- "confidence": "high" if you are sure what it is, otherwise "low".
- "matchId": if it is the same product as one of the existing catalog items below, that item's number, else null.

Existing catalog:
${catalog.length ? catalog.join('\n') : '(empty)'}

Reply with only a JSON array, no other text.`;

  const msg = await client.messages.create({
    model,
    max_tokens: 2000,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: imageBase64 } },
          { type: 'text', text: prompt }
        ]
      }
    ]
  });

  const text = msg.content
    .map((b) => (b.type === 'text' ? b.text : ''))
    .join('')
    .trim();
  const start = text.indexOf('[');
  const end = text.lastIndexOf(']');
  if (start < 0 || end < start) throw new Error('The photo could not be read. Try again with better light.');
  const raw = JSON.parse(text.slice(start, end + 1)) as Array<Record<string, unknown>>;

  const validIds = new Map(activeItems(d).map((i) => [i.id, i.name]));
  const results: ScanResult[] = raw
    .filter((r) => typeof r.name === 'string' && (r.name as string).trim())
    .map((r) => {
      const id = typeof r.matchId === 'number' && validIds.has(r.matchId) ? r.matchId : null;
      const fallback = id == null ? matchCatalog(d, String(r.name), location) : null;
      return {
        name: String(r.name).trim(),
        unit: typeof r.unit === 'string' ? r.unit : '',
        count: Math.max(0, Math.round(Number(r.count) || 0)),
        confidence: r.confidence === 'low' ? 'low' : 'high',
        matchId: id ?? fallback!.matchId,
        matchName: id != null ? validIds.get(id)! : fallback!.matchName
      };
    });
  return { demo: false, results };
}
