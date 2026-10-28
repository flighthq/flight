use std::sync::{Arc, RwLock};

use flight_geometry::set_rectangle;
use flight_interaction::hit_tests::{
    HitTestContext, find_graph_hit_target_precise, hit_test_graph_point,
};
use flight_interaction::node_interaction_state::{
    enable_node_interaction_state, set_node_hit_test_enabled,
};
use flight_interaction::register_default_hit_tests::register_default_hit_tests;
use flight_interaction::register_shape_hit_test::register_shape_hit_test;
use flight_node::NodeRef;
use flight_path::{append_path_circle, append_path_rectangle, create_path, create_path_morph};
use flight_shape::contract::{ShapeCommandToken, create_shape_bounds_state};
use flight_shape::{
    MorphShape, ShapeBoundsStateRef, append_morph_shape_path, append_shape_begin_fill,
    append_shape_end_fill, create_morph_shape, create_shape,
    register_default_shape_bounds_commands, set_morph_shape_progress,
};

fn bounds_state() -> ShapeBoundsStateRef {
    let state = create_shape_bounds_state();
    register_default_shape_bounds_commands(&state);
    return state;
}

fn rectangle_fill_commands(x: f64, y: f64, w: f64, h: f64) -> Vec<ShapeCommandToken> {
    return vec![
        ShapeCommandToken::String("beginFill".into()),
        ShapeCommandToken::Number(2.0),
        ShapeCommandToken::Number(0xff0000ffu32 as f64),
        ShapeCommandToken::Number(1.0),
        ShapeCommandToken::String("drawRectangle".into()),
        ShapeCommandToken::Number(4.0),
        ShapeCommandToken::Number(x),
        ShapeCommandToken::Number(y),
        ShapeCommandToken::Number(w),
        ShapeCommandToken::Number(h),
        ShapeCommandToken::String("endFill".into()),
        ShapeCommandToken::Number(0.0),
    ];
}

fn circle_fill_commands(cx: f64, cy: f64, r: f64) -> Vec<ShapeCommandToken> {
    return vec![
        ShapeCommandToken::String("beginFill".into()),
        ShapeCommandToken::Number(2.0),
        ShapeCommandToken::Number(0xff0000ffu32 as f64),
        ShapeCommandToken::Number(1.0),
        ShapeCommandToken::String("drawCircle".into()),
        ShapeCommandToken::Number(3.0),
        ShapeCommandToken::Number(cx),
        ShapeCommandToken::Number(cy),
        ShapeCommandToken::Number(r),
        ShapeCommandToken::String("endFill".into()),
        ShapeCommandToken::Number(0.0),
    ];
}

fn shape_node_with_fill(x: f64, y: f64, w: f64, h: f64) -> NodeRef {
    let shape = create_shape();
    {
        let mut g = shape.write().unwrap();
        g.data.bounds_state = bounds_state();
        g.data.commands = rectangle_fill_commands(x, y, w, h);
    }
    let node: NodeRef = shape;
    enable_node_interaction_state(&node);
    set_node_hit_test_enabled(&node, true);
    return node;
}

fn shape_node_with_circle(cx: f64, cy: f64, r: f64) -> NodeRef {
    let shape = create_shape();
    {
        let mut g = shape.write().unwrap();
        g.data.bounds_state = bounds_state();
        g.data.commands = circle_fill_commands(cx, cy, r);
    }
    let node: NodeRef = shape;
    enable_node_interaction_state(&node);
    set_node_hit_test_enabled(&node, true);
    return node;
}

mod register_shape_hit_test {
    use super::*;

    #[test]
    fn registers_handler_for_shape_kind() {
        let mut ctx = HitTestContext::new();
        register_shape_hit_test(&mut ctx);
        let shape = shape_node_with_fill(0.0, 0.0, 100.0, 100.0);
        let result = find_graph_hit_target_precise(&ctx, &shape, 50.0, 50.0);
        assert!(result.is_some());
    }

    #[test]
    fn hit_inside_filled_region() {
        let mut ctx = HitTestContext::new();
        register_shape_hit_test(&mut ctx);
        let shape = shape_node_with_fill(10.0, 10.0, 80.0, 80.0);
        let result = find_graph_hit_target_precise(&ctx, &shape, 50.0, 50.0);
        assert!(result.is_some());
    }

    #[test]
    fn miss_outside_filled_region() {
        let mut ctx = HitTestContext::new();
        register_shape_hit_test(&mut ctx);
        let shape = shape_node_with_fill(10.0, 10.0, 20.0, 20.0);
        let result = find_graph_hit_target_precise(&ctx, &shape, 50.0, 50.0);
        assert!(result.is_none());
    }

    #[test]
    fn shape_with_no_commands_misses() {
        let mut ctx = HitTestContext::new();
        register_shape_hit_test(&mut ctx);
        let shape: NodeRef = create_shape();
        enable_node_interaction_state(&shape);
        set_node_hit_test_enabled(&shape, true);
        let result = find_graph_hit_target_precise(&ctx, &shape, 0.0, 0.0);
        assert!(result.is_none());
    }

    #[test]
    fn circle_center_hits_precise() {
        let mut ctx = HitTestContext::new();
        register_shape_hit_test(&mut ctx);
        let shape = shape_node_with_circle(50.0, 50.0, 40.0);
        let result = find_graph_hit_target_precise(&ctx, &shape, 50.0, 50.0);
        assert!(
            Arc::ptr_eq(result.as_ref().unwrap(), &shape),
            "center of circle hits same shape"
        );
    }

    #[test]
    fn circle_bbox_corner_misses_precise() {
        let mut ctx = HitTestContext::new();
        register_shape_hit_test(&mut ctx);
        let shape = shape_node_with_circle(50.0, 50.0, 40.0);
        let result = find_graph_hit_target_precise(&ctx, &shape, 85.0, 85.0);
        assert!(
            result.is_none(),
            "(85,85) is inside bounding box but outside circle"
        );
    }

    #[test]
    fn circle_bbox_corner_hits_coarse() {
        let mut ctx = HitTestContext::new();
        register_default_hit_tests(&mut ctx);
        register_shape_hit_test(&mut ctx);
        let shape = shape_node_with_circle(50.0, 50.0, 40.0);
        let result = hit_test_graph_point(&ctx, &shape, 85.0, 85.0);
        assert!(result, "(85,85) is inside bounding box so coarse test hits");
    }

    #[test]
    fn morph_shape_progress_changes_hit_regions() {
        let mut ctx = HitTestContext::new();
        register_default_hit_tests(&mut ctx);
        register_shape_hit_test(&mut ctx);

        let state = bounds_state();

        let mut start1 = create_path(flight_path::PathWinding::NonZero);
        append_path_circle(&mut start1, 50.0, 50.0, 40.0);
        let mut end1 = create_path(flight_path::PathWinding::NonZero);
        append_path_rectangle(&mut end1, 10.0, 10.0, 80.0, 80.0);
        let morph1 = Arc::new(RwLock::new(
            create_path_morph(&start1, &end1).expect("circle-to-rect morph"),
        ));

        let mut start2 = create_path(flight_path::PathWinding::NonZero);
        append_path_circle(&mut start2, 150.0, 150.0, 40.0);
        let mut end2 = create_path(flight_path::PathWinding::NonZero);
        append_path_rectangle(&mut end2, 110.0, 110.0, 80.0, 80.0);
        let morph2 = Arc::new(RwLock::new(
            create_path_morph(&start2, &end2).expect("circle-to-rect morph"),
        ));

        let shape: flight_entity::Ref<MorphShape> = create_morph_shape(&morph1);
        {
            let mut g = shape.write().unwrap();
            g.data.bounds_state = state;
        }
        {
            let node: NodeRef = shape.clone();
            set_node_hit_test_enabled(&node, true);
            let mut guard = node.write().unwrap();
            let bounds = guard
                .as_bounds_node_mut()
                .expect("morph shape has bounds")
                .bounds_runtime_mut();
            let rect = bounds
                .local_bounds_rectangle
                .get_or_insert_with(Default::default);
            set_rectangle(rect, 10.0, 10.0, 180.0, 180.0);
            let local_bounds_id = guard.node_runtime().local_bounds_id as i32;
            guard.node_runtime_mut().local_bounds_using_local_bounds_id = local_bounds_id;
        }

        append_shape_begin_fill(&shape, 0xff0000ff, Some(1.0));
        append_morph_shape_path(&shape, &morph1);
        append_shape_end_fill(&shape);

        append_shape_begin_fill(&shape, 0x0000ffff, Some(1.0));
        append_morph_shape_path(&shape, &morph2);
        append_shape_end_fill(&shape);

        let node: NodeRef = shape.clone();
        let r1 = find_graph_hit_target_precise(&ctx, &node, 85.0, 85.0);
        assert!(
            r1.is_none(),
            "progress=0: (85,85) outside circle at (50,50)"
        );
        let r2 = find_graph_hit_target_precise(&ctx, &node, 185.0, 185.0);
        assert!(
            r2.is_none(),
            "progress=0: (185,185) outside circle at (150,150)"
        );

        set_morph_shape_progress(&shape, 1.0);
        let r3 = find_graph_hit_target_precise(&ctx, &node, 85.0, 85.0);
        assert!(
            Arc::ptr_eq(r3.as_ref().unwrap(), &node),
            "progress=1: (85,85) hits same morph shape"
        );
        let r4 = find_graph_hit_target_precise(&ctx, &node, 185.0, 185.0);
        assert!(
            Arc::ptr_eq(r4.as_ref().unwrap(), &node),
            "progress=1: (185,185) hits same morph shape"
        );
    }
}
