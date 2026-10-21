//! Locale-aware cardinal and ordinal plural selection (TS `plural.ts`).

use std::sync::Arc;

use crate::cache::{FormatterCache, get_cache_key, get_cached, overlay_intl_options};
use crate::types::*;

fn get_plural_rules(
    cache: &mut FormatterCache,
    host: &HostIntlCapability,
    locale: &LocaleInput,
    options: Option<&IntlOptions>,
) -> Arc<IntlPluralRulesHandle> {
    let key = get_cache_key("plural", locale, options);
    let empty = IntlOptions::default();
    let values = options.unwrap_or(&empty);
    return get_cached(cache, &key, || (host.create_plural_rules)(locale, values));
}

/// Selects the ordinal plural category of `value`; caller options merge over `type: 'ordinal'` (TS
/// `selectOrdinalCategory`).
// flight-lint: allow(f64) D1: plural selection consumes the JS number value exactly
// flight-lint: allow(conform-params) D5: caller-owned FormatterCache and the explicit host capability replace the source module map and ambient Intl
pub fn select_ordinal_category(
    cache: &mut FormatterCache,
    host: &HostIntlCapability,
    value: f64,
    locale: &LocaleInput,
    options: Option<&IntlOptions>,
) -> IntlPluralCategory {
    let values = overlay_intl_options(
        &[("type", IntlOptionValue::String("ordinal".to_string()))],
        options,
    );
    let rules = get_plural_rules(cache, host, locale, Some(&values));
    return (rules.select)(value);
}

/// Selects the cardinal plural category of `value`; caller options merge over `type: 'cardinal'` (TS
/// `selectPluralCategory`).
// flight-lint: allow(f64) D1: plural selection consumes the JS number value exactly
// flight-lint: allow(conform-params) D5: caller-owned FormatterCache and the explicit host capability replace the source module map and ambient Intl
pub fn select_plural_category(
    cache: &mut FormatterCache,
    host: &HostIntlCapability,
    value: f64,
    locale: &LocaleInput,
    options: Option<&IntlOptions>,
) -> IntlPluralCategory {
    let values = overlay_intl_options(
        &[("type", IntlOptionValue::String("cardinal".to_string()))],
        options,
    );
    let rules = get_plural_rules(cache, host, locale, Some(&values));
    return (rules.select)(value);
}
