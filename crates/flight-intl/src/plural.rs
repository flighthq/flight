//! Locale-aware cardinal and ordinal plural selection (TS `plural.ts`).

use std::sync::Arc;

use crate::cache::{FormatterCache, get_cache_key, get_cached};
use crate::options::*;
use crate::types::*;
#[cfg(test)]
mod sugar_tests {
    use super::*;
    use crate::intl_test_support::{locale, test_host};

    #[test]
    fn select_and_open_plural_rules_match_their_free_functions() {
        let host = test_host();
        let handle = host.open_plural_rules(&locale(), &PluralRulesOptions::default());
        assert_eq!(
            handle.select(2.0),
            select_intl_plural_category(&handle, 2.0)
        );
        let via_free = create_intl_plural_rules(&host, &locale(), &PluralRulesOptions::default());
        assert_eq!(
            select_intl_plural_category(&via_free, 2.0),
            select_intl_plural_category(&handle, 2.0)
        );
    }
}

// flight-lint: allow(conform-extra) D18: the source interface exposes rules construction on the provider object; TS exports no free function
pub fn create_intl_plural_rules(
    host: &HostIntlCapability,
    locale: &LocaleInput,
    options: &PluralRulesOptions,
) -> IntlPluralRulesHandle {
    return (host.create_plural_rules)(locale, options);
}

fn get_plural_rules(
    cache: &mut FormatterCache,
    host: &HostIntlCapability,
    locale: &LocaleInput,
    options: Option<&PluralRulesOptions>,
) -> Arc<IntlPluralRulesHandle> {
    let empty = PluralRulesOptions::default();
    let values = options.unwrap_or(&empty);
    let key = get_cache_key(
        "plural",
        locale,
        options.map(IntlOptionsKey::Plural).as_ref(),
    );
    return get_cached(cache, &key, || host.open_plural_rules(locale, values));
}

/// Delegates one plural selection to a cached rules handle (Rust-owned receiver sugar).
// flight-lint: allow(f64) D1: plural selection consumes the JS number value exactly
// flight-lint: allow(conform-extra) D18: the source interface exposes `select` on the rules instance; TS exports no free function
pub fn select_intl_plural_category(
    rules: &IntlPluralRulesHandle,
    value: f64,
) -> IntlPluralCategory {
    return (rules.select)(value);
}

/// Selects the ordinal plural category of `value`.
// flight-lint: allow(f64) D1: plural selection consumes the JS number value exactly
// flight-lint: allow(conform-params) D5: caller-owned FormatterCache and the explicit host capability replace the source module map and ambient Intl
pub fn select_ordinal_category(
    cache: &mut FormatterCache,
    host: &HostIntlCapability,
    value: f64,
    locale: &LocaleInput,
    options: Option<&PluralRulesOptions>,
) -> IntlPluralCategory {
    let mut values = PluralRulesOptions {
        type_: Some(PluralType::Ordinal),
        ..PluralRulesOptions::default()
    };
    overlay_plural_rules_options(&mut values, options);
    let rules = get_plural_rules(cache, host, locale, Some(&values));
    return select_intl_plural_category(&rules, value);
}

/// Selects the cardinal plural category of `value`.
// flight-lint: allow(f64) D1: plural selection consumes the JS number value exactly
// flight-lint: allow(conform-params) D5: caller-owned FormatterCache and the explicit host capability replace the source module map and ambient Intl
pub fn select_plural_category(
    cache: &mut FormatterCache,
    host: &HostIntlCapability,
    value: f64,
    locale: &LocaleInput,
    options: Option<&PluralRulesOptions>,
) -> IntlPluralCategory {
    let mut values = PluralRulesOptions {
        type_: Some(PluralType::Cardinal),
        ..PluralRulesOptions::default()
    };
    overlay_plural_rules_options(&mut values, options);
    let rules = get_plural_rules(cache, host, locale, Some(&values));
    return select_intl_plural_category(&rules, value);
}

impl IntlPluralRulesHandle {
    // flight-lint: allow(f64) D1: plural selection consumes the JS number value exactly
    pub fn select(&self, value: f64) -> IntlPluralCategory {
        return select_intl_plural_category(self, value);
    }
}

/// Delegates one plural-rules construction to the host capability.

impl HostIntlCapability {
    pub fn open_plural_rules(
        &self,
        locale: &LocaleInput,
        options: &PluralRulesOptions,
    ) -> IntlPluralRulesHandle {
        return create_intl_plural_rules(self, locale, options);
    }
}
