use flight_intl::contract::*;

use crate::test_support::*;

mod create_intl_date_time_format {
    use super::*;

    #[test]
    fn builds_through_the_host_capability() {
        let mock = mock_intl();
        let handle = create_intl_date_time_format(
            &mock.host,
            &single_locale("en-US"),
            &empty_date_time_options(),
        );
        assert_eq!(format_intl_date_time(&handle, 1.0), "datetime:1");
    }
}

mod format_date {
    use super::*;

    #[test]
    fn forwards_the_numeric_year_month_day_defaults() {
        let mock = mock_intl();
        let mut cache = create_formatter_cache();
        let locale = single_locale("en-US");
        format_date(&mut cache, &mock.host, 1579093500000.0, &locale, None);
        let calls = factory_calls_for(&mock, "datetime");
        assert_eq!(
            calls[0].options_key,
            "datetime|en-US|{\"year\":\"numeric\",\"month\":\"numeric\",\"day\":\"numeric\"}"
        );
        assert_eq!(*mock.format_inputs.lock().unwrap(), vec![1579093500000.0]);
    }

    #[test]
    fn a_caller_options_record_replaces_the_default_field_set() {
        let mock = mock_intl();
        let mut cache = create_formatter_cache();
        let locale = single_locale("de-DE");
        let mut values = empty_date_time_options();
        values.time_zone = Some("UTC".to_string());
        format_date(&mut cache, &mock.host, 0.0, &locale, Some(&values));
        assert_eq!(
            factory_calls_for(&mock, "datetime")[0].options_key,
            "datetime|de-DE|{\"timeZone\":\"UTC\"}"
        );
    }

    #[test]
    fn an_invalid_date_returns_the_source_sentinel_without_building_a_formatter() {
        let mock = mock_intl();
        let mut cache = create_formatter_cache();
        let locale = single_locale("en-US");
        assert_eq!(
            format_date(&mut cache, &mock.host, f64::NAN, &locale, None),
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
        format_date_time(&mut cache, &mock.host, 1000.0, &locale, None);
        assert_eq!(
            factory_calls_for(&mock, "datetime")[0].options_key,
            "datetime|en-US|{\"year\":\"numeric\",\"month\":\"numeric\",\"day\":\"numeric\",\"hour\":\"numeric\",\"minute\":\"numeric\"}"
        );
    }
}

mod format_intl_date_time {
    use super::*;

    #[test]
    fn delegates_one_epoch_format_to_the_handle() {
        let mock = mock_intl();
        let handle = (mock.host.create_date_time_format)(
            &single_locale("en-US"),
            &empty_date_time_options(),
        );
        assert_eq!(format_intl_date_time(&handle, 1.0), (handle.format)(1.0));
    }
}

mod format_time {
    use super::*;

    #[test]
    fn forwards_the_hour_minute_defaults_and_reuses_the_cache() {
        let mock = mock_intl();
        let mut cache = create_formatter_cache();
        let locale = single_locale("en-US");
        format_time(&mut cache, &mock.host, 1.0, &locale, None);
        format_time(&mut cache, &mock.host, 2.0, &locale, None);
        let calls = factory_calls_for(&mock, "datetime");
        assert_eq!(calls.len(), 1);
        assert_eq!(
            calls[0].options_key,
            "datetime|en-US|{\"hour\":\"numeric\",\"minute\":\"numeric\"}"
        );
    }
}
