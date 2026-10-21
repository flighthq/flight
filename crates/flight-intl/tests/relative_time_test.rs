use flight_intl::contract::*;

use crate::test_support::*;

mod create_intl_relative_time_format {
    use super::*;

    #[test]
    fn builds_through_the_host_capability() {
        let mock = mock_intl();
        let handle = create_intl_relative_time_format(
            &mock.host,
            &single_locale("en-US"),
            &empty_relative_time_options(),
        );
        assert_eq!(
            format_intl_relative_time(&handle, 1.0, IntlRelativeTimeUnit::Day),
            "relative:1:day"
        );
    }
}

mod format_intl_relative_time {
    use super::*;

    #[test]
    fn delegates_one_relative_format_to_the_handle() {
        let mock = mock_intl();
        let handle = (mock.host.create_relative_time_format)(
            &single_locale("en-US"),
            &empty_relative_time_options(),
        );
        assert_eq!(
            format_intl_relative_time(&handle, 1.0, IntlRelativeTimeUnit::Day),
            (handle.format)(1.0, IntlRelativeTimeUnit::Day)
        );
    }
}

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
        let calls = factory_calls_for(&mock, "relativetime");
        assert_eq!(calls.len(), 1);
        assert_eq!(calls[0].options_key, "relativetime|en-US|{}");
    }

    #[test]
    fn forwards_options_into_the_cache_key() {
        let mock = mock_intl();
        let mut cache = create_formatter_cache();
        let locale = single_locale("en-US");
        let mut values = empty_relative_time_options();
        values.numeric = Some(RelativeTimeNumeric::Auto);
        format_relative_time(
            &mut cache,
            &mock.host,
            1.0,
            IntlRelativeTimeUnit::Day,
            &locale,
            Some(&values),
        );
        assert_eq!(
            factory_calls_for(&mock, "relativetime")[0].options_key,
            "relativetime|en-US|{\"numeric\":\"auto\"}"
        );
    }
}
