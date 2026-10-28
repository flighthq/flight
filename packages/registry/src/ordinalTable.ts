import type { Kind, NonEntityCreateResult, OrdinalTable } from '@flighthq/types/contract';

export function createOrdinalTable<T>(
  vocabulary: readonly Kind[],
): NonEntityCreateResult<OrdinalTable<T>, 'descriptor'> {
  return { entries: vocabulary.map(() => null), vocabulary };
}

export function getOrdinalTableEntry<T>(table: Readonly<OrdinalTable<T>>, ordinal: number): T | null {
  if (!Number.isInteger(ordinal) || ordinal < 0 || ordinal >= table.entries.length) return null;
  return table.entries[ordinal];
}
