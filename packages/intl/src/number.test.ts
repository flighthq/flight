import { afterEach, describe, expect, it, vi } from 'vitest';

import { formatCompactNumber, formatCurrency, formatNumber, formatPercent, formatUnit } from './number';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('formatCompactNumber', () => {
  it('abbreviates large numbers in en-US', () => {
    expect(formatCompactNumber(1_200_000, 'en-US')).toBe('1.2M');
  });
});

describe('formatCurrency', () => {
  it('formats USD amounts in en-US with the currency symbol and two fraction digits', () => {
    expect(formatCurrency(1234.5, 'USD', 'en-US')).toBe('$1,234.50');
  });
});

describe('formatNumber', () => {
  it('groups and separates by locale', () => {
    expect(formatNumber(1234.56, 'en-US')).toBe('1,234.56');
    expect(formatNumber(1234.56, 'de-DE')).toBe('1.234,56');
  });

  it('passes NaN through as Intl does', () => {
    expect(formatNumber(NaN, 'en-US')).toBe('NaN');
  });

  it('reuses one cached Intl.NumberFormat for identical (locale, options) and builds another for different options', () => {
    // Preserve real construction so `.format` still works, while counting builds.
    // A regular function (not an arrow) so vitest can invoke it under `new`.
    const OriginalNumberFormat = Intl.NumberFormat;
    const spy = vi.spyOn(Intl, 'NumberFormat').mockImplementation(function (
      locales?: Intl.LocalesArgument,
      options?: Intl.NumberFormatOptions,
    ) {
      return new OriginalNumberFormat(locales, options);
    });

    // A locale used only by this test, so the cache starts empty for it.
    formatNumber(1, 'ja-JP');
    formatNumber(2, 'ja-JP');
    expect(spy).toHaveBeenCalledTimes(1);

    formatNumber(3, 'ja-JP', { minimumFractionDigits: 2 });
    expect(spy).toHaveBeenCalledTimes(2);
  });
});

describe('formatPercent', () => {
  it('scales a ratio to a percentage in en-US', () => {
    expect(formatPercent(0.25, 'en-US')).toBe('25%');
  });
});

describe('formatUnit', () => {
  it('renders a compound unit in en-US', () => {
    expect(formatUnit(5, 'kilometer-per-hour', 'en-US')).toContain('km/h');
  });
});
