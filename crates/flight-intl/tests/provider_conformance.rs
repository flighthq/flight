//! Principal-authorized deferrals: the pinned locale-output assertions, kept intact for the future
//! host-icu provider (D19). The placeholder host panics if any ignored test is ever run without a
//! real provider; these tests are not proof of SDK behavior.

use std::sync::Arc;

use flight_intl::contract::*;

fn host_icu_placeholder() -> HostIntlCapability {
    let unavailable: &'static str = "provider conformance: host-icu (D19) is not implemented";
    let collator = move |_locale: &LocaleInput, _options: &CollatorOptions| IntlCollatorHandle {
        compare: Arc::new(move |_a: &str, _b: &str| panic!("{}", unavailable)),
    };
    let date =
        move |_locale: &LocaleInput, _options: &DateTimeFormatOptions| IntlDateTimeFormatHandle {
            format: Arc::new(move |_value: f64| panic!("{}", unavailable)),
        };
    let list = move |_locale: &LocaleInput, _options: &ListFormatOptions| IntlListFormatHandle {
        format: Arc::new(move |_items: &[String]| panic!("{}", unavailable)),
    };
    let number =
        move |_locale: &LocaleInput, _options: &NumberFormatOptions| IntlNumberFormatHandle {
            format: Arc::new(move |_value: f64| panic!("{}", unavailable)),
        };
    let plural =
        move |_locale: &LocaleInput, _options: &PluralRulesOptions| IntlPluralRulesHandle {
            select: Arc::new(move |_value: f64| panic!("{}", unavailable)),
        };
    let relative = move |_locale: &LocaleInput, _options: &RelativeTimeFormatOptions| {
        IntlRelativeTimeFormatHandle {
            format: Arc::new(move |_value: f64, _unit: IntlRelativeTimeUnit| {
                panic!("{}", unavailable)
            }),
        }
    };
    return HostIntlCapability {
        provider: Arc::new(()),
        create_collator: Arc::new(collator),
        create_date_time_format: Arc::new(date),
        create_list_format: Arc::new(list),
        create_number_format: Arc::new(number),
        create_plural_rules: Arc::new(plural),
        create_relative_time_format: Arc::new(relative),
    };
}

fn utc(
    y: Option<TimeFieldStyle>,
    m: Option<MonthStyle>,
    d: Option<TimeFieldStyle>,
) -> DateTimeFormatOptions {
    let mut values = empty_date_time_options();
    values.year = y;
    values.month = m;
    values.day = d;
    values.time_zone = Some("UTC".to_string());
    return values;
}

fn empty_date_time_options() -> DateTimeFormatOptions {
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

mod locale_output_conformance {
    use super::*;

    const INSTANT: f64 = 1579093500000.0;

    #[test]
    #[ignore = "provider conformance: host-icu (D19)"]
    fn date_orders_numeric_fields_per_locale() {
        let mut cache = create_formatter_cache();
        let options = utc(
            Some(TimeFieldStyle::Numeric),
            Some(MonthStyle::Numeric),
            Some(TimeFieldStyle::Numeric),
        );
        assert_eq!(
            format_date(
                &mut cache,
                &host_icu_placeholder(),
                INSTANT,
                &LocaleInput::Single("en-US".into()),
                Some(&options)
            ),
            "1/15/2020"
        );
        assert_eq!(
            format_date(
                &mut cache,
                &host_icu_placeholder(),
                INSTANT,
                &LocaleInput::Single("de-DE".into()),
                Some(&options)
            ),
            "15.1.2020"
        );
    }

    #[test]
    #[ignore = "provider conformance: host-icu (D19)"]
    fn time_formats_per_locale_clock() {
        let mut cache = create_formatter_cache();
        let mut options = empty_date_time_options();
        options.hour = Some(TimeFieldStyle::Numeric);
        options.minute = Some(TimeFieldStyle::Numeric);
        options.time_zone = Some("UTC".into());
        assert_eq!(
            format_time(
                &mut cache,
                &host_icu_placeholder(),
                INSTANT,
                &LocaleInput::Single("en-US".into()),
                Some(&options)
            ),
            "1:05 PM"
        );
        assert_eq!(
            format_time(
                &mut cache,
                &host_icu_placeholder(),
                INSTANT,
                &LocaleInput::Single("de-DE".into()),
                Some(&options)
            ),
            "13:05"
        );
    }

    #[test]
    #[ignore = "provider conformance: host-icu (D19)"]
    fn lists_join_as_conjunction_or_disjunction() {
        let mut cache = create_formatter_cache();
        let items = vec!["a".to_string(), "b".to_string(), "c".to_string()];
        let locale = LocaleInput::Single("en-US".into());
        assert_eq!(
            format_list(&mut cache, &host_icu_placeholder(), &items, &locale, None),
            "a, b, and c"
        );
        let mut options = empty_list_options();
        options.type_ = Some(ListType::Disjunction);
        assert_eq!(
            format_list(
                &mut cache,
                &host_icu_placeholder(),
                &items,
                &locale,
                Some(&options)
            ),
            "a, b, or c"
        );
    }

    #[test]
    #[ignore = "provider conformance: host-icu (D19)"]
    fn numbers_use_locale_spellings_and_sentinels() {
        let mut cache = create_formatter_cache();
        let en = LocaleInput::Single("en-US".into());
        let de = LocaleInput::Single("de-DE".into());
        assert_eq!(
            format_number(&mut cache, &host_icu_placeholder(), 1234.56, &en, None),
            "1,234.56"
        );
        assert_eq!(
            format_number(&mut cache, &host_icu_placeholder(), 1234.56, &de, None),
            "1.234,56"
        );
        assert_eq!(
            format_number(&mut cache, &host_icu_placeholder(), f64::NAN, &en, None),
            "NaN"
        );
        assert_eq!(
            format_currency(
                &mut cache,
                &host_icu_placeholder(),
                1234.5,
                "USD",
                &en,
                None
            ),
            "$1,234.50"
        );
        assert_eq!(
            format_percent(&mut cache, &host_icu_placeholder(), 0.25, &en, None),
            "25%"
        );
        assert_eq!(
            format_compact_number(&mut cache, &host_icu_placeholder(), 1_200_000.0, &en, None),
            "1.2M"
        );
        assert!(
            format_unit(
                &mut cache,
                &host_icu_placeholder(),
                5.0,
                "kilometer-per-hour",
                &en,
                None
            )
            .contains("km/h")
        );
    }

    #[test]
    #[ignore = "provider conformance: host-icu (D19)"]
    fn plurals_distinguish_ordinal_and_cardinal_forms() {
        let mut cache = create_formatter_cache();
        let en = LocaleInput::Single("en-US".into());
        let host = host_icu_placeholder();
        assert_eq!(
            select_ordinal_category(&mut cache, &host, 1.0, &en, None),
            IntlPluralCategory::One
        );
        assert_eq!(
            select_ordinal_category(&mut cache, &host, 2.0, &en, None),
            IntlPluralCategory::Two
        );
        assert_eq!(
            select_ordinal_category(&mut cache, &host, 3.0, &en, None),
            IntlPluralCategory::Few
        );
        assert_eq!(
            select_ordinal_category(&mut cache, &host, 4.0, &en, None),
            IntlPluralCategory::Other
        );
        assert_eq!(
            select_plural_category(&mut cache, &host, 1.0, &en, None),
            IntlPluralCategory::One
        );
        assert_eq!(
            select_plural_category(&mut cache, &host, 2.0, &en, None),
            IntlPluralCategory::Other
        );
    }

    #[test]
    #[ignore = "provider conformance: host-icu (D19)"]
    fn relative_time_phrases_past_and_future() {
        let mut cache = create_formatter_cache();
        let en = LocaleInput::Single("en-US".into());
        assert_eq!(
            format_relative_time(
                &mut cache,
                &host_icu_placeholder(),
                2.0,
                IntlRelativeTimeUnit::Day,
                &en,
                None
            ),
            "in 2 days"
        );
        assert_eq!(
            format_relative_time(
                &mut cache,
                &host_icu_placeholder(),
                -1.0,
                IntlRelativeTimeUnit::Day,
                &en,
                None
            ),
            "1 day ago"
        );
    }
}

fn empty_list_options() -> ListFormatOptions {
    return ListFormatOptions {
        locale_matcher: None,
        type_: None,
        style: None,
    };
}

mod minimal_helper {
    use super::*;

    #[test]
    #[ignore = "provider conformance: host-icu (D19)"]
    fn builder_is_available_to_conformance_tests() {
        assert!(empty_date_time_options().year.is_none());
    }
}
