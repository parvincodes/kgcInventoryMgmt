import Anthropic from '@anthropic-ai/sdk';
import { activeItems } from './logic.js';
import { canonicalName, glossaryForPrompt, sameProduct } from './grocery-glossary.js';
import { Catalog, Item, sql } from './db.js';

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

function matchCatalog(items: Item[], name: string, location: string) {
  const hit =
    items.find((i) => sameProduct(i.name, name) && i.location === location) ??
    items.find((i) => sameProduct(i.name, name));
  return hit ? { matchId: hit.id, matchName: hit.name } : { matchId: null, matchName: null };
}

/** Identifies the one product in a close-up photo. Used when adding a single item from the catalog screen. */
export async function identifyProduct(
  imageBase64: string,
  mediaType: 'image/jpeg' | 'image/png' | 'image/webp'
): Promise<{ demo: boolean; name: string | null; unit: string; confidence: 'high' | 'low' }> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return { demo: true, name: null, unit: '', confidence: 'low' };

  const client = new Anthropic({ apiKey, timeout: 60_000, maxRetries: 2 });
  const model = process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5';
  const prompt = `This photo shows one grocery product, close up, for a community (langar) kitchen pantry. Identify it.
Reply with only a JSON object: {"name": string or null, "unit": string, "confidence": "high" or "low"}.
- "name": if the product is in the glossary below, use its glossary name exactly. For a branded pack, put the brand first. Otherwise a short plain English name. Use null if you cannot tell what it is.
- "unit": how it is sold, plural (e.g. "bags", "bottles", "packs").
- "confidence": "high" only if you are sure.

Indian grocery glossary (canonical name, then other names people use for it):
${glossaryForPrompt()}`;

  const msg = await client.messages.create({
    model,
    max_tokens: 300,
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
  const text = msg.content.map((b) => (b.type === 'text' ? b.text : '')).join('').trim();
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end < start) throw new Error('The product could not be read.');
  const raw = JSON.parse(text.slice(start, end + 1)) as { name?: unknown; unit?: unknown; confidence?: unknown };
  const name = typeof raw.name === 'string' && raw.name.trim() ? canonicalName(raw.name) : null;
  return {
    demo: false,
    name,
    unit: typeof raw.unit === 'string' ? raw.unit : '',
    confidence: raw.confidence === 'high' ? 'high' : 'low'
  };
}

export async function scanPhoto(
  catalog: Catalog,
  location: string,
  imageBase64: string,
  mediaType: 'image/jpeg' | 'image/png' | 'image/webp'
): Promise<{ demo: boolean; results: ScanResult[] }> {
  const items = await activeItems(sql, catalog);
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return {
      demo: true,
      results: DEMO.map((r) => ({ ...r, name: canonicalName(r.name), ...matchCatalog(items, r.name, location) }))
    };
  }

  const catalogLines = items.map((i) => `${i.id}: ${i.name} (${i.location}, ${i.unit || 'level'})`);
  const client = new Anthropic({ apiKey, timeout: 90_000, maxRetries: 2 });
  const model = process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5';

  const prompt = `This photo shows the "${location}" area of a community (langar) kitchen pantry.
List each distinct product you can see. For each one give:
- "name": a short generic shopping name a volunteer would recognise. Where the product is in the glossary below, use its glossary name exactly. Otherwise use a plain English name (e.g. "Dish soap"). For a branded pack, put the brand first (e.g. "Aashirvaad Atta (whole wheat flour)").
- "unit": how it sits on the shelf, plural (e.g. "20 lb bags", "bottles", "packs", "jars").
- "count": your best estimate of how many units are visible (integer).
- "confidence": "high" if you are sure what it is, otherwise "low".
- "matchId": if it is the same product as one of the existing catalog items below, that item's number, else null.

Indian grocery glossary (canonical name, then other names people use for it):
${glossaryForPrompt()}

Existing catalog:
${catalogLines.length ? catalogLines.join('\n') : '(empty)'}

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

  const validIds = new Map(items.map((i) => [i.id, i.name]));
  const results: ScanResult[] = raw
    .filter((r) => typeof r.name === 'string' && (r.name as string).trim())
    .map((r) => {
      const id = typeof r.matchId === 'number' && validIds.has(r.matchId) ? r.matchId : null;
      const fallback = id == null ? matchCatalog(items, String(r.name), location) : null;
      return {
        name: canonicalName(String(r.name)),
        unit: typeof r.unit === 'string' ? r.unit : '',
        count: Math.max(0, Math.round(Number(r.count) || 0)),
        confidence: r.confidence === 'low' ? 'low' : 'high',
        matchId: id ?? fallback!.matchId,
        matchName: id != null ? validIds.get(id)! : fallback!.matchName
      };
    });
  return { demo: false, results };
}
