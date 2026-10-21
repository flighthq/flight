use std::sync::{Arc, RwLock};

use flight_adjustments::{Adjustment, create_color_matrix_adjustment, create_tint_adjustment};
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
    fn appends_to_the_stack_and_resolves_it() {
        let node = create_test_node_2d("Test");
        add_node_color_adjustment(&node, tint(0xff0000ff));
        add_node_color_adjustment(&node, matrix());
        let runtime = node.read().unwrap();
        let values = runtime.node_runtime();
        assert_eq!(values.color_adjustments.as_ref().map(|a| a.len()), Some(2));
        assert!(values.resolved_color_scale_bias.is_some());
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
    fn replaces_the_stack_and_none_clears_it() {
        let node = create_test_node_2d("Test");
        set_node_color_adjustments(&node, Some(vec![tint(0xffffffff)]));
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
    fn replaces_the_stack_with_one_tint_adjustment() {
        let node = create_test_node_2d("Test");
        set_node_color_adjustments_tint(&node, 0x336699ff);
        let guard = node.read().unwrap();
        let stack = guard
            .node_runtime()
            .color_adjustments
            .as_ref()
            .expect("stack");
        assert_eq!(stack.len(), 1);
        assert_eq!(
            stack[0].read().unwrap().adjustment_fields().kind,
            "TintAdjustment"
        );
    }
}
