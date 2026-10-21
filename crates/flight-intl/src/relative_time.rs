//! Locale-aware relative-time phrasing (TS `relativeTime.ts`).

use crate::cache::{FormatterCache, get_cache_key, get_cached};
use crate::options::*;
use crate::types::*;
#[cfg(test)]
mod sugar_tests {
    use super::*;
    use crate::intl_test_support::{locale, test_host};

    #[test]
    fn format_and_open_relative_time_format_match_their_free_functions() {
        let host = test_host();
        let handle =
            host.open_relative_time_format(&locale(), &RelativeTimeFormatOptions::default());
        assert_eq!(
            handle.format(2.0, IntlRelativeTimeUnit::Day),
            format_intl_relative_time(&handle, 2.0, IntlRelativeTimeUnit::Day)
        );
        let via_free = create_intl_relative_time_format(
            &host,
            &locale(),
            &RelativeTimeFormatOptions::default(),
        );
        assert_eq!(
            format_intl_relative_time(&via_free, 2.0, IntlRelativeTimeUnit::Day),
            format_intl_relative_time(&handle, 2.0, IntlRelativeTimeUnit::Day)
        );
    }
}

// flight-lint: allow(conform-extra) D18: the source interface exposes formatter construction on the provider object; TS exports no free function
pub fn create_intl_relative_time_format(
    host: &HostIntlCapability,
    locale: &LocaleInput,
    options: &RelativeTimeFormatOptions,
) -> IntlRelativeTimeFormatHandle {
    return (host.create_relative_time_format)(locale, options);
}

/// Delegates one relative-time format to a cached handle (Rust-owned receiver sugar).
// flight-lint: allow(f64) D1: relative-time formatting consumes the JS number offset exactly
// flight-lint: allow(conform-extra) D18: the source interface exposes `format` on the formatter instance; TS exports no free function
pub fn format_intl_relative_time(
    formatter: &IntlRelativeTimeFormatHandle,
    value: f64,
    unit: IntlRelativeTimeUnit,
) -> String {
    return (formatter.format)(value, unit);
}

/// Formats `value` of `unit` as a locale-aware relative-time phrase.
// flight-lint: allow(f64) D1: relative-time formatting consumes the JS number offset exactly
// flight-lint: allow(conform-params) D5: caller-owned FormatterCache and the explicit host capability replace the source module map and ambient Intl
pub fn format_relative_time(
    cache: &mut FormatterCache,
    host: &HostIntlCapability,
    value: f64,
    unit: IntlRelativeTimeUnit,
    locale: &LocaleInput,
    options: Option<&RelativeTimeFormatOptions>,
) -> String {
    let empty = RelativeTimeFormatOptions::default();
    let values = options.unwrap_or(&empty);
    let key = get_cache_key(
        "relativetime",
        locale,
        options
            .map(|v| IntlOptionsKey::RelativeTime(RelativeTimeFormatOptionsKey { options: v }))
            .as_ref(),
    );
    let formatter = get_cached(cache, &key, || {
        host.open_relative_time_format(locale, values)
    });
    return format_intl_relative_time(&formatter, value, unit);
}

impl IntlRelativeTimeFormatHandle {
    // flight-lint: allow(f64) D1: relative-time formatting consumes the JS number offset exactly
    pub fn format(&self, value: f64, unit: IntlRelativeTimeUnit) -> String {
        return format_intl_relative_time(self, value, unit);
    }
}

/// Delegates one relative-time-formatter construction to the host capability.

impl HostIntlCapability {
    pub fn open_relative_time_format(
        &self,
        locale: &LocaleInput,
        options: &RelativeTimeFormatOptions,
    ) -> IntlRelativeTimeFormatHandle {
        return create_intl_relative_time_format(self, locale, options);
    }
}
