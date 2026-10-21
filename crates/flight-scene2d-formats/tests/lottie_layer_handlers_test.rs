use std::sync::Arc;

use flight_scene2d_formats::contract::*;

mod lottie_all_layer_handlers {
    use super::*;

    #[test]
    fn contains_every_builtin_layer_handler() {
        let mut registry = create_lottie_registry();
        register_lottie_layer_handlers(&mut registry);
        let expected = [
            (LOTTIE_LAYER_KIND_IMAGE, 0),
            (LOTTIE_LAYER_KIND_NULL, 1),
            (LOTTIE_LAYER_KIND_PRECOMPOSITION, 2),
            (LOTTIE_LAYER_KIND_SHAPE, 3),
            (LOTTIE_LAYER_KIND_SOLID, 4),
            (LOTTIE_LAYER_KIND_TEXT, 5),
        ];
        assert_eq!(LOTTIE_ALL_LAYER_HANDLERS.len(), expected.len());
        for (kind, index) in expected {
            assert!(Arc::ptr_eq(
                &get_lottie_layer_handler(&registry, kind).unwrap(),
                &LOTTIE_ALL_LAYER_HANDLERS[index]
            ));
        }
    }
}

mod register_lottie_layer_handlers {
    use super::*;

    #[test]
    fn registers_exactly_one_handler_for_every_layer_kind_and_no_other_families() {
        let mut registry = create_lottie_registry();
        register_lottie_layer_handlers(&mut registry);
        let mut kinds = registry
            .layer_handlers
            .iter()
            .map(|entry| entry.kind)
            .collect::<Vec<_>>();
        kinds.sort();
        assert_eq!(kinds, [0, 1, 2, 3, 4, 5]);
        assert!(registry.mask_handlers.is_empty());
        assert!(registry.shape_item_handlers.is_empty());
    }
}
