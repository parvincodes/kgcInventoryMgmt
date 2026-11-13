/**
 * Indian grocery vocabulary, built from the "Indian Grocery Catalog & LLM Integration Guide".
 * Each entry has one canonical name and the other names people use for it (English, Hindi, Punjabi, spellings).
 * Ambiguous words are left out on purpose: "dhania" can mean coriander seeds, powder, or leaves,
 * "methi" can mean fenugreek seeds or leaves, and "sarson" can mean mustard seeds or oil.
 * Brand names are not in this list. Branded packs keep their brand, e.g. "Aashirvaad Atta (whole wheat flour)".
 */
export type GlossaryEntry = {
  name: string;
  category: string;
  unit: string;
  aliases: string[];
};

export const GLOSSARY: GlossaryEntry[] = [
  // Grains & flours
  { name: 'Basmati Rice', category: 'Grains & flours', unit: 'bags', aliases: ['basmati', 'basmati rice', 'basmati chawal'] },
  { name: 'Sona Masoori Rice', category: 'Grains & flours', unit: 'bags', aliases: ['sona masoori', 'sona masoori rice', 'sona masuri'] },
  { name: 'Atta (whole wheat flour)', category: 'Grains & flours', unit: 'bags', aliases: ['atta', 'aata', 'whole wheat flour', 'chakki atta', 'atta flour'] },
  { name: 'Maida (refined wheat flour)', category: 'Grains & flours', unit: 'bags', aliases: ['maida', 'refined wheat flour', 'refined flour', 'all purpose flour'] },
  { name: 'Besan (gram flour)', category: 'Grains & flours', unit: 'bags', aliases: ['besan', 'gram flour', 'chana flour', 'chickpea flour'] },
  { name: 'Sooji (semolina)', category: 'Grains & flours', unit: 'bags', aliases: ['sooji', 'suji', 'rava', 'semolina'] },

  // Lentils & pulses (dals)
  { name: 'Toor Dal', category: 'Lentils & pulses', unit: 'packs', aliases: ['toor dal', 'tur dal', 'toovar dal', 'arhar dal', 'arhar', 'pigeon pea dal', 'pigeon peas dal'] },
  { name: 'Moong Dal', category: 'Lentils & pulses', unit: 'packs', aliases: ['moong dal', 'mung dal', 'moong', 'yellow moong dal'] },
  { name: 'Chana Dal', category: 'Lentils & pulses', unit: 'packs', aliases: ['chana dal', 'bengal gram dal', 'split chickpeas'] },
  { name: 'Urad Dal', category: 'Lentils & pulses', unit: 'packs', aliases: ['urad dal', 'urad', 'black gram dal', 'maah dal'] },
  { name: 'Masoor Dal', category: 'Lentils & pulses', unit: 'packs', aliases: ['masoor dal', 'masar dal', 'red lentils', 'red lentil'] },
  { name: 'Rajma (kidney beans)', category: 'Lentils & pulses', unit: 'packs', aliases: ['rajma', 'kidney beans', 'red kidney beans'] },
  { name: 'Kabuli Chana (chickpeas)', category: 'Lentils & pulses', unit: 'packs', aliases: ['kabuli chana', 'kabli chana', 'chole', 'chickpeas', 'kabuli chickpeas', 'safed chana'] },

  // Oils & ghee
  { name: 'Mustard Oil', category: 'Oils & ghee', unit: 'bottles', aliases: ['mustard oil', 'sarson da tel', 'sarson ka tel', 'kacchi ghani mustard oil'] },
  { name: 'Sunflower Oil', category: 'Oils & ghee', unit: 'bottles', aliases: ['sunflower oil', 'suraj mukhi tel', 'refined sunflower oil'] },
  { name: 'Groundnut Oil', category: 'Oils & ghee', unit: 'bottles', aliases: ['groundnut oil', 'peanut oil', 'moongphali tel'] },
  { name: 'Coconut Oil', category: 'Oils & ghee', unit: 'bottles', aliases: ['coconut oil', 'nariyal tel'] },
  { name: 'Ghee', category: 'Oils & ghee', unit: 'tins', aliases: ['ghee', 'desi ghee', 'pure ghee', 'clarified butter'] },

  // Dairy
  { name: 'Milk', category: 'Dairy', unit: 'cartons', aliases: ['milk', 'doodh'] },
  { name: 'Paneer', category: 'Dairy', unit: 'packs', aliases: ['paneer', 'cottage cheese'] },
  { name: 'Curd (yogurt)', category: 'Dairy', unit: 'tubs', aliases: ['curd', 'dahi', 'yogurt', 'yoghurt'] },
  { name: 'Butter', category: 'Dairy', unit: 'packs', aliases: ['butter', 'makhan', 'table butter'] },
  { name: 'Buttermilk (lassi)', category: 'Dairy', unit: 'cartons', aliases: ['buttermilk', 'chaas', 'chhaas', 'lassi'] },

  // Fresh vegetables
  { name: 'Tomatoes', category: 'Vegetables', unit: 'kg', aliases: ['tomato', 'tomatoes', 'tamatar'] },
  { name: 'Potatoes', category: 'Vegetables', unit: 'kg', aliases: ['potato', 'potatoes', 'aloo', 'alu'] },
  { name: 'Onions', category: 'Vegetables', unit: 'kg', aliases: ['onion', 'onions', 'pyaz', 'kanda'] },
  { name: 'Red onions', category: 'Vegetables', unit: 'kg', aliases: ['red onion', 'red onions'] },
  { name: 'Green chillies', category: 'Vegetables', unit: 'kg', aliases: ['green chilli', 'green chilli peppers', 'green chillies', 'green chili', 'hari mirch'] },
  { name: 'Fresh coriander', category: 'Vegetables', unit: 'bunches', aliases: ['fresh coriander', 'coriander leaves', 'hara dhania', 'cilantro'] },
  { name: 'Ginger', category: 'Vegetables', unit: 'kg', aliases: ['ginger', 'adrak'] },
  { name: 'Garlic', category: 'Vegetables', unit: 'bulbs', aliases: ['garlic', 'lehsun', 'lasan'] },
  { name: 'Okra (bhindi)', category: 'Vegetables', unit: 'kg', aliases: ['okra', 'bhindi', 'lady finger', 'ladyfinger'] },
  { name: 'Eggplant (baingan)', category: 'Vegetables', unit: 'kg', aliases: ['eggplant', 'aubergine', 'baingan', 'brinjal'] },

  // Fresh fruit
  { name: 'Mangoes', category: 'Fruit', unit: 'pieces', aliases: ['mango', 'mangoes', 'aam'] },
  { name: 'Bananas', category: 'Fruit', unit: 'bunches', aliases: ['banana', 'bananas', 'kela'] },
  { name: 'Apples', category: 'Fruit', unit: 'pieces', aliases: ['apple', 'apples', 'seb'] },
  { name: 'Pomegranates', category: 'Fruit', unit: 'pieces', aliases: ['pomegranate', 'pomegranates', 'anar'] },
  { name: 'Guavas', category: 'Fruit', unit: 'pieces', aliases: ['guava', 'guavas', 'amrood'] },

  // Spices: everyday
  { name: 'Turmeric powder (haldi)', category: 'Spices', unit: 'packs', aliases: ['turmeric', 'turmeric powder', 'haldi', 'haldi powder'] },
  { name: 'Cumin seeds (jeera)', category: 'Spices', unit: 'packs', aliases: ['cumin', 'cumin seeds', 'jeera', 'zeera', 'jeera seeds'] },
  { name: 'Cumin powder (jeera powder)', category: 'Spices', unit: 'packs', aliases: ['cumin powder', 'jeera powder'] },
  { name: 'Coriander powder (dhania powder)', category: 'Spices', unit: 'packs', aliases: ['coriander powder', 'dhania powder', 'dhaniya powder'] },
  { name: 'Red chilli powder (lal mirch)', category: 'Spices', unit: 'packs', aliases: ['red chilli powder', 'red chili powder', 'lal mirch', 'lal mirch powder', 'chilli powder'] },
  { name: 'Green cardamom (choti elaichi)', category: 'Spices', unit: 'packs', aliases: ['green cardamom', 'cardamom', 'elaichi', 'choti elaichi'] },
  { name: 'Black cardamom (badi elaichi)', category: 'Spices', unit: 'packs', aliases: ['black cardamom', 'badi elaichi'] },
  { name: 'Cinnamon (dalchini)', category: 'Spices', unit: 'packs', aliases: ['cinnamon', 'dalchini', 'cassia bark'] },
  { name: 'Cloves (laung)', category: 'Spices', unit: 'packs', aliases: ['cloves', 'clove', 'laung', 'lavang'] },
  { name: 'Black pepper (kali mirch)', category: 'Spices', unit: 'packs', aliases: ['black pepper', 'kali mirch', 'whole black pepper'] },
  { name: 'Garam masala', category: 'Spices', unit: 'packs', aliases: ['garam masala'] },
  { name: 'Bay leaves (tej patta)', category: 'Spices', unit: 'packs', aliases: ['bay leaf', 'bay leaves', 'tej patta'] },
  { name: 'Asafoetida (hing)', category: 'Spices', unit: 'packs', aliases: ['asafoetida', 'hing'] },
  { name: 'Salt (namak)', category: 'Spices', unit: 'packs', aliases: ['salt', 'namak'] },

  // Spice box (masala dabba)
  { name: 'Mustard seeds (rai)', category: 'Spice box', unit: 'packs', aliases: ['mustard seeds', 'mustard seed', 'rai', 'rai seeds'] },
  { name: 'Fennel seeds (saunf)', category: 'Spice box', unit: 'packs', aliases: ['fennel', 'fennel seeds', 'saunf'] },
  { name: 'Star anise (chakra phool)', category: 'Spice box', unit: 'packs', aliases: ['star anise', 'chakra phool', 'chakri phool'] },
  { name: 'Fenugreek seeds (methi dana)', category: 'Spice box', unit: 'packs', aliases: ['fenugreek seeds', 'fenugreek', 'methi seeds', 'methi dana'] },
  { name: 'Carom seeds (ajwain)', category: 'Spice box', unit: 'packs', aliases: ['ajwain', 'carom seeds', 'carom'] },
  { name: 'Nigella seeds (kalonji)', category: 'Spice box', unit: 'packs', aliases: ['kalonji', 'nigella seeds', 'nigella', 'black seeds'] },
];

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** Maps every normalised name and alias to its canonical name. */
const index = new Map<string, string>();
for (const e of GLOSSARY) {
  for (const a of [e.name, ...e.aliases]) index.set(norm(a), e.name);
}

/** The canonical glossary name for a raw name, or the raw name (trimmed) when it isn't in the glossary. */
export function canonicalName(raw: string): string {
  const s = raw.trim();
  return index.get(norm(s)) ?? s;
}

/** True when two names refer to the same product once glossary aliases are applied. */
export function sameProduct(a: string, b: string): boolean {
  return canonicalName(a).toLowerCase() === canonicalName(b).toLowerCase();
}

/** The glossary as plain text for the photo prompt, so the model uses the same names the app does. */
export function glossaryForPrompt(): string {
  return GLOSSARY.map((e) => `- ${e.name} (also: ${e.aliases.join(', ')})`).join('\n');
}

/** Every alias that appears under more than one canonical name. Should always be empty. */
export function aliasClashes(): string[] {
  const seen = new Map<string, string>();
  const clashes: string[] = [];
  for (const e of GLOSSARY) {
    for (const a of [e.name, ...e.aliases]) {
      const k = norm(a);
      const prev = seen.get(k);
      if (prev && prev !== e.name) clashes.push(`"${a}" is under both "${prev}" and "${e.name}"`);
      seen.set(k, e.name);
    }
  }
  return clashes;
}

/**
 * Punjabi (Gurmukhi) display names, keyed by canonical glossary name. Stored items stay in English;
 * these are only shown when the app is set to Punjabi. Brand names are never translated.
 */
export const PUNJABI_NAMES: Record<string, string> = {
  'Basmati Rice': 'ਬਾਸਮਤੀ ਚਾਵਲ',
  'Sona Masoori Rice': 'ਸੋਨਾ ਮਸੂਰੀ ਚਾਵਲ',
  'Atta (whole wheat flour)': 'ਕਣਕ ਦਾ ਆਟਾ',
  'Maida (refined wheat flour)': 'ਮੈਦਾ',
  'Besan (gram flour)': 'ਬੇਸਣ',
  'Sooji (semolina)': 'ਸੂਜੀ',
  'Toor Dal': 'ਤੂਰ ਦਾਲ',
  'Moong Dal': 'ਮੂੰਗ ਦਾਲ',
  'Chana Dal': 'ਚਨਾ ਦਾਲ',
  'Urad Dal': 'ਉੜਦ ਦਾਲ',
  'Masoor Dal': 'ਮਸਰ ਦਾਲ',
  'Rajma (kidney beans)': 'ਰਾਜਮਾਂਹ',
  'Kabuli Chana (chickpeas)': 'ਕਾਬਲੀ ਛੋਲੇ',
  'Mustard Oil': 'ਸਰ੍ਹੋਂ ਦਾ ਤੇਲ',
  'Sunflower Oil': 'ਸੂਰਜਮੁਖੀ ਦਾ ਤੇਲ',
  'Groundnut Oil': 'ਮੂੰਗਫਲੀ ਦਾ ਤੇਲ',
  'Coconut Oil': 'ਨਾਰੀਅਲ ਦਾ ਤੇਲ',
  Ghee: 'ਘਿਓ',
  Milk: 'ਦੁੱਧ',
  Paneer: 'ਪਨੀਰ',
  'Curd (yogurt)': 'ਦਹੀਂ',
  Butter: 'ਮੱਖਣ',
  'Buttermilk (lassi)': 'ਛਾਹ',
  Tomatoes: 'ਟਮਾਟਰ',
  Potatoes: 'ਆਲੂ',
  Onions: 'ਪਿਆਜ਼',
  'Red onions': 'ਲਾਲ ਪਿਆਜ਼',
  'Green chillies': 'ਹਰੀ ਮਿਰਚ',
  'Fresh coriander': 'ਹਰਾ ਧਨੀਆ',
  Ginger: 'ਅਦਰਕ',
  Garlic: 'ਲਸਣ',
  'Okra (bhindi)': 'ਭਿੰਡੀ',
  'Eggplant (baingan)': 'ਬੈਂਗਣ',
  Mangoes: 'ਅੰਬ',
  Bananas: 'ਕੇਲੇ',
  Apples: 'ਸੇਬ',
  Pomegranates: 'ਅਨਾਰ',
  Guavas: 'ਅਮਰੂਦ',
  'Turmeric powder (haldi)': 'ਹਲਦੀ',
  'Cumin seeds (jeera)': 'ਜ਼ੀਰਾ',
  'Cumin powder (jeera powder)': 'ਜ਼ੀਰਾ ਪਾਊਡਰ',
  'Coriander powder (dhania powder)': 'ਧਨੀਆ ਪਾਊਡਰ',
  'Red chilli powder (lal mirch)': 'ਲਾਲ ਮਿਰਚ ਪਾਊਡਰ',
  'Green cardamom (choti elaichi)': 'ਛੋਟੀ ਇਲਾਇਚੀ',
  'Black cardamom (badi elaichi)': 'ਵੱਡੀ ਇਲਾਇਚੀ',
  'Cinnamon (dalchini)': 'ਦਾਲਚੀਨੀ',
  'Cloves (laung)': 'ਲੌਂਗ',
  'Black pepper (kali mirch)': 'ਕਾਲੀ ਮਿਰਚ',
  'Garam masala': 'ਗਰਮ ਮਸਾਲਾ',
  'Bay leaves (tej patta)': 'ਤੇਜ ਪੱਤਾ',
  'Asafoetida (hing)': 'ਹਿੰਗ',
  'Salt (namak)': 'ਲੂਣ',
  'Mustard seeds (rai)': 'ਰਾਈ',
  'Fennel seeds (saunf)': 'ਸੌਂਫ',
  'Star anise (chakra phool)': 'ਚਕਰਫੂਲ',
  'Fenugreek seeds (methi dana)': 'ਮੇਥੀ ਦਾਣਾ',
  'Carom seeds (ajwain)': 'ਅਜਵਾਇਣ',
  'Nigella seeds (kalonji)': 'ਕਲੌਂਜੀ'
};

/** The Punjabi name for a product, or null if the glossary has no translation for it. */
export function punjabiName(name: string): string | null {
  return Object.prototype.hasOwnProperty.call(PUNJABI_NAMES, canonicalName(name)) ? PUNJABI_NAMES[canonicalName(name)] : null;
}
