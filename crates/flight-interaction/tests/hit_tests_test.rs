use std::sync::Arc;

use crate::interaction_fixture;
use flight_clip::create_clip_region_from_rectangle;
use flight_geometry::create_rectangle;
use flight_interaction::hit_tests::*;
use flight_interaction::register_default_hit_tests::register_default_hit_tests;
use flight_interaction::types::HitTestResult;
use flight_scene2d::{as_node2d_ref, set_node2d_clip};

mod create_hit_test_context {
    use super::*;

    #[test]
    fn returns_a_context() {
        let _ctx = create_hit_test_context();
    }
}

mod describe_graph_hit {
    use super::*;

    #[test]
    fn does_not_panic() {
        let root = interaction_fixture::interactive_node();
        let ctx = HitTestContext::new();
        let mut result = HitTestResult {
            local_x: 0.0,
            local_y: 0.0,
            node: None,
            sub_index: -1,
        };
        describe_graph_hit(&ctx, &root, 0.0, 0.0, &mut result);
    }
}

mod find_graph_hit_target {
    use super::*;

    #[test]
    fn empty_context_returns_none() {
        let root = interaction_fixture::interactive_node();
        let ctx = HitTestContext::new();
        let result = find_graph_hit_target(&ctx, &root, 0.0, 0.0);
        assert!(result.is_none());
    }

    #[test]
    fn rejects_a_registered_geometry_hit_outside_the_public_clip_region() {
        let root = interaction_fixture::interactive_node();
        let node2d = as_node2d_ref(&root).unwrap();
        set_node2d_clip(
            &node2d,
            Some(create_clip_region_from_rectangle(&create_rectangle(
                0.0, 0.0, 10.0, 10.0,
            ))),
        );
        let mut ctx = HitTestContext::new();
        register_hit_test(
            &mut ctx,
            "DisplayObject".to_string(),
            Arc::new(|_node, _x, _y| return true),
        );

        assert!(find_graph_hit_target(&ctx, &root, 5.0, 5.0).is_some());
        assert!(find_graph_hit_target(&ctx, &root, 15.0, 5.0).is_none());
    }
}

mod find_graph_hit_target_precise {
    use super::*;

    #[test]
    fn empty_context_returns_none() {
        let root = interaction_fixture::interactive_node();
        let ctx = HitTestContext::new();
        let result = find_graph_hit_target_precise(&ctx, &root, 0.0, 0.0);
        assert!(result.is_none());
    }
}

mod find_graph_hit_targets {
    use super::*;

    #[test]
    fn returns_empty_for_no_match() {
        let root = interaction_fixture::interactive_node();
        let ctx = HitTestContext::new();
        let mut out = Vec::new();
        find_graph_hit_targets(&ctx, &root, 999.0, 999.0, &mut out);
        assert!(out.is_empty());
    }
}

mod find_graph_hit_targets_precise {
    use super::*;

    #[test]
    fn returns_empty_for_no_match() {
        let root = interaction_fixture::interactive_node();
        let ctx = HitTestContext::new();
        let mut out = Vec::new();
        find_graph_hit_targets_precise(&ctx, &root, 999.0, 999.0, &mut out);
        assert!(out.is_empty());
    }
}

mod hit_test_graph_local_bounds {
    use super::*;

    #[test]
    fn zero_size_node_returns_false() {
        let node = interaction_fixture::node();
        let result = hit_test_graph_local_bounds(&node, 0.0, 0.0);
        assert!(!result);
    }
}

mod hit_test_graph_point {
    use super::*;

    #[test]
    fn returns_false_with_no_handlers() {
        let root = interaction_fixture::interactive_node();
        let ctx = HitTestContext::new();
        let result = hit_test_graph_point(&ctx, &root, 0.0, 0.0);
        assert!(!result);
    }

    #[test]
    fn uses_registered_handler() {
        let root = interaction_fixture::interactive_node();
        let mut ctx = HitTestContext::new();
        register_default_hit_tests(&mut ctx);
        let result = hit_test_graph_point(&ctx, &root, 0.0, 0.0);
        assert!(!result);
    }
}

mod hit_test_graph_point_precise {
    use super::*;

    #[test]
    fn returns_false_with_no_handlers() {
        let root = interaction_fixture::interactive_node();
        let ctx = HitTestContext::new();
        let result = hit_test_graph_point_precise(&ctx, &root, 0.0, 0.0);
        assert!(!result);
    }
}

mod hit_test_node2ds {
    use super::*;

    #[test]
    fn no_parents_returns_false() {
        let a = interaction_fixture::node();
        let b = interaction_fixture::node();
        assert!(!hit_test_node2ds(&a, &b));
    }
}

mod hit_test_node_region {
    use super::*;

    #[test]
    fn returns_false_for_no_interaction_state() {
        let node = interaction_fixture::node();
        let ctx = HitTestContext::new();
        assert!(!hit_test_node_region(&ctx, &node, 0.0, 0.0, false));
    }
}

mod register_hit_test {
    use super::*;

    #[test]
    fn registered_handler_is_used_by_hit_test() {
        let mut ctx = HitTestContext::new();
        register_hit_test(
            &mut ctx,
            "DisplayObject".to_string(),
            Arc::new(|_node, _x, _y| return true),
        );
        let node = interaction_fixture::interactive_node();
        assert!(hit_test_graph_point(&ctx, &node, 0.0, 0.0));
    }
}

mod register_hit_test_precise {
    use super::*;

    #[test]
    fn registered_handler_is_used_by_precise_test() {
        let mut ctx = HitTestContext::new();
        register_hit_test_precise(
            &mut ctx,
            "DisplayObject".to_string(),
            Arc::new(|_node, _x, _y| return 1),
        );
        let node = interaction_fixture::interactive_node();
        assert!(hit_test_graph_point_precise(&ctx, &node, 0.0, 0.0));
    }
}
