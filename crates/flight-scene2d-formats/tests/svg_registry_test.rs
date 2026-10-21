use std::sync::Arc;

use flight_scene2d_formats::contract::*;

fn clip_handler() -> SvgClipHandler {
    return Arc::new(|_| {});
}

fn element_handler() -> SvgElementHandler {
    return Arc::new(|_| None);
}

mod create_svg_registry {
    use super::*;

    #[test]
    fn creates_independent_empty_registries() {
        let mut first = create_svg_registry();
        let second = create_svg_registry();
        assert!(first.clip_handlers.is_empty());
        assert!(first.element_handlers.is_empty());
        register_svg_element_handler(&mut first, SVG_ELEMENT_KIND_CONTAINER, element_handler());
        assert_eq!(first.element_handlers.len(), 1);
        assert!(second.element_handlers.is_empty());
    }
}

mod get_svg_clip_handler {
    use super::*;

    #[test]
    fn returns_none_for_an_unregistered_clip_kind() {
        assert!(get_svg_clip_handler(&create_svg_registry(), SVG_CLIP_KIND_PATH).is_none());
    }
}

mod get_svg_element_handler {
    use super::*;

    #[test]
    fn returns_none_for_an_unregistered_element_kind() {
        assert!(
            get_svg_element_handler(&create_svg_registry(), SVG_ELEMENT_KIND_CONTAINER).is_none()
        );
    }
}

mod register_svg_clip_handler {
    use super::*;

    #[test]
    fn is_last_write_wins_and_touches_no_element_handler() {
        let mut registry = create_svg_registry();
        let first = clip_handler();
        let second = clip_handler();
        register_svg_clip_handler(&mut registry, SVG_CLIP_KIND_PATH, first);
        register_svg_clip_handler(&mut registry, SVG_CLIP_KIND_PATH, second.clone());
        assert_eq!(registry.clip_handlers.len(), 1);
        assert!(Arc::ptr_eq(
            &get_svg_clip_handler(&registry, SVG_CLIP_KIND_PATH).unwrap(),
            &second
        ));
        assert!(registry.element_handlers.is_empty());
    }
}

mod register_svg_element_handler {
    use super::*;

    #[test]
    fn accepts_extensions_outside_the_built_in_element_vocabulary() {
        let mut registry = create_svg_registry();
        let handler = element_handler();
        register_svg_element_handler(&mut registry, "vendorElement", handler.clone());
        assert!(Arc::ptr_eq(
            &get_svg_element_handler(&registry, "vendorElement").unwrap(),
            &handler
        ));
    }

    #[test]
    fn is_last_write_wins_without_moving_the_registered_key() {
        let mut registry = create_svg_registry();
        let first = element_handler();
        let second = element_handler();
        register_svg_element_handler(&mut registry, SVG_ELEMENT_KIND_CONTAINER, first);
        register_svg_element_handler(&mut registry, "vendorElement", element_handler());
        register_svg_element_handler(&mut registry, SVG_ELEMENT_KIND_CONTAINER, second.clone());
        assert_eq!(registry.element_handlers.len(), 2);
        assert_eq!(
            registry.element_handlers[0].kind,
            SVG_ELEMENT_KIND_CONTAINER
        );
        assert!(Arc::ptr_eq(
            &get_svg_element_handler(&registry, SVG_ELEMENT_KIND_CONTAINER).unwrap(),
            &second
        ));
    }
}

mod unregister_svg_clip_handler {
    use super::*;

    #[test]
    fn reports_whether_a_clip_kind_was_registered() {
        let mut registry = create_svg_registry();
        assert!(!unregister_svg_clip_handler(
            &mut registry,
            SVG_CLIP_KIND_PATH
        ));
        register_svg_clip_handler(&mut registry, SVG_CLIP_KIND_PATH, clip_handler());
        assert!(unregister_svg_clip_handler(
            &mut registry,
            SVG_CLIP_KIND_PATH
        ));
        assert!(registry.clip_handlers.is_empty());
    }
}

mod unregister_svg_element_handler {
    use super::*;

    #[test]
    fn removes_only_a_present_element_handler() {
        let mut registry = create_svg_registry();
        register_svg_element_handler(&mut registry, SVG_ELEMENT_KIND_CONTAINER, element_handler());
        assert!(unregister_svg_element_handler(
            &mut registry,
            SVG_ELEMENT_KIND_CONTAINER
        ));
        assert!(!unregister_svg_element_handler(
            &mut registry,
            SVG_ELEMENT_KIND_CONTAINER
        ));
    }
}
