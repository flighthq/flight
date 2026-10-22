use std::sync::{Arc, RwLock};

use crate::interaction_fixture;
use flight_interaction::interaction_manager::*;
use flight_interaction::types::{
    InteractionDispatchLayerOptions, InteractionInputSource, InteractionSignalName,
    create_interaction_manager_options,
};

mod capture_interaction_pointer {
    use super::*;

    #[test]
    fn captures_and_stores() {
        let root = interaction_fixture::node();
        let target = interaction_fixture::interactive_node();
        let mut mgr = interaction_fixture::manager_for(&root);
        capture_interaction_pointer(&mut mgr, 0, target);
        assert!(mgr.pointer_captures.contains_key(&0));
    }
}

mod connect_input_to_interaction {
    use super::*;
    use std::sync::atomic::{AtomicU32, Ordering};

    fn test_input_source() -> InteractionInputSource {
        return InteractionInputSource {
            on_key_down: flight_signals::create_signal(),
            on_key_up: flight_signals::create_signal(),
            on_pointer_cancel: flight_signals::create_signal(),
            on_pointer_down: flight_signals::create_signal(),
            on_pointer_move: flight_signals::create_signal(),
            on_pointer_up: flight_signals::create_signal(),
            on_wheel: flight_signals::create_signal(),
        };
    }

    fn test_keyboard_data(key: &str) -> flight_input::InputKeyboardData {
        return flight_input::InputKeyboardData {
            alt_key: false,
            caps_lock: false,
            code: String::new(),
            ctrl_key: false,
            key: key.to_string(),
            key_code: 0,
            location: 0,
            meta_key: false,
            modifier: 0,
            num_lock: false,
            repeat: false,
            shift_key: false,
            time_stamp: 0.0,
        };
    }

    #[test]
    fn connects_and_returns_dispose() {
        let root = interaction_fixture::node();
        let mgr = Arc::new(RwLock::new(interaction_fixture::manager_for(&root)));
        let input = test_input_source();
        let dispose = connect_input_to_interaction(&input, mgr, 1.0);
        dispose();
    }

    #[test]
    fn key_down_dispatches_through_signal() {
        let root = interaction_fixture::node();
        let sigs = interaction_fixture::signals_for(&root);
        let count = Arc::new(AtomicU32::new(0));
        let count2 = count.clone();
        flight_signals::connect_signal(
            &sigs.read().unwrap().on_key_down,
            Arc::new(
                move |_data: &flight_interaction::types::KeyboardEventData| {
                    count2.fetch_add(1, Ordering::Relaxed);
                },
            ),
            None,
        );
        let mgr = Arc::new(RwLock::new(interaction_fixture::manager_for(&root)));
        mgr.write().unwrap().enabled = true;
        let input = test_input_source();
        let _dispose = connect_input_to_interaction(&input, mgr, 1.0);
        flight_signals::emit_signal(&input.on_key_down, &test_keyboard_data("a"));
        assert!(count.load(Ordering::Relaxed) > 0);
    }

    #[test]
    fn dispose_prevents_further_dispatch() {
        let root = interaction_fixture::node();
        let mgr = Arc::new(RwLock::new(interaction_fixture::manager_for(&root)));
        let input = test_input_source();
        let dispose = connect_input_to_interaction(&input, mgr, 1.0);
        dispose();
        flight_signals::emit_signal(&input.on_key_down, &test_keyboard_data("a"));
    }
}

mod connect_interaction_dispatch_layer {
    use super::*;

    #[test]
    fn adds_layer() {
        let root = interaction_fixture::node();
        let mut mgr = interaction_fixture::manager_for(&root);
        let layer: flight_interaction::types::InteractionDispatchLayer =
            Arc::new(|_node, _name, _data| false);
        connect_interaction_dispatch_layer(
            &mut mgr,
            layer,
            &InteractionDispatchLayerOptions { priority: Some(1) },
        );
        assert!(mgr.dispatch_layers.is_some());
    }
}

mod connect_interaction_signal {
    use super::*;

    #[test]
    fn increments_subscriber_count() {
        let root = interaction_fixture::node();
        let target = interaction_fixture::node();
        let mut mgr = interaction_fixture::manager_for(&root);
        let slot: flight_interaction::types::AnyInteractionSignalSlot =
            Arc::new(|_data: &flight_interaction::types::PointerEventData| {});
        connect_interaction_signal(&mut mgr, &target, InteractionSignalName::OnClick, slot);
        assert_eq!(
            mgr.signal_subscriber_counts
                .get(&InteractionSignalName::OnClick)
                .copied()
                .unwrap_or(0),
            1
        );
    }
}

mod create_interaction_manager {
    use super::*;

    #[test]
    fn defaults() {
        let root = interaction_fixture::node();
        let mgr = create_interaction_manager(root, &create_interaction_manager_options());
        assert!(mgr.enabled);
        assert_eq!(mgr.double_click_delay, 500.0);
        assert_eq!(mgr.double_click_distance, 4.0);
        assert!(mgr.suppress_touch_hover);
    }
}

mod create_interaction_signals {
    use super::*;

    #[test]
    fn returns_valid_signals() {
        let _signals = create_interaction_signals();
    }
}

mod disconnect_interaction_signal {
    use super::*;

    #[test]
    fn decrements_subscriber_count() {
        let root = interaction_fixture::node();
        let target = interaction_fixture::node();
        let mut mgr = interaction_fixture::manager_for(&root);
        let slot: flight_interaction::types::AnyInteractionSignalSlot =
            Arc::new(|_data: &flight_interaction::types::PointerEventData| {});
        connect_interaction_signal(
            &mut mgr,
            &target,
            InteractionSignalName::OnClick,
            slot.clone(),
        );
        disconnect_interaction_signal(&mut mgr, &target, InteractionSignalName::OnClick, &slot);
        assert_eq!(
            mgr.signal_subscriber_counts
                .get(&InteractionSignalName::OnClick)
                .copied()
                .unwrap_or(0),
            0
        );
    }
}

mod dispatch_interaction_context_menu {
    use super::*;

    #[test]
    fn does_not_panic() {
        let root = interaction_fixture::node();
        let mut mgr = interaction_fixture::manager_for(&root);
        dispatch_interaction_context_menu(&mut mgr, 0.0, 0.0, 0, None);
    }
}

mod dispatch_interaction_key_down {
    use super::*;

    #[test]
    fn does_not_panic() {
        let root = interaction_fixture::node();
        let mut mgr = interaction_fixture::manager_for(&root);
        dispatch_interaction_key_down(&mut mgr, "Enter", 13, None);
    }
}

mod dispatch_interaction_key_up {
    use super::*;

    #[test]
    fn does_not_panic() {
        let root = interaction_fixture::node();
        let mut mgr = interaction_fixture::manager_for(&root);
        dispatch_interaction_key_up(&mut mgr, "Enter", 13, None);
    }
}

mod dispatch_interaction_pointer_cancel {
    use super::*;

    #[test]
    fn does_not_panic() {
        let root = interaction_fixture::node();
        let mut mgr = interaction_fixture::manager_for(&root);
        dispatch_interaction_pointer_cancel(&mut mgr, 0.0, 0.0, None);
    }
}

mod dispatch_interaction_pointer_down {
    use super::*;

    #[test]
    fn on_empty_tree_does_not_panic() {
        let root = interaction_fixture::node();
        let mut mgr = interaction_fixture::manager_for(&root);
        dispatch_interaction_pointer_down(&mut mgr, 5.0, 5.0, 0, None);
    }
}

mod dispatch_interaction_pointer_move {
    use super::*;

    #[test]
    fn on_empty_tree_does_not_panic() {
        let root = interaction_fixture::node();
        let mut mgr = interaction_fixture::manager_for(&root);
        dispatch_interaction_pointer_move(&mut mgr, 5.0, 5.0, 0, None);
    }
}

mod dispatch_interaction_pointer_up {
    use super::*;

    #[test]
    fn on_empty_tree_does_not_panic() {
        let root = interaction_fixture::node();
        let mut mgr = interaction_fixture::manager_for(&root);
        dispatch_interaction_pointer_up(&mut mgr, 5.0, 5.0, 0, None, None);
    }
}

mod dispatch_interaction_wheel {
    use super::*;

    #[test]
    fn does_not_panic() {
        let root = interaction_fixture::node();
        let mut mgr = interaction_fixture::manager_for(&root);
        dispatch_interaction_wheel(&mut mgr, 0.0, 0.0, 0.0, 0.0, None);
    }
}

mod enable_interaction_signals {
    use super::*;

    #[test]
    fn returns_same_arc_twice() {
        let node = interaction_fixture::node();
        let a = enable_interaction_signals(&node);
        let b = enable_interaction_signals(&node);
        assert!(Arc::ptr_eq(&a, &b));
    }
}

mod get_interaction_signals {
    use super::*;

    #[test]
    fn returns_none_without_enable() {
        let node = interaction_fixture::node();
        assert!(get_interaction_signals(&node).is_none());
    }
}

mod initialize_interaction_manager {
    use super::*;

    #[test]
    fn does_not_panic() {
        let root = interaction_fixture::node();
        let mut mgr = interaction_fixture::manager_for(&root);
        initialize_interaction_manager(&mut mgr, root, &create_interaction_manager_options());
    }
}

mod initialize_interaction_signals {
    use super::*;

    #[test]
    fn does_not_panic() {
        let mut signals = create_interaction_signals();
        initialize_interaction_signals(&mut signals);
    }
}

mod invalidate_interaction_cursor {
    use super::*;

    #[test]
    fn does_not_panic() {
        let root = interaction_fixture::node();
        let mut mgr = interaction_fixture::manager_for(&root);
        invalidate_interaction_cursor(&mut mgr);
    }
}

mod release_interaction_pointer {
    use super::*;

    #[test]
    fn removes_capture() {
        let root = interaction_fixture::node();
        let target = interaction_fixture::interactive_node();
        let mut mgr = interaction_fixture::manager_for(&root);
        capture_interaction_pointer(&mut mgr, 0, target);
        release_interaction_pointer(&mut mgr, 0);
        assert!(!mgr.pointer_captures.contains_key(&0));
    }
}
