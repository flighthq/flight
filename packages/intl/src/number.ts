import type { LocaleInput } from '@flighthq/types';

import { getCacheKey, getCached } from './cache';

/**
 * Format `value` as a compact number in `locale` (`notation: 'compact'`) — for
 * example `1200000` → `'1.2M'` in `en-US`. Merges over any caller `options`.
 */
export function formatCompactNumber(
  value: number,
  locale: LocaleInput,
  options?: Readonly<Intl.NumberFormatOptions>,
): string {
  return getNumberFormat(locale, { notation: 'compact', ...options }).format(value);
}

/**
 * Format `value` as an amount in `currency` (ISO 4217 code, e.g. `'USD'`) in
 * `locale` — for example `1234.5` → `'$1,234.50'` in `en-US`. Sets
 * `style: 'currency'` and `currency`; a caller may override other options.
 */
export function formatCurrency(
  value: number,
  currency: string,
  locale: LocaleInput,
  options?: Readonly<Intl.NumberFormatOptions>,
): string {
  return getNumberFormat(locale, { style: 'currency', currency, ...options }).format(value);
}

/**
 * Format `value` as a plain number in `locale` — for example `1234.56` →
 * `'1,234.56'` in `en-US`, `'1.234,56'` in `de-DE`. `NaN`/`Infinity` and other
 * edge inputs pass through `Intl`'s own output unchanged.
 */
export function formatNumber(value: number, locale: LocaleInput, options?: Readonly<Intl.NumberFormatOptions>): string {
  return getNumberFormat(locale, options).format(value);
}

/**
 * Format `value` as a percentage in `locale` (`style: 'percent'`) — the value
 * is a ratio, so `0.25` → `'25%'` in `en-US`. Merges over any caller `options`.
 */
export function formatPercent(
  value: number,
  locale: LocaleInput,
  options?: Readonly<Intl.NumberFormatOptions>,
): string {
  return getNumberFormat(locale, { style: 'percent', ...options }).format(value);
}

/**
 * Format `value` in a measurement `unit` (a sanctioned CLDR unit identifier such
 * as `'kilometer-per-hour'`) in `locale` (`style: 'unit'`) — for example
 * `5` → `'5 km/h'` in `en-US`. Sets `style: 'unit'` and `unit`; a caller may
 * override other options.
 */
export function formatUnit(
  value: number,
  unit: string,
  locale: LocaleInput,
  options?: Readonly<Intl.NumberFormatOptions>,
): string {
  return getNumberFormat(locale, { style: 'unit', unit, ...options }).format(value);
}

function getNumberFormat(
  locale: LocaleInput,
  options: Readonly<Intl.NumberFormatOptions> | undefined,
): Intl.NumberFormat {
  const key = getCacheKey('number', locale, options);
  return getCached(key, () => new Intl.NumberFormat(locale as string | string[], options));
}
