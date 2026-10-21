//! Locale-aware date, date-time and time formatting (TS `datetime.ts`).

use crate::cache::{FormatterCache, get_cache_key, get_cached};
use crate::options::*;
use crate::types::*;
#[cfg(test)]
mod sugar_tests {
    use super::*;
    use crate::intl_test_support::{locale, test_host};

    #[test]
    fn format_and_open_date_time_format_match_their_free_functions() {
        let host = test_host();
        let handle = host.open_date_time_format(&locale(), &default_date_options());
        assert_eq!(handle.format(5.0), format_intl_date_time(&handle, 5.0));
        let via_free = create_intl_date_time_format(&host, &locale(), &default_date_options());
        assert_eq!(
            format_intl_date_time(&via_free, 5.0),
            format_intl_date_time(&handle, 5.0)
        );
    }
}

// flight-lint: allow(conform-extra) D18: the source interface exposes formatter construction on the provider object; TS exports no free function
pub fn create_intl_date_time_format(
    host: &HostIntlCapability,
    locale: &LocaleInput,
    options: &DateTimeFormatOptions,
) -> IntlDateTimeFormatHandle {
    return (host.create_date_time_format)(locale, options);
}

fn default_date_options() -> DateTimeFormatOptions {
    return DateTimeFormatOptions {
        year: Some(TimeFieldStyle::Numeric),
        month: Some(MonthStyle::Numeric),
        day: Some(TimeFieldStyle::Numeric),
        ..DateTimeFormatOptions::default()
    };
}

fn default_date_time_options() -> DateTimeFormatOptions {
    return DateTimeFormatOptions {
        year: Some(TimeFieldStyle::Numeric),
        month: Some(MonthStyle::Numeric),
        day: Some(TimeFieldStyle::Numeric),
        hour: Some(TimeFieldStyle::Numeric),
        minute: Some(TimeFieldStyle::Numeric),
        ..DateTimeFormatOptions::default()
    };
}

fn default_time_options() -> DateTimeFormatOptions {
    return DateTimeFormatOptions {
        hour: Some(TimeFieldStyle::Numeric),
        minute: Some(TimeFieldStyle::Numeric),
        ..DateTimeFormatOptions::default()
    };
}

/// Formats the date portion of `date` (epoch milliseconds) with the numeric year/month/day default
/// field set (TS `formatDate`).
// flight-lint: allow(conform-params) D5: caller-owned FormatterCache and the explicit host capability replace the source module map and ambient Intl
// flight-lint: allow(f64) D1: the source date argument is an epoch-millisecond JS number
pub fn format_date(
    cache: &mut FormatterCache,
    host: &HostIntlCapability,
    date: f64,
    locale: &LocaleInput,
    options: Option<&DateTimeFormatOptions>,
) -> String {
    let values = match options {
        Some(values) => values.clone(),
        None => default_date_options(),
    };
    return format_date_value(cache, host, date, locale, &values);
}

/// Formats both date and time with the numeric year/month/day/hour/minute default field set (TS
/// `formatDateTime`).
// flight-lint: allow(conform-params) D5: caller-owned FormatterCache and the explicit host capability replace the source module map and ambient Intl
// flight-lint: allow(f64) D1: the source date argument is an epoch-millisecond JS number
pub fn format_date_time(
    cache: &mut FormatterCache,
    host: &HostIntlCapability,
    date: f64,
    locale: &LocaleInput,
    options: Option<&DateTimeFormatOptions>,
) -> String {
    let values = match options {
        Some(values) => values.clone(),
        None => default_date_time_options(),
    };
    return format_date_value(cache, host, date, locale, &values);
}

// flight-lint: allow(f64) D1: the source date argument is an epoch-millisecond JS number
fn format_date_value(
    cache: &mut FormatterCache,
    host: &HostIntlCapability,
    date: f64,
    locale: &LocaleInput,
    options: &DateTimeFormatOptions,
) -> String {
    if date.is_nan() {
        return "Invalid Date".to_string();
    }
    let key = get_cache_key(
        "datetime",
        locale,
        Some(&IntlOptionsKey::DateTimeFormat(DateTimeFormatOptionsKey {
            options: options,
        })),
    );
    let formatter = get_cached(cache, &key, || host.open_date_time_format(locale, options));
    return format_intl_date_time(&formatter, date);
}

/// Delegates one epoch-millisecond format to a cached date-time handle (Rust-owned receiver sugar).
// flight-lint: allow(f64) D1: the source date argument is an epoch-millisecond JS number
// flight-lint: allow(conform-extra) D18: the source interface exposes `format` on the formatter instance; TS exports no free function
pub fn format_intl_date_time(formatter: &IntlDateTimeFormatHandle, date: f64) -> String {
    return (formatter.format)(date);
}

/// Formats the time portion with the numeric hour/minute default field set (TS `formatTime`).
// flight-lint: allow(conform-params) D5: caller-owned FormatterCache and the explicit host capability replace the source module map and ambient Intl
// flight-lint: allow(f64) D1: the source date argument is an epoch-millisecond JS number
pub fn format_time(
    cache: &mut FormatterCache,
    host: &HostIntlCapability,
    date: f64,
    locale: &LocaleInput,
    options: Option<&DateTimeFormatOptions>,
) -> String {
    let values = match options {
        Some(values) => values.clone(),
        None => default_time_options(),
    };
    return format_date_value(cache, host, date, locale, &values);
}

impl IntlDateTimeFormatHandle {
    // flight-lint: allow(f64) D1: the source date argument is an epoch-millisecond JS number
    pub fn format(&self, date: f64) -> String {
        return format_intl_date_time(self, date);
    }
}

/// Delegates one date-time formatter construction to the host capability (Rust-owned receiver sugar).

impl HostIntlCapability {
    pub fn open_date_time_format(
        &self,
        locale: &LocaleInput,
        options: &DateTimeFormatOptions,
    ) -> IntlDateTimeFormatHandle {
        return create_intl_date_time_format(self, locale, options);
    }
}
