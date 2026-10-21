use std::collections::HashMap;
use std::sync::{Arc, RwLock};

use flight_importdiagnostics::ImportDiagnostic;
use flight_node::contract::{NodeRef, get_node_child_at};
use flight_scene2d::contract::{Node2DRef, create_display_object};
use flight_scene2d_formats::contract::*;
use flight_xml::contract::{XmlElement, parse_xml_document};

mod svg_path_clip_handler {
    use super::*;

    #[test]
    fn leaves_an_element_with_no_clip_path_unclipped() {
        let registry = create_svg_registry();
        let mut import = import_context(&registry, None);
        let target: Node2DRef = create_display_object(None);
        let mut context = SvgClipContext {
            element: element("<g/>"),
            import: &mut import,
            target: target.clone(),
        };
        svg_path_clip_handler(&mut context);
        assert!(target.read().unwrap().node2d_fields().clip.is_none());
    }

    #[test]
    fn lowers_a_clip_path_reference_onto_the_node_clip() {
        assert!(
            clipped(
                "<clipPath id=\"c\"><rect width=\"2\" height=\"2\"/></clipPath>",
                "clip-path=\"url(#c)\"",
                None,
            )
            .read()
            .unwrap()
            .node2d_fields()
            .clip
            .is_some()
        );
    }

    #[test]
    fn reports_an_unresolved_reference_and_leaves_the_element_visible() {
        let mut diagnostics = Vec::new();
        let node = clipped("", "clip-path=\"url(#missing)\"", Some(&mut diagnostics));
        assert!(node.read().unwrap().node2d_fields().clip.is_none());
        assert!(
            diagnostics
                .iter()
                .any(|entry| entry.kind == "svg.unresolved-clip-reference")
        );
    }

    #[test]
    fn resolves_a_use_inside_a_clip_path() {
        let defs = "<defs><rect id=\"r\" width=\"2\" height=\"2\"/></defs><clipPath id=\"c\"><use href=\"#r\"/></clipPath>";
        assert!(
            clipped(defs, "clip-path=\"url(#c)\"", None)
                .read()
                .unwrap()
                .node2d_fields()
                .clip
                .is_some()
        );
    }
}

mod uses_svg_object_bounding_box_units {
    use super::*;

    #[test]
    fn is_true_only_when_clip_path_units_names_the_bounding_box() {
        assert!(uses_svg_object_bounding_box_units(&element(
            "<clipPath clipPathUnits=\"objectBoundingBox\"/>"
        )));
        assert!(!uses_svg_object_bounding_box_units(&element("<clipPath/>")));
        assert!(!uses_svg_object_bounding_box_units(&element(
            "<clipPath clipPathUnits=\"userSpaceOnUse\"/>"
        )));
    }

    #[test]
    fn reads_mask_content_units_for_a_mask() {
        assert!(uses_svg_object_bounding_box_units(&element(
            "<mask maskContentUnits=\"objectBoundingBox\"/>"
        )));
        assert!(!uses_svg_object_bounding_box_units(&element(
            "<mask clipPathUnits=\"objectBoundingBox\"/>"
        )));
    }
}

fn clipped(
    definitions: &str,
    attributes: &str,
    diagnostics: Option<&mut Vec<ImportDiagnostic>>,
) -> Node2DRef {
    let registry = registry();
    let source =
        format!("<svg>{definitions}<g {attributes}><rect width=\"4\" height=\"4\"/></g></svg>");
    let root =
        create_scene2d_from_svg_document_with_registry(&source, &registry, diagnostics, None);
    let root: NodeRef = root;
    let child = get_node_child_at(&root, 0).unwrap();
    return flight_scene2d::contract::as_node2d_ref(&child).unwrap();
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

fn registry() -> SvgRegistry {
    let mut registry = create_svg_registry();
    register_svg_clip_handler(
        &mut registry,
        SVG_CLIP_KIND_PATH,
        Arc::new(svg_path_clip_handler),
    );
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
