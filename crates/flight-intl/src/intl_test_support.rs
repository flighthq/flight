//! Inline-sugar test host: trivial deterministic callbacks, no locale data.

use std::sync::Arc;

use crate::types::*;

pub(crate) fn locale() -> LocaleInput {
    return LocaleInput::Single("en-US".to_string());
}

// flight-lint: allow(f64) D1: the handles mirror the JS number formatter arguments
pub(crate) fn test_host() -> HostIntlCapability {
    return HostIntlCapability {
        provider: Arc::new(()),
        create_collator: Arc::new(
            |_locale: &LocaleInput, _options: &crate::options::CollatorOptions| {
                return IntlCollatorHandle {
                    compare: Arc::new(|a: &str, b: &str| {
                        return if a < b {
                            -1.0
                        } else if a > b {
                            1.0
                        } else {
                            0.0
                        };
                    }),
                };
            },
        ),
        create_date_time_format: Arc::new(
            |_locale: &LocaleInput, _options: &crate::options::DateTimeFormatOptions| {
                return IntlDateTimeFormatHandle {
                    format: Arc::new(|value: f64| return format!("d{}", value)),
                };
            },
        ),
        create_list_format: Arc::new(
            |_locale: &LocaleInput, _options: &crate::options::ListFormatOptions| {
                return IntlListFormatHandle {
                    format: Arc::new(|items: &[String]| return items.join(",")),
                };
            },
        ),
        create_number_format: Arc::new(
            |_locale: &LocaleInput, _options: &crate::options::NumberFormatOptions| {
                return IntlNumberFormatHandle {
                    format: Arc::new(|value: f64| return format!("n{}", value)),
                };
            },
        ),
        create_plural_rules: Arc::new(
            |_locale: &LocaleInput, _options: &crate::options::PluralRulesOptions| {
                return IntlPluralRulesHandle {
                    select: Arc::new(|_value: f64| return IntlPluralCategory::Other),
                };
            },
        ),
        create_relative_time_format: Arc::new(
            |_locale: &LocaleInput, _options: &crate::options::RelativeTimeFormatOptions| {
                return IntlRelativeTimeFormatHandle {
                    format: Arc::new(|value: f64, unit: IntlRelativeTimeUnit| {
                        return format!("r{}:{}", value, get_intl_relative_time_unit_string(unit));
                    }),
                };
            },
        ),
    };
}
