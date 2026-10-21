//! Locale-aware number, currency, percent, unit and compact formatting (TS `number.ts`).

use std::sync::Arc;

use crate::cache::{FormatterCache, get_cache_key, get_cached};
use crate::options::*;
use crate::types::*;

#[cfg(test)]
mod sugar_tests {
    use super::*;
    use crate::intl_test_support::{locale, test_host};

    #[test]
    fn format_and_open_number_format_match_their_free_functions() {
        let host = test_host();
        let handle = host.open_number_format(&locale(), &NumberFormatOptions::default());
        assert_eq!(handle.format(2.0), format_intl_number(&handle, 2.0));
        let via_free = create_intl_number_format(&host, &locale(), &NumberFormatOptions::default());
        assert_eq!(
            format_intl_number(&via_free, 2.0),
            format_intl_number(&handle, 2.0)
        );
    }
}

/// Delegates one number-formatter construction to the host capability.
// flight-lint: allow(conform-extra) D18: the source interface exposes formatter construction on the provider object; TS exports no free function
pub fn create_intl_number_format(
    host: &HostIntlCapability,
    locale: &LocaleInput,
    options: &NumberFormatOptions,
) -> IntlNumberFormatHandle {
    return (host.create_number_format)(locale, options);
}

/// Formats `value` as a compact number; caller options merge over `notation: 'compact'`.
// flight-lint: allow(f64) D1: number formatting consumes the JS number value exactly
// flight-lint: allow(conform-params) D5: caller-owned FormatterCache and the explicit host capability replace the source module map and ambient Intl
pub fn format_compact_number(
    cache: &mut FormatterCache,
    host: &HostIntlCapability,
    value: f64,
    locale: &LocaleInput,
    options: Option<&NumberFormatOptions>,
) -> String {
    let mut values = NumberFormatOptions {
        notation: Some(NumberNotation::Compact),
        ..NumberFormatOptions::default()
    };
    overlay_number_format_options(&mut values, options);
    let formatter = get_number_format(cache, host, locale, Some(&values));
    return format_intl_number(&formatter, value);
}

/// Formats `value` as an amount in `currency`.
// flight-lint: allow(f64) D1: number formatting consumes the JS number value exactly
// flight-lint: allow(conform-params) D5: caller-owned FormatterCache and the explicit host capability replace the source module map and ambient Intl
pub fn format_currency(
    cache: &mut FormatterCache,
    host: &HostIntlCapability,
    value: f64,
    currency: &str,
    locale: &LocaleInput,
    options: Option<&NumberFormatOptions>,
) -> String {
    let mut values = NumberFormatOptions {
        style: Some(NumberStyle::Currency),
        currency: Some(currency.to_string()),
        ..NumberFormatOptions::default()
    };
    overlay_number_format_options(&mut values, options);
    let formatter = get_number_format(cache, host, locale, Some(&values));
    return format_intl_number(&formatter, value);
}

/// Delegates one value format to a cached number handle (Rust-owned receiver sugar).
// flight-lint: allow(f64) D1: number formatting consumes the JS number value exactly
// flight-lint: allow(conform-extra) D18: the source interface exposes `format` on the formatter instance; TS exports no free function
pub fn format_intl_number(formatter: &IntlNumberFormatHandle, value: f64) -> String {
    return (formatter.format)(value);
}

/// Formats `value` as a plain number.
// flight-lint: allow(f64) D1: number formatting consumes the JS number value exactly
// flight-lint: allow(conform-params) D5: caller-owned FormatterCache and the explicit host capability replace the source module map and ambient Intl
pub fn format_number(
    cache: &mut FormatterCache,
    host: &HostIntlCapability,
    value: f64,
    locale: &LocaleInput,
    options: Option<&NumberFormatOptions>,
) -> String {
    let formatter = get_number_format(cache, host, locale, options);
    return format_intl_number(&formatter, value);
}

/// Formats `value` as a percentage ratio.
// flight-lint: allow(f64) D1: number formatting consumes the JS number value exactly
// flight-lint: allow(conform-params) D5: caller-owned FormatterCache and the explicit host capability replace the source module map and ambient Intl
pub fn format_percent(
    cache: &mut FormatterCache,
    host: &HostIntlCapability,
    value: f64,
    locale: &LocaleInput,
    options: Option<&NumberFormatOptions>,
) -> String {
    let mut values = NumberFormatOptions {
        style: Some(NumberStyle::Percent),
        ..NumberFormatOptions::default()
    };
    overlay_number_format_options(&mut values, options);
    let formatter = get_number_format(cache, host, locale, Some(&values));
    return format_intl_number(&formatter, value);
}

/// Formats `value` in a measurement `unit`.
// flight-lint: allow(f64) D1: number formatting consumes the JS number value exactly
// flight-lint: allow(conform-params) D5: caller-owned FormatterCache and the explicit host capability replace the source module map and ambient Intl
pub fn format_unit(
    cache: &mut FormatterCache,
    host: &HostIntlCapability,
    value: f64,
    unit: &str,
    locale: &LocaleInput,
    options: Option<&NumberFormatOptions>,
) -> String {
    let mut values = NumberFormatOptions {
        style: Some(NumberStyle::Unit),
        unit: Some(unit.to_string()),
        ..NumberFormatOptions::default()
    };
    overlay_number_format_options(&mut values, options);
    let formatter = get_number_format(cache, host, locale, Some(&values));
    return format_intl_number(&formatter, value);
}

fn get_number_format(
    cache: &mut FormatterCache,
    host: &HostIntlCapability,
    locale: &LocaleInput,
    options: Option<&NumberFormatOptions>,
) -> Arc<IntlNumberFormatHandle> {
    let empty = NumberFormatOptions::default();
    let values = options.unwrap_or(&empty);
    let key = get_cache_key(
        "number",
        locale,
        options.map(IntlOptionsKey::Number).as_ref(),
    );
    return get_cached(cache, &key, || host.open_number_format(locale, values));
}

impl IntlNumberFormatHandle {
    // flight-lint: allow(f64) D1: number formatting consumes the JS number value exactly
    pub fn format(&self, value: f64) -> String {
        return format_intl_number(self, value);
    }
}

impl HostIntlCapability {
    pub fn open_number_format(
        &self,
        locale: &LocaleInput,
        options: &NumberFormatOptions,
    ) -> IntlNumberFormatHandle {
        return create_intl_number_format(self, locale, options);
    }
}
