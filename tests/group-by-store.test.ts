import { describe, expect, it } from 'vitest';
import { groupByStore } from '../client/src/groupByStore.js';

describe('grouping the list by store', () => {
  it('puts the three shopping stores first, then others, then items with no store', () => {
    const lines = [
      { name: 'Eggs', store: null },
      { name: 'Cucumbers', store: 'US Chef Store' },
      { name: 'Milk', store: 'Costco' },
      { name: 'Ghee', store: 'Aldi' },
      { name: 'Dal', store: 'Punjab Trading' },
      { name: 'Paneer', store: 'Costco' }
    ];
    const groups = groupByStore(lines);
    expect(groups.map((g) => g.store)).toEqual(['Costco', 'Punjab Trading', 'US Chef Store', 'Aldi', null]);
    expect(groups[0].lines.map((l) => l.name)).toEqual(['Milk', 'Paneer']);
  });
});
