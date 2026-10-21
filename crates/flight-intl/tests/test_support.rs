#![allow(dead_code)]

use std::sync::{Arc, Mutex};

use flight_intl::contract::*;

#[derive(Clone, Debug)]
pub(crate) struct FactoryCall {
    pub family: String,
    pub locale: LocaleInput,
    pub options_key: String,
}

pub(crate) struct MockIntl {
    pub host: HostIntlCapability,
    pub factory_calls: Arc<Mutex<Vec<FactoryCall>>>,
    pub format_inputs: Arc<Mutex<Vec<f64>>>,
    pub list_inputs: Arc<Mutex<Vec<Vec<String>>>>,
    pub plural_inputs: Arc<Mutex<Vec<f64>>>,
    pub relative_inputs: Arc<Mutex<Vec<(f64, IntlRelativeTimeUnit)>>>,
}

pub(crate) fn factory_calls_for(mock: &MockIntl, family: &str) -> Vec<FactoryCall> {
    let calls = mock.factory_calls.lock().unwrap();
    return calls
        .iter()
        .filter(|call| call.family == family)
        .cloned()
        .collect();
}

pub(crate) fn mock_intl() -> MockIntl {
    let factory_calls = Arc::new(Mutex::new(Vec::new()));
    let format_inputs = Arc::new(Mutex::new(Vec::new()));
    let list_inputs = Arc::new(Mutex::new(Vec::new()));
    let plural_inputs = Arc::new(Mutex::new(Vec::new()));
    let relative_inputs = Arc::new(Mutex::new(Vec::new()));

    let calls = factory_calls.clone();
    let create_collator: Arc<
        dyn Fn(&LocaleInput, &CollatorOptions) -> IntlCollatorHandle + Send + Sync,
    > = Arc::new(move |locale: &LocaleInput, options: &CollatorOptions| {
        calls.lock().unwrap().push(FactoryCall {
            family: "collator".to_string(),
            locale: locale.clone(),
            options_key: get_cache_key(
                "collator",
                locale,
                Some(&IntlOptionsKey::Collator(options)),
            ),
        });
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
    });

    let calls = factory_calls.clone();
    let inputs = format_inputs.clone();
    let create_date_time_format: Arc<
        dyn Fn(&LocaleInput, &DateTimeFormatOptions) -> IntlDateTimeFormatHandle + Send + Sync,
    > = Arc::new(
        move |locale: &LocaleInput, options: &DateTimeFormatOptions| {
            calls.lock().unwrap().push(FactoryCall {
                family: "datetime".to_string(),
                locale: locale.clone(),
                options_key: get_cache_key(
                    "datetime",
                    locale,
                    Some(&IntlOptionsKey::DateTimeFormat(options)),
                ),
            });
            let inputs = inputs.clone();
            return IntlDateTimeFormatHandle {
                format: Arc::new(move |value: f64| {
                    inputs.lock().unwrap().push(value);
                    return format!("datetime:{}", value);
                }),
            };
        },
    );

    let calls = factory_calls.clone();
    let items_log = list_inputs.clone();
    let create_list_format: Arc<
        dyn Fn(&LocaleInput, &ListFormatOptions) -> IntlListFormatHandle + Send + Sync,
    > = Arc::new(move |locale: &LocaleInput, options: &ListFormatOptions| {
        calls.lock().unwrap().push(FactoryCall {
            family: "list".to_string(),
            locale: locale.clone(),
            options_key: get_cache_key("list", locale, Some(&IntlOptionsKey::List(options))),
        });
        let items_log = items_log.clone();
        return IntlListFormatHandle {
            format: Arc::new(move |items: &[String]| {
                items_log.lock().unwrap().push(items.to_vec());
                return items.join(",");
            }),
        };
    });

    let calls = factory_calls.clone();
    let inputs = format_inputs.clone();
    let create_number_format: Arc<
        dyn Fn(&LocaleInput, &NumberFormatOptions) -> IntlNumberFormatHandle + Send + Sync,
    > = Arc::new(move |locale: &LocaleInput, options: &NumberFormatOptions| {
        calls.lock().unwrap().push(FactoryCall {
            family: "number".to_string(),
            locale: locale.clone(),
            options_key: get_cache_key("number", locale, Some(&IntlOptionsKey::Number(options))),
        });
        let inputs = inputs.clone();
        return IntlNumberFormatHandle {
            format: Arc::new(move |value: f64| {
                inputs.lock().unwrap().push(value);
                if value.is_nan() {
                    return "NaN".to_string();
                }
                return format!("number:{}", value);
            }),
        };
    });

    let calls = factory_calls.clone();
    let plural_log = plural_inputs.clone();
    let create_plural_rules: Arc<
        dyn Fn(&LocaleInput, &PluralRulesOptions) -> IntlPluralRulesHandle + Send + Sync,
    > = Arc::new(move |locale: &LocaleInput, options: &PluralRulesOptions| {
        calls.lock().unwrap().push(FactoryCall {
            family: "plural".to_string(),
            locale: locale.clone(),
            options_key: get_cache_key("plural", locale, Some(&IntlOptionsKey::Plural(options))),
        });
        let plural_log = plural_log.clone();
        return IntlPluralRulesHandle {
            select: Arc::new(move |value: f64| {
                plural_log.lock().unwrap().push(value);
                return if value == 1.0 {
                    IntlPluralCategory::One
                } else {
                    IntlPluralCategory::Other
                };
            }),
        };
    });

    let calls = factory_calls.clone();
    let relative_log = relative_inputs.clone();
    let create_relative_time_format: Arc<
        dyn Fn(&LocaleInput, &RelativeTimeFormatOptions) -> IntlRelativeTimeFormatHandle
            + Send
            + Sync,
    > = Arc::new(
        move |locale: &LocaleInput, options: &RelativeTimeFormatOptions| {
            calls.lock().unwrap().push(FactoryCall {
                family: "relativetime".to_string(),
                locale: locale.clone(),
                options_key: get_cache_key(
                    "relativetime",
                    locale,
                    Some(&IntlOptionsKey::RelativeTime(options)),
                ),
            });
            let relative_log = relative_log.clone();
            return IntlRelativeTimeFormatHandle {
                format: Arc::new(move |value: f64, unit: IntlRelativeTimeUnit| {
                    relative_log.lock().unwrap().push((value, unit));
                    return format!(
                        "relative:{}:{}",
                        value,
                        get_intl_relative_time_unit_string(unit)
                    );
                }),
            };
        },
    );

    let host = HostIntlCapability {
        provider: Arc::new(()),
        create_collator,
        create_date_time_format,
        create_list_format,
        create_number_format,
        create_plural_rules,
        create_relative_time_format,
    };
    return MockIntl {
        host,
        factory_calls,
        format_inputs,
        list_inputs,
        plural_inputs,
        relative_inputs,
    };
}

pub(crate) fn single_locale(value: &str) -> LocaleInput {
    return LocaleInput::Single(value.to_string());
}

pub(crate) fn empty_collator_options() -> CollatorOptions {
    return CollatorOptions {
        locale_matcher: None,
        usage: None,
        sensitivity: None,
        ignore_punctuation: None,
        collation: None,
        numeric: None,
        case_first: None,
    };
}

pub(crate) fn empty_date_time_options() -> DateTimeFormatOptions {
    return DateTimeFormatOptions {
        locale_matcher: None,
        weekday: None,
        era: None,
        year: None,
        month: None,
        day: None,
        hour: None,
        minute: None,
        second: None,
        time_zone_name: None,
        format_matcher: None,
        hour12: None,
        time_zone: None,
        calendar: None,
        day_period: None,
        numbering_system: None,
        date_style: None,
        time_style: None,
        hour_cycle: None,
        fractional_second_digits: None,
    };
}

pub(crate) fn empty_list_options() -> ListFormatOptions {
    return ListFormatOptions {
        locale_matcher: None,
        type_: None,
        style: None,
    };
}

pub(crate) fn empty_number_options() -> NumberFormatOptions {
    return NumberFormatOptions {
        locale_matcher: None,
        style: None,
        currency: None,
        currency_display: None,
        currency_sign: None,
        unit: None,
        unit_display: None,
        notation: None,
        compact_display: None,
        use_grouping: None,
        sign_display: None,
        minimum_integer_digits: None,
        minimum_fraction_digits: None,
        maximum_fraction_digits: None,
        minimum_significant_digits: None,
        maximum_significant_digits: None,
    };
}

pub(crate) fn empty_plural_options() -> PluralRulesOptions {
    return PluralRulesOptions {
        locale_matcher: None,
        type_: None,
        minimum_integer_digits: None,
        minimum_fraction_digits: None,
        maximum_fraction_digits: None,
        minimum_significant_digits: None,
        maximum_significant_digits: None,
    };
}

pub(crate) fn empty_relative_time_options() -> RelativeTimeFormatOptions {
    return RelativeTimeFormatOptions {
        locale_matcher: None,
        numeric: None,
        style: None,
    };
}
