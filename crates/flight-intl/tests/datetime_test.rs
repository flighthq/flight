use flight_intl::contract::*;

use crate::test_support::*;

fn options_key(locale: &LocaleInput, options: &IntlOptions) -> String {
    return get_cache_key("datetime", locale, Some(options));
}

mod format_date {
    use super::*;

    #[test]
    fn forwards_the_numeric_year_month_day_defaults() {
        let mock = mock_intl();
        let mut cache = create_formatter_cache();
        let locale = single_locale("en-US");
        format_date(
            &mut cache,
            &mock.host,
            IntlDateInput::EpochMillis(1579093500000.0),
            &locale,
            None,
        );
        let calls = factory_calls_for(&mock, "datetime");
        assert_eq!(
            options_key(&locale, &calls[0].options),
            "datetime|en-US|{\"year\":\"numeric\",\"month\":\"numeric\",\"day\":\"numeric\"}"
        );
        assert_eq!(*mock.format_inputs.lock().unwrap(), vec![1579093500000.0]);
    }

    #[test]
    fn a_caller_options_record_replaces_the_default_field_set() {
        let mock = mock_intl();
        let mut cache = create_formatter_cache();
        let locale = single_locale("de-DE");
        let values = options(&[("timeZone", option_text("UTC"))]);
        format_date(
            &mut cache,
            &mock.host,
            IntlDateInput::Date(0.0),
            &locale,
            Some(&values),
        );
        let calls = factory_calls_for(&mock, "datetime");
        assert_eq!(
            options_key(&locale, &calls[0].options),
            "datetime|de-DE|{\"timeZone\":\"UTC\"}"
        );
    }

    #[test]
    fn an_invalid_date_returns_the_source_sentinel_without_building_a_formatter() {
        let mock = mock_intl();
        let mut cache = create_formatter_cache();
        let locale = single_locale("en-US");
        assert_eq!(
            format_date(
                &mut cache,
                &mock.host,
                IntlDateInput::Date(f64::NAN),
                &locale,
                None
            ),
            "Invalid Date"
        );
        assert_eq!(
            format_date(
                &mut cache,
                &mock.host,
                IntlDateInput::EpochMillis(f64::NAN),
                &locale,
                None
            ),
            "Invalid Date"
        );
        assert!(factory_calls_for(&mock, "datetime").is_empty());
    }
}

mod format_date_time {
    use super::*;

    #[test]
    fn forwards_the_date_and_time_default_field_set() {
        let mock = mock_intl();
        let mut cache = create_formatter_cache();
        let locale = single_locale("en-US");
        format_date_time(
            &mut cache,
            &mock.host,
            IntlDateInput::EpochMillis(1000.0),
            &locale,
            None,
        );
        let calls = factory_calls_for(&mock, "datetime");
        assert_eq!(
            options_key(&locale, &calls[0].options),
            "datetime|en-US|{\"year\":\"numeric\",\"month\":\"numeric\",\"day\":\"numeric\",\"hour\":\"numeric\",\"minute\":\"numeric\"}"
        );
    }
}

mod format_time {
    use super::*;

    #[test]
    fn forwards_the_hour_minute_default_field_set_and_reuses_the_cache() {
        let mock = mock_intl();
        let mut cache = create_formatter_cache();
        let locale = single_locale("en-US");
        format_time(
            &mut cache,
            &mock.host,
            IntlDateInput::EpochMillis(1.0),
            &locale,
            None,
        );
        format_time(
            &mut cache,
            &mock.host,
            IntlDateInput::EpochMillis(2.0),
            &locale,
            None,
        );
        let calls = factory_calls_for(&mock, "datetime");
        assert_eq!(calls.len(), 1);
        assert_eq!(
            options_key(&locale, &calls[0].options),
            "datetime|en-US|{\"hour\":\"numeric\",\"minute\":\"numeric\"}"
        );
    }
}
