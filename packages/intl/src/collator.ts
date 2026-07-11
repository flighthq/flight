import type { LocaleInput } from '@flighthq/types';

import { getCacheKey, getCached } from './cache';

/**
 * Compare strings `a` and `b` for locale-aware ordering in `locale`, returning
 * a negative number when `a` sorts before `b`, `0` when they sort equally, and
 * a positive number when `a` sorts after `b` — the comparator contract
 * `Array.prototype.sort` expects. Pass `{ sensitivity, numeric, caseFirst }`
 * options to tune collation (e.g. `{ numeric: true }` for `'file2' < 'file10'`).
 */
export function compareStrings(
  a: string,
  b: string,
  locale: LocaleInput,
  options?: Readonly<Intl.CollatorOptions>,
): number {
  return getCollator(locale, options).compare(a, b);
}

/**
 * Return a new array of `items` sorted by locale-aware collation in `locale`.
 * The input array is not mutated. Uses the same `Intl.Collator` (and cache) as
 * `compareStrings`, so `options` tune ordering identically.
 */
export function sortStrings(
  items: readonly string[],
  locale: LocaleInput,
  options?: Readonly<Intl.CollatorOptions>,
): string[] {
  const collator = getCollator(locale, options);
  return items.slice().sort((a, b) => collator.compare(a, b));
}

function getCollator(locale: LocaleInput, options: Readonly<Intl.CollatorOptions> | undefined): Intl.Collator {
  const key = getCacheKey('collator', locale, options);
  return getCached(key, () => new Intl.Collator(locale as string | string[], options));
}
