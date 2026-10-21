use std::sync::Arc;

use flight_scene2d_formats::contract::*;

mod lottie_all_mask_handlers {
    use super::*;

    #[test]
    fn contains_every_builtin_mask_handler() {
        let mut registry = create_lottie_registry();
        register_lottie_mask_handlers(&mut registry);
        assert_eq!(LOTTIE_ALL_MASK_HANDLERS.len(), 1);
        assert!(Arc::ptr_eq(
            &get_lottie_mask_handler(&registry, LOTTIE_MASK_KIND_ADDITIVE).unwrap(),
            &LOTTIE_ALL_MASK_HANDLERS[0]
        ));
    }
}

mod register_lottie_mask_handlers {
    use super::*;

    #[test]
    fn registers_the_additive_mode_alone_and_no_other_handler_families() {
        let mut registry = create_lottie_registry();
        register_lottie_mask_handlers(&mut registry);
        assert_eq!(registry.mask_handlers.len(), 1);
        assert_eq!(registry.mask_handlers[0].kind, LOTTIE_MASK_KIND_ADDITIVE);
        assert!(registry.layer_handlers.is_empty());
        assert!(registry.shape_item_handlers.is_empty());
    }
}
