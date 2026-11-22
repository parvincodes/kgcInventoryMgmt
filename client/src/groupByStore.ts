/** The order the stores are shown in. Any other store comes after these, alphabetically. Items with no store come last. */
const ORDER = ['Costco', 'Punjab Trading', 'US Chef Store'];

/** Groups list lines by the store they're bought from. */
export function groupByStore<T extends { store?: string | null }>(lines: T[]): { store: string | null; lines: T[] }[] {
  const groups = new Map<string | null, T[]>();
  for (const l of lines) {
    const key = l.store || null;
    groups.set(key, [...(groups.get(key) ?? []), l]);
  }
  const rank = (s: string | null) => {
    if (s === null) return [2, ''] as const;
    const i = ORDER.indexOf(s);
    return i >= 0 ? ([0, String(i).padStart(3, '0')] as const) : ([1, s.toLowerCase()] as const);
  };
  return [...groups.entries()]
    .sort(([a], [b]) => {
      const [ra, sa] = rank(a);
      const [rb, sb] = rank(b);
      return ra - rb || sa.localeCompare(sb);
    })
    .map(([store, lines]) => ({ store, lines }));
}
