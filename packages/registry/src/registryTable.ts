import type { Kind, NonEntityCreateResult, OrdinalTable } from '@flighthq/types/contract';

export function concatKindMap<T>(base: ReadonlyMap<Kind, T>, overlay: ReadonlyMap<Kind, T>): Map<Kind, T> {
  const entries = new Map(base);
  for (const [key, value] of overlay) {
    entries.set(key, value);
  }
  return entries;
}

export function createOrdinalTable<T>(
  vocabulary: readonly Kind[],
): NonEntityCreateResult<OrdinalTable<T>, 'descriptor'> {
  return { entries: vocabulary.map(() => null), vocabulary };
}

export function getKindMapKeys(out: Kind[], map: ReadonlyMap<Kind, unknown>): void {
  out.length = 0;
  for (const key of map.keys()) out.push(key);
  out.sort();
}

export function getOrdinalTableEntry<T>(table: Readonly<OrdinalTable<T>>, ordinal: number): T | null {
  if (!Number.isInteger(ordinal) || ordinal < 0 || ordinal >= table.entries.length) return null;
  return table.entries[ordinal];
}

export function withKindMapEntry<T>(map: ReadonlyMap<Kind, T>, key: Kind, value: T): Map<Kind, T> {
  const entries = new Map(map);
  entries.set(key, value);
  return entries;
}

export function withoutKindMapEntry<T>(map: ReadonlyMap<Kind, T>, key: Kind): Map<Kind, T> {
  const entries = new Map(map);
  entries.delete(key);
  return entries;
}
