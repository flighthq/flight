import type { LocaleInput } from '@flighthq/types';

import { getCacheKey, getCached } from './cache';

/**
 * Format the date portion of `date` (a `Date` or epoch-millisecond number) in
 * `locale`. Default field set: numeric `year`, `month`, and `day` — the order
 * and separators follow the locale (`en-US` → `'1/15/2020'`, `de-DE` →
 * `'15.1.2020'`). A caller `options` object replaces the default field set.
 * An invalid `Date` passes through as `Intl`'s own `'Invalid Date'`.
 */
export function formatDate(
  date: Date | number,
  locale: LocaleInput,
  options?: Readonly<Intl.DateTimeFormatOptions>,
): string {
  return formatDateValue(date, locale, options ?? defaultDateOptions);
}

/**
 * Format both the date and time of `date` (a `Date` or epoch-millisecond
 * number) in `locale`. Default field set: numeric `year`/`month`/`day` plus
 * numeric `hour`/`minute`. A caller `options` object replaces the default field
 * set.
 */
export function formatDateTime(
  date: Date | number,
  locale: LocaleInput,
  options?: Readonly<Intl.DateTimeFormatOptions>,
): string {
  return formatDateValue(date, locale, options ?? defaultDateTimeOptions);
}

/**
 * Format the time portion of `date` (a `Date` or epoch-millisecond number) in
 * `locale`. Default field set: numeric `hour` and `minute` (the locale decides
 * 12- vs 24-hour). A caller `options` object replaces the default field set.
 */
export function formatTime(
  date: Date | number,
  locale: LocaleInput,
  options?: Readonly<Intl.DateTimeFormatOptions>,
): string {
  return formatDateValue(date, locale, options ?? defaultTimeOptions);
}

// `Intl.DateTimeFormat.format` throws `RangeError` on an invalid `Date`, unlike
// `Date.prototype.toLocale*`. Guarding here keeps the charter's degradation
// contract — an invalid date returns `'Invalid Date'`, matching the `'NaN'`
// pass-through of the number formatters rather than surfacing as a throw.
function formatDateValue(
  date: Date | number,
  locale: LocaleInput,
  options: Readonly<Intl.DateTimeFormatOptions>,
): string {
  const time = typeof date === 'number' ? date : date.getTime();
  if (Number.isNaN(time)) return 'Invalid Date';

  const key = getCacheKey('datetime', locale, options);
  const formatter = getCached(key, () => new Intl.DateTimeFormat(locale as string | string[], options));
  return formatter.format(date);
}

const defaultDateOptions: Readonly<Intl.DateTimeFormatOptions> = { year: 'numeric', month: 'numeric', day: 'numeric' };
const defaultTimeOptions: Readonly<Intl.DateTimeFormatOptions> = { hour: 'numeric', minute: 'numeric' };
const defaultDateTimeOptions: Readonly<Intl.DateTimeFormatOptions> = {
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
  hour: 'numeric',
  minute: 'numeric',
};
