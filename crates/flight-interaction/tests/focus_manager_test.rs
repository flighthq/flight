use std::sync::{Arc, RwLock};

use flight_node::add_node_child;

use crate::interaction_fixture;
use flight_interaction::focus_manager::*;
use flight_interaction::types::{
    FocusDirection, FocusNavigationInput, FocusNavigationOptions, create_focus_manager_options,
};

mod clear_focus {
    use super::*;

    #[test]
    fn resets_to_none() {
        let root = interaction_fixture::node();
        let a = interaction_fixture::focusable_node(0);
        add_node_child(&root, &a);
        let mut mgr = create_focus_manager(root, &create_focus_manager_options());
        focus_next_node(&mut mgr);
        assert!(get_focused_node(&mgr).is_some());
        clear_focus(&mut mgr);
        assert!(get_focused_node(&mgr).is_none());
    }
}

mod connect_focus_navigation {
    use super::*;
    use flight_interaction::types::KeyboardEventData;

    fn key_event(key: &str, shift: bool) -> KeyboardEventData {
        return KeyboardEventData {
            alt_key: false,
            ctrl_key: false,
            key: key.to_string(),
            key_code: 0,
            meta_key: false,
            shift_key: shift,
        };
    }

    #[test]
    fn tab_advances_focus() {
        let root = interaction_fixture::node();
        let a = interaction_fixture::focusable_node(0);
        let b = interaction_fixture::focusable_node(1);
        flight_node::add_node_child(&root, &a);
        flight_node::add_node_child(&root, &b);
        let input = FocusNavigationInput {
            on_key_down: flight_signals::create_signal(),
        };
        let mgr = Arc::new(RwLock::new(create_focus_manager(root, &create_focus_manager_options())));
        let _dispose = connect_focus_navigation(&input, mgr.clone(), &FocusNavigationOptions { arrow_keys: None });
        flight_signals::emit_signal(&input.on_key_down, &key_event("Tab", false));
        let focused = get_focused_node(&mgr.read().unwrap());
        assert!(focused.is_some());
        assert!(Arc::ptr_eq(&focused.unwrap(), &a));
    }

    #[test]
    fn shift_tab_goes_backward() {
        let root = interaction_fixture::node();
        let a = interaction_fixture::focusable_node(0);
        let b = interaction_fixture::focusable_node(1);
        flight_node::add_node_child(&root, &a);
        flight_node::add_node_child(&root, &b);
        let input = FocusNavigationInput {
            on_key_down: flight_signals::create_signal(),
        };
        let mgr = Arc::new(RwLock::new(create_focus_manager(root, &create_focus_manager_options())));
        let _dispose = connect_focus_navigation(&input, mgr.clone(), &FocusNavigationOptions { arrow_keys: None });
        flight_signals::emit_signal(&input.on_key_down, &key_event("Tab", true));
        let focused = get_focused_node(&mgr.read().unwrap());
        assert!(focused.is_some());
        assert!(Arc::ptr_eq(&focused.unwrap(), &b));
    }

    #[test]
    fn dispose_disconnects_signal() {
        let root = interaction_fixture::node();
        let a = interaction_fixture::focusable_node(0);
        flight_node::add_node_child(&root, &a);
        let input = FocusNavigationInput {
            on_key_down: flight_signals::create_signal(),
        };
        let mgr = Arc::new(RwLock::new(create_focus_manager(root, &create_focus_manager_options())));
        let dispose = connect_focus_navigation(&input, mgr.clone(), &FocusNavigationOptions { arrow_keys: None });
        dispose();
        flight_signals::emit_signal(&input.on_key_down, &key_event("Tab", false));
        assert!(get_focused_node(&mgr.read().unwrap()).is_none());
    }

    #[test]
    fn arrow_keys_ignored_when_disabled() {
        let root = interaction_fixture::node();
        let a = interaction_fixture::focusable_node(0);
        flight_node::add_node_child(&root, &a);
        let input = FocusNavigationInput {
            on_key_down: flight_signals::create_signal(),
        };
        let mgr = Arc::new(RwLock::new(create_focus_manager(root, &create_focus_manager_options())));
        let _dispose = connect_focus_navigation(&input, mgr.clone(), &FocusNavigationOptions { arrow_keys: Some(false) });
        flight_signals::emit_signal(&input.on_key_down, &key_event("Tab", false));
        flight_signals::emit_signal(&input.on_key_down, &key_event("ArrowDown", false));
        let focused = get_focused_node(&mgr.read().unwrap());
        assert!(focused.is_some());
        assert!(Arc::ptr_eq(&focused.unwrap(), &a));
    }
}

mod create_focus_manager {
    use super::*;

    #[test]
    fn defaults() {
        let root = interaction_fixture::node();
        let mgr = create_focus_manager(root, &create_focus_manager_options());
        assert!(mgr.wrap);
        assert!(get_focused_node(&mgr).is_none());
    }
}

mod focus_next_node {
    use super::*;

    #[test]
    fn cycles_through_nodes() {
        let root = interaction_fixture::node();
        let a = interaction_fixture::focusable_node(0);
        let b = interaction_fixture::focusable_node(1);
        add_node_child(&root, &a);
        add_node_child(&root, &b);
        let mut mgr = create_focus_manager(root, &create_focus_manager_options());
        let first = focus_next_node(&mut mgr);
        assert!(first.is_some());
        assert!(Arc::ptr_eq(&first.unwrap(), &a));
        let second = focus_next_node(&mut mgr);
        assert!(second.is_some());
        assert!(Arc::ptr_eq(&second.unwrap(), &b));
    }
}

mod focus_node_in_direction {
    use super::*;

    #[test]
    fn returns_none_for_empty_tree() {
        let root = interaction_fixture::node();
        let mut mgr = create_focus_manager(root, &create_focus_manager_options());
        let result = focus_node_in_direction(&mut mgr, FocusDirection::Down);
        assert!(result.is_none());
    }
}

mod focus_previous_node {
    use super::*;

    #[test]
    fn wraps_to_last() {
        let root = interaction_fixture::node();
        let a = interaction_fixture::focusable_node(0);
        let b = interaction_fixture::focusable_node(1);
        add_node_child(&root, &a);
        add_node_child(&root, &b);
        let mut mgr = create_focus_manager(root, &create_focus_manager_options());
        let last = focus_previous_node(&mut mgr);
        assert!(last.is_some());
        assert!(Arc::ptr_eq(&last.unwrap(), &b));
    }
}

mod get_focus_order {
    use super::*;

    #[test]
    fn empty_tree_returns_empty() {
        let root = interaction_fixture::node();
        let mgr = create_focus_manager(root, &create_focus_manager_options());
        let order = get_focus_order(&mgr);
        assert!(order.is_empty());
    }

    #[test]
    fn with_focusable_children_returns_sorted() {
        let root = interaction_fixture::node();
        let a = interaction_fixture::focusable_node(1);
        let b = interaction_fixture::focusable_node(0);
        add_node_child(&root, &a);
        add_node_child(&root, &b);
        let mgr = create_focus_manager(root, &create_focus_manager_options());
        let order = get_focus_order(&mgr);
        assert_eq!(order.len(), 2);
        assert!(Arc::ptr_eq(&order[0], &b));
        assert!(Arc::ptr_eq(&order[1], &a));
    }
}

mod get_focused_node {
    use super::*;

    #[test]
    fn returns_none_initially() {
        let root = interaction_fixture::node();
        let mgr = create_focus_manager(root, &create_focus_manager_options());
        assert!(get_focused_node(&mgr).is_none());
    }
}

mod initialize_focus_manager {
    use super::*;

    #[test]
    fn does_not_panic() {
        let root = interaction_fixture::node();
        let mut mgr = create_focus_manager(root.clone(), &create_focus_manager_options());
        initialize_focus_manager(&mut mgr, root, &create_focus_manager_options());
    }
}

mod is_node_focused {
    use super::*;

    #[test]
    fn checks_identity() {
        let root = interaction_fixture::node();
        let a = interaction_fixture::focusable_node(0);
        let b = interaction_fixture::focusable_node(1);
        add_node_child(&root, &a);
        add_node_child(&root, &b);
        let mut mgr = create_focus_manager(root, &create_focus_manager_options());
        focus_next_node(&mut mgr);
        assert!(is_node_focused(&mgr, &a));
        assert!(!is_node_focused(&mgr, &b));
    }
}

mod set_focused_node {
    use super::*;

    #[test]
    fn unfocusable_returns_false() {
        let root = interaction_fixture::node();
        let child = interaction_fixture::node();
        add_node_child(&root, &child);
        let mut mgr = create_focus_manager(root, &create_focus_manager_options());
        assert!(!set_focused_node(&mut mgr, Some(child)));
    }
}

mod set_focused_node_ref {
    use super::*;
    use flight_entity::Ref;
    use flight_interaction::types::{FocusEventData, FocusManager};
    use flight_node::NodeRef;
    use flight_signals::connect_signal;
    use std::sync::Mutex;
    use std::sync::mpsc;
    use std::time::Duration;

    type FocusLog = Arc<Mutex<Vec<(&'static str, &'static str, Option<&'static str>)>>>;

    struct Stops {
        a: NodeRef,
        b: NodeRef,
        c: NodeRef,
        manager: Ref<FocusManager>,
    }

    fn stops() -> Stops {
        let root = interaction_fixture::node();
        let a = interaction_fixture::focusable_node(0);
        let b = interaction_fixture::focusable_node(1);
        let c = interaction_fixture::focusable_node(2);
        add_node_child(&root, &a);
        add_node_child(&root, &b);
        add_node_child(&root, &c);
        let manager = Arc::new(RwLock::new(create_focus_manager(
            root,
            &create_focus_manager_options(),
        )));
        return Stops { a, b, c, manager };
    }

    fn name_of(stops: &Stops, node: &Option<NodeRef>) -> Option<&'static str> {
        let node = node.as_ref()?;
        for (name, candidate) in [("a", &stops.a), ("b", &stops.b), ("c", &stops.c)] {
            if Arc::ptr_eq(node, candidate) {
                return Some(name);
            }
        }
        return Some("other");
    }

    fn record(
        stops: &Arc<Stops>,
        node: &NodeRef,
        log: &FocusLog,
        after_in: Option<Arc<dyn Fn() + Send + Sync>>,
    ) {
        let signals = interaction_fixture::signals_for(node);
        let (focus_in, focus_out) = {
            let signals = signals.read().unwrap();
            (signals.on_focus_in.clone(), signals.on_focus_out.clone())
        };
        let (in_stops, in_log) = (stops.clone(), log.clone());
        connect_signal(
            &focus_in,
            Arc::new(move |data: &FocusEventData| {
                let target = name_of(&in_stops, &data.target).unwrap();
                in_log.lock().unwrap().push((
                    "in",
                    target,
                    name_of(&in_stops, &data.related_target),
                ));
                if let Some(after_in) = &after_in {
                    after_in();
                }
            }),
            None,
        );
        let (out_stops, out_log) = (stops.clone(), log.clone());
        connect_signal(
            &focus_out,
            Arc::new(move |data: &FocusEventData| {
                let target = name_of(&out_stops, &data.target).unwrap();
                out_log.lock().unwrap().push((
                    "out",
                    target,
                    name_of(&out_stops, &data.related_target),
                ));
            }),
            None,
        );
    }

    // Runs `body` on its own thread so a deadlock fails this test instead of hanging the suite.
    fn bounded<T: Send + 'static>(body: impl FnOnce() -> T + Send + 'static) -> T {
        let (done, result) = mpsc::channel();
        std::thread::spawn(move || {
            let _ = done.send(body());
        });
        return result
            .recv_timeout(Duration::from_secs(10))
            .expect("set_focused_node_ref deadlocked");
    }

    fn focused(stops: &Stops) -> Option<&'static str> {
        return name_of(stops, &get_focused_node(&stops.manager.read().unwrap()));
    }

    #[test]
    fn emits_focus_out_before_focus_in_with_the_related_targets() {
        let stops = Arc::new(stops());
        let log: FocusLog = Arc::new(Mutex::new(Vec::new()));
        record(&stops, &stops.a, &log, None);
        record(&stops, &stops.b, &log, None);
        assert!(set_focused_node_ref(&stops.manager, Some(stops.a.clone())));
        log.lock().unwrap().clear();

        assert!(set_focused_node_ref(&stops.manager, Some(stops.b.clone())));

        assert_eq!(
            *log.lock().unwrap(),
            vec![("out", "a", Some("b")), ("in", "b", Some("a"))]
        );
        assert_eq!(focused(&stops), Some("b"));
    }

    #[test]
    fn lets_a_callback_read_the_shared_manager_and_re_enter_without_deadlock() {
        let stops = Arc::new(stops());
        let log: FocusLog = Arc::new(Mutex::new(Vec::new()));
        let observed = Arc::new(Mutex::new(Vec::new()));
        record(&stops, &stops.a, &log, None);
        let (re_stops, re_observed) = (stops.clone(), observed.clone());
        let redirect: Arc<dyn Fn() + Send + Sync> = Arc::new(move || {
            // The callback sees the committed target, then moves focus on from inside it.
            re_observed.lock().unwrap().push(focused(&re_stops));
            if focused(&re_stops) == Some("b") {
                assert!(set_focused_node_ref(
                    &re_stops.manager,
                    Some(re_stops.c.clone())
                ));
            }
        });
        record(&stops, &stops.b, &log, Some(redirect));
        record(&stops, &stops.c, &log, None);
        assert!(set_focused_node_ref(&stops.manager, Some(stops.a.clone())));
        log.lock().unwrap().clear();

        let task = stops.clone();
        assert!(bounded(move || set_focused_node_ref(
            &task.manager,
            Some(task.b.clone())
        )));

        assert_eq!(
            *log.lock().unwrap(),
            vec![
                ("out", "a", Some("b")),
                ("in", "b", Some("a")),
                ("out", "b", Some("c")),
                ("in", "c", Some("b")),
            ]
        );
        assert_eq!(*observed.lock().unwrap(), vec![Some("b")]);
        // The nested change is final: nothing is written after the outer callbacks return.
        assert_eq!(focused(&stops), Some("c"));
    }

    #[test]
    fn keeps_a_focus_cleared_inside_a_callback() {
        let stops = Arc::new(stops());
        let log: FocusLog = Arc::new(Mutex::new(Vec::new()));
        let clear_stops = stops.clone();
        let clear: Arc<dyn Fn() + Send + Sync> = Arc::new(move || {
            assert!(set_focused_node_ref(&clear_stops.manager, None));
        });
        record(&stops, &stops.b, &log, Some(clear));

        let task = stops.clone();
        assert!(bounded(move || set_focused_node_ref(
            &task.manager,
            Some(task.b.clone())
        )));

        assert_eq!(
            *log.lock().unwrap(),
            vec![("in", "b", None), ("out", "b", None)]
        );
        assert_eq!(focused(&stops), None);
    }

    #[test]
    fn returns_true_without_signals_when_the_target_is_already_focused() {
        let stops = Arc::new(stops());
        let log: FocusLog = Arc::new(Mutex::new(Vec::new()));
        record(&stops, &stops.a, &log, None);
        assert!(set_focused_node_ref(&stops.manager, Some(stops.a.clone())));
        log.lock().unwrap().clear();

        assert!(set_focused_node_ref(&stops.manager, Some(stops.a.clone())));

        assert!(log.lock().unwrap().is_empty());
        assert_eq!(focused(&stops), Some("a"));
    }

    #[test]
    fn rejects_a_non_focusable_target_without_changing_focus() {
        let stops = Arc::new(stops());
        let log: FocusLog = Arc::new(Mutex::new(Vec::new()));
        record(&stops, &stops.a, &log, None);
        assert!(set_focused_node_ref(&stops.manager, Some(stops.a.clone())));
        log.lock().unwrap().clear();

        assert!(!set_focused_node_ref(
            &stops.manager,
            Some(interaction_fixture::node())
        ));

        assert!(log.lock().unwrap().is_empty());
        assert_eq!(focused(&stops), Some("a"));
    }

    #[test]
    fn clears_focus_with_only_a_focus_out() {
        let stops = Arc::new(stops());
        let log: FocusLog = Arc::new(Mutex::new(Vec::new()));
        record(&stops, &stops.a, &log, None);
        assert!(set_focused_node_ref(&stops.manager, Some(stops.a.clone())));
        log.lock().unwrap().clear();

        assert!(set_focused_node_ref(&stops.manager, None));

        assert_eq!(*log.lock().unwrap(), vec![("out", "a", None)]);
        assert_eq!(focused(&stops), None);
    }

    #[test]
    fn matches_the_exclusive_setter_on_the_same_sequence() {
        let shared = Arc::new(stops());
        let exclusive = stops();
        let mut manager = create_focus_manager(
            exclusive.manager.read().unwrap().root.clone(),
            &create_focus_manager_options(),
        );
        for (shared_target, exclusive_target) in [
            (Some(shared.b.clone()), Some(exclusive.b.clone())),
            (Some(shared.b.clone()), Some(exclusive.b.clone())),
            (
                Some(interaction_fixture::node()),
                Some(interaction_fixture::node()),
            ),
            (None, None),
        ] {
            assert_eq!(
                set_focused_node_ref(&shared.manager, shared_target),
                set_focused_node(&mut manager, exclusive_target)
            );
            assert_eq!(
                focused(&shared),
                name_of(&exclusive, &get_focused_node(&manager))
            );
        }
    }
}
