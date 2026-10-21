use std::sync::Arc;

use flight_scene2d_formats::contract::*;

mod register_svg_clip_handlers {
    use super::*;

    #[test]
    fn registers_the_clip_path_kind_alone_and_no_element_handlers() {
        let mut registry = create_svg_registry();
        register_svg_clip_handlers(&mut registry);
        assert_eq!(registry.clip_handlers.len(), 1);
        assert_eq!(registry.clip_handlers[0].kind, SVG_CLIP_KIND_PATH);
        assert!(registry.element_handlers.is_empty());
    }
}

mod svg_all_clip_handlers {
    use super::*;

    #[test]
    fn contains_every_builtin_clip_handler() {
        let mut registry = create_svg_registry();
        register_svg_clip_handlers(&mut registry);
        assert_eq!(SVG_ALL_CLIP_HANDLERS.len(), 1);
        assert!(Arc::ptr_eq(
            &registry.clip_handlers[0].handle,
            &SVG_ALL_CLIP_HANDLERS[0]
        ));
    }
}
