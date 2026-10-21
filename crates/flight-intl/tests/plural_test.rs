use flight_intl::contract::*;

use crate::test_support::*;

mod select_ordinal_category {
    use super::*;

    #[test]
    fn merges_the_ordinal_type_and_forwards_the_value() {
        let mock = mock_intl();
        let mut cache = create_formatter_cache();
        let locale = single_locale("en-US");
        assert_eq!(
            select_ordinal_category(&mut cache, &mock.host, 1.0, &locale, None),
            IntlPluralCategory::One
        );
        assert_eq!(
            select_ordinal_category(&mut cache, &mock.host, 2.0, &locale, None),
            IntlPluralCategory::Other
        );
        let calls = factory_calls_for(&mock, "plural");
        assert_eq!(calls.len(), 1);
        assert_eq!(
            get_cache_key("plural", &locale, Some(&calls[0].options)),
            "plural|en-US|{\"type\":\"ordinal\"}"
        );
        assert_eq!(*mock.plural_inputs.lock().unwrap(), vec![1.0, 2.0]);
    }
}

mod select_plural_category {
    use super::*;

    #[test]
    fn merges_the_cardinal_type_and_uses_a_distinct_cache_key() {
        let mock = mock_intl();
        let mut cache = create_formatter_cache();
        let locale = single_locale("en-US");
        select_plural_category(&mut cache, &mock.host, 1.0, &locale, None);
        select_ordinal_category(&mut cache, &mock.host, 1.0, &locale, None);
        let calls = factory_calls_for(&mock, "plural");
        assert_eq!(calls.len(), 2);
        assert_eq!(
            get_cache_key("plural", &locale, Some(&calls[0].options)),
            "plural|en-US|{\"type\":\"cardinal\"}"
        );
    }
}
