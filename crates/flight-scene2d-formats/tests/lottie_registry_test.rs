use std::sync::Arc;

use flight_scene2d_formats::*;

fn layer_handler() -> LottieLayerHandler {
    return Arc::new(|_context| {});
}

fn mask_handler() -> LottieMaskHandler {
    return Arc::new(|_context| {});
}

fn shape_item_handler() -> LottieShapeItemHandler {
    return Arc::new(|_context| {});
}

mod create_lottie_registry {
    use super::*;

    #[test]
    fn creates_independent_empty_registries() {
        let mut first = create_lottie_registry();
        let second = create_lottie_registry();
        assert!(first.layer_handlers.is_empty());
        assert!(first.mask_handlers.is_empty());
        assert!(first.shape_item_handlers.is_empty());
        register_lottie_layer_handler(&mut first, LOTTIE_LAYER_KIND_SHAPE, layer_handler());
        assert_eq!(first.layer_handlers.len(), 1);
        assert!(second.layer_handlers.is_empty());
    }
}

mod get_lottie_layer_handler {
    use super::*;

    #[test]
    fn returns_none_for_an_unregistered_layer_kind() {
        assert!(
            get_lottie_layer_handler(&create_lottie_registry(), LOTTIE_LAYER_KIND_SHAPE).is_none()
        );
    }
}

mod get_lottie_mask_handler {
    use super::*;

    #[test]
    fn returns_none_for_an_unregistered_mask_mode() {
        assert!(
            get_lottie_mask_handler(&create_lottie_registry(), LOTTIE_MASK_KIND_ADDITIVE).is_none()
        );
    }
}

mod get_lottie_shape_item_handler {
    use super::*;

    #[test]
    fn returns_none_for_an_unregistered_shape_item_kind() {
        assert!(
            get_lottie_shape_item_handler(&create_lottie_registry(), LOTTIE_SHAPE_ITEM_KIND_FILL,)
                .is_none()
        );
    }
}

mod register_lottie_layer_handler {
    use super::*;

    #[test]
    fn is_last_write_wins_without_moving_the_registered_key() {
        let mut registry = create_lottie_registry();
        let first = layer_handler();
        let second = layer_handler();
        register_lottie_layer_handler(&mut registry, LOTTIE_LAYER_KIND_SHAPE, first);
        register_lottie_layer_handler(&mut registry, LOTTIE_LAYER_KIND_SHAPE, second.clone());
        assert_eq!(registry.layer_handlers.len(), 1);
        assert!(Arc::ptr_eq(
            &get_lottie_layer_handler(&registry, LOTTIE_LAYER_KIND_SHAPE).unwrap(),
            &second,
        ));
    }

    #[test]
    fn accepts_extensions_outside_the_built_in_layer_vocabulary() {
        let mut registry = create_lottie_registry();
        let handler = layer_handler();
        register_lottie_layer_handler(&mut registry, 99, handler.clone());
        assert!(Arc::ptr_eq(
            &get_lottie_layer_handler(&registry, 99).unwrap(),
            &handler,
        ));
    }
}

mod register_lottie_mask_handler {
    use super::*;

    #[test]
    fn is_last_write_wins_on_the_mask_family_too_and_touches_no_other_family() {
        let mut registry = create_lottie_registry();
        let first = mask_handler();
        let second = mask_handler();
        register_lottie_mask_handler(&mut registry, LOTTIE_MASK_KIND_ADDITIVE, first);
        register_lottie_mask_handler(&mut registry, LOTTIE_MASK_KIND_ADDITIVE, second.clone());
        assert_eq!(registry.mask_handlers.len(), 1);
        assert!(Arc::ptr_eq(
            &get_lottie_mask_handler(&registry, LOTTIE_MASK_KIND_ADDITIVE).unwrap(),
            &second,
        ));
        assert!(registry.layer_handlers.is_empty());
        assert!(registry.shape_item_handlers.is_empty());
    }
}

mod register_lottie_shape_item_handler {
    use super::*;

    #[test]
    fn is_last_write_wins_without_moving_the_registered_key() {
        let mut registry = create_lottie_registry();
        let first = shape_item_handler();
        let second = shape_item_handler();
        register_lottie_shape_item_handler(&mut registry, LOTTIE_SHAPE_ITEM_KIND_FILL, first);
        register_lottie_shape_item_handler(
            &mut registry,
            LOTTIE_SHAPE_ITEM_KIND_FILL,
            second.clone(),
        );
        assert_eq!(registry.shape_item_handlers.len(), 1);
        assert!(Arc::ptr_eq(
            &get_lottie_shape_item_handler(&registry, LOTTIE_SHAPE_ITEM_KIND_FILL).unwrap(),
            &second,
        ));
    }

    #[test]
    fn accepts_extensions_outside_the_built_in_shape_item_vocabulary() {
        let mut registry = create_lottie_registry();
        let handler = shape_item_handler();
        register_lottie_shape_item_handler(&mut registry, "vendorShape", handler.clone());
        assert!(Arc::ptr_eq(
            &get_lottie_shape_item_handler(&registry, "vendorShape").unwrap(),
            &handler,
        ));
    }
}

mod unregister_lottie_layer_handler {
    use super::*;

    #[test]
    fn removes_only_a_present_layer_handler() {
        let mut registry = create_lottie_registry();
        register_lottie_layer_handler(&mut registry, LOTTIE_LAYER_KIND_SHAPE, layer_handler());
        assert!(unregister_lottie_layer_handler(
            &mut registry,
            LOTTIE_LAYER_KIND_SHAPE,
        ));
        assert!(!unregister_lottie_layer_handler(
            &mut registry,
            LOTTIE_LAYER_KIND_SHAPE,
        ));
    }
}

mod unregister_lottie_mask_handler {
    use super::*;

    #[test]
    fn reports_whether_a_mask_mode_was_registered() {
        let mut registry = create_lottie_registry();
        assert!(!unregister_lottie_mask_handler(
            &mut registry,
            LOTTIE_MASK_KIND_ADDITIVE,
        ));
        register_lottie_mask_handler(&mut registry, LOTTIE_MASK_KIND_ADDITIVE, mask_handler());
        assert!(unregister_lottie_mask_handler(
            &mut registry,
            LOTTIE_MASK_KIND_ADDITIVE,
        ));
        assert!(registry.mask_handlers.is_empty());
    }
}

mod unregister_lottie_shape_item_handler {
    use super::*;

    #[test]
    fn removes_only_a_present_shape_item_handler() {
        let mut registry = create_lottie_registry();
        register_lottie_shape_item_handler(
            &mut registry,
            LOTTIE_SHAPE_ITEM_KIND_FILL,
            shape_item_handler(),
        );
        assert!(unregister_lottie_shape_item_handler(
            &mut registry,
            LOTTIE_SHAPE_ITEM_KIND_FILL,
        ));
        assert!(!unregister_lottie_shape_item_handler(
            &mut registry,
            LOTTIE_SHAPE_ITEM_KIND_FILL,
        ));
    }
}
