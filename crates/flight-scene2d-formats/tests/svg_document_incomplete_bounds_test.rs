use std::sync::Arc;

use flight_node::contract::{NodeRef, get_node_child_at};
use flight_scene2d::contract::Node2DRef;
use flight_scene2d_formats::contract::*;
use flight_shape::contract::create_shape;

mod create_scene2d_from_svg_document_incomplete_bounds {
    use super::*;

    #[test]
    fn rejects_a_partial_child_box_instead_of_placing_an_object_bounding_box_clip_from_it() {
        let options = SvgDocumentImportOptions {
            clip_handlers: None,
            element_handlers: Some(vec![
                SvgElementHandlerEntry {
                    handle: SVG_ALL_ELEMENT_HANDLERS[0].clone(),
                    kind: SVG_ELEMENT_KIND_CONTAINER.to_string(),
                },
                SvgElementHandlerEntry {
                    handle: Arc::new(|_| {
                        let node: Node2DRef = create_shape();
                        Some(node)
                    }),
                    kind: SVG_ELEMENT_KIND_GEOMETRY.to_string(),
                },
            ]),
            resolve_image_resource: None,
        };
        let root = create_scene2d_from_svg_document(
            "<svg><defs><clipPath id=\"half\" clipPathUnits=\"objectBoundingBox\"><rect width=\"0.5\" height=\"1\"/></clipPath></defs><g clip-path=\"url(#half)\"><rect x=\"10\" y=\"20\" width=\"100\" height=\"50\"/></g></svg>",
            None,
            Some(&options),
        );
        let root: NodeRef = root;
        let group = get_node_child_at(&root, 0).unwrap();
        let group = flight_scene2d::contract::as_node2d_ref(&group).unwrap();
        assert!(group.read().unwrap().node2d_fields().clip.is_none());
    }
}
