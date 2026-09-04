import type { KeyedTable, SlotTable } from '@flighthq/types/contract';
import { RegistryEntryState } from '@flighthq/types/contract';

import {
  concatRegistryTable,
  createKeyedTable,
  createOrdinalTable,
  createSlotTable,
  getOrdinalTableEntry,
  getRegistryTableEntry,
  getRegistryTableKeys,
  hasRegistryTableEntry,
  initializeKeyedTable,
  initializeOrdinalTable,
  initializeSlotTable,
  withRegistryTableEntry,
  withRegistryTableTombstone,
  withoutRegistryTableEntry,
} from './registryTable';

describe('concatRegistryTable', () => {
  it('lets a bound overlay entry win over the base', () => {
    const base = withRegistryTableEntry(createKeyedTable<string>('r', 'none'), 'a', 'base');
    const overlay = withRegistryTableEntry(createKeyedTable<string>('r', 'none'), 'a', 'overlay');

    expect(getRegistryTableEntry(concatRegistryTable(base, overlay), 'a')).toBe('overlay');
  });

  it('carries a TOMBSTONE through as a tombstone, so the omitted base entry does NOT come back', () => {
    // The defect this arm exists to prevent: resolving a tombstone to a binding during composition
    // resurrects exactly the entry the overlay meant to omit.
    const base = withRegistryTableEntry(createKeyedTable<string>('r', 'none'), 'a', 'base');
    const overlay = withRegistryTableTombstone(createKeyedTable<string>('r', 'none'), 'a');
    const composed = concatRegistryTable(base, overlay) as KeyedTable<string>;

    expect(getRegistryTableEntry(composed, 'a')).toBeNull();
    // And it is a tombstone in the result, not an absence — so composing again still omits.
    expect(composed.entries.get('a')).toEqual({ state: RegistryEntryState.Tombstoned });
  });

  it('INHERITS the base where the overlay merely has no opinion — the opposite of a tombstone', () => {
    // withoutRegistryTableEntry and withRegistryTableTombstone read almost identically and compose
    // oppositely. This pins the difference; without it the two verbs are interchangeable.
    const base = withRegistryTableEntry(createKeyedTable<string>('r', 'none'), 'a', 'base');
    const overlay = withoutRegistryTableEntry(
      withRegistryTableEntry(createKeyedTable<string>('r', 'none'), 'a', 'x'),
      'a',
    );

    expect(getRegistryTableEntry(concatRegistryTable(base, overlay), 'a')).toBe('base');
  });

  it('throws on a shape mismatch, which is a programmer error rather than an expected failure', () => {
    const keyed = createKeyedTable<string>('r', 'none');
    const slot = createSlotTable<string>('r', 'none');

    expect(() => concatRegistryTable(keyed, slot)).toThrow(/cannot compose a 'keyed' table with a 'slot' table/);
  });

  it('throws when the two tables are different registries', () => {
    expect(() =>
      concatRegistryTable(createKeyedTable<string>('a', 'none'), createKeyedTable<string>('b', 'none')),
    ).toThrow(/cannot compose registry 'a' with registry 'b'/);
  });

  it('throws when the two tables carry a different MISS POLICY', () => {
    // The third refusal, alongside shape and registry id. Composition only ever compares policies for
    // equality — it never interprets one — which is why the table layer needs no policy vocabulary and
    // the type is an open alias. Same registry and same shape here, so the policy is the only difference.
    expect(() =>
      concatRegistryTable(createKeyedTable<string>('r', 'fallback'), createKeyedTable<string>('r', 'none')),
    ).toThrow(/cannot compose miss policy 'fallback' with miss policy 'none'/);
  });

  it('preserves the miss policy through composition and through every replacement', () => {
    // A policy that survives concat but is dropped by withEntry would make the refusal above fire
    // spuriously on the NEXT compose — so the preservation is pinned here rather than assumed.
    const base = withRegistryTableEntry(createKeyedTable<string>('r', 'fallback'), 'a', 'v');
    const overlay = withRegistryTableTombstone(createKeyedTable<string>('r', 'fallback'), 'b');

    expect(base.onMiss).toBe('fallback');
    expect(withoutRegistryTableEntry(base, 'a').onMiss).toBe('fallback');
    expect((concatRegistryTable(base, overlay) as KeyedTable<string>).onMiss).toBe('fallback');
  });

  it('composes a slot, where null is inherit and a tombstone is omit', () => {
    const base: SlotTable<string> = {
      entry: { state: RegistryEntryState.Bound, value: 'base' },
      onMiss: 'none',
      registry: 'r',
      shape: 'slot',
    };
    const noOpinion = createSlotTable<string>('r', 'none');
    const omit: SlotTable<string> = {
      entry: { state: RegistryEntryState.Tombstoned },
      onMiss: 'none',
      registry: 'r',
      shape: 'slot',
    };

    expect(getRegistryTableEntry(concatRegistryTable(base, noOpinion), 'r')).toBe('base');
    expect(getRegistryTableEntry(concatRegistryTable(base, omit), 'r')).toBeNull();
  });
});

describe('createKeyedTable', () => {
  it('starts empty and carries its registry id', () => {
    const table = createKeyedTable<string>('textureResolvers', 'none');

    expect(table.registry).toBe('textureResolvers');
    expect(table.entries.size).toBe(0);
  });
});

describe('createOrdinalTable', () => {
  it('starts with every ordinal unbound, one per vocabulary entry', () => {
    const table = createOrdinalTable<string>('swfTags', 'none', ['Tag0', 'Tag1', 'Tag2']);

    expect(table.entries.length).toBe(3);
    expect(table.entries.every((entry) => entry === null)).toBe(true);
  });
});

describe('createSlotTable', () => {
  it('starts with no opinion, which is not the same as an explicit omission', () => {
    expect(createSlotTable<string>('shapeRasterizer', 'none').entry).toBeNull();
  });
});

describe('getOrdinalTableEntry', () => {
  it('returns null out of range, which is the format skip path rather than a miss', () => {
    const table = createOrdinalTable<string>('swfTags', 'none', ['Tag0']);

    expect(getOrdinalTableEntry(table, 1)).toBeNull();
    expect(getOrdinalTableEntry(table, -1)).toBeNull();
    expect(getOrdinalTableEntry(table, 1.5)).toBeNull();
  });

  it('indexes directly when the ordinal is in range', () => {
    const table = createOrdinalTable<string>('swfTags', 'none', ['Tag0', 'Tag1']);
    const bound = { ...table, entries: ['zero', null] };

    expect(getOrdinalTableEntry(bound, 0)).toBe('zero');
    expect(getOrdinalTableEntry(bound, 1)).toBeNull();
  });
});

describe('getRegistryTableEntry', () => {
  it('resolves a bound value', () => {
    expect(getRegistryTableEntry(withRegistryTableEntry(createKeyedTable<string>('r', 'none'), 'a', 'v'), 'a')).toBe(
      'v',
    );
  });

  it('collapses a tombstone to null, because at resolution a tombstone IS a miss', () => {
    expect(
      getRegistryTableEntry(withRegistryTableTombstone(createKeyedTable<string>('r', 'none'), 'a'), 'a'),
    ).toBeNull();
  });

  it('returns null for a key nobody has an opinion about', () => {
    expect(getRegistryTableEntry(createKeyedTable<string>('r', 'none'), 'a')).toBeNull();
  });
});

describe('getRegistryTableKeys', () => {
  it('lists ONLY bound keys, so enumeration and resolution cannot disagree', () => {
    // The trap: listing a tombstoned key means a caller that enumerates then resolves gets null for a
    // key this function just said was there.
    const table = withRegistryTableTombstone(
      withRegistryTableEntry(withRegistryTableEntry(createKeyedTable<string>('r', 'none'), 'b', '1'), 'a', '2'),
      'c',
    );
    const out: string[] = [];
    getRegistryTableKeys(out, table);

    expect(out).toEqual(['a', 'b']);
    for (const key of out) expect(getRegistryTableEntry(table, key)).not.toBeNull();
  });

  it('clears `out` first, so a reused array does not accumulate', () => {
    const out = ['stale'];
    getRegistryTableKeys(out, createKeyedTable<string>('r', 'none'));

    expect(out).toEqual([]);
  });

  it('names an ordinal table by vocabulary and a slot by its registry id', () => {
    const ordinal = createOrdinalTable<string>('swfTags', 'none', ['Tag0', 'Tag1']);
    const outOrdinal: string[] = [];
    getRegistryTableKeys(outOrdinal, { ...ordinal, entries: [null, 'one'] });
    expect(outOrdinal).toEqual(['Tag1']);

    const outSlot: string[] = [];
    getRegistryTableKeys(outSlot, {
      entry: { state: RegistryEntryState.Bound, value: 'x' },
      onMiss: 'none',
      registry: 'shapeRasterizer',
      shape: 'slot',
    });
    expect(outSlot).toEqual(['shapeRasterizer']);
  });
});

describe('hasRegistryTableEntry', () => {
  it('is FALSE on a tombstone, matching what get answers', () => {
    const table = withRegistryTableTombstone(createKeyedTable<string>('r', 'none'), 'a');

    expect(hasRegistryTableEntry(table, 'a')).toBe(false);
    expect(getRegistryTableEntry(table, 'a')).toBeNull();
  });

  it('is true for a bound key and false for an unknown one', () => {
    const table = withRegistryTableEntry(createKeyedTable<string>('r', 'none'), 'a', 'v');

    expect(hasRegistryTableEntry(table, 'a')).toBe(true);
    expect(hasRegistryTableEntry(table, 'b')).toBe(false);
  });
});

describe('initializeKeyedTable', () => {
  it('is the construction initializer of createKeyedTable', () => {
    expect(typeof initializeKeyedTable).toBe('function');
  });
});

describe('initializeOrdinalTable', () => {
  it('is the construction initializer of createOrdinalTable', () => {
    expect(typeof initializeOrdinalTable).toBe('function');
  });
});

describe('initializeSlotTable', () => {
  it('is the construction initializer of createSlotTable', () => {
    expect(typeof initializeSlotTable).toBe('function');
  });
});
describe('withoutRegistryTableEntry', () => {
  it('leaves NO opinion — the key is absent, not tombstoned', () => {
    const table = withoutRegistryTableEntry(
      withRegistryTableEntry(createKeyedTable<string>('r', 'none'), 'a', 'v'),
      'a',
    );

    expect(table.entries.has('a')).toBe(false);
  });

  it('does not mutate the table it was given', () => {
    const before = withRegistryTableEntry(createKeyedTable<string>('r', 'none'), 'a', 'v');
    withoutRegistryTableEntry(before, 'a');

    expect(getRegistryTableEntry(before, 'a')).toBe('v');
  });
});

describe('withRegistryTableEntry', () => {
  it('returns a REPLACEMENT and mutates nothing — the persistence contract', () => {
    // This is why it is not named set*: the input is untouched and the caller must assign the result.
    const before = createKeyedTable<string>('r', 'none');
    const after = withRegistryTableEntry(before, 'a', 'v');

    expect(before.entries.size).toBe(0);
    expect(getRegistryTableEntry(after, 'a')).toBe('v');
    expect(after).not.toBe(before);
  });

  it('is last-write-wins for a key', () => {
    const table = withRegistryTableEntry(
      withRegistryTableEntry(createKeyedTable<string>('r', 'none'), 'a', '1'),
      'a',
      '2',
    );

    expect(getRegistryTableEntry(table, 'a')).toBe('2');
  });
});

describe('withRegistryTableTombstone', () => {
  it('stores an explicit omission rather than removing the key', () => {
    const table = withRegistryTableTombstone(createKeyedTable<string>('r', 'none'), 'a');

    expect(table.entries.has('a')).toBe(true);
    expect(table.entries.get('a')).toEqual({ state: RegistryEntryState.Tombstoned });
  });

  it('does not mutate the table it was given', () => {
    const before = createKeyedTable<string>('r', 'none');
    withRegistryTableTombstone(before, 'a');

    expect(before.entries.size).toBe(0);
  });
});
