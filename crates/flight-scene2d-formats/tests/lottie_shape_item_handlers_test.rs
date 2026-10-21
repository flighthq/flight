use std::sync::Arc;

use flight_scene2d_formats::contract::*;

mod lottie_all_shape_item_handlers {
    use super::*;

    #[test]
    fn contains_every_builtin_shape_item_handler() {
        let mut registry = create_lottie_registry();
        register_lottie_shape_item_handlers(&mut registry);
        let expected = [
            (LOTTIE_SHAPE_ITEM_KIND_ELLIPSE, 0),
            (LOTTIE_SHAPE_ITEM_KIND_FILL, 1),
            (LOTTIE_SHAPE_ITEM_KIND_GRADIENT_FILL, 2),
            (LOTTIE_SHAPE_ITEM_KIND_GRADIENT_STROKE, 3),
            (LOTTIE_SHAPE_ITEM_KIND_PATH, 4),
            (LOTTIE_SHAPE_ITEM_KIND_POLYSTAR, 5),
            (LOTTIE_SHAPE_ITEM_KIND_RECTANGLE, 6),
            (LOTTIE_SHAPE_ITEM_KIND_STROKE, 7),
            (LOTTIE_SHAPE_ITEM_KIND_TRIM_PATH, 8),
        ];
        assert_eq!(LOTTIE_ALL_SHAPE_ITEM_HANDLERS.len(), expected.len());
        for (kind, index) in expected {
            assert!(Arc::ptr_eq(
                &get_lottie_shape_item_handler(&registry, kind).unwrap(),
                &LOTTIE_ALL_SHAPE_ITEM_HANDLERS[index]
            ));
        }
    }
}

mod register_lottie_shape_item_handlers {
    use super::*;

    #[test]
    fn registers_exactly_one_handler_for_every_shape_item_kind_and_no_other_families() {
        let mut registry = create_lottie_registry();
        register_lottie_shape_item_handlers(&mut registry);
        let mut kinds = registry
            .shape_item_handlers
            .iter()
            .map(|entry| entry.kind.as_str())
            .collect::<Vec<_>>();
        kinds.sort();
        let mut expected = vec![
            LOTTIE_SHAPE_ITEM_KIND_ELLIPSE,
            LOTTIE_SHAPE_ITEM_KIND_FILL,
            LOTTIE_SHAPE_ITEM_KIND_GRADIENT_FILL,
            LOTTIE_SHAPE_ITEM_KIND_GRADIENT_STROKE,
            LOTTIE_SHAPE_ITEM_KIND_PATH,
            LOTTIE_SHAPE_ITEM_KIND_POLYSTAR,
            LOTTIE_SHAPE_ITEM_KIND_RECTANGLE,
            LOTTIE_SHAPE_ITEM_KIND_STROKE,
            LOTTIE_SHAPE_ITEM_KIND_TRIM_PATH,
        ];
        expected.sort();
        assert_eq!(kinds, expected);
        assert!(registry.layer_handlers.is_empty());
        assert!(registry.mask_handlers.is_empty());
    }
}
