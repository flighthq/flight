use std::collections::HashMap;
use std::sync::{Arc, RwLock};

use flight_scene2d_formats::contract::*;
use flight_shape::contract::{SHAPE_KIND, get_shape_command_count};
use flight_xml::contract::parse_xml_document;

mod svg_geometry_element_handler {
    use super::*;

    #[test]
    fn creates_a_painted_shape_for_a_geometry_element() {
        let element = Arc::new(RwLock::new(
            parse_xml_document("<rect width=\"10\" height=\"10\" fill=\"#ff0000\"/>").unwrap(),
        ));
        let registry = create_svg_registry();
        let mut import = import_context(&registry);
        let mut context = SvgElementContext {
            element,
            import: &mut import,
            parent_style: &DEFAULT_SVG_STYLE,
        };
        let node = svg_geometry_element_handler(&mut context).unwrap();
        let node = node.read().unwrap();
        assert_eq!(node.node2d_fields().kind, SHAPE_KIND);
        assert!(get_shape_command_count(&*node) > 0);
        assert_eq!(context.import.object_bounding_boxes.len(), 1);
    }
}

fn import_context(registry: &SvgRegistry) -> SvgImportContext<'_> {
    return SvgImportContext {
        css_rules: Vec::new(),
        diagnostics: None,
        elements_by_id: HashMap::new(),
        gradients_by_id: HashMap::new(),
        object_bounding_boxes: Vec::new(),
        options: None,
        parent_by_element: Vec::new(),
        registry,
        reported_unsupported_elements: Vec::new(),
        resolved_definition_styles: Vec::new(),
        resolving_clip_uses: Vec::new(),
        resolving_clips: Vec::new(),
        resolving_gradients: Vec::new(),
        resolving_uses: Vec::new(),
    };
}
