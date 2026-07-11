import type { LocaleInput } from '@flighthq/types';

import { getCacheKey, getCached } from './cache';

/**
 * Format `value` of `unit` as a locale-aware relative-time phrase in `locale` —
 * a positive value is in the future, a negative value in the past. For example
 * `formatRelativeTime(2, 'day', 'en-US')` → `'in 2 days'` and `(-1, 'day')` →
 * `'1 day ago'`. Defaults to `numeric: 'always'`; pass `{ numeric: 'auto' }` to
 * allow words like `'tomorrow'` / `'yesterday'`.
 */
export function formatRelativeTime(
  value: number,
  unit: Intl.RelativeTimeFormatUnit,
  locale: LocaleInput,
  options?: Readonly<Intl.RelativeTimeFormatOptions>,
): string {
  const key = getCacheKey('relativetime', locale, options);
  const formatter = getCached(key, () => new Intl.RelativeTimeFormat(locale as string | string[], options));
  return formatter.format(value, unit);
}
