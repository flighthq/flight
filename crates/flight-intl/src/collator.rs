//! Locale-aware string comparison and sorting (TS `collator.ts`).

use std::cmp::Ordering;

use crate::cache::{FormatterCache, get_cache_key, get_cached};
use crate::options::*;
use crate::types::*;
#[cfg(test)]
mod sugar_tests {
    use super::*;
    use crate::intl_test_support::{locale, test_host};

    #[test]
    fn compare_and_open_collator_match_their_free_functions() {
        let host = test_host();
        let handle = host.open_collator(&locale(), &CollatorOptions::default());
        assert_eq!(
            handle.compare("a", "b"),
            compare_intl_collator(&handle, "a", "b")
        );
        let via_free = create_intl_collator(&host, &locale(), &CollatorOptions::default());
        assert_eq!(
            compare_intl_collator(&via_free, "a", "b"),
            compare_intl_collator(&handle, "a", "b")
        );
    }
}

// flight-lint: allow(conform-extra) D18: the source interface exposes `openSocket`-style factory construction on the provider object; TS exports no free function
pub fn create_intl_collator(
    host: &HostIntlCapability,
    locale: &LocaleInput,
    options: &CollatorOptions,
) -> IntlCollatorHandle {
    return (host.create_collator)(locale, options);
}

/// Delegates one comparison to a cached collator handle (Rust-owned receiver sugar target).
// flight-lint: allow(conform-extra) D18: the source interface exposes `compare` on the formatter instance; TS exports no free function
// flight-lint: allow(f64) D1: the comparator returns the source's JS number result
pub fn compare_intl_collator(collator: &IntlCollatorHandle, a: &str, b: &str) -> f64 {
    return (collator.compare)(a, b);
}

/// Compares `a` and `b` for locale-aware ordering (TS `compareStrings`).
// flight-lint: allow(f64) D1: the comparator returns the source's JS number result
// flight-lint: allow(conform-params) D5: caller-owned FormatterCache and the explicit host capability replace the source module map and ambient Intl
pub fn compare_strings(
    cache: &mut FormatterCache,
    host: &HostIntlCapability,
    a: &str,
    b: &str,
    locale: &LocaleInput,
    options: Option<&CollatorOptions>,
) -> f64 {
    let collator = get_collator(cache, host, locale, options);
    return compare_intl_collator(&collator, a, b);
}

fn get_collator(
    cache: &mut FormatterCache,
    host: &HostIntlCapability,
    locale: &LocaleInput,
    options: Option<&CollatorOptions>,
) -> std::sync::Arc<IntlCollatorHandle> {
    let empty = CollatorOptions::default();
    let values = options.unwrap_or(&empty);
    let key = get_cache_key(
        "collator",
        locale,
        options
            .map(|v| IntlOptionsKey::Collator(CollatorOptionsKey { options: v }))
            .as_ref(),
    );
    return get_cached(cache, &key, || host.open_collator(locale, values));
}

/// Returns a new array of `items` sorted by locale-aware collation; the input is not mutated (TS
/// `sortStrings`).
// flight-lint: allow(conform-params) D5: caller-owned FormatterCache and the explicit host capability replace the source module map and ambient Intl
// flight-lint: allow(conform-params) D24 (Principal 21f7557f): the result fills a caller-owned out, cleared first
pub fn sort_strings(
    out: &mut Vec<String>,
    cache: &mut FormatterCache,
    host: &HostIntlCapability,
    items: &[String],
    locale: &LocaleInput,
    options: Option<&CollatorOptions>,
) {
    let collator = get_collator(cache, host, locale, options);
    out.clear();
    out.extend_from_slice(items);
    out.sort_by(|a, b| {
        let result = compare_intl_collator(&collator, a, b);
        if result < 0.0 {
            return Ordering::Less;
        }
        if result > 0.0 {
            return Ordering::Greater;
        }
        return Ordering::Equal;
    });
}

impl IntlCollatorHandle {
    // flight-lint: allow(f64) D1: the comparator returns the source's JS number result
    pub fn compare(&self, a: &str, b: &str) -> f64 {
        return compare_intl_collator(self, a, b);
    }
}

/// Delegates one collator construction to the host capability (Rust-owned receiver sugar target).

impl HostIntlCapability {
    pub fn open_collator(
        &self,
        locale: &LocaleInput,
        options: &CollatorOptions,
    ) -> IntlCollatorHandle {
        return create_intl_collator(self, locale, options);
    }
}
