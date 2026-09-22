import {
  concatKindMap,
  createOrdinalTable,
  getKindMapKeys,
  getOrdinalTableEntry,
  withKindMapEntry,
  withoutKindMapEntry,
} from './registryTable';

describe('concatKindMap', () => {
  it('lets an overlay entry win over the base', () => {
    const base = withKindMapEntry(new Map(), 'a', 'base');
    const overlay = withKindMapEntry(new Map(), 'a', 'overlay');

    expect(concatKindMap(base, overlay).get('a')).toBe('overlay');
  });

  it('preserves base entries that the overlay does not mention', () => {
    const base = withKindMapEntry(new Map(), 'a', 'base');
    const overlay = withKindMapEntry(new Map(), 'b', 'overlay');
    const composed = concatKindMap(base, overlay);

    expect(composed.get('a')).toBe('base');
    expect(composed.get('b')).toBe('overlay');
  });
});

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

describe('getKindMapKeys', () => {
  it('lists all keys sorted', () => {
    const table = withKindMapEntry(withKindMapEntry(new Map(), 'b', '1'), 'a', '2');
    const out: string[] = [];
    getKindMapKeys(out, table);

    expect(out).toEqual(['a', 'b']);
  });

  it('clears `out` first, so a reused array does not accumulate', () => {
    const out = ['stale'];
    getKindMapKeys(out, new Map());

    expect(out).toEqual([]);
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

describe('withKindMapEntry', () => {
  it('returns a replacement and mutates nothing', () => {
    const before = new Map<string, string>();
    const after = withKindMapEntry(before, 'a', 'v');

    expect(before.size).toBe(0);
    expect(after.get('a')).toBe('v');
    expect(after).not.toBe(before);
  });

  it('is last-write-wins for a key', () => {
    const table = withKindMapEntry(withKindMapEntry(new Map(), 'a', '1'), 'a', '2');

    expect(table.get('a')).toBe('2');
  });
});

describe('withoutKindMapEntry', () => {
  it('removes the key from the result', () => {
    const table = withoutKindMapEntry(withKindMapEntry(new Map(), 'a', 'v'), 'a');

    expect(table.has('a')).toBe(false);
  });

  it('does not mutate the table it was given', () => {
    const before = withKindMapEntry(new Map(), 'a', 'v');
    withoutKindMapEntry(before, 'a');

    expect(before.get('a')).toBe('v');
  });
});
