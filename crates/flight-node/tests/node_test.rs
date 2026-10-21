use std::sync::Arc;

use flight_node::contract::*;

use crate::support::{TestNode, create_test_node};

mod create_node {
    use super::*;

    #[test]
    fn returns_a_new_object_for_the_given_kind() {
        let node: TestNode = create_node(String::from("NodeTest"), None);
        assert_eq!(node.node_fields().kind, "NodeTest");
        assert!(node.node_fields().enabled);
    }

    #[test]
    fn initializes_default_values() {
        let node = create_test_node("NodeTest");
        assert!(node.read().unwrap().node_fields().enabled);
        assert_eq!(node.read().unwrap().node_fields().kind, "NodeTest");
    }

    #[test]
    fn allows_predefined_values() {
        let options = PartialNode {
            enabled: Some(false),
            name: Some(String::from("named")),
        };
        let node = create_node::<TestNode>(String::from("NodeTest"), Some(&options));
        assert!(!node.node_fields().enabled);
        assert_eq!(node.node_fields().name.as_deref(), Some("named"));
    }

    #[test]
    fn makes_a_default_runtime_object_if_none_passed_in() {
        let node = create_test_node("NodeTest");
        let guard = node.read().unwrap();
        assert!(guard.node_runtime().children.is_none());
        assert!(guard.node_runtime().parent.is_none());
    }
}

mod create_node_runtime {
    use super::*;

    #[test]
    fn returns_a_new_object_for_the_given_kind() {
        let node: TestNode = create_node(String::from("NodeTest"), None);
        assert_eq!(node.node_fields().kind, "NodeTest");
        assert!(node.node_fields().enabled);
    }

    #[test]
    fn initializes_default_values() {
        let runtime = create_node_runtime(None);
        assert_eq!(runtime.appearance_id, 0);
        assert_eq!(runtime.bounds_using_local_bounds_id, -1);
        assert_eq!(runtime.bounds_using_local_transform_id, -1);
        assert!(runtime.children.is_none());
        assert!(runtime.node_signals.is_none());
        assert!(runtime.interaction_signals.is_none());
        assert!(runtime.interaction_state.is_none());
        assert_eq!(runtime.local_bounds_id, 0);
        assert_eq!(runtime.local_bounds_using_local_bounds_id, -1);
        assert_eq!(runtime.local_transform_id, 0);
        assert_eq!(runtime.local_transform_using_local_transform_id, -1);
        assert!(runtime.parent.is_none());
        assert_eq!(runtime.world_bounds_using_local_bounds_id, -1);
        assert_eq!(runtime.world_bounds_using_world_transform_id, -1);
        assert_eq!(runtime.world_transform_id, 0);
        assert_eq!(runtime.world_transform_using_local_transform_id, -1);
        assert_eq!(runtime.world_transform_using_parent_transform_id, -1);
    }

    #[test]
    fn allows_a_custom_can_add_child() {
        let methods = NodeRuntimeMethods {
            can_add_child: Some(Arc::new(|_target: &dyn Node, _child: &dyn Node| false)),
        };
        let runtime = create_node_runtime(Some(&methods));
        let parent = create_test_node("Test");
        let child = create_test_node("Test");
        let parent_guard = parent.read().unwrap();
        let child_guard = child.read().unwrap();
        assert!(!(runtime.can_add_child)(&*parent_guard, &*child_guard));
    }
}

mod create_node_signals {
    use super::*;

    #[test]
    fn returns_an_object_with_all_signal_properties() {
        let signals = create_node_signals();
        let guard = signals.read().unwrap();
        flight_signals::emit_signal(&guard.on_child_added, &create_test_node("Test"));
        flight_signals::emit_signal(&guard.on_child_removed, &create_test_node("Test"));
        flight_signals::emit_signal(&guard.on_children_changed, &());
        flight_signals::emit_signal(&guard.on_children_order_changed, &());
        flight_signals::emit_signal(&guard.on_parent_changed, &());
    }
}

mod default_node_runtime_can_add_child {
    use super::*;

    #[test]
    fn always_returns_true() {
        let parent = create_test_node("Test");
        let child = create_test_node("Test");
        let parent_guard = parent.read().unwrap();
        let child_guard = child.read().unwrap();
        assert!(default_node_runtime_can_add_child(
            &*parent_guard,
            &*child_guard
        ));
    }
}

mod dispose_node {
    use super::*;

    #[test]
    fn detaches_the_node_from_its_parent() {
        let parent = create_test_node("Test");
        let child = create_test_node("Test");
        add_node_child(&parent, &child);
        dispose_node(&child);
        assert!(get_node_parent(&child).is_none());
        assert_eq!(get_node_child_count(&parent), 0);
    }

    #[test]
    fn recursively_removes_all_descendants() {
        let parent = create_test_node("Test");
        let child = create_test_node("Test");
        let grandchild = create_test_node("Test");
        add_node_child(&parent, &child);
        add_node_child(&child, &grandchild);
        dispose_node(&parent);
        assert_eq!(get_node_child_count(&parent), 0);
        assert!(get_node_parent(&child).is_none());
        assert!(get_node_parent(&grandchild).is_none());
    }

    #[test]
    fn clears_node_signals_after_disposal() {
        let node = create_test_node("Test");
        enable_node_signals(&node);
        dispose_node(&node);
        assert!(get_node_signals(&*node.read().unwrap()).is_none());
    }

    #[test]
    fn releases_the_interaction_runtime_slots_after_disposal() {
        let node = create_test_node("Test");
        {
            let mut guard = node.write().unwrap();
            let runtime = guard.node_runtime_mut();
            runtime.interaction_signals = Some(Arc::new("signals"));
            runtime.interaction_state = Some(Arc::new("state"));
        }
        dispose_node(&node);
        let guard = node.read().unwrap();
        assert!(guard.node_runtime().interaction_signals.is_none());
        assert!(guard.node_runtime().interaction_state.is_none());
    }

    #[test]
    fn is_safe_on_a_root_node_with_no_parent() {
        let node = create_test_node("Test");
        dispose_node(&node);
    }

    #[test]
    fn is_safe_on_a_leaf_node_with_no_children() {
        let node = create_test_node("Test");
        dispose_node(&node);
    }
}

mod enable_node_signals {
    use super::*;

    #[test]
    fn creates_and_returns_signals_on_first_call() {
        let node = create_test_node("Test");
        let signals = enable_node_signals(&node);
        assert!(get_node_signals(&*node.read().unwrap()).is_some());
        assert!(Arc::ptr_eq(
            &signals,
            &get_node_signals(&*node.read().unwrap()).unwrap()
        ));
    }

    #[test]
    fn returns_the_same_object_on_subsequent_calls() {
        let node = create_test_node("Test");
        let first = enable_node_signals(&node);
        let second = enable_node_signals(&node);
        assert!(Arc::ptr_eq(&first, &second));
    }
}

mod get_node_runtime {
    use super::*;

    #[test]
    fn returns_the_runtime_attached_to_the_node() {
        let node = create_test_node("Test");
        let guard = node.read().unwrap();
        assert!(get_node_runtime(&*guard).children.is_none());
    }
}

mod get_node_signals {
    use super::*;

    #[test]
    fn returns_none_before_signals_are_enabled() {
        let node = create_test_node("Test");
        assert!(get_node_signals(&*node.read().unwrap()).is_none());
    }

    #[test]
    fn returns_the_signals_after_enable_node_signals() {
        let node = create_test_node("Test");
        let signals = enable_node_signals(&node);
        assert!(Arc::ptr_eq(
            &signals,
            &get_node_signals(&*node.read().unwrap()).unwrap()
        ));
    }
}

mod initialize_node {
    use super::*;

    #[test]
    fn populates_fields_on_an_allocated_entity() {
        let mut out: TestNode = flight_entity::allocate_entity();
        let options = PartialNode {
            enabled: Some(false),
            name: Some(String::from("test")),
        };
        initialize_node(&mut out, String::from("NodeTest"), Some(&options));
        assert_eq!(out.node_fields().kind, "NodeTest");
        assert_eq!(out.node_fields().name.as_deref(), Some("test"));
        assert!(!out.node_fields().enabled);
    }
}

mod initialize_node_signals {
    use super::*;

    #[test]
    fn is_the_construction_initializer_of_create_node_signals() {
        let signals = create_node_signals();
        {
            let mut guard = signals.write().unwrap();
            initialize_node_signals(&mut guard);
        }
        let guard = signals.read().unwrap();
        flight_signals::emit_signal(&guard.on_parent_changed, &());
    }
}

mod set_node_enabled {
    use super::*;

    #[test]
    fn sets_enabled_false_and_back_to_true() {
        let node = create_test_node("Test");
        set_node_enabled(&node, false);
        assert!(!node.read().unwrap().node_fields().enabled);
        set_node_enabled(&node, true);
        assert!(node.read().unwrap().node_fields().enabled);
    }
}
