use flight_node::add_node_child;
use flight_render::*;

use crate::support::{NOOP_RENDERER, display_node, node_with_kind, sprite_node};

mod explain_scene_2d_pipeline_coverage {
    use super::*;

    #[test]
    fn pipeline_coverage_reports_unused_registrations() {
        let mut state = create_render_state();
        register_node_renderer(&mut state, "Sprite".to_string(), &NOOP_RENDERER);
        register_node_renderer(&mut state, "DisplayObject".to_string(), &NOOP_RENDERER);
        let result = explain_scene_2d_pipeline_coverage(&state, &sprite_node());
        assert_eq!(result.used_kinds, vec!["Sprite"]);
        assert_eq!(result.unused_registrations, vec!["DisplayObject"]);
        assert!(result.uncovered_kinds.is_empty());
    }

    #[test]
    fn pipeline_coverage_reports_uncovered_kinds() {
        let mut state = create_render_state();
        register_node_renderer(&mut state, "Sprite".to_string(), &NOOP_RENDERER);
        let root = display_node();
        add_node_child(&root, &sprite_node());
        add_node_child(&root, &node_with_kind("CustomWidget"));
        let result = explain_scene_2d_pipeline_coverage(&state, &root);
        assert_eq!(
            result.used_kinds,
            vec!["CustomWidget", "DisplayObject", "Sprite"]
        );
        assert_eq!(
            result.uncovered_kinds,
            vec!["CustomWidget", "DisplayObject"]
        );
    }

    #[test]
    fn pipeline_coverage_handles_empty_pipeline() {
        let state = create_render_state();
        let result = explain_scene_2d_pipeline_coverage(&state, &display_node());
        assert_eq!(result.used_kinds, vec!["DisplayObject"]);
        assert!(result.registered_kinds.is_empty());
        assert_eq!(result.uncovered_kinds, vec!["DisplayObject"]);
    }

    #[test]
    fn pipeline_coverage_returns_sorted_stable_arrays() {
        let mut state = create_render_state();
        for kind in ["Sprite", "DisplayObject", "BitmapText"] {
            register_node_renderer(&mut state, kind.to_string(), &NOOP_RENDERER);
        }
        let root = display_node();
        add_node_child(&root, &sprite_node());
        let result = explain_scene_2d_pipeline_coverage(&state, &root);
        assert_eq!(result.used_kinds, vec!["DisplayObject", "Sprite"]);
        assert_eq!(
            result.registered_kinds,
            vec!["BitmapText", "DisplayObject", "Sprite"]
        );
        assert_eq!(result.unused_registrations, vec!["BitmapText"]);
    }

    #[test]
    fn pipeline_coverage_traverses_full_tree_iteratively() {
        let state = create_render_state();
        let root = display_node();
        let first = sprite_node();
        let second = display_node();
        add_node_child(&second, &sprite_node());
        add_node_child(&root, &first);
        add_node_child(&root, &second);
        assert_eq!(
            explain_scene_2d_pipeline_coverage(&state, &root).used_kinds,
            vec!["DisplayObject", "Sprite"]
        );
    }
}
