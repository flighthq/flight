//! Locale-aware string comparison and sorting (TS `collator.ts`).

use std::cmp::Ordering;

use crate::cache::{FormatterCache, get_cache_key, get_cached};
use crate::types::*;

/// Compares `a` and `b` for locale-aware ordering, returning a negative number when `a` sorts first,
/// 0 when equal, positive otherwise (TS `compareStrings`).
// flight-lint: allow(f64) D1: the comparator returns the source's JS number result
// flight-lint: allow(conform-params) D5: caller-owned FormatterCache and the explicit host capability replace the source module map and ambient Intl
pub fn compare_strings(
    cache: &mut FormatterCache,
    host: &HostIntlCapability,
    a: &str,
    b: &str,
    locale: &LocaleInput,
    options: Option<&IntlOptions>,
) -> f64 {
    let key = get_cache_key("collator", locale, options);
    let empty = IntlOptions::default();
    let values = options.unwrap_or(&empty);
    let collator = get_cached(cache, &key, || (host.create_collator)(locale, values));
    return (collator.compare)(a, b);
}

/// Returns a new array of `items` sorted by locale-aware collation; the input is not mutated (TS
/// `sortStrings`). Uses the same collator and cache as `compare_strings`.
// flight-lint: allow(conform-params) D5: caller-owned FormatterCache and the explicit host capability replace the source module map and ambient Intl
pub fn sort_strings(
    cache: &mut FormatterCache,
    host: &HostIntlCapability,
    items: &[String],
    locale: &LocaleInput,
    options: Option<&IntlOptions>,
) -> Vec<String> {
    let key = get_cache_key("collator", locale, options);
    let empty = IntlOptions::default();
    let values = options.unwrap_or(&empty);
    let collator = get_cached(cache, &key, || (host.create_collator)(locale, values));
    let mut sorted = items.to_vec();
    sorted.sort_by(|a, b| {
        let result = (collator.compare)(a, b);
        if result < 0.0 {
            return Ordering::Less;
        }
        if result > 0.0 {
            return Ordering::Greater;
        }
        return Ordering::Equal;
    });
    return sorted;
}
