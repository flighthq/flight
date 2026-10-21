use std::sync::Arc;

use flight_scene2d_formats::contract::*;

mod register_all_lottie_handlers {
    use super::*;

    #[test]
    fn registers_every_handler_family() {
        let mut registry = create_lottie_registry();
        register_all_lottie_handlers(&mut registry);

        let mut expected = create_lottie_registry();
        register_lottie_layer_handlers(&mut expected);
        register_lottie_mask_handlers(&mut expected);
        register_lottie_shape_item_handlers(&mut expected);

        assert_eq!(registry.layer_handlers.len(), expected.layer_handlers.len());
        for (actual, expected) in registry.layer_handlers.iter().zip(&expected.layer_handlers) {
            assert_eq!(actual.kind, expected.kind);
            assert!(Arc::ptr_eq(&actual.handle, &expected.handle));
        }
        assert_eq!(registry.mask_handlers.len(), expected.mask_handlers.len());
        for (actual, expected) in registry.mask_handlers.iter().zip(&expected.mask_handlers) {
            assert_eq!(actual.kind, expected.kind);
            assert!(Arc::ptr_eq(&actual.handle, &expected.handle));
        }
        assert_eq!(
            registry.shape_item_handlers.len(),
            expected.shape_item_handlers.len()
        );
        for (actual, expected) in registry
            .shape_item_handlers
            .iter()
            .zip(&expected.shape_item_handlers)
        {
            assert_eq!(actual.kind, expected.kind);
            assert!(Arc::ptr_eq(&actual.handle, &expected.handle));
        }
    }
}
