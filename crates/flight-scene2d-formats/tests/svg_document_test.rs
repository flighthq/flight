use std::collections::HashMap;
use std::sync::{Arc, RwLock};

use flight_importdiagnostics::ImportDiagnostic;
use flight_node::contract::{NodeRef, get_node_child_at, get_node_child_count};
use flight_scene2d::contract::{Node2DRef, create_display_object};
use flight_scene2d_formats::contract::*;
use flight_xml::contract::{XmlElement, parse_xml_document};

mod append_svg_children {
    use super::*;

    #[test]
    fn keeps_document_order_which_is_svg_paint_order() {
        let document = element("<svg><rect width=\"1\" height=\"1\"/><circle r=\"1\"/></svg>");
        let mut registry = create_svg_registry();
        register_svg_element_handler(
            &mut registry,
            SVG_ELEMENT_KIND_GEOMETRY,
            Arc::new(svg_geometry_element_handler),
        );
        let mut context = import_context(&registry, None);
        let root = create_display_object();
        append_svg_children(&root, &document, &DEFAULT_SVG_STYLE, &mut context);
        assert_eq!(child_kinds(&root), ["Shape", "Shape"]);
    }
}

mod apply_svg_element_appearance {
    use super::*;

    #[test]
    fn lands_group_opacity_on_the_node_alpha() {
        let element = element("<g id=\"group\" opacity=\"0.5\"/>");
        let registry = create_svg_registry();
        let mut context = import_context(&registry, None);
        let target: Node2DRef = create_display_object();
        apply_svg_element_appearance(
            &target,
            &element,
            &DEFAULT_SVG_STYLE,
            &mut context,
            None,
            true,
        );
        let target = target.read().unwrap();
        assert_f32_eq(target.node2d_fields().alpha, 0.5);
        assert_eq!(target.node2d_fields().name.as_deref(), Some("group"));
    }
}

mod apply_svg_element_clip_family {
    use super::*;

    #[test]
    fn does_nothing_when_the_clip_family_is_absent() {
        let element = element("<g clip-path=\"url(#missing)\"/>");
        let registry = create_svg_registry();
        let mut diagnostics = Vec::new();
        let mut context = import_context(&registry, Some(&mut diagnostics));
        let target: Node2DRef = create_display_object();
        apply_svg_element_clip_family(&target, &element, &mut context);
        assert!(target.read().unwrap().node2d_fields().clip.is_none());
        assert!(diagnostics.is_empty());
    }
}

mod create_scene2d_from_svg_document_with_registry {
    use super::*;

    #[test]
    fn produces_no_children_for_an_empty_registry_and_reports_each_unclaimed_element() {
        let mut diagnostics = Vec::new();
        let root = create_scene2d_from_svg_document_with_registry(
            "<svg><g><rect width=\"4\" height=\"4\"/></g><text>hi</text></svg>",
            &create_svg_registry(),
            Some(&mut diagnostics),
            None,
        );
        let root: NodeRef = root;
        assert_eq!(get_node_child_count(&root), 0);
        assert_eq!(
            diagnostic_kinds(&diagnostics),
            ["svg.unknown-element", "svg.unknown-element"]
        );
    }

    #[test]
    fn reads_exactly_the_registered_families_and_reports_only_the_unclaimed_ones() {
        let registry = container_and_geometry();
        let mut diagnostics = Vec::new();
        let root = create_scene2d_from_svg_document_with_registry(
            "<svg><g><rect width=\"4\" height=\"4\"/></g><text>hi</text></svg>",
            &registry,
            Some(&mut diagnostics),
            None,
        );
        assert_eq!(child_kinds(&root), ["DisplayObject"]);
        let root: NodeRef = root;
        assert_eq!(
            get_node_child_count(&get_node_child_at(&root, 0).unwrap()),
            1
        );
        assert_eq!(diagnostic_kinds(&diagnostics), ["svg.unknown-element"]);
    }

    #[test]
    fn rejects_a_document_that_is_not_svg() {
        let mut diagnostics = Vec::new();
        let root = create_scene2d_from_svg_document_with_registry(
            "<html/>",
            &container_and_geometry(),
            Some(&mut diagnostics),
            None,
        );
        let root: NodeRef = root;
        assert_eq!(get_node_child_count(&root), 0);
        assert_eq!(diagnostic_kinds(&diagnostics), ["svg.invalid-document"]);
    }
}

mod create_svg_element_node {
    use super::*;

    #[test]
    fn reports_an_element_no_registered_family_claims() {
        let element = element("<rect width=\"1\" height=\"1\"/>");
        let registry = create_svg_registry();
        let mut diagnostics = Vec::new();
        let mut context = import_context(&registry, Some(&mut diagnostics));
        assert!(create_svg_element_node(&element, &DEFAULT_SVG_STYLE, &mut context).is_none());
        assert_eq!(diagnostic_kinds(&diagnostics), ["svg.unknown-element"]);
    }
}

mod report_remaining_unsupported_svg_elements {
    use super::*;

    #[test]
    fn names_each_unsupported_feature_the_document_declares() {
        let element = element("<svg><filter id=\"f\"/><foreignObject/></svg>");
        let registry = create_svg_registry();
        let mut diagnostics = Vec::new();
        let mut context = import_context(&registry, Some(&mut diagnostics));
        report_remaining_unsupported_svg_elements(&element, &mut context, false);
        assert_eq!(
            diagnostic_kinds(&diagnostics),
            ["svg.unsupported-filter", "svg.unsupported-foreignObject"]
        );
    }
}

fn assert_f32_eq(actual: f32, expected: f32) {
    // D1 f32 bound (TS: 0)
    let bound = 4.0 * f32::EPSILON * expected.abs().max(1.0);
    assert!((actual - expected).abs() <= bound);
}

fn child_kinds(root: &flight_entity::Ref<flight_scene2d::DisplayObject>) -> Vec<String> {
    let root: NodeRef = root.clone();
    return (0..get_node_child_count(&root))
        .filter_map(|index| get_node_child_at(&root, index as i32))
        .map(|child| child.read().unwrap().node_fields().kind.clone())
        .collect();
}

fn container_and_geometry() -> SvgRegistry {
    let mut registry = create_svg_registry();
    register_svg_element_handler(
        &mut registry,
        SVG_ELEMENT_KIND_CONTAINER,
        Arc::new(svg_container_element_handler),
    );
    register_svg_element_handler(
        &mut registry,
        SVG_ELEMENT_KIND_GEOMETRY,
        Arc::new(svg_geometry_element_handler),
    );
    return registry;
}

fn diagnostic_kinds(diagnostics: &[ImportDiagnostic]) -> Vec<&str> {
    return diagnostics
        .iter()
        .map(|diagnostic| diagnostic.kind.as_str())
        .collect();
}

fn element(source: &str) -> flight_entity::Ref<XmlElement> {
    return Arc::new(RwLock::new(parse_xml_document(source).unwrap()));
}

fn import_context<'a>(
    registry: &'a SvgRegistry,
    diagnostics: Option<&'a mut Vec<ImportDiagnostic>>,
) -> SvgImportContext<'a> {
    return SvgImportContext {
        css_rules: Vec::new(),
        diagnostics,
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
