use std::sync::{Arc, RwLock};

use flight_geometry::set_rectangle;
use flight_interaction::hit_tests::{
    describe_graph_hit, find_graph_hit_target_precise, HitTestContext,
};
use flight_interaction::node_interaction_state::{
    enable_node_interaction_state, set_node_hit_test_enabled,
};
use flight_interaction::register_text_hit_test::register_text_hit_test;
use flight_interaction::types::HitTestResult;
use flight_node::NodeRef;
use flight_scene2d::PartialNode2D;
use flight_text::contract::{TextLayoutContext, create_text_layout_context};
use flight_text::{PartialTextLabel, TextLabelDataOptions, create_text_label};
use flight_textlayout::set_text_layout_measure_provider;

fn text_node_with_bounds(x: f32, y: f32, w: f32, h: f32) -> NodeRef {
    let text: NodeRef = create_text_label(None);
    {
        let mut guard = text.write().unwrap();
        let bounds = guard
            .as_bounds_node_mut()
            .expect("text has bounds")
            .bounds_runtime_mut();
        let rect = bounds
            .local_bounds_rectangle
            .get_or_insert_with(Default::default);
        set_rectangle(rect, x, y, w, h);
        let local_bounds_id = guard.node_runtime().local_bounds_id as i32;
        guard.node_runtime_mut().local_bounds_using_local_bounds_id = local_bounds_id;
    }
    enable_node_interaction_state(&text);
    set_node_hit_test_enabled(&text, true);
    return text;
}

fn measured_context() -> Arc<RwLock<TextLayoutContext>> {
    let context = create_text_layout_context(None);
    {
        let mut ctx = context.write().unwrap();
        set_text_layout_measure_provider(
            &mut ctx.measure_state,
            Some(Arc::new(|text, _format| text.encode_utf16().count() as f32 * 7.0)),
        );
    }
    return context;
}

fn text_node_with_measure(text: &str, w: f32, h: f32) -> NodeRef {
    let context = measured_context();
    let label: NodeRef = create_text_label(Some(&PartialTextLabel {
        data: Some(TextLabelDataOptions {
            auto_size: None,
            height: Some(h),
            text: Some(text.to_string()),
            text_format: None,
            vertical_align: None,
            width: Some(w),
        }),
        layout_context: Some(context),
        node: PartialNode2D {
            alpha: None,
            blend_mode: None,
            clip: None,
            enabled: None,
            material: None,
            material_data: None,
            name: None,
            pivot_x: None,
            pivot_y: None,
            rotation: None,
            scale_x: None,
            scale_y: None,
            skew_x: None,
            skew_y: None,
            visible: None,
            x: None,
            y: None,
        },
    }));
    {
        let mut guard = label.write().unwrap();
        let bounds = guard
            .as_bounds_node_mut()
            .expect("text has bounds")
            .bounds_runtime_mut();
        let rect = bounds
            .local_bounds_rectangle
            .get_or_insert_with(Default::default);
        set_rectangle(rect, 0.0, 0.0, w, h);
        let local_bounds_id = guard.node_runtime().local_bounds_id as i32;
        guard.node_runtime_mut().local_bounds_using_local_bounds_id = local_bounds_id;
    }
    enable_node_interaction_state(&label);
    set_node_hit_test_enabled(&label, true);
    return label;
}

mod register_text_hit_test {
    use super::*;

    #[test]
    fn registers_handler_for_text_kind() {
        let mut ctx = HitTestContext::new();
        register_text_hit_test(&mut ctx);
        let text = text_node_with_bounds(0.0, 0.0, 100.0, 100.0);
        let result = find_graph_hit_target_precise(&ctx, &text, 50.0, 50.0);
        assert!(result.is_some());
    }

    #[test]
    fn miss_outside_bounds() {
        let mut ctx = HitTestContext::new();
        register_text_hit_test(&mut ctx);
        let text = text_node_with_bounds(0.0, 0.0, 100.0, 100.0);
        let result = find_graph_hit_target_precise(&ctx, &text, 200.0, 200.0);
        assert!(result.is_none());
    }

    #[test]
    fn text_without_layout_hits_via_bounds_and_sub_index_zero() {
        let mut ctx = HitTestContext::new();
        register_text_hit_test(&mut ctx);
        let text = text_node_with_bounds(0.0, 0.0, 50.0, 50.0);
        let result = find_graph_hit_target_precise(&ctx, &text, 25.0, 25.0);
        assert!(result.is_some());
        let mut hit = HitTestResult::new();
        describe_graph_hit(&ctx, &text, 25.0, 25.0, &mut hit);
        assert_eq!(hit.sub_index, 0, "no-layout text returns subIndex 0");
    }

    #[test]
    fn describe_graph_hit_left_char_sub_index_zero() {
        let mut ctx = HitTestContext::new();
        register_text_hit_test(&mut ctx);
        let text = text_node_with_measure("ABCDE", 100.0, 100.0);
        let result = find_graph_hit_target_precise(&ctx, &text, 1.0, 10.0);
        assert!(result.is_some());
        let mut hit = HitTestResult::new();
        describe_graph_hit(&ctx, &text, 1.0, 10.0, &mut hit);
        assert_eq!(hit.sub_index, 0, "x=1 is in the first character (A), subIndex 0");
    }

    #[test]
    fn describe_graph_hit_right_char_sub_index_greater_than_left() {
        let mut ctx = HitTestContext::new();
        register_text_hit_test(&mut ctx);
        let text = text_node_with_measure("ABCDE", 100.0, 100.0);
        let mut hit_left = HitTestResult::new();
        describe_graph_hit(&ctx, &text, 1.0, 10.0, &mut hit_left);
        let mut hit_right = HitTestResult::new();
        describe_graph_hit(&ctx, &text, 30.0, 10.0, &mut hit_right);
        assert!(
            hit_right.sub_index > hit_left.sub_index,
            "x=30 subIndex ({}) > x=1 subIndex ({})",
            hit_right.sub_index,
            hit_left.sub_index
        );
    }
}
