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
    fn serializes_a_string_locale_and_named_options_into_a_stable_key() {
        let mut values = empty_number_options();
        values.style = Some(NumberStyle::Percent);
        assert_eq!(
            get_cache_key(
                "number",
                &single_locale("en-US"),
                Some(&IntlOptionsKey::Number(NumberFormatOptionsKey {
                    options: &values
                }))
            ),
            "number|en-US|{\"style\":\"percent\"}"
        );
    }

    #[test]
    fn joins_a_locale_fallback_list() {
        let locale = LocaleInput::List(LocaleList {
            locales: vec!["fr-CA".to_string(), "fr".to_string()],
        });
        assert_eq!(get_cache_key("number", &locale, None), "number|fr-CA,fr|");
    }

    #[test]
    fn separates_keys_by_kind_and_by_options() {
        let percent = {
            let mut v = empty_number_options();
            v.style = Some(NumberStyle::Percent);
            v
        };
        let currency = {
            let mut v = empty_number_options();
            v.style = Some(NumberStyle::Currency);
            v
        };
        assert_ne!(
            get_cache_key("number", &single_locale("en-US"), None),
            get_cache_key("date", &single_locale("en-US"), None)
        );
        assert_ne!(
            get_cache_key(
                "number",
                &single_locale("en-US"),
                Some(&IntlOptionsKey::Number(NumberFormatOptionsKey {
                    options: &percent
                }))
            ),
            get_cache_key(
                "number",
                &single_locale("en-US"),
                Some(&IntlOptionsKey::Number(NumberFormatOptionsKey {
                    options: &currency
                }))
            )
        );
    }

    #[test]
    fn distinguishes_an_omitted_options_record_from_a_default_one() {
        let empty = empty_list_options();
        assert_eq!(
            get_cache_key("list", &single_locale("en-US"), None),
            "list|en-US|"
        );
        assert_eq!(
            get_cache_key(
                "list",
                &single_locale("en-US"),
                Some(&IntlOptionsKey::List(ListFormatOptionsKey {
                    options: &empty
                }))
            ),
            "list|en-US|{}"
        );
    }

    #[test]
    fn emits_present_fields_in_ecma_order_with_scalar_types() {
        let mut values = empty_number_options();
        values.currency = Some("USD".to_string());
        values.style = Some(NumberStyle::Currency);
        assert_eq!(
            get_cache_key(
                "number",
                &single_locale("en-US"),
                Some(&IntlOptionsKey::Number(NumberFormatOptionsKey {
                    options: &values
                }))
            ),
            "number|en-US|{\"style\":\"currency\",\"currency\":\"USD\"}"
        );
        let mut collator = empty_collator_options();
        collator.numeric = Some(true);
        assert_eq!(
            get_cache_key(
                "collator",
                &single_locale("en-US"),
                Some(&IntlOptionsKey::Collator(CollatorOptionsKey {
                    options: &collator
                }))
            ),
            "collator|en-US|{\"numeric\":true}"
        );
    }

    #[test]
    fn keeps_the_js_number_domain_and_json_projection() {
        let mut digits = empty_number_options();
        digits.minimum_fraction_digits = Some(2.0);
        assert_eq!(
            get_cache_key(
                "number",
                &single_locale("en-US"),
                Some(&IntlOptionsKey::Number(NumberFormatOptionsKey {
                    options: &digits
                }))
            ),
            "number|en-US|{\"minimumFractionDigits\":2}"
        );
        digits.minimum_fraction_digits = Some(2.5);
        assert_eq!(
            get_cache_key(
                "number",
                &single_locale("en-US"),
                Some(&IntlOptionsKey::Number(NumberFormatOptionsKey {
                    options: &digits
                }))
            ),
            "number|en-US|{\"minimumFractionDigits\":2.5}"
        );
        digits.minimum_fraction_digits = Some(f64::NAN);
        assert_eq!(
            get_cache_key(
                "number",
                &single_locale("en-US"),
                Some(&IntlOptionsKey::Number(NumberFormatOptionsKey {
                    options: &digits
                }))
            ),
            "number|en-US|{\"minimumFractionDigits\":null}"
        );
    }

    #[test]
    fn escapes_strings_like_json() {
        let mut values = empty_number_options();
        values.unit = Some("a\"b\\c\n".to_string());
        assert_eq!(
            get_cache_key(
                "number",
                &single_locale("en-US"),
                Some(&IntlOptionsKey::Number(NumberFormatOptionsKey {
                    options: &values
                }))
            ),
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
    }
}
