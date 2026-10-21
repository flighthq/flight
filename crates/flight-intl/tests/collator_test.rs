use flight_intl::contract::*;

use crate::test_support::*;

mod compare_strings {
    use super::*;

    #[test]
    fn returns_the_host_comparator_result() {
        let mock = mock_intl();
        let mut cache = create_formatter_cache();
        let locale = single_locale("en-US");
        assert!(compare_strings(&mut cache, &mock.host, "a", "b", &locale, None) < 0.0);
        assert!(compare_strings(&mut cache, &mock.host, "b", "a", &locale, None) > 0.0);
    }

    #[test]
    fn reuses_one_collator_for_identical_locale_and_options() {
        let mock = mock_intl();
        let mut cache = create_formatter_cache();
        let locale = single_locale("en-US");
        compare_strings(&mut cache, &mock.host, "a", "b", &locale, None);
        compare_strings(&mut cache, &mock.host, "c", "d", &locale, None);
        assert_eq!(factory_calls_for(&mock, "collator").len(), 1);
        compare_strings(
            &mut cache,
            &mock.host,
            "a",
            "b",
            &locale,
            Some(&options(&[("numeric", option_bool(true))])),
        );
        assert_eq!(factory_calls_for(&mock, "collator").len(), 2);
    }

    #[test]
    fn forwards_the_locale_and_options_to_the_host_factory() {
        let mock = mock_intl();
        let mut cache = create_formatter_cache();
        let locale = LocaleInput::List(vec!["fr-CA".to_string(), "fr".to_string()]);
        let values = options(&[("sensitivity", option_text("base"))]);
        compare_strings(&mut cache, &mock.host, "a", "b", &locale, Some(&values));
        let calls = factory_calls_for(&mock, "collator");
        assert_eq!(calls[0].locale, locale);
        assert!(same_options(&calls[0].options, &values));
    }
}

mod sort_strings {
    use super::*;

    #[test]
    fn returns_a_new_sorted_array() {
        let mock = mock_intl();
        let mut cache = create_formatter_cache();
        let locale = single_locale("en-US");
        let items = vec!["b".to_string(), "a".to_string(), "c".to_string()];
        let sorted = sort_strings(&mut cache, &mock.host, &items, &locale, None);
        assert_eq!(
            sorted,
            vec!["a".to_string(), "b".to_string(), "c".to_string()]
        );
    }

    #[test]
    fn does_not_mutate_the_input_array() {
        let mock = mock_intl();
        let mut cache = create_formatter_cache();
        let locale = single_locale("en-US");
        let items = vec!["b".to_string(), "a".to_string(), "c".to_string()];
        sort_strings(&mut cache, &mock.host, &items, &locale, None);
        assert_eq!(
            items,
            vec!["b".to_string(), "a".to_string(), "c".to_string()]
        );
    }
}
