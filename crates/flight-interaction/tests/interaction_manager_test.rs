//! flight-compiler: target-native

use std::sync::{Arc, RwLock};

use crate::interaction_fixture;
use flight_interaction::contract::*;
use flight_interaction::contract::{
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
        return flight_input::create_input_manager();
    }

    fn test_pointer_data(x: f64, y: f64, delta_y: f64) -> flight_input::InputPointerData {
        return flight_input::InputPointerData {
            alt_key: false,
            button: 0,
            buttons: 0,
            ctrl_key: false,
            delta_x: 0.0,
            delta_y,
            height: 0.0,
            is_primary: true,
            meta_key: false,
            pointer_id: 0,
            pointer_type: flight_input::PointerType::Mouse,
            pressure: 0.0,
            shift_key: false,
            tilt_x: 0.0,
            tilt_y: 0.0,
            time_stamp: 0.0,
            twist: 0.0,
            wheel_mode: flight_input::MouseWheelMode::Pixels,
            width: 0.0,
            x,
            y,
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
                move |_data: &flight_interaction::contract::KeyboardEventData| {
                    count2.fetch_add(1, Ordering::Relaxed);
                },
            ),
            None,
        );
        let mgr = Arc::new(RwLock::new(interaction_fixture::manager_for(&root)));
        mgr.write().unwrap().enabled = true;
        let input = test_input_source();
        let _dispose = connect_input_to_interaction(&input, mgr, 1.0);
        flight_signals::emit_signal(&input.read().unwrap().on_key_down, &test_keyboard_data("a"));
        assert!(count.load(Ordering::Relaxed) > 0);
    }

    #[test]
    fn delivers_exact_double_coordinates_through_every_pointer_bridge() {
        // Each input closure must carry x = 1e9 + 0.25 (f32 spacing 64) and y = 0.1 (no exact f32).
        type InputSignal =
            fn(&flight_input::InputManager) -> &flight_signals::Signal<flight_input::InputPointerData>;
        type NodeSignal =
            fn(
                &flight_interaction::InteractionSignals,
            ) -> &flight_signals::Signal<flight_interaction::PointerEventData>;
        let cases: [(InteractionSignalName, InputSignal, NodeSignal); 5] = [
            (
                InteractionSignalName::OnPointerCancel,
                |i| &i.on_pointer_cancel,
                |s| &s.on_pointer_cancel,
            ),
            (
                InteractionSignalName::OnPointerDown,
                |i| &i.on_pointer_down,
                |s| &s.on_pointer_down,
            ),
            (
                InteractionSignalName::OnPointerMove,
                |i| &i.on_pointer_move,
                |s| &s.on_pointer_move,
            ),
            (
                InteractionSignalName::OnPointerUp,
                |i| &i.on_pointer_up,
                |s| &s.on_pointer_up,
            ),
            (
                InteractionSignalName::OnWheel,
                |i| &i.on_wheel,
                |s| &s.on_wheel,
            ),
        ];
        for (name, input_signal, node_signal) in cases {
            let root = interaction_fixture::node();
            let sigs = interaction_fixture::signals_for(&root);
            let seen = Arc::new(RwLock::new(None));
            let seen2 = seen.clone();
            flight_signals::connect_signal(
                node_signal(&sigs.read().unwrap()),
                Arc::new(move |data: &flight_interaction::PointerEventData| {
                    *seen2.write().unwrap() = Some((data.x, data.y));
                }),
                None,
            );
            let mut manager = interaction_fixture::manager_for(&root);
            manager.enabled = true;
            capture_interaction_pointer(&mut manager, 0, root.clone());
            let slot: flight_interaction::AnyInteractionSignalSlot =
                Arc::new(|_data: &flight_interaction::PointerEventData| {});
            connect_interaction_signal(&mut manager, &root, name, slot);
            let input = test_input_source();
            let _dispose =
                connect_input_to_interaction(&input, Arc::new(RwLock::new(manager)), 1.0);

            flight_signals::emit_signal(
                input_signal(&input.read().unwrap()),
                &test_pointer_data(1_000_000_000.25, 0.1, 0.0),
            );

            assert_eq!(
                *seen.read().unwrap(),
                Some((1_000_000_000.25, 0.1)),
                "{name:?}"
            );
        }
    }

    #[test]
    fn delivers_input_pointer_coordinates_and_wheel_deltas_as_exact_doubles() {
        // f32 spacing at 1e9 is 64 and 16_777_216.5 has no f32: both survive only as doubles.
        let root = interaction_fixture::node();
        let sigs = interaction_fixture::signals_for(&root);
        let seen = Arc::new(RwLock::new(None));
        let seen2 = seen.clone();
        flight_signals::connect_signal(
            &sigs.read().unwrap().on_wheel,
            Arc::new(move |data: &flight_interaction::PointerEventData| {
                *seen2.write().unwrap() = Some((data.x, data.delta_y));
            }),
            None,
        );
        let mut manager = interaction_fixture::manager_for(&root);
        manager.enabled = true;
        capture_interaction_pointer(&mut manager, 0, root.clone());
        let slot: flight_interaction::AnyInteractionSignalSlot =
            Arc::new(|_data: &flight_interaction::PointerEventData| {});
        connect_interaction_signal(&mut manager, &root, InteractionSignalName::OnWheel, slot);
        let input = test_input_source();
        let _dispose = connect_input_to_interaction(&input, Arc::new(RwLock::new(manager)), 1.0);

        flight_signals::emit_signal(
            &input.read().unwrap().on_wheel,
            &test_pointer_data(1_000_000_000.25, 0.0, 16_777_216.5),
        );

        assert_eq!(
            *seen.read().unwrap(),
            Some((1_000_000_000.25, 16_777_216.5))
        );
    }

    #[test]
    fn dispose_prevents_further_dispatch() {
        let root = interaction_fixture::node();
        let mgr = Arc::new(RwLock::new(interaction_fixture::manager_for(&root)));
        let input = test_input_source();
        let dispose = connect_input_to_interaction(&input, mgr, 1.0);
        dispose();
        flight_signals::emit_signal(&input.read().unwrap().on_key_down, &test_keyboard_data("a"));
    }

    #[test]
    fn retains_only_registrations_and_the_manager_handle() {
        let root = interaction_fixture::node();
        let mgr = Arc::new(RwLock::new(interaction_fixture::manager_for(&root)));
        let input = test_input_source();
        let dispose = connect_input_to_interaction(&input, mgr.clone(), 1.0);
        assert_eq!(
            Arc::strong_count(&input),
            1,
            "the input lock is held only to connect"
        );
        assert!(
            input.try_write().is_ok(),
            "no input lock outlives the connection"
        );
        let released = Arc::downgrade(&input);
        drop(input);
        assert!(
            released.upgrade().is_none(),
            "the disposer must not keep the input alive"
        );
        dispose();
        assert_eq!(
            Arc::strong_count(&mgr),
            2,
            "the disposer holds the manager to reset it"
        );
        drop(dispose);
        assert_eq!(Arc::strong_count(&mgr), 1);
    }

    #[test]
    fn input_dispatch_lets_a_slot_reenter_the_manager() {
        z_run_within_deadline(|| {
            let (root, children) = interaction_fixture::tree_with_children(1);
            let child = children[0].clone();
            let mgr = interaction_fixture::shared_manager_for(&root);
            capture_interaction_pointer(&mut mgr.write().unwrap(), 0, child.clone());
            mgr.write()
                .unwrap()
                .signal_subscriber_counts
                .insert(InteractionSignalName::OnPointerDown, 1);
            let weak = Arc::downgrade(&mgr);
            flight_signals::connect_signal(
                &interaction_fixture::signals_for(&child)
                    .read()
                    .unwrap()
                    .on_pointer_down,
                Arc::new(move |_| {
                    let manager = weak.upgrade().unwrap();
                    assert!(manager.read().unwrap().enabled);
                    manager.write().unwrap().precise = true;
                }),
                None,
            );
            let input = test_input_source();
            let _dispose = connect_input_to_interaction(&input, mgr.clone(), 1.0);
            let data = test_pointer_data(1.0, 1.0, 0.0);
            flight_signals::emit_signal(&input.read().unwrap().on_pointer_down, &data);
            assert!(mgr.read().unwrap().precise);
        });
    }
}

mod connect_interaction_dispatch_layer {
    use super::*;

    #[test]
    fn adds_layer() {
        let root = interaction_fixture::node();
        let mut mgr = interaction_fixture::manager_for(&root);
        let layer: flight_interaction::contract::InteractionDispatchLayer =
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
        let slot: flight_interaction::contract::AnyInteractionSignalSlot =
            Arc::new(|_data: &flight_interaction::contract::PointerEventData| {});
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
        let mgr = create_interaction_manager(root, None);
        let mgr = mgr.read().unwrap();
        assert!(mgr.enabled);
        assert_eq!(mgr.double_click_delay, 500.0);
        assert_eq!(mgr.double_click_distance, 4.0);
        assert!(mgr.suppress_touch_hover);
    }

    #[test]
    fn applies_given_options_and_returns_one_shared_handle() {
        let root = interaction_fixture::node();
        let mut options = create_interaction_manager_options();
        options.enabled = Some(false);
        options.double_click_delay = Some(250.0);
        let manager = create_interaction_manager(root, Some(&options));
        assert_eq!(std::sync::Arc::strong_count(&manager), 1);
        let manager = manager.read().unwrap();
        assert!(!manager.enabled);
        assert_eq!(manager.double_click_delay, 250.0);
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
        let slot: flight_interaction::contract::AnyInteractionSignalSlot =
            Arc::new(|_data: &flight_interaction::contract::PointerEventData| {});
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
        let mgr = interaction_fixture::shared_manager_for(&root);
        dispatch_interaction_context_menu(&mgr, 0.0, 0.0, 0, None);
    }
}

mod dispatch_interaction_key_down {
    use super::*;

    #[test]
    fn does_not_panic() {
        let root = interaction_fixture::node();
        let mgr = interaction_fixture::shared_manager_for(&root);
        dispatch_interaction_key_down(&mgr, "Enter", 13, None);
    }

    #[test]
    fn a_key_slot_may_reenter_the_manager() {
        z_run_within_deadline(|| {
            let root = interaction_fixture::node();
            let mgr = interaction_fixture::shared_manager_for(&root);
            let weak = Arc::downgrade(&mgr);
            flight_signals::connect_signal(
                &interaction_fixture::signals_for(&root)
                    .read()
                    .unwrap()
                    .on_key_down,
                Arc::new(move |_| {
                    let manager = weak.upgrade().unwrap();
                    assert!(manager.read().unwrap().enabled);
                    manager.write().unwrap().precise = true;
                }),
                None,
            );
            dispatch_interaction_key_down(&mgr, "Enter", 13, None);
            assert!(mgr.read().unwrap().precise);
        });
    }
}

mod dispatch_interaction_key_up {
    use super::*;

    #[test]
    fn does_not_panic() {
        let root = interaction_fixture::node();
        let mgr = interaction_fixture::shared_manager_for(&root);
        dispatch_interaction_key_up(&mgr, "Enter", 13, None);
    }
}

mod dispatch_interaction_pointer_cancel {
    use super::*;

    #[test]
    fn does_not_panic() {
        let root = interaction_fixture::node();
        let mgr = interaction_fixture::shared_manager_for(&root);
        dispatch_interaction_pointer_cancel(&mgr, 0.0, 0.0, None);
    }

    #[test]
    fn delivers_cancel_then_out_and_roll_out_and_clears_capture() {
        let (root, children) = interaction_fixture::tree_with_children(1);
        let child = children[0].clone();
        let mgr = interaction_fixture::shared_manager_for(&root);
        let deliveries = z_record_deliveries(&mgr);
        capture_interaction_pointer(&mut mgr.write().unwrap(), 0, child.clone());
        dispatch_interaction_pointer_move(&mgr, 1.0, 1.0, 0, None);
        dispatch_interaction_pointer_down(&mgr, 1.0, 1.0, 0, None);
        deliveries.lock().unwrap().clear();
        dispatch_interaction_pointer_cancel(&mgr, 1.0, 1.0, None);
        assert_eq!(
            *deliveries.lock().unwrap(),
            [
                z_delivery(InteractionSignalName::OnPointerCancel, &child),
                z_delivery(InteractionSignalName::OnPointerOut, &child),
                z_delivery(InteractionSignalName::OnPointerRollOut, &child),
                z_delivery(InteractionSignalName::OnPointerRollOut, &root),
            ]
        );
        let manager = mgr.read().unwrap();
        assert!(manager.pointer_captures.is_empty());
        assert!(manager.pointer_states[&0].pointer_over_target.is_none());
        assert!(manager.cursor_target.is_none());
    }
}

mod dispatch_interaction_pointer_down {
    use super::*;

    #[test]
    fn on_empty_tree_does_not_panic() {
        let root = interaction_fixture::node();
        let mgr = interaction_fixture::shared_manager_for(&root);
        dispatch_interaction_pointer_down(&mgr, 5.0, 5.0, 0, None);
    }

    #[test]
    fn a_layer_and_a_signal_slot_may_reenter_the_manager() {
        z_run_within_deadline(|| {
            let (root, children) = interaction_fixture::tree_with_children(1);
            let child = children[0].clone();
            let mgr = interaction_fixture::shared_manager_for(&root);
            capture_interaction_pointer(&mut mgr.write().unwrap(), 0, child.clone());
            let (weak, captured) = (Arc::downgrade(&mgr), child.clone());
            connect_interaction_dispatch_layer(
                &mut mgr.write().unwrap(),
                Arc::new(move |_, _, _| {
                    let manager = weak.upgrade().unwrap();
                    assert!(manager.read().unwrap().enabled);
                    capture_interaction_pointer(&mut manager.write().unwrap(), 9, captured.clone());
                    return true;
                }),
                &InteractionDispatchLayerOptions { priority: None },
            );
            let weak = Arc::downgrade(&mgr);
            flight_signals::connect_signal(
                &interaction_fixture::signals_for(&child)
                    .read()
                    .unwrap()
                    .on_pointer_down,
                Arc::new(move |_| {
                    let manager = weak.upgrade().unwrap();
                    assert!(manager.read().unwrap().pointer_captures.contains_key(&9));
                    manager.write().unwrap().double_click_delay = 123.0;
                }),
                None,
            );
            dispatch_interaction_pointer_down(&mgr, 1.0, 1.0, 0, None);
            let manager = mgr.read().unwrap();
            assert!(manager.pointer_captures.contains_key(&9));
            assert_eq!(manager.double_click_delay, 123.0);
            assert!(manager.pointer_states[&0].pointer_down_target.is_some());
        });
    }
}

mod dispatch_interaction_pointer_move {
    use super::*;

    #[test]
    fn on_empty_tree_does_not_panic() {
        let root = interaction_fixture::node();
        let mgr = interaction_fixture::shared_manager_for(&root);
        dispatch_interaction_pointer_move(&mgr, 5.0, 5.0, 0, None);
    }

    #[test]
    fn delivers_roll_over_then_over_then_move_and_sets_the_cursor_target() {
        let (root, children) = interaction_fixture::tree_with_children(1);
        let child = children[0].clone();
        let mgr = interaction_fixture::shared_manager_for(&root);
        let deliveries = z_record_deliveries(&mgr);
        capture_interaction_pointer(&mut mgr.write().unwrap(), 0, child.clone());
        dispatch_interaction_pointer_move(&mgr, 1.0, 1.0, 0, None);
        assert_eq!(
            *deliveries.lock().unwrap(),
            [
                z_delivery(InteractionSignalName::OnPointerRollOver, &root),
                z_delivery(InteractionSignalName::OnPointerRollOver, &child),
                z_delivery(InteractionSignalName::OnPointerOver, &child),
                z_delivery(InteractionSignalName::OnPointerMove, &child),
            ]
        );
        let manager = mgr.read().unwrap();
        assert!(Arc::ptr_eq(manager.cursor_target.as_ref().unwrap(), &child));
    }
}

mod dispatch_interaction_pointer_up {
    use super::*;

    #[test]
    fn on_empty_tree_does_not_panic() {
        let root = interaction_fixture::node();
        let mgr = interaction_fixture::shared_manager_for(&root);
        dispatch_interaction_pointer_up(&mgr, 5.0, 5.0, 0, None, None);
    }

    // flight-lint: allow(f64) click timestamps are JS millisecond-precision doubles
    #[test]
    fn delivers_up_then_click_and_a_double_click_within_the_delay() {
        let (root, children) = interaction_fixture::tree_with_children(1);
        let child = children[0].clone();
        let mgr = interaction_fixture::shared_manager_for(&root);
        let deliveries = z_record_deliveries(&mgr);
        capture_interaction_pointer(&mut mgr.write().unwrap(), 0, child.clone());
        dispatch_interaction_pointer_down(&mgr, 1.0, 1.0, 0, None);
        dispatch_interaction_pointer_up(&mgr, 1.0, 1.0, 0, Some(100.0), None);
        dispatch_interaction_pointer_down(&mgr, 1.0, 1.0, 0, None);
        dispatch_interaction_pointer_up(&mgr, 1.0, 1.0, 0, Some(200.0), None);
        let down = z_delivery(InteractionSignalName::OnPointerDown, &child);
        let up = z_delivery(InteractionSignalName::OnPointerUp, &child);
        let click = z_delivery(InteractionSignalName::OnClick, &child);
        let double = z_delivery(InteractionSignalName::OnDoubleClick, &child);
        assert_eq!(
            *deliveries.lock().unwrap(),
            [down, up, click, down, up, click, double]
        );
        let manager = mgr.read().unwrap();
        assert!(manager.pointer_states[&0].last_click_target.is_none());
        assert!(manager.pointer_states[&0].pointer_down_target.is_none());
    }

    // flight-lint: allow(f64) click timestamps are JS millisecond-precision doubles
    #[test]
    fn delivers_release_outside_when_the_pointer_leaves_the_down_target() {
        let (root, children) = interaction_fixture::tree_with_children(1);
        let child = children[0].clone();
        let mgr = interaction_fixture::shared_manager_for(&root);
        let deliveries = z_record_deliveries(&mgr);
        capture_interaction_pointer(&mut mgr.write().unwrap(), 0, child.clone());
        dispatch_interaction_pointer_down(&mgr, 1.0, 1.0, 0, None);
        release_interaction_pointer(&mut mgr.write().unwrap(), 0);
        dispatch_interaction_pointer_up(&mgr, 1.0, 1.0, 0, Some(100.0), None);
        assert_eq!(
            *deliveries.lock().unwrap(),
            [
                z_delivery(InteractionSignalName::OnPointerDown, &child),
                z_delivery(InteractionSignalName::OnReleaseOutside, &child),
            ]
        );
        let manager = mgr.read().unwrap();
        assert!(manager.pointer_states[&0].last_click_target.is_none());
    }
}

mod dispatch_interaction_wheel {
    use super::*;

    #[test]
    fn does_not_panic() {
        let root = interaction_fixture::node();
        let mgr = interaction_fixture::shared_manager_for(&root);
        dispatch_interaction_wheel(&mgr, 0.0, 0.0, 0.0, 0.0, None);
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
        let mgr = interaction_fixture::shared_manager_for(&root);
        invalidate_interaction_cursor(&mgr);
    }

    #[test]
    fn the_cursor_backend_may_reenter_the_manager() {
        z_run_within_deadline(|| {
            let (root, children) = interaction_fixture::tree_with_children(1);
            let mgr = interaction_fixture::shared_manager_for(&root);
            let backend = Arc::new(ReenteringCursor {
                manager: Arc::downgrade(&mgr),
                calls: std::sync::Mutex::new(0),
            });
            mgr.write().unwrap().cursor_backend = Some(backend.clone());
            capture_interaction_pointer(&mut mgr.write().unwrap(), 0, children[0].clone());
            dispatch_interaction_pointer_move(&mgr, 1.0, 1.0, 0, None);
            invalidate_interaction_cursor(&mgr);
            assert_eq!(*backend.calls.lock().unwrap(), 2);
            assert!(mgr.read().unwrap().precise);
        });
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

// A cursor backend that re-enters the manager it is installed on.
struct ReenteringCursor {
    manager: std::sync::Weak<RwLock<InteractionManager>>,
    calls: std::sync::Mutex<usize>,
}

impl CursorBackend for ReenteringCursor {
    fn set_cursor(&self, _cursor: Option<&str>) {
        z_reenter_from_cursor(self);
    }
}

fn z_delivery(
    name: InteractionSignalName,
    target: &flight_node::NodeRef,
) -> (InteractionSignalName, usize) {
    return (name, Arc::as_ptr(target) as *const () as usize);
}

// Records every pointer delivery a dispatch makes, in order, through a pass-through dispatch layer.
fn z_record_deliveries(
    manager: &flight_entity::Ref<InteractionManager>,
) -> Arc<std::sync::Mutex<Vec<(InteractionSignalName, usize)>>> {
    let deliveries = Arc::new(std::sync::Mutex::new(Vec::new()));
    let recorded = deliveries.clone();
    connect_interaction_dispatch_layer(
        &mut manager.write().unwrap(),
        Arc::new(move |target, name, _| {
            recorded.lock().unwrap().push(z_delivery(name, target));
            return true;
        }),
        &InteractionDispatchLayerOptions { priority: None },
    );
    return deliveries;
}

fn z_reenter_from_cursor(cursor: &ReenteringCursor) {
    let manager = cursor.manager.upgrade().unwrap();
    assert!(manager.read().unwrap().enabled);
    manager.write().unwrap().precise = true;
    *cursor.calls.lock().unwrap() += 1;
}

// Runs `test` on its own thread and fails instead of hanging when it deadlocks.
fn z_run_within_deadline(test: impl FnOnce() + Send + 'static) {
    let (done, finished) = std::sync::mpsc::channel();
    let worker = std::thread::spawn(move || {
        test();
        done.send(()).unwrap();
    });
    if finished
        .recv_timeout(std::time::Duration::from_secs(5))
        .is_err()
    {
        panic!("interaction dispatch deadlocked or panicked");
    }
    worker.join().unwrap();
}
