use std::cell::Cell;
use std::sync::Arc;

use flight_intl::contract::*;

use crate::test_support::*;

mod create_formatter_cache {
    use super::*;

    #[test]
    fn starts_empty_and_builds_on_first_use() {
        let mut cache = create_formatter_cache();
        let built = get_cached(&mut cache, "cache-test|empty", || 5u32);
        assert_eq!(*built, 5);
    }
}

mod get_cache_key {
    use super::*;

    #[test]
    fn serializes_a_string_locale_and_options_into_a_stable_key() {
        let values = options(&[("style", option_text("percent"))]);
        assert_eq!(
            get_cache_key("number", &single_locale("en-US"), Some(&values)),
            "number|en-US|{\"style\":\"percent\"}"
        );
    }

    #[test]
    fn joins_a_locale_fallback_list() {
        let locale = LocaleInput::List(vec!["fr-CA".to_string(), "fr".to_string()]);
        assert_eq!(get_cache_key("number", &locale, None), "number|fr-CA,fr|");
    }

    #[test]
    fn separates_keys_by_kind_and_by_options() {
        assert_ne!(
            get_cache_key("number", &single_locale("en-US"), None),
            get_cache_key("date", &single_locale("en-US"), None)
        );
        let percent = options(&[("style", option_text("percent"))]);
        let currency = options(&[("style", option_text("currency"))]);
        assert_ne!(
            get_cache_key("number", &single_locale("en-US"), Some(&percent)),
            get_cache_key("number", &single_locale("en-US"), Some(&currency))
        );
    }

    #[test]
    fn distinguishes_an_omitted_options_object_from_an_empty_one() {
        let empty = options(&[]);
        assert_eq!(
            get_cache_key("list", &single_locale("en-US"), None),
            "list|en-US|"
        );
        assert_eq!(
            get_cache_key("list", &single_locale("en-US"), Some(&empty)),
            "list|en-US|{}"
        );
        assert_ne!(
            get_cache_key("list", &single_locale("en-US"), None),
            get_cache_key("list", &single_locale("en-US"), Some(&empty))
        );
    }

    #[test]
    fn preserves_insertion_order_and_scalar_types() {
        let ordered = options(&[
            ("style", option_text("currency")),
            ("currency", option_text("USD")),
        ]);
        let reversed = options(&[
            ("currency", option_text("USD")),
            ("style", option_text("currency")),
        ]);
        assert_eq!(
            get_cache_key("number", &single_locale("en-US"), Some(&ordered)),
            "number|en-US|{\"style\":\"currency\",\"currency\":\"USD\"}"
        );
        assert_ne!(
            get_cache_key("number", &single_locale("en-US"), Some(&ordered)),
            get_cache_key("number", &single_locale("en-US"), Some(&reversed))
        );
        let scalars = options(&[
            ("numeric", option_bool(true)),
            ("minimumFractionDigits", option_integer(2)),
        ]);
        assert_eq!(
            get_cache_key("collator", &single_locale("en-US"), Some(&scalars)),
            "collator|en-US|{\"numeric\":true,\"minimumFractionDigits\":2}"
        );
    }

    #[test]
    fn escapes_strings_like_json() {
        let values = options(&[("unit", option_text("a\"b\\c\n"))]);
        assert_eq!(
            get_cache_key("number", &single_locale("en-US"), Some(&values)),
            "number|en-US|{\"unit\":\"a\\\"b\\\\c\\n\"}"
        );
    }
}

mod get_cached {
    use super::*;

    #[test]
    fn builds_once_per_key_and_returns_the_same_instance() {
        let mut cache = create_formatter_cache();
        let builds = Cell::new(0);
        let first = get_cached(&mut cache, "cache-test|reuse", || {
            builds.set(builds.get() + 1);
            return 11u32;
        });
        let second = get_cached(&mut cache, "cache-test|reuse", || {
            builds.set(builds.get() + 1);
            return 22u32;
        });
        assert_eq!(builds.get(), 1);
        assert!(Arc::ptr_eq(&first, &second));
        assert_eq!(*second, 11);
    }

    #[test]
    fn rebuilds_for_a_different_key() {
        let mut cache = create_formatter_cache();
        let builds = Cell::new(0);
        let a = get_cached(&mut cache, "cache-test|a", || {
            builds.set(builds.get() + 1);
            return 1u32;
        });
        let b = get_cached(&mut cache, "cache-test|b", || {
            builds.set(builds.get() + 1);
            return 2u32;
        });
        assert_eq!(builds.get(), 2);
        assert!(!Arc::ptr_eq(&a, &b));
        assert_eq!(*b, 2);
    }

    #[test]
    fn evicts_the_oldest_entry_first_with_a_capacity_of_256() {
        let mut cache = create_formatter_cache();
        let mut index = 0u32;
        while index < 256 {
            let key = format!("cache-test|fifo|{}", index);
            get_cached(&mut cache, &key, || index);
            index += 1;
        }
        get_cached(&mut cache, "cache-test|fifo|256", || 256u32);

        let rebuilds = Cell::new(0);
        get_cached(&mut cache, "cache-test|fifo|0", || {
            rebuilds.set(rebuilds.get() + 1);
            return 0u32;
        });
        assert_eq!(rebuilds.get(), 1);
        let hits = Cell::new(0);
        get_cached(&mut cache, "cache-test|fifo|255", || {
            hits.set(hits.get() + 1);
            return 255u32;
        });
        assert_eq!(hits.get(), 0);
    }
}
