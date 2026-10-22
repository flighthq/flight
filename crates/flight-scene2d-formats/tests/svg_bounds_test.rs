use std::collections::HashMap;

use flight_geometry::{create_matrix, create_rectangle};
use flight_node::contract::{add_node_child, NodeRef};
use flight_scene2d::contract::{create_display_object, Node2DRef};
use flight_scene2d_formats::contract::*;
use flight_text::contract::create_text_label;

mod create_svg_node2d_bounds {
    use super::*;

    #[test]
    fn measures_a_group_from_recorded_geometry_only_child_bounds() {
        let registry = create_svg_registry();
        let mut context = import_context(&registry);
        let root: Node2DRef = create_display_object();
        let child: Node2DRef = create_display_object();
        apply_svg_transform(
            &mut *child.write().unwrap(),
            Some(&create_matrix(1.0, 0.0, 0.0, 1.0, 5.0, 0.0)),
        );
        context
            .object_bounding_boxes
            .push((child.clone(), create_rectangle(0.0, 0.0, 4.0, 3.0)));
        add(&root, &child);
        let bounds = create_svg_node2d_bounds(&root, &context).unwrap();
        assert_f32_eq(bounds.x, 5.0);
        assert_f32_eq(bounds.y, 0.0);
        assert_f32_eq(bounds.width, 4.0);
        assert_f32_eq(bounds.height, 3.0);
    }
}

mod has_unmeasurable_svg_text {
    use super::*;

    #[test]
    fn finds_text_at_any_depth_and_leaves_geometry_only_trees_measurable() {
        let root: Node2DRef = create_display_object();
        let branch: Node2DRef = create_display_object();
        add(&root, &branch);
        assert!(!has_unmeasurable_svg_text(&root));
        let text: Node2DRef = create_text_label(None);
        add(&branch, &text);
        assert!(has_unmeasurable_svg_text(&root));
    }
}

fn add(parent: &Node2DRef, child: &Node2DRef) {
    let parent: NodeRef = parent.clone();
    let child: NodeRef = child.clone();
    add_node_child(&parent, &child);
}

fn assert_f32_eq(actual: f32, expected: f32) {
    // D1 f32 bound (TS: 0)
    let bound = 4.0 * f32::EPSILON * expected.abs().max(1.0);
    assert!((actual - expected).abs() <= bound);
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
