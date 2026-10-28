import { concatKindMap, getKindMapKeys, withKindMapEntry, withoutKindMapEntry } from './kindMap.ts';

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
