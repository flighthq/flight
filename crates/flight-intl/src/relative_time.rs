//! Locale-aware relative-time phrasing (TS `relativeTime.ts`).

use crate::cache::{FormatterCache, get_cache_key, get_cached};
use crate::types::*;

/// Formats `value` of `unit` as a locale-aware relative-time phrase; positive is the future,
/// negative the past (TS `formatRelativeTime`). Options pass through unchanged.
// flight-lint: allow(f64) D1: relative-time formatting consumes the JS number offset exactly
// flight-lint: allow(conform-params) D5: caller-owned FormatterCache and the explicit host capability replace the source module map and ambient Intl
pub fn format_relative_time(
    cache: &mut FormatterCache,
    host: &HostIntlCapability,
    value: f64,
    unit: IntlRelativeTimeUnit,
    locale: &LocaleInput,
    options: Option<&IntlOptions>,
) -> String {
    let key = get_cache_key("relativetime", locale, options);
    let empty = IntlOptions::default();
    let values = options.unwrap_or(&empty);
    let formatter = get_cached(cache, &key, || {
        (host.create_relative_time_format)(locale, values)
    });
    return (formatter.format)(value, unit);
}
