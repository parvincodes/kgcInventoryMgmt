import { describe, expect, it } from 'vitest';
import { aliasClashes, canonicalName, GLOSSARY, sameProduct } from '../server/grocery-glossary.js';

describe('Indian grocery glossary', () => {
  it('has no name that points at two different products', () => {
    expect(aliasClashes()).toEqual([]);
  });

  it('gives every entry a name, a category and a unit', () => {
    for (const e of GLOSSARY) {
      expect(e.name.trim(), e.name).not.toBe('');
      expect(e.category.trim(), e.name).not.toBe('');
      expect(e.unit.trim(), e.name).not.toBe('');
    }
  });

  it('maps Hindi, Punjabi and English names to one canonical name', () => {
    expect(canonicalName('Arhar Dal')).toBe('Toor Dal');
    expect(canonicalName('tur dal')).toBe('Toor Dal');
    expect(canonicalName('Toor Dal')).toBe('Toor Dal');
    expect(canonicalName('jeera')).toBe('Cumin seeds (jeera)');
    expect(canonicalName('Haldi')).toBe('Turmeric powder (haldi)');
    expect(canonicalName('  Chole  ')).toBe('Kabuli Chana (chickpeas)');
    expect(canonicalName('Sarson ka tel')).toBe('Mustard Oil');
  });

  it('is not fooled by case, punctuation or spacing', () => {
    expect(canonicalName('LAL-MIRCH')).toBe('Red chilli powder (lal mirch)');
    expect(canonicalName('red  chili   powder')).toBe('Red chilli powder (lal mirch)');
  });

  it('leaves brand names and unknown names alone', () => {
    expect(canonicalName('Aashirvaad Atta (whole wheat flour)')).toBe('Aashirvaad Atta (whole wheat flour)');
    expect(canonicalName('Dish soap')).toBe('Dish soap');
    expect(canonicalName('  Honey  ')).toBe('Honey');
  });

  it('does not guess at ambiguous words on their own', () => {
    expect(canonicalName('dhania')).toBe('dhania');
    expect(canonicalName('methi')).toBe('methi');
    expect(canonicalName('sarson')).toBe('sarson');
  });

  it('treats two names as the same product when they share a canonical name', () => {
    expect(sameProduct('Arhar dal', 'Toor Dal')).toBe(true);
    expect(sameProduct('Toor Dal', 'Moong Dal')).toBe(false);
    expect(sameProduct('Aashirvaad Atta (whole wheat flour)', 'Atta')).toBe(false);
  });
});

describe('Punjabi display names', () => {
  it('only has translations for glossary names', async () => {
    const { PUNJABI_NAMES } = await import('../server/grocery-glossary.js');
    const names = new Set(GLOSSARY.map((e) => e.name));
    for (const k of Object.keys(PUNJABI_NAMES)) expect(names.has(k), k).toBe(true);
  });

  it('translates glossary products and leaves brands and custom names in English', async () => {
    const { punjabiName } = await import('../server/grocery-glossary.js');
    expect(punjabiName('Toor Dal')).toBe('ਤੂਰ ਦਾਲ');
    expect(punjabiName('arhar dal')).toBe('ਤੂਰ ਦਾਲ');
    expect(punjabiName('Aashirvaad Atta (whole wheat flour)')).toBeNull();
    expect(punjabiName('Custom item')).toBeNull();
  });
});
