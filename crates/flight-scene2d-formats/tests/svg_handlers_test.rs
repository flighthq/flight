use std::sync::Arc;

use flight_scene2d_formats::contract::*;

mod register_all_svg_handlers {
    use super::*;

    #[test]
    fn registers_the_element_handler_family() {
        let mut registry = create_svg_registry();
        register_all_svg_handlers(&mut registry);
        let mut elements = create_svg_registry();
        register_svg_element_handlers(&mut elements);
        assert_eq!(
            registry.element_handlers.len(),
            elements.element_handlers.len()
        );
        for (actual, expected) in registry
            .element_handlers
            .iter()
            .zip(&elements.element_handlers)
        {
            assert_eq!(actual.kind, expected.kind);
            assert!(Arc::ptr_eq(&actual.handle, &expected.handle));
        }
    }
}
