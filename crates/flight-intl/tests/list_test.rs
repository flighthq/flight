use flight_entity::entries;
use flight_intl::contract::*;

use crate::test_support::*;

mod format_list {
    use super::*;

    #[test]
    fn forwards_items_with_no_options_as_an_omitted_key() {
        let mock = mock_intl();
        let mut cache = create_formatter_cache();
        let locale = single_locale("en-US");
        let items = vec!["a".to_string(), "b".to_string(), "c".to_string()];
        format_list(&mut cache, &mock.host, &items, &locale, None);
        let calls = factory_calls_for(&mock, "list");
        assert_eq!(get_cache_key("list", &locale, None), "list|en-US|");
        assert_eq!(*mock.list_inputs.lock().unwrap(), vec![items]);
        assert!(entries(&calls[0].options).is_empty());
    }

    #[test]
    fn forwards_disjunction_options_and_reuses_the_cache() {
        let mock = mock_intl();
        let mut cache = create_formatter_cache();
        let locale = single_locale("en-US");
        let items = vec!["a".to_string(), "b".to_string()];
        let values = options(&[("type", option_text("disjunction"))]);
        format_list(&mut cache, &mock.host, &items, &locale, Some(&values));
        format_list(&mut cache, &mock.host, &items, &locale, Some(&values));
        let calls = factory_calls_for(&mock, "list");
        assert_eq!(calls.len(), 1);
        assert_eq!(
            get_cache_key("list", &locale, Some(&calls[0].options)),
            "list|en-US|{\"type\":\"disjunction\"}"
        );
    }
}
