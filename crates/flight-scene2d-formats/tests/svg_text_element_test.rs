use std::collections::HashMap;
use std::sync::{Arc, RwLock};

use flight_entity::Ref;
use flight_node::contract::{NodeRef, get_node_child_at};
use flight_scene2d_formats::contract::*;
use flight_text::contract::TEXT_LABEL_KIND;
use flight_xml::contract::{XmlElement, parse_xml_document};

mod svg_text_element_handler {
    use super::*;

    #[test]
    fn is_the_builtin_text_element_handler() {
        let mut registry = create_svg_registry();
        register_svg_element_handlers(&mut registry);
        assert!(Arc::ptr_eq(
            &get_svg_element_handler(&registry, SVG_ELEMENT_KIND_TEXT).unwrap(),
            &SVG_ALL_ELEMENT_HANDLERS[3]
        ));
        let element = element("<text/>");
        let mut import = import_context(&registry);
        let mut context = SvgElementContext {
            element,
            import: &mut import,
            parent_style: &DEFAULT_SVG_STYLE,
        };
        assert!(svg_text_element_handler(&mut context).is_some());
    }

    #[test]
    fn is_exercised_through_document_import_for_text_elements() {
        let root = create_scene2d_from_svg_document(
            "<svg><text x=\"0\" y=\"20\">Hello</text></svg>",
            None,
            None,
        );
        let root: NodeRef = root;
        let text = get_node_child_at(&root, 0).unwrap();
        assert_eq!(text.read().unwrap().node_fields().kind, TEXT_LABEL_KIND);
    }
}

fn element(source: &str) -> Ref<XmlElement> {
    return Arc::new(RwLock::new(parse_xml_document(source).unwrap()));
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
