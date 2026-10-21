use flight_intl::contract::*;

use crate::test_support::*;

mod format_relative_time {
    use super::*;

    #[test]
    fn forwards_value_and_unit_to_the_host_formatter() {
        let mock = mock_intl();
        let mut cache = create_formatter_cache();
        let locale = single_locale("en-US");
        assert_eq!(
            format_relative_time(
                &mut cache,
                &mock.host,
                2.0,
                IntlRelativeTimeUnit::Day,
                &locale,
                None
            ),
            "relative:2:day"
        );
        assert_eq!(
            format_relative_time(
                &mut cache,
                &mock.host,
                -1.0,
                IntlRelativeTimeUnit::Day,
                &locale,
                None
            ),
            "relative:-1:day"
        );
        assert_eq!(
            *mock.relative_inputs.lock().unwrap(),
            vec![
                (2.0, IntlRelativeTimeUnit::Day),
                (-1.0, IntlRelativeTimeUnit::Day)
            ]
        );
        let calls = factory_calls_for(&mock, "relativetime");
        assert_eq!(calls.len(), 1);
        assert_eq!(
            get_cache_key("relativetime", &locale, None),
            "relativetime|en-US|"
        );
    }

    #[test]
    fn forwards_options_into_the_cache_key() {
        let mock = mock_intl();
        let mut cache = create_formatter_cache();
        let locale = single_locale("en-US");
        let values = options(&[("numeric", option_text("auto"))]);
        format_relative_time(
            &mut cache,
            &mock.host,
            1.0,
            IntlRelativeTimeUnit::Day,
            &locale,
            Some(&values),
        );
        let calls = factory_calls_for(&mock, "relativetime");
        assert_eq!(
            get_cache_key("relativetime", &locale, Some(&calls[0].options)),
            "relativetime|en-US|{\"numeric\":\"auto\"}"
        );
    }
}
