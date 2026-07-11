import type { LocaleInput } from '@flighthq/types';

import { getCacheKey, getCached } from './cache';

/**
 * Join `items` into one locale-aware list string in `locale` — for example
 * `['a', 'b', 'c']` → `'a, b, and c'` in `en-US`. Defaults to a conjunction
 * (`'and'`) list; pass `{ type: 'disjunction' }` for an `'or'` list or
 * `{ style: 'short' }` / `{ style: 'narrow' }` for tighter joins.
 */
export function formatList(
  items: readonly string[],
  locale: LocaleInput,
  options?: Readonly<Intl.ListFormatOptions>,
): string {
  const key = getCacheKey('list', locale, options);
  const formatter = getCached(key, () => new Intl.ListFormat(locale as string | string[], options));
  return formatter.format(items as string[]);
}
