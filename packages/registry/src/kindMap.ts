import type { Kind } from '@flighthq/types/contract';

// The durable TypeScript twin of crates/flight-registry/src/kind_map.rs (target-native): these functions
// operate on the JavaScript built-in Map, whose insertion order Rust's KindMap carrier reproduces.

export function concatKindMap<T>(base: ReadonlyMap<Kind, T>, overlay: ReadonlyMap<Kind, T>): Map<Kind, T> {
  const entries = new Map(base);
  for (const [key, value] of overlay) {
    entries.set(key, value);
  }
  return entries;
}

export function getKindMapKeys(out: Kind[], map: ReadonlyMap<Kind, unknown>): void {
  out.length = 0;
  for (const key of map.keys()) out.push(key);
  out.sort();
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
