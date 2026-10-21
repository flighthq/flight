use flight_intl::contract::*;

use crate::test_support::*;

mod compare_intl_collator {
    use super::*;

    #[test]
    fn delegates_one_comparison_to_the_handle() {
        let mock = mock_intl();
        let handle =
            (mock.host.create_collator)(&single_locale("en-US"), &empty_collator_options());
        assert_eq!(
            compare_intl_collator(&handle, "a", "b"),
            (handle.compare)("a", "b")
        );
    }
}

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
        let mut values = empty_collator_options();
        values.numeric = Some(true);
        compare_strings(&mut cache, &mock.host, "a", "b", &locale, Some(&values));
        assert_eq!(factory_calls_for(&mock, "collator").len(), 2);
    }

    #[test]
    fn forwards_the_locale_and_named_options_to_the_host_factory() {
        let mock = mock_intl();
        let mut cache = create_formatter_cache();
        let locale = LocaleInput::List(LocaleList {
            locales: vec!["fr-CA".to_string(), "fr".to_string()],
        });
        let mut values = empty_collator_options();
        values.sensitivity = Some(CollatorSensitivity::Base);
        compare_strings(&mut cache, &mock.host, "a", "b", &locale, Some(&values));
        let calls = factory_calls_for(&mock, "collator");
        assert_eq!(calls[0].locale, locale);
        assert_eq!(
            calls[0].options_key,
            "collator|fr-CA,fr|{\"sensitivity\":\"base\"}"
        );
    }
}

mod create_intl_collator {
    use super::*;

    #[test]
    fn builds_through_the_host_capability() {
        let mock = mock_intl();
        let handle = create_intl_collator(
            &mock.host,
            &single_locale("en-US"),
            &empty_collator_options(),
        );
        assert_eq!(
            compare_intl_collator(&handle, "a", "b"),
            (handle.compare)("a", "b")
        );
    }
}

mod sort_strings {
    use super::*;

    #[test]
    fn returns_a_new_sorted_array_without_mutating_the_input() {
        let mock = mock_intl();
        let mut cache = create_formatter_cache();
        let locale = single_locale("en-US");
        let items = vec!["b".to_string(), "a".to_string(), "c".to_string()];
        let mut sorted = Vec::with_capacity(8);
        sorted.push("stale".to_string());
        sort_strings(&mut sorted, &mut cache, &mock.host, &items, &locale, None);
        assert!(sorted.capacity() >= 8);
        assert_eq!(
            sorted,
            vec!["a".to_string(), "b".to_string(), "c".to_string()]
        );
        assert_eq!(
            items,
            vec!["b".to_string(), "a".to_string(), "c".to_string()]
        );
    }
}
