use flight_intl::contract::*;

mod get_intl_plural_category_string {
    use super::*;

    #[test]
    fn returns_the_source_literals() {
        assert_eq!(
            get_intl_plural_category_string(IntlPluralCategory::Zero),
            "zero"
        );
        assert_eq!(
            get_intl_plural_category_string(IntlPluralCategory::One),
            "one"
        );
        assert_eq!(
            get_intl_plural_category_string(IntlPluralCategory::Two),
            "two"
        );
        assert_eq!(
            get_intl_plural_category_string(IntlPluralCategory::Few),
            "few"
        );
        assert_eq!(
            get_intl_plural_category_string(IntlPluralCategory::Many),
            "many"
        );
        assert_eq!(
            get_intl_plural_category_string(IntlPluralCategory::Other),
            "other"
        );
    }
}

mod get_intl_relative_time_unit_string {
    use super::*;

    #[test]
    fn returns_the_source_literals() {
        assert_eq!(
            get_intl_relative_time_unit_string(IntlRelativeTimeUnit::Year),
            "year"
        );
        assert_eq!(
            get_intl_relative_time_unit_string(IntlRelativeTimeUnit::Years),
            "years"
        );
        assert_eq!(
            get_intl_relative_time_unit_string(IntlRelativeTimeUnit::Quarter),
            "quarter"
        );
        assert_eq!(
            get_intl_relative_time_unit_string(IntlRelativeTimeUnit::Quarters),
            "quarters"
        );
        assert_eq!(
            get_intl_relative_time_unit_string(IntlRelativeTimeUnit::Month),
            "month"
        );
        assert_eq!(
            get_intl_relative_time_unit_string(IntlRelativeTimeUnit::Months),
            "months"
        );
        assert_eq!(
            get_intl_relative_time_unit_string(IntlRelativeTimeUnit::Week),
            "week"
        );
        assert_eq!(
            get_intl_relative_time_unit_string(IntlRelativeTimeUnit::Weeks),
            "weeks"
        );
        assert_eq!(
            get_intl_relative_time_unit_string(IntlRelativeTimeUnit::Day),
            "day"
        );
        assert_eq!(
            get_intl_relative_time_unit_string(IntlRelativeTimeUnit::Days),
            "days"
        );
        assert_eq!(
            get_intl_relative_time_unit_string(IntlRelativeTimeUnit::Hour),
            "hour"
        );
        assert_eq!(
            get_intl_relative_time_unit_string(IntlRelativeTimeUnit::Hours),
            "hours"
        );
        assert_eq!(
            get_intl_relative_time_unit_string(IntlRelativeTimeUnit::Minute),
            "minute"
        );
        assert_eq!(
            get_intl_relative_time_unit_string(IntlRelativeTimeUnit::Minutes),
            "minutes"
        );
        assert_eq!(
            get_intl_relative_time_unit_string(IntlRelativeTimeUnit::Second),
            "second"
        );
        assert_eq!(
            get_intl_relative_time_unit_string(IntlRelativeTimeUnit::Seconds),
            "seconds"
        );
    }
}

mod locale_input {
    use super::*;

    #[test]
    fn distinguishes_a_single_locale_from_a_fallback_list() {
        assert_eq!(
            LocaleInput::Single("en-US".to_string()),
            LocaleInput::Single("en-US".to_string())
        );
        assert_ne!(
            LocaleInput::Single("fr".to_string()),
            LocaleInput::List(vec!["fr".to_string()])
        );
    }
}

mod parse_intl_plural_category {
    use super::*;

    #[test]
    fn round_trips_every_category() {
        for value in [
            IntlPluralCategory::Zero,
            IntlPluralCategory::One,
            IntlPluralCategory::Two,
            IntlPluralCategory::Few,
            IntlPluralCategory::Many,
            IntlPluralCategory::Other,
        ] {
            assert_eq!(
                parse_intl_plural_category(get_intl_plural_category_string(value)),
                Some(value)
            );
        }
    }

    #[test]
    fn rejects_an_unknown_string() {
        assert_eq!(parse_intl_plural_category("lots"), None);
    }
}

mod parse_intl_relative_time_unit {
    use super::*;

    #[test]
    fn round_trips_every_unit() {
        for value in [
            IntlRelativeTimeUnit::Year,
            IntlRelativeTimeUnit::Years,
            IntlRelativeTimeUnit::Quarter,
            IntlRelativeTimeUnit::Quarters,
            IntlRelativeTimeUnit::Month,
            IntlRelativeTimeUnit::Months,
            IntlRelativeTimeUnit::Week,
            IntlRelativeTimeUnit::Weeks,
            IntlRelativeTimeUnit::Day,
            IntlRelativeTimeUnit::Days,
            IntlRelativeTimeUnit::Hour,
            IntlRelativeTimeUnit::Hours,
            IntlRelativeTimeUnit::Minute,
            IntlRelativeTimeUnit::Minutes,
            IntlRelativeTimeUnit::Second,
            IntlRelativeTimeUnit::Seconds,
        ] {
            assert_eq!(
                parse_intl_relative_time_unit(get_intl_relative_time_unit_string(value)),
                Some(value)
            );
        }
    }

    #[test]
    fn rejects_an_unknown_string() {
        assert_eq!(parse_intl_relative_time_unit("fortnight"), None);
    }
}
