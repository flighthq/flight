import type { LocaleInput } from '@flighthq/types';

/**
 * Return the cached value for `key`, building and storing it with `build` on a
 * miss. Memoizes the immutable `Intl.*` formatter instances the format
 * functions share — building an `Intl.*` per call is the cost this package
 * exists to remove.
 *
 * The cache is a bounded module-level `Map` (see the bottom of this file): it
 * holds only immutable formatter instances, never mutable app state, and evicts
 * the oldest entry once it exceeds `cacheCapacity` so it cannot grow unbounded.
 */
export function getCached<T>(key: string, build: () => T): T {
  const existing = formatterCache.get(key);
  if (existing !== undefined) return existing as T;

  const built = build();
  if (formatterCache.size >= cacheCapacity) {
    const oldest = formatterCache.keys().next().value;
    if (oldest !== undefined) formatterCache.delete(oldest);
  }
  formatterCache.set(key, built);
  return built;
}

/**
 * Build the stable cache key for one formatter family. `kind` names the family
 * (`'number'`, `'date'`, …); `locale` and `options` are serialized so that two
 * calls with equivalent arguments hit the same entry. Options key order follows
 * insertion order, which is stable because each format function assembles its
 * options object the same way every call.
 */
export function getCacheKey(kind: string, locale: LocaleInput, options: Readonly<object> | undefined): string {
  const localeKey = typeof locale === 'string' ? locale : locale.join(',');
  return `${kind}|${localeKey}|${options === undefined ? '' : JSON.stringify(options)}`;
}

// Immutable `Intl.*` instances keyed by `kind|locale|options`. A Map preserves
// insertion order, so the first key is the oldest and drives simple FIFO
// eviction once the cache is full.
const formatterCache = new Map<string, unknown>();
const cacheCapacity = 256;
