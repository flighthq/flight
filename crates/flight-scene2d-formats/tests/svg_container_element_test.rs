use std::collections::HashMap;
use std::sync::{Arc, RwLock};

use flight_node::contract::{get_node_child_count, NodeRef};
use flight_scene2d_formats::contract::*;
use flight_xml::contract::parse_xml_document;

mod svg_container_element_handler {
    use super::*;

    #[test]
    fn creates_a_display_container_and_imports_its_children() {
        let element = Arc::new(RwLock::new(
            parse_xml_document("<g><rect width=\"10\" height=\"10\"/></g>").unwrap(),
        ));
        let mut registry = create_svg_registry();
        register_svg_element_handler(
            &mut registry,
            SVG_ELEMENT_KIND_GEOMETRY,
            Arc::new(svg_geometry_element_handler),
        );
        let mut import = import_context(&registry);
        let mut context = SvgElementContext {
            element,
            import: &mut import,
            parent_style: &DEFAULT_SVG_STYLE,
        };
        let node = svg_container_element_handler(&mut context).unwrap();
        assert_eq!(node.read().unwrap().node2d_fields().kind, "DisplayObject");
        let node: NodeRef = node;
        assert_eq!(get_node_child_count(&node), 1);
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
