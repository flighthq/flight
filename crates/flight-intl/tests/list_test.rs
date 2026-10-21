use flight_intl::contract::*;

use crate::test_support::*;

mod create_intl_list_format {
    use super::*;

    #[test]
    fn builds_through_the_host_capability() {
        let mock = mock_intl();
        let handle =
            create_intl_list_format(&mock.host, &single_locale("en-US"), &empty_list_options());
        assert_eq!(format_intl_list(&handle, &["a".to_string()]), "a");
    }
}

mod format_intl_list {
    use super::*;

    #[test]
    fn delegates_one_list_join_to_the_handle() {
        let mock = mock_intl();
        let handle = (mock.host.create_list_format)(&single_locale("en-US"), &empty_list_options());
        let items = vec!["a".to_string(), "b".to_string()];
        assert_eq!(format_intl_list(&handle, &items), (handle.format)(&items));
    }
}

mod format_list {
    use super::*;

    #[test]
    fn forwards_items_with_no_options_as_an_omitted_key() {
        let mock = mock_intl();
        let mut cache = create_formatter_cache();
        let locale = single_locale("en-US");
        let items = vec!["a".to_string(), "b".to_string(), "c".to_string()];
        format_list(&mut cache, &mock.host, &items, &locale, None);
        assert_eq!(*mock.list_inputs.lock().unwrap(), vec![items]);
        assert_eq!(
            factory_calls_for(&mock, "list")[0].options_key,
            "list|en-US|{}"
        );
    }

    #[test]
    fn forwards_disjunction_options_and_reuses_the_cache() {
        let mock = mock_intl();
        let mut cache = create_formatter_cache();
        let locale = single_locale("en-US");
        let items = vec!["a".to_string(), "b".to_string()];
        let mut values = empty_list_options();
        values.type_ = Some(ListType::Disjunction);
        format_list(&mut cache, &mock.host, &items, &locale, Some(&values));
        format_list(&mut cache, &mock.host, &items, &locale, Some(&values));
        let calls = factory_calls_for(&mock, "list");
        assert_eq!(calls.len(), 1);
        assert_eq!(
            calls[0].options_key,
            "list|en-US|{\"type\":\"disjunction\"}"
        );
    }
}
