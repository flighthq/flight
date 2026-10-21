use flight_intl::contract::*;

use crate::test_support::*;

fn options_key(locale: &LocaleInput, options: &IntlOptions) -> String {
    return get_cache_key("number", locale, Some(options));
}

mod format_compact_number {
    use super::*;

    #[test]
    fn merges_the_compact_notation_default() {
        let mock = mock_intl();
        let mut cache = create_formatter_cache();
        let locale = single_locale("en-US");
        format_compact_number(&mut cache, &mock.host, 1_200_000.0, &locale, None);
        let calls = factory_calls_for(&mock, "number");
        assert_eq!(
            options_key(&locale, &calls[0].options),
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
        let locale = single_locale("en-US");
        format_currency(&mut cache, &mock.host, 1234.5, "USD", &locale, None);
        let calls = factory_calls_for(&mock, "number");
        assert_eq!(
            options_key(&locale, &calls[0].options),
            "number|en-US|{\"style\":\"currency\",\"currency\":\"USD\"}"
        );
    }
}

mod format_number {
    use super::*;

    #[test]
    fn passes_nan_through_the_host() {
        let mock = mock_intl();
        let mut cache = create_formatter_cache();
        let locale = single_locale("en-US");
        assert_eq!(
            format_number(&mut cache, &mock.host, f64::NAN, &locale, None),
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
        let values = options(&[("minimumFractionDigits", option_integer(2))]);
        format_number(&mut cache, &mock.host, 3.0, &locale, Some(&values));
        assert_eq!(factory_calls_for(&mock, "number").len(), 2);
    }
}

mod format_percent {
    use super::*;

    #[test]
    fn sets_percent_style_and_lets_a_caller_override_it_in_place() {
        let mock = mock_intl();
        let mut cache = create_formatter_cache();
        let locale = single_locale("en-US");
        format_percent(&mut cache, &mock.host, 0.25, &locale, None);
        let calls = factory_calls_for(&mock, "number");
        assert_eq!(
            options_key(&locale, &calls[0].options),
            "number|en-US|{\"style\":\"percent\"}"
        );
        let override_values = options(&[("style", option_text("decimal"))]);
        format_percent(
            &mut cache,
            &mock.host,
            0.25,
            &locale,
            Some(&override_values),
        );
        let calls = factory_calls_for(&mock, "number");
        assert_eq!(
            options_key(&locale, &calls[1].options),
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
        let locale = single_locale("en-US");
        format_unit(
            &mut cache,
            &mock.host,
            5.0,
            "kilometer-per-hour",
            &locale,
            None,
        );
        let calls = factory_calls_for(&mock, "number");
        assert_eq!(
            options_key(&locale, &calls[0].options),
            "number|en-US|{\"style\":\"unit\",\"unit\":\"kilometer-per-hour\"}"
        );
    }
}
