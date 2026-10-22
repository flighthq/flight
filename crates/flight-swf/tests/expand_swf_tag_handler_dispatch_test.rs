use std::sync::Arc;

use crate::support::create_test_handler;
use flight_swf::contract::*;

mod expand_swf_tag_handler_dispatch {
    use super::*;

    #[test]
    fn claims_nothing_for_an_empty_handler_array() {
        assert!(expand_swf_tag_handler_dispatch(&[]).is_empty());
    }

    #[test]
    fn covers_every_tag_of_every_named_handler() {
        let handlers = vec![
            create_test_handler(&[2, 22, 32, 83]),
            create_test_handler(&[46, 84]),
        ];
        let dispatch = expand_swf_tag_handler_dispatch(&handlers);
        for handler in handlers {
            for tag in &handler.tags {
                assert!(dispatch.contains_key(tag));
            }
        }
        assert!(!dispatch.is_empty());
    }

    #[test]
    fn maps_every_claimed_tag_to_that_handler() {
        let handler = create_test_handler(&[2, 22, 32, 83]);
        let dispatch = expand_swf_tag_handler_dispatch(&[handler.clone()]);
        for tag in &handler.tags {
            assert!(Arc::ptr_eq(dispatch.get(tag).unwrap(), &handler));
        }
    }

    #[test]
    fn resolves_a_contested_tag_to_the_last_handler_named() {
        let stock = create_test_handler(&[2, 22]);
        let override_handler = create_test_handler(&[2]);
        let dispatch = expand_swf_tag_handler_dispatch(&[stock.clone(), override_handler.clone()]);
        assert!(Arc::ptr_eq(dispatch.get(&2).unwrap(), &override_handler));
        let reverse = expand_swf_tag_handler_dispatch(&[override_handler, stock.clone()]);
        assert!(Arc::ptr_eq(reverse.get(&2).unwrap(), &stock));
    }
}
