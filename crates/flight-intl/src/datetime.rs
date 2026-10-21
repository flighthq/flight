//! Locale-aware date, date-time and time formatting (TS `datetime.ts`).

use crate::cache::{FormatterCache, create_intl_options, get_cache_key, get_cached};
use crate::types::*;

fn default_date_options() -> IntlOptions {
    return create_intl_options(&[
        ("year", IntlOptionValue::String("numeric".to_string())),
        ("month", IntlOptionValue::String("numeric".to_string())),
        ("day", IntlOptionValue::String("numeric".to_string())),
    ]);
}

fn default_date_time_options() -> IntlOptions {
    return create_intl_options(&[
        ("year", IntlOptionValue::String("numeric".to_string())),
        ("month", IntlOptionValue::String("numeric".to_string())),
        ("day", IntlOptionValue::String("numeric".to_string())),
        ("hour", IntlOptionValue::String("numeric".to_string())),
        ("minute", IntlOptionValue::String("numeric".to_string())),
    ]);
}

fn default_time_options() -> IntlOptions {
    return create_intl_options(&[
        ("hour", IntlOptionValue::String("numeric".to_string())),
        ("minute", IntlOptionValue::String("numeric".to_string())),
    ]);
}

/// Formats the date portion of `date` with the numeric year/month/day default field set; a caller
/// options record replaces the default set (TS `formatDate`).
// flight-lint: allow(conform-params) D5: caller-owned FormatterCache and the explicit host capability replace the source module map and ambient Intl
pub fn format_date(
    cache: &mut FormatterCache,
    host: &HostIntlCapability,
    date: IntlDateInput,
    locale: &LocaleInput,
    options: Option<&IntlOptions>,
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
pub fn format_date_time(
    cache: &mut FormatterCache,
    host: &HostIntlCapability,
    date: IntlDateInput,
    locale: &LocaleInput,
    options: Option<&IntlOptions>,
) -> String {
    let values = match options {
        Some(values) => values.clone(),
        None => default_date_time_options(),
    };
    return format_date_value(cache, host, date, locale, &values);
}

/// Formats the time portion with the numeric hour/minute default field set (TS `formatTime`). An
/// invalid date returns the source sentinel `Invalid Date` instead of throwing.
fn format_date_value(
    cache: &mut FormatterCache,
    host: &HostIntlCapability,
    date: IntlDateInput,
    locale: &LocaleInput,
    options: &IntlOptions,
) -> String {
    let time = match date {
        IntlDateInput::Date(value) => value,
        IntlDateInput::EpochMillis(value) => value,
    };
    if time.is_nan() {
        return "Invalid Date".to_string();
    }
    let key = get_cache_key("datetime", locale, Some(options));
    let formatter = get_cached(cache, &key, || {
        (host.create_date_time_format)(locale, options)
    });
    return (formatter.format)(time);
}

/// Formats the time portion of `date`; a caller options record replaces the default set (TS
/// `formatTime`).
// flight-lint: allow(conform-params) D5: caller-owned FormatterCache and the explicit host capability replace the source module map and ambient Intl
pub fn format_time(
    cache: &mut FormatterCache,
    host: &HostIntlCapability,
    date: IntlDateInput,
    locale: &LocaleInput,
    options: Option<&IntlOptions>,
) -> String {
    let values = match options {
        Some(values) => values.clone(),
        None => default_time_options(),
    };
    return format_date_value(cache, host, date, locale, &values);
}
