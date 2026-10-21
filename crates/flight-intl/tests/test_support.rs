#![allow(dead_code)]

use std::sync::{Arc, Mutex};

use flight_entity::{entries, set_record_value};
use flight_intl::contract::*;

#[derive(Clone, Debug)]
pub(crate) struct FactoryCall {
    pub family: String,
    pub locale: LocaleInput,
    pub options: IntlOptions,
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

    let collator_calls = factory_calls.clone();
    let create_collator: Arc<
        dyn Fn(&LocaleInput, &IntlOptions) -> IntlCollatorHandle + Send + Sync,
    > = Arc::new(move |locale: &LocaleInput, options: &IntlOptions| {
        collator_calls.lock().unwrap().push(FactoryCall {
            family: "collator".to_string(),
            locale: locale.clone(),
            options: options.clone(),
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

    let date_calls = factory_calls.clone();
    let date_inputs = format_inputs.clone();
    let create_date_time_format: Arc<
        dyn Fn(&LocaleInput, &IntlOptions) -> IntlDateTimeFormatHandle + Send + Sync,
    > = Arc::new(move |locale: &LocaleInput, options: &IntlOptions| {
        date_calls.lock().unwrap().push(FactoryCall {
            family: "datetime".to_string(),
            locale: locale.clone(),
            options: options.clone(),
        });
        let inputs = date_inputs.clone();
        return IntlDateTimeFormatHandle {
            format: Arc::new(move |value: f64| {
                inputs.lock().unwrap().push(value);
                return format!("datetime:{}", value);
            }),
        };
    });

    let list_calls = factory_calls.clone();
    let items_log = list_inputs.clone();
    let create_list_format: Arc<
        dyn Fn(&LocaleInput, &IntlOptions) -> IntlListFormatHandle + Send + Sync,
    > = Arc::new(move |locale: &LocaleInput, options: &IntlOptions| {
        list_calls.lock().unwrap().push(FactoryCall {
            family: "list".to_string(),
            locale: locale.clone(),
            options: options.clone(),
        });
        let items_log = items_log.clone();
        return IntlListFormatHandle {
            format: Arc::new(move |items: &[String]| {
                items_log.lock().unwrap().push(items.to_vec());
                return items.join(",");
            }),
        };
    });

    let number_calls = factory_calls.clone();
    let number_inputs = format_inputs.clone();
    let create_number_format: Arc<
        dyn Fn(&LocaleInput, &IntlOptions) -> IntlNumberFormatHandle + Send + Sync,
    > = Arc::new(move |locale: &LocaleInput, options: &IntlOptions| {
        number_calls.lock().unwrap().push(FactoryCall {
            family: "number".to_string(),
            locale: locale.clone(),
            options: options.clone(),
        });
        let inputs = number_inputs.clone();
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

    let plural_calls = factory_calls.clone();
    let plural_log = plural_inputs.clone();
    let create_plural_rules: Arc<
        dyn Fn(&LocaleInput, &IntlOptions) -> IntlPluralRulesHandle + Send + Sync,
    > = Arc::new(move |locale: &LocaleInput, options: &IntlOptions| {
        plural_calls.lock().unwrap().push(FactoryCall {
            family: "plural".to_string(),
            locale: locale.clone(),
            options: options.clone(),
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

    let relative_calls = factory_calls.clone();
    let relative_log = relative_inputs.clone();
    let create_relative_time_format: Arc<
        dyn Fn(&LocaleInput, &IntlOptions) -> IntlRelativeTimeFormatHandle + Send + Sync,
    > = Arc::new(move |locale: &LocaleInput, options: &IntlOptions| {
        relative_calls.lock().unwrap().push(FactoryCall {
            family: "relativetime".to_string(),
            locale: locale.clone(),
            options: options.clone(),
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
    });

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

pub(crate) fn options(values: &[(&str, IntlOptionValue)]) -> IntlOptions {
    let mut out = IntlOptions::default();
    for (key, value) in values {
        set_record_value(&mut out, key.to_string(), value.clone());
    }
    return out;
}

pub(crate) fn option_text(value: &str) -> IntlOptionValue {
    return IntlOptionValue::String(value.to_string());
}

pub(crate) fn option_integer(value: i32) -> IntlOptionValue {
    return IntlOptionValue::Integer(value);
}

pub(crate) fn option_bool(value: bool) -> IntlOptionValue {
    return IntlOptionValue::Bool(value);
}

pub(crate) fn same_options(a: &IntlOptions, b: &IntlOptions) -> bool {
    let left = entries(a);
    let right = entries(b);
    if left.len() != right.len() {
        return false;
    }
    let mut index = 0;
    while index < left.len() {
        if left[index].0 != right[index].0 || left[index].1 != right[index].1 {
            return false;
        }
        index += 1;
    }
    return true;
}

pub(crate) fn single_locale(value: &str) -> LocaleInput {
    return LocaleInput::Single(value.to_string());
}
