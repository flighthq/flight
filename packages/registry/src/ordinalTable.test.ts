import { createOrdinalTable, getOrdinalTableEntry } from './ordinalTable.ts';

describe('createOrdinalTable', () => {
  it('starts with every ordinal null, one per vocabulary entry', () => {
    const table = createOrdinalTable<string>(['Tag0', 'Tag1', 'Tag2']);

    expect(table.entries.length).toBe(3);
    expect(table.entries.every((entry) => entry === null)).toBe(true);
  });

  it('carries the vocabulary through unchanged', () => {
    const vocab = ['Tag0', 'Tag1'] as const;
    const table = createOrdinalTable<string>([...vocab]);

    expect(table.vocabulary).toEqual(['Tag0', 'Tag1']);
  });
});

describe('getOrdinalTableEntry', () => {
  it('returns null out of range', () => {
    const table = createOrdinalTable<string>(['Tag0']);

    expect(getOrdinalTableEntry(table, 1)).toBeNull();
    expect(getOrdinalTableEntry(table, -1)).toBeNull();
    expect(getOrdinalTableEntry(table, 1.5)).toBeNull();
  });

  it('indexes directly when the ordinal is in range', () => {
    const table = createOrdinalTable<string>(['Tag0', 'Tag1']);
    const bound = { ...table, entries: ['zero', null] };

    expect(getOrdinalTableEntry(bound, 0)).toBe('zero');
    expect(getOrdinalTableEntry(bound, 1)).toBeNull();
  });
});
