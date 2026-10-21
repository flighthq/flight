//! Locale-aware number, currency, percent, unit and compact formatting (TS `number.ts`).

use std::sync::Arc;

use crate::cache::{FormatterCache, get_cache_key, get_cached, overlay_intl_options};
use crate::types::*;

/// Formats `value` as a compact number; caller options merge over `notation: 'compact'` (TS
/// `formatCompactNumber`).
// flight-lint: allow(f64) D1: number formatting consumes the JS number value exactly
// flight-lint: allow(conform-params) D5: caller-owned FormatterCache and the explicit host capability replace the source module map and ambient Intl
pub fn format_compact_number(
    cache: &mut FormatterCache,
    host: &HostIntlCapability,
    value: f64,
    locale: &LocaleInput,
    options: Option<&IntlOptions>,
) -> String {
    let values = overlay_intl_options(
        &[("notation", IntlOptionValue::String("compact".to_string()))],
        options,
    );
    let formatter = get_number_format(cache, host, locale, Some(&values));
    return (formatter.format)(value);
}

/// Formats `value` as an amount in `currency`; caller options merge over `style: 'currency'` and
/// `currency` (TS `formatCurrency`).
// flight-lint: allow(f64) D1: number formatting consumes the JS number value exactly
// flight-lint: allow(conform-params) D5: caller-owned FormatterCache and the explicit host capability replace the source module map and ambient Intl
pub fn format_currency(
    cache: &mut FormatterCache,
    host: &HostIntlCapability,
    value: f64,
    currency: &str,
    locale: &LocaleInput,
    options: Option<&IntlOptions>,
) -> String {
    let values = overlay_intl_options(
        &[
            ("style", IntlOptionValue::String("currency".to_string())),
            ("currency", IntlOptionValue::String(currency.to_string())),
        ],
        options,
    );
    let formatter = get_number_format(cache, host, locale, Some(&values));
    return (formatter.format)(value);
}

/// Formats `value` as a plain number; `NaN` and infinities pass through the host unchanged (TS
/// `formatNumber`).
// flight-lint: allow(f64) D1: number formatting consumes the JS number value exactly
// flight-lint: allow(conform-params) D5: caller-owned FormatterCache and the explicit host capability replace the source module map and ambient Intl
pub fn format_number(
    cache: &mut FormatterCache,
    host: &HostIntlCapability,
    value: f64,
    locale: &LocaleInput,
    options: Option<&IntlOptions>,
) -> String {
    let formatter = get_number_format(cache, host, locale, options);
    return (formatter.format)(value);
}

/// Formats `value` as a percentage ratio; caller options merge over `style: 'percent'` (TS
/// `formatPercent`).
// flight-lint: allow(f64) D1: number formatting consumes the JS number value exactly
// flight-lint: allow(conform-params) D5: caller-owned FormatterCache and the explicit host capability replace the source module map and ambient Intl
pub fn format_percent(
    cache: &mut FormatterCache,
    host: &HostIntlCapability,
    value: f64,
    locale: &LocaleInput,
    options: Option<&IntlOptions>,
) -> String {
    let values = overlay_intl_options(
        &[("style", IntlOptionValue::String("percent".to_string()))],
        options,
    );
    let formatter = get_number_format(cache, host, locale, Some(&values));
    return (formatter.format)(value);
}

/// Formats `value` in a measurement `unit`; caller options merge over `style: 'unit'` and `unit`
/// (TS `formatUnit`).
// flight-lint: allow(f64) D1: number formatting consumes the JS number value exactly
// flight-lint: allow(conform-params) D5: caller-owned FormatterCache and the explicit host capability replace the source module map and ambient Intl
pub fn format_unit(
    cache: &mut FormatterCache,
    host: &HostIntlCapability,
    value: f64,
    unit: &str,
    locale: &LocaleInput,
    options: Option<&IntlOptions>,
) -> String {
    let values = overlay_intl_options(
        &[
            ("style", IntlOptionValue::String("unit".to_string())),
            ("unit", IntlOptionValue::String(unit.to_string())),
        ],
        options,
    );
    let formatter = get_number_format(cache, host, locale, Some(&values));
    return (formatter.format)(value);
}

fn get_number_format(
    cache: &mut FormatterCache,
    host: &HostIntlCapability,
    locale: &LocaleInput,
    options: Option<&IntlOptions>,
) -> Arc<IntlNumberFormatHandle> {
    let key = get_cache_key("number", locale, options);
    let empty = IntlOptions::default();
    let values = options.unwrap_or(&empty);
    return get_cached(cache, &key, || (host.create_number_format)(locale, values));
}
