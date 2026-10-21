use flight_intl::contract::*;

use crate::test_support::*;

mod create_intl_number_format {
    use super::*;

    #[test]
    fn builds_through_the_host_capability() {
        let mock = mock_intl();
        let handle =
            create_intl_number_format(&mock.host, &single_locale("en-US"), &empty_number_options());
        assert_eq!(format_intl_number(&handle, 2.0), "number:2");
    }
}

mod format_compact_number {
    use super::*;

    #[test]
    fn merges_the_compact_notation_default() {
        let mock = mock_intl();
        let mut cache = create_formatter_cache();
        let locale = single_locale("en-US");
        format_compact_number(&mut cache, &mock.host, 1_200_000.0, &locale, None);
        assert_eq!(
            factory_calls_for(&mock, "number")[0].options_key,
            "number|en-US|{\"notation\":\"compact\"}"
        );
        assert_eq!(*mock.format_inputs.lock().unwrap(), vec![1_200_000.0]);
    }
}

mod format_currency {
    use super::*;

    #[test]
    fn sets_currency_style_and_code() {
        let mock = mock_intl();
        let mut cache = create_formatter_cache();
        format_currency(
            &mut cache,
            &mock.host,
            1234.5,
            "USD",
            &single_locale("en-US"),
            None,
        );
        assert_eq!(
            factory_calls_for(&mock, "number")[0].options_key,
            "number|en-US|{\"style\":\"currency\",\"currency\":\"USD\"}"
        );
    }
}

mod format_intl_number {
    use super::*;

    #[test]
    fn delegates_one_value_format_to_the_handle() {
        let mock = mock_intl();
        let handle =
            (mock.host.create_number_format)(&single_locale("en-US"), &empty_number_options());
        assert_eq!(format_intl_number(&handle, 2.0), (handle.format)(2.0));
    }
}

mod format_number {
    use super::*;

    #[test]
    fn passes_nan_through_the_host() {
        let mock = mock_intl();
        let mut cache = create_formatter_cache();
        assert_eq!(
            format_number(
                &mut cache,
                &mock.host,
                f64::NAN,
                &single_locale("en-US"),
                None
            ),
            "NaN"
        );
    }

    #[test]
    fn reuses_one_host_formatter_for_identical_locale_and_options() {
        let mock = mock_intl();
        let mut cache = create_formatter_cache();
        let locale = single_locale("ja-JP");
        format_number(&mut cache, &mock.host, 1.0, &locale, None);
        format_number(&mut cache, &mock.host, 2.0, &locale, None);
        assert_eq!(factory_calls_for(&mock, "number").len(), 1);
        let mut values = empty_number_options();
        values.minimum_fraction_digits = Some(2.0);
        format_number(&mut cache, &mock.host, 3.0, &locale, Some(&values));
        assert_eq!(factory_calls_for(&mock, "number").len(), 2);
    }
}

mod format_percent {
    use super::*;

    #[test]
    fn sets_percent_style_and_lets_a_caller_override_it() {
        let mock = mock_intl();
        let mut cache = create_formatter_cache();
        let locale = single_locale("en-US");
        format_percent(&mut cache, &mock.host, 0.25, &locale, None);
        assert_eq!(
            factory_calls_for(&mock, "number")[0].options_key,
            "number|en-US|{\"style\":\"percent\"}"
        );
        let mut values = empty_number_options();
        values.style = Some(NumberStyle::Decimal);
        format_percent(&mut cache, &mock.host, 0.25, &locale, Some(&values));
        assert_eq!(
            factory_calls_for(&mock, "number")[1].options_key,
            "number|en-US|{\"style\":\"decimal\"}"
        );
    }
}

mod format_unit {
    use super::*;

    #[test]
    fn sets_unit_style_and_identifier() {
        let mock = mock_intl();
        let mut cache = create_formatter_cache();
        format_unit(
            &mut cache,
            &mock.host,
            5.0,
            "kilometer-per-hour",
            &single_locale("en-US"),
            None,
        );
        assert_eq!(
            factory_calls_for(&mock, "number")[0].options_key,
            "number|en-US|{\"style\":\"unit\",\"unit\":\"kilometer-per-hour\"}"
        );
    }
}
