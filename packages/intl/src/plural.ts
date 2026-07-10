import type { LocaleInput } from '@flighthq/types';

import { getCacheKey, getCached } from './cache';

/**
 * Select the ordinal plural category of `value` in `locale` (`type: 'ordinal'`)
 * — which grammatical form a positional number (`1st`, `2nd`, …) takes. In
 * `en-US`: `1` → `'one'`, `2` → `'two'`, `3` → `'few'`, `4` → `'other'`. Use it
 * to pick the right ordinal suffix per locale.
 */
export function selectOrdinalCategory(
  value: number,
  locale: LocaleInput,
  options?: Readonly<Intl.PluralRulesOptions>,
): Intl.LDMLPluralRule {
  return getPluralRules(locale, { type: 'ordinal', ...options }).select(value);
}

/**
 * Select the cardinal plural category of `value` in `locale` (`type:
 * 'cardinal'`) — which grammatical form a count takes. In `en-US`: `1` →
 * `'one'`, everything else → `'other'`; other locales return `'zero'` / `'two'`
 * / `'few'` / `'many'` where their grammar distinguishes them. Use it to pick
 * the right message variant for a count.
 */
export function selectPluralCategory(
  value: number,
  locale: LocaleInput,
  options?: Readonly<Intl.PluralRulesOptions>,
): Intl.LDMLPluralRule {
  return getPluralRules(locale, { type: 'cardinal', ...options }).select(value);
}

function getPluralRules(locale: LocaleInput, options: Readonly<Intl.PluralRulesOptions>): Intl.PluralRules {
  const key = getCacheKey('plural', locale, options);
  return getCached(key, () => new Intl.PluralRules(locale as string | string[], options));
}
