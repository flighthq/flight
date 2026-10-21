use flight_intl::contract::*;

use crate::test_support::*;

mod create_intl_plural_rules {
    use super::*;

    #[test]
    fn builds_through_the_host_capability() {
        let mock = mock_intl();
        let handle =
            create_intl_plural_rules(&mock.host, &single_locale("en-US"), &empty_plural_options());
        assert_eq!(
            select_intl_plural_category(&handle, 1.0),
            IntlPluralCategory::One
        );
    }
}

mod select_intl_plural_category {
    use super::*;

    #[test]
    fn delegates_one_selection_to_the_handle() {
        let mock = mock_intl();
        let handle =
            (mock.host.create_plural_rules)(&single_locale("en-US"), &empty_plural_options());
        assert_eq!(
            select_intl_plural_category(&handle, 2.0),
            (handle.select)(2.0)
        );
    }
}

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
        assert_eq!(calls[0].options_key, "plural|en-US|{\"type\":\"ordinal\"}");
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
        assert_eq!(calls[0].options_key, "plural|en-US|{\"type\":\"cardinal\"}");
    }
}
