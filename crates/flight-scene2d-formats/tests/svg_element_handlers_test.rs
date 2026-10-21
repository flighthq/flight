use std::sync::Arc;

use flight_scene2d_formats::contract::*;

mod register_svg_element_handlers {
    use super::*;

    #[test]
    fn registers_exactly_one_handler_for_every_element_kind() {
        let mut registry = create_svg_registry();
        register_svg_element_handlers(&mut registry);
        let mut kinds = registry
            .element_handlers
            .iter()
            .map(|entry| entry.kind.as_str())
            .collect::<Vec<_>>();
        kinds.sort();
        assert_eq!(
            kinds,
            [
                SVG_ELEMENT_KIND_CONTAINER,
                SVG_ELEMENT_KIND_GEOMETRY,
                SVG_ELEMENT_KIND_IMAGE,
                SVG_ELEMENT_KIND_TEXT,
                SVG_ELEMENT_KIND_USE,
            ]
        );
    }
}

mod svg_all_element_handlers {
    use super::*;

    #[test]
    fn contains_every_builtin_element_handler() {
        let mut registry = create_svg_registry();
        register_svg_element_handlers(&mut registry);
        assert_eq!(SVG_ALL_ELEMENT_HANDLERS.len(), 5);
        for (kind, index) in [
            (SVG_ELEMENT_KIND_CONTAINER, 0),
            (SVG_ELEMENT_KIND_GEOMETRY, 1),
            (SVG_ELEMENT_KIND_IMAGE, 2),
            (SVG_ELEMENT_KIND_TEXT, 3),
            (SVG_ELEMENT_KIND_USE, 4),
        ] {
            assert!(Arc::ptr_eq(
                &get_svg_element_handler(&registry, kind).unwrap(),
                &SVG_ALL_ELEMENT_HANDLERS[index]
            ));
        }
    }
}
