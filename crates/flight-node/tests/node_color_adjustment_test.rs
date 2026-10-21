use std::sync::{Arc, RwLock};

use flight_adjustments::{create_color_matrix_adjustment, create_tint_adjustment};
use flight_entity::Ref;
use flight_node::contract::*;

use crate::support::create_test_node_2d;

fn tint(tint: u32) -> AdjustmentRef {
    let typed: Ref<flight_adjustments::TintAdjustment> =
        Arc::new(RwLock::new(create_tint_adjustment(tint)));
    let erased: AdjustmentRef = typed;
    return erased;
}

fn matrix() -> AdjustmentRef {
    let typed: Ref<flight_adjustments::ColorMatrixAdjustment> =
        Arc::new(RwLock::new(create_color_matrix_adjustment([
            1.0, 0.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0,
            0.0, 1.0, 0.0,
        ])));
    let erased: AdjustmentRef = typed;
    return erased;
}

mod add_node_color_adjustment {
    use super::*;

    #[test]
    fn lazily_creates_the_stack_and_resolves_its_material_feature_data() {
        let node = create_test_node_2d("Test");
        let adjustment = tint(0x7f3fffff);
        add_node_color_adjustment(&node, adjustment.clone());
        let guard = node.read().unwrap();
        let stack = guard
            .node_runtime()
            .color_adjustments
            .as_ref()
            .expect("stack")
            .read()
            .unwrap();
        assert_eq!(stack.len(), 1);
        assert!(Arc::ptr_eq(&stack[0], &adjustment));
        let bias = guard
            .node_runtime()
            .resolved_color_scale_bias
            .as_ref()
            .expect("resolved bias");
        assert!((bias.red_scale - (0x7f as f32) / 255.0).abs() <= 1e-6);
    }

    #[test]
    fn appends_to_an_existing_stack_without_replacing_earlier_adjustments() {
        let node = create_test_node_2d("Test");
        let first = tint(0xff0000ff);
        let second = tint(0x00ff00ff);
        add_node_color_adjustment(&node, first.clone());
        add_node_color_adjustment(&node, second.clone());
        let guard = node.read().unwrap();
        let stack = guard
            .node_runtime()
            .color_adjustments
            .as_ref()
            .expect("stack")
            .read()
            .unwrap();
        assert_eq!(stack.len(), 2);
        assert!(Arc::ptr_eq(&stack[0], &first));
        assert!(Arc::ptr_eq(&stack[1], &second));
    }
}

mod get_node_color_adjustments {
    use super::*;

    #[test]
    fn returns_none_for_the_untinted_default() {
        let node = create_test_node_2d("Test");
        assert!(get_node_color_adjustments(&*node.read().unwrap()).is_none());
    }
}

mod set_node_color_adjustments {
    use super::*;

    #[test]
    fn keeps_an_empty_stack_distinct_from_no_stack() {
        let node = create_test_node_2d("Test");
        let empty = Arc::new(std::sync::RwLock::new(Vec::new()));
        set_node_color_adjustments(&node, Some(empty.clone()));
        let stored = get_node_color_adjustments(&*node.read().unwrap()).expect("an empty stack");
        assert!(Arc::ptr_eq(&stored, &empty));
        assert!(stored.read().unwrap().is_empty());

        set_node_color_adjustments(&node, None);
        assert!(get_node_color_adjustments(&*node.read().unwrap()).is_none());
    }

    #[test]
    fn caches_a_complete_channel_mixing_matrix_without_marking_it_unsupported() {
        let node = create_test_node_2d("Test");
        let matrix = [
            1.0, 0.5, 0.0, 0.0, 0.1, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0,
            0.0, 1.0, 0.0,
        ];
        let adjustment: AdjustmentRef =
            Arc::new(RwLock::new(create_color_matrix_adjustment(matrix)));
        set_node_color_adjustments(
            &node,
            Some(Arc::new(std::sync::RwLock::new(vec![adjustment]))),
        );
        let guard = node.read().unwrap();
        let resolved = guard
            .node_runtime()
            .resolved_color_matrix
            .expect("resolved matrix");
        for (index, expected) in matrix.iter().enumerate() {
            assert!((resolved[index] - expected).abs() <= 1e-6, "index {index}");
        }
        assert!(!guard.node_runtime().color_adjustments_unsupported);
    }

    #[test]
    fn replaces_the_stack_and_none_clears_it() {
        let node = create_test_node_2d("Test");
        set_node_color_adjustments(
            &node,
            Some(Arc::new(std::sync::RwLock::new(vec![tint(0xffffffff)]))),
        );
        assert!(
            node.read()
                .unwrap()
                .node_runtime()
                .resolved_color_scale_bias
                .is_some()
        );
        set_node_color_adjustments(&node, None);
        let guard = node.read().unwrap();
        assert!(guard.node_runtime().color_adjustments.is_none());
        assert!(guard.node_runtime().resolved_color_scale_bias.is_none());
        assert!(guard.node_runtime().resolved_color_matrix.is_none());
        assert!(!guard.node_runtime().color_adjustments_unsupported);
    }
}

mod set_node_color_adjustments_tint {
    use super::*;

    #[test]
    fn authors_a_packed_tint_through_the_shared_adjustment_model() {
        let node = create_test_node_2d("Test");
        set_node_color_adjustments_tint(&node, 0x00ff00ff);
        let guard = node.read().unwrap();
        let stack = guard
            .node_runtime()
            .color_adjustments
            .as_ref()
            .expect("stack")
            .read()
            .unwrap();
        assert_eq!(stack.len(), 1);
        assert_eq!(
            stack[0].read().unwrap().adjustment_fields().kind,
            "TintAdjustment"
        );
        let bias = guard
            .node_runtime()
            .resolved_color_scale_bias
            .as_ref()
            .expect("resolved bias");
        assert!((bias.green_scale - 1.0).abs() <= 1e-6);
        assert!(bias.red_scale.abs() <= 1e-6);
    }
}
