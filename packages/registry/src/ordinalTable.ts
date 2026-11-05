import type { Kind, NonEntityCreateResult } from '@flighthq/entity/contract';

// A dense array indexed by a token the wire format already carries as a small integer. `vocabulary` maps
// ordinal to `Kind` so a miss can be named; the hot path never consults it, because the decoder already
// holds the integer.
export interface OrdinalTable<T> {
  readonly entries: readonly (T | null)[];
  readonly vocabulary: readonly Kind[];
}

export function createOrdinalTable<T>(
  vocabulary: readonly Kind[],
): NonEntityCreateResult<OrdinalTable<T>, 'descriptor'> {
  return { entries: vocabulary.map(() => null), vocabulary };
}

export function getOrdinalTableEntry<T>(table: Readonly<OrdinalTable<T>>, ordinal: number): T | null {
  if (!Number.isInteger(ordinal) || ordinal < 0 || ordinal >= table.entries.length) return null;
  return table.entries[ordinal];
}
