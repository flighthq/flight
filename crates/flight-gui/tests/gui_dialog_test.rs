use flight_entity::Ref;
use flight_gui::contract::*;
use flight_interaction::contract::*;
use flight_node::{NodeRef, get_node_parent};
use flight_scene2d::Node2DRef;
use std::sync::{Arc, RwLock};
fn options() -> GuiDialogOptions {
    return GuiDialogOptions {
        backdrop: None,
        focus_manager: None,
        transition: None,
    };
}
fn entry(id: &str, root: Node2DRef) -> Ref<GuiDialogEntry> {
    return Arc::new(RwLock::new(GuiDialogEntry {
        dismiss_on_backdrop: None,
        id: id.to_string(),
        initial_focus: None,
        root,
    }));
}
fn result(id: &str, reason: GuiDialogCloseReason) -> Ref<GuiDialogCloseResult> {
    return Arc::new(RwLock::new(GuiDialogCloseResult {
        entry_id: id.to_string(),
        reason,
        value: None,
    }));
}
fn visible(node: &Node2DRef) -> bool {
    return node.read().unwrap().node2d_fields().visible;
}
fn focus_manager() -> Ref<FocusManager> {
    return Arc::new(RwLock::new(create_focus_manager(
        create_gui_test_node(None, None),
        &FocusManagerOptions { wrap: None },
    )));
}
fn focusable() -> Node2DRef {
    let node: Node2DRef = create_gui_test_node(None, None);
    let target: NodeRef = node.clone();
    set_node_focusable(&target, true);
    return node;
}
fn assert_focus(manager: &Ref<FocusManager>, node: &Node2DRef) {
    let expected: NodeRef = node.clone();
    assert!(Arc::ptr_eq(
        get_focused_node(&manager.read().unwrap()).as_ref().unwrap(),
        &expected
    ));
}
mod close_gui_dialog {
    use super::*;
    #[test]
    fn closes_the_active_entry_and_promotes_the_fifo_head_without_reparenting_caller_visuals() {
        let backdrop: Node2DRef = create_gui_test_node(None, None);
        let first_root: Node2DRef = create_gui_test_node(None, None);
        let second_root: Node2DRef = create_gui_test_node(None, None);
        let mut options = options();
        options.backdrop = Some(backdrop.clone());
        let dialog = create_gui_dialog(Some(&options));
        let closed = Arc::new(RwLock::new(Vec::new()));
        let copy = closed.clone();
        let signals = get_gui_dialog_signals(&dialog);
        flight_signals::connect_signal(
            &signals.read().unwrap().on_close.read().unwrap(),
            Arc::new(move |result| copy.write().unwrap().push(result.clone())),
            None,
        );
        enqueue_gui_dialog(&dialog, &entry("first", first_root.clone()));
        enqueue_gui_dialog(&dialog, &entry("second", second_root.clone()));
        assert_eq!(
            [
                visible(&backdrop),
                visible(&first_root),
                visible(&second_root)
            ],
            [true, true, false]
        );
        let first: NodeRef = first_root.clone();
        let second: NodeRef = second_root.clone();
        assert!(get_node_parent(&first).is_none());
        assert!(get_node_parent(&second).is_none());
        let result = result("first", GuiDialogCloseReason::Accepted);
        let value: flight_entity::UnknownValue = Arc::new(7_i32);
        result.write().unwrap().value = Some(Some(value.clone()));
        assert!(close_gui_dialog(&dialog, &result));
        assert_eq!(
            get_active_gui_dialog_entry(&dialog)
                .unwrap()
                .read()
                .unwrap()
                .id,
            "second"
        );
        assert_eq!(
            [
                visible(&backdrop),
                visible(&first_root),
                visible(&second_root)
            ],
            [true, false, true]
        );
        assert_eq!(closed.read().unwrap().len(), 1);
        let closed = closed.read().unwrap()[0].clone();
        assert!(Arc::ptr_eq(&closed, &result));
        assert_eq!(closed.read().unwrap().entry_id, "first");
        assert_eq!(
            closed.read().unwrap().reason,
            GuiDialogCloseReason::Accepted
        );
        assert!(Arc::ptr_eq(
            closed
                .read()
                .unwrap()
                .value
                .as_ref()
                .unwrap()
                .as_ref()
                .unwrap(),
            &value
        ));
        assert_eq!(*value.downcast_ref::<i32>().unwrap(), 7);
        assert!(get_node_parent(&first).is_none());
        assert!(get_node_parent(&second).is_none());
    }
    #[test]
    fn rejects_a_mismatched_result_and_a_reentrant_duplicate_close() {
        let root: Node2DRef = create_gui_test_node(None, None);
        let dialog = Arc::new(RwLock::new(create_gui_dialog(None)));
        enqueue_gui_dialog(&dialog.read().unwrap(), &entry("only", root.clone()));
        let result = result("only", GuiDialogCloseReason::Cancelled);
        let nested = Arc::new(RwLock::new(Vec::new()));
        let copy = nested.clone();
        let close_count = Arc::new(RwLock::new(0));
        let count = close_count.clone();
        let retained = dialog.clone();
        let retained_result = result.clone();
        let signals = get_gui_dialog_signals(&dialog.read().unwrap());
        flight_signals::connect_signal(
            &signals.read().unwrap().on_close.read().unwrap(),
            Arc::new(move |_| {
                *count.write().unwrap() += 1;
                copy.write().unwrap().push(close_gui_dialog(
                    &retained.read().unwrap(),
                    &retained_result,
                ));
            }),
            None,
        );
        assert!(!close_gui_dialog(
            &dialog.read().unwrap(),
            &super::result("other", GuiDialogCloseReason::Cancelled)
        ));
        assert!(close_gui_dialog(&dialog.read().unwrap(), &result));
        assert_eq!(*close_count.read().unwrap(), 1);
        assert_eq!(*nested.read().unwrap(), [false]);
        assert!(!visible(&root));
        assert!(get_active_gui_dialog_entry(&dialog.read().unwrap()).is_none());
    }
}

mod create_gui_dialog {
    use super::*;
    #[test]
    fn dismisses_only_an_opted_in_active_entry_from_the_supplied_backdrop() {
        let backdrop: Node2DRef = create_gui_test_node(None, None);
        let mut options = options();
        options.backdrop = Some(backdrop.clone());
        let dialog = create_gui_dialog(Some(&options));
        let results = Arc::new(RwLock::new(Vec::new()));
        let copy = results.clone();
        let signals = get_gui_dialog_signals(&dialog);
        flight_signals::connect_signal(
            &signals.read().unwrap().on_close.read().unwrap(),
            Arc::new(move |result| {
                let result = result.read().unwrap();
                copy.write().unwrap().push((
                    result.entry_id.clone(),
                    result.reason,
                    result.value.is_none(),
                ));
            }),
            None,
        );
        enqueue_gui_dialog(&dialog, &entry("fixed", create_gui_test_node(None, None)));
        emit_gui_pointer(&backdrop, InteractionSignalName::OnClick, None);
        assert_eq!(
            get_active_gui_dialog_entry(&dialog)
                .unwrap()
                .read()
                .unwrap()
                .id,
            "fixed"
        );
        close_gui_dialog(&dialog, &result("fixed", GuiDialogCloseReason::Cancelled));
        let dismissible = entry("dismissible", create_gui_test_node(None, None));
        dismissible.write().unwrap().dismiss_on_backdrop = Some(true);
        enqueue_gui_dialog(&dialog, &dismissible);
        emit_gui_pointer(&backdrop, InteractionSignalName::OnClick, None);
        assert_eq!(
            *results.read().unwrap(),
            [
                ("fixed".to_string(), GuiDialogCloseReason::Cancelled, true),
                (
                    "dismissible".to_string(),
                    GuiDialogCloseReason::Dismissed,
                    true
                )
            ]
        );
    }
    #[test]
    fn writes_visibility_immediately_by_default_and_delegates_only_to_an_explicit_transition_adapter()
     {
        let backdrop: Node2DRef = create_gui_test_node(None, None);
        let root: Node2DRef = create_gui_test_node(None, None);
        root.write().unwrap().node2d_fields_mut().visible = false;
        let requests = Arc::new(RwLock::new(Vec::new()));
        let copy = requests.clone();
        let mut options = options();
        options.backdrop = Some(backdrop.clone());
        options.transition = Some(Arc::new(GuiTransitionDescriptor {
            run: Arc::new(move |request| {
                copy.write()
                    .unwrap()
                    .push((request.target.clone(), request.value));
                (request.apply)(None);
            }),
        }));
        let dialog = create_gui_dialog(Some(&options));
        assert!(!visible(&backdrop));
        enqueue_gui_dialog(&dialog, &entry("entry", root.clone()));
        assert_eq!([visible(&backdrop), visible(&root)], [true, true]);
        let requests = requests.read().unwrap();
        assert_eq!(requests.len(), 3);
        for ((target, value), (expected, visible)) in requests.iter().zip([
            (backdrop.clone(), false),
            (root.clone(), true),
            (backdrop.clone(), true),
        ]) {
            let expected: NodeRef = expected;
            assert!(Arc::ptr_eq(target, &expected));
            assert!(matches!(value,GuiTransitionValue::Boolean(value) if *value==visible));
        }
    }
}

mod dispose_gui_dialog {
    use super::*;
    #[test]
    fn hides_retained_visuals_restores_focus_and_detaches_backdrop_interaction() {
        let manager = focus_manager();
        let previous = focusable();
        let initial = focusable();
        let old: NodeRef = previous.clone();
        set_focused_node_ref(&manager, Some(old));
        let backdrop: Node2DRef = create_gui_test_node(None, None);
        let entry_root: Node2DRef = create_gui_test_node(None, None);
        let mut options = options();
        options.focus_manager = Some(manager.clone());
        options.backdrop = Some(backdrop.clone());
        let dialog = create_gui_dialog(Some(&options));
        let closes = Arc::new(RwLock::new(0));
        let copy = closes.clone();
        let signals = get_gui_dialog_signals(&dialog);
        flight_signals::connect_signal(
            &signals.read().unwrap().on_close.read().unwrap(),
            Arc::new(move |_| *copy.write().unwrap() += 1),
            None,
        );
        let entry = entry("entry", entry_root.clone());
        entry.write().unwrap().dismiss_on_backdrop = Some(true);
        entry.write().unwrap().initial_focus = Some(initial.clone());
        enqueue_gui_dialog(&dialog, &entry);
        assert_focus(&manager, &initial);
        dispose_gui_dialog(&dialog);
        emit_gui_pointer(&backdrop, InteractionSignalName::OnClick, None);
        assert_eq!([visible(&backdrop), visible(&entry_root)], [false, false]);
        assert_focus(&manager, &previous);
        assert_eq!(*closes.read().unwrap(), 0);
        assert!(!enqueue_gui_dialog(
            &dialog,
            &super::entry("late", create_gui_test_node(None, None))
        ));
    }
}

mod enqueue_gui_dialog {
    use super::*;
    #[test]
    fn rejects_duplicate_ids_without_changing_the_caller_visual_or_queue() {
        let first_root: Node2DRef = create_gui_test_node(None, None);
        let duplicate_root: Node2DRef = create_gui_test_node(None, None);
        let dialog = create_gui_dialog(None);
        assert!(enqueue_gui_dialog(
            &dialog,
            &entry("same", first_root.clone())
        ));
        assert!(!enqueue_gui_dialog(
            &dialog,
            &entry("same", duplicate_root.clone())
        ));
        let mut entries = Vec::new();
        get_gui_dialog_entries(&mut entries, &dialog);
        assert_eq!(entries.len(), 1);
        assert!(Arc::ptr_eq(&entries[0].read().unwrap().root, &first_root));
        assert!(visible(&duplicate_root));
    }
    #[test]
    fn hands_focus_to_each_explicit_initial_target_and_restores_pre_dialog_focus_when_empty() {
        let manager = focus_manager();
        let previous = focusable();
        let first_focus = focusable();
        let second_focus = focusable();
        let old: NodeRef = previous.clone();
        set_focused_node_ref(&manager, Some(old));
        let mut options = options();
        options.focus_manager = Some(manager.clone());
        let dialog = create_gui_dialog(Some(&options));
        let first = entry("first", create_gui_test_node(None, None));
        first.write().unwrap().initial_focus = Some(first_focus.clone());
        let second = entry("second", create_gui_test_node(None, None));
        second.write().unwrap().initial_focus = Some(second_focus.clone());
        enqueue_gui_dialog(&dialog, &first);
        enqueue_gui_dialog(&dialog, &second);
        assert_focus(&manager, &first_focus);
        close_gui_dialog(&dialog, &result("first", GuiDialogCloseReason::Accepted));
        assert_focus(&manager, &second_focus);
        close_gui_dialog(&dialog, &result("second", GuiDialogCloseReason::Accepted));
        assert_focus(&manager, &previous);
    }
    #[test]
    fn permits_focus_in_callbacks_to_close_and_restore_the_same_manager_without_held_guards() {
        let manager = focus_manager();
        let previous = focusable();
        let initial = focusable();
        let previous_node: NodeRef = previous.clone();
        set_focused_node_ref(&manager, Some(previous_node));
        let mut options = options();
        options.focus_manager = Some(manager.clone());
        let dialog = Arc::new(RwLock::new(create_gui_dialog(Some(&options))));
        let retained = dialog.clone();
        let retained_manager = manager.clone();
        let state = get_gui_controller_runtime(&dialog.read().unwrap());
        let target: NodeRef = initial.clone();
        let signals = enable_interaction_signals(&target);
        let closed = Arc::new(RwLock::new(false));
        let flag = closed.clone();
        flight_signals::connect_signal(
            &signals.read().unwrap().on_focus_in,
            Arc::new(move |_| {
                assert!(retained_manager.try_write().is_ok());
                assert!(state.try_write().is_ok());
                let result = result("entry", GuiDialogCloseReason::Accepted);
                *flag.write().unwrap() = close_gui_dialog(&retained.read().unwrap(), &result);
            }),
            None,
        );
        let entry = entry("entry", create_gui_test_node(None, None));
        entry.write().unwrap().initial_focus = Some(initial);
        assert!(enqueue_gui_dialog(&dialog.read().unwrap(), &entry));
        assert!(*closed.read().unwrap());
        assert!(get_active_gui_dialog_entry(&dialog.read().unwrap()).is_none());
        assert_focus(&manager, &previous);
    }
}

mod get_active_gui_dialog_entry {
    use super::*;
    #[test]
    fn returns_null_for_empty_queue_and_current_fifo_head_otherwise() {
        let dialog = create_gui_dialog(None);
        assert!(get_active_gui_dialog_entry(&dialog).is_none());
        enqueue_gui_dialog(&dialog, &entry("active", create_gui_test_node(None, None)));
        assert_eq!(
            get_active_gui_dialog_entry(&dialog)
                .unwrap()
                .read()
                .unwrap()
                .id,
            "active"
        );
    }
}

mod get_gui_dialog_close_reason_string {
    use super::*;
    #[test]
    fn preserves_source_literals() {
        assert_eq!(
            get_gui_dialog_close_reason_string(GuiDialogCloseReason::Accepted),
            "accepted"
        );
        assert_eq!(
            get_gui_dialog_close_reason_string(GuiDialogCloseReason::Cancelled),
            "cancelled"
        );
        assert_eq!(
            get_gui_dialog_close_reason_string(GuiDialogCloseReason::Dismissed),
            "dismissed"
        );
    }
}

mod get_gui_dialog_entries {
    use super::*;
    #[test]
    fn fills_a_caller_owned_array_in_fifo_order_and_reuses_it_after_queue_changes() {
        let dialog = create_gui_dialog(None);
        let first = entry("first", create_gui_test_node(None, None));
        let second = entry("second", create_gui_test_node(None, None));
        enqueue_gui_dialog(&dialog, &first);
        enqueue_gui_dialog(&dialog, &second);
        let mut out = vec![entry("stale", create_gui_test_node(None, None))];
        let address = &out as *const _;
        get_gui_dialog_entries(&mut out, &dialog);
        assert_eq!(&out as *const _, address);
        assert_eq!(
            out.iter()
                .map(|entry| entry.read().unwrap().id.clone())
                .collect::<Vec<_>>(),
            ["first", "second"]
        );
        assert!(Arc::ptr_eq(&out[0], &first));
        assert!(Arc::ptr_eq(&out[1], &second));
        close_gui_dialog(&dialog, &result("first", GuiDialogCloseReason::Accepted));
        get_gui_dialog_entries(&mut out, &dialog);
        assert_eq!(out.len(), 1);
        assert!(Arc::ptr_eq(&out[0], &second));
        close_gui_dialog(&dialog, &result("second", GuiDialogCloseReason::Accepted));
        get_gui_dialog_entries(&mut out, &dialog);
        assert!(out.is_empty());
    }
}

mod get_gui_dialog_signals {
    use super::*;
    #[test]
    fn returns_stable_signals_and_reports_active_and_queue_changes() {
        let dialog = create_gui_dialog(None);
        let signals = get_gui_dialog_signals(&dialog);
        let active = Arc::new(RwLock::new(Vec::new()));
        let copy = active.clone();
        let queue_changes = Arc::new(RwLock::new(0));
        let count = queue_changes.clone();
        flight_signals::connect_signal(
            &signals.read().unwrap().on_active_change.read().unwrap(),
            Arc::new(move |entry| {
                copy.write()
                    .unwrap()
                    .push(entry.as_ref().map(|entry| entry.read().unwrap().id.clone()))
            }),
            None,
        );
        flight_signals::connect_signal(
            &signals.read().unwrap().on_queue_change.read().unwrap(),
            Arc::new(move |_| *count.write().unwrap() += 1),
            None,
        );
        enqueue_gui_dialog(&dialog, &entry("first", create_gui_test_node(None, None)));
        enqueue_gui_dialog(&dialog, &entry("second", create_gui_test_node(None, None)));
        close_gui_dialog(&dialog, &result("first", GuiDialogCloseReason::Accepted));
        assert!(Arc::ptr_eq(&get_gui_dialog_signals(&dialog), &signals));
        assert_eq!(
            *active.read().unwrap(),
            [Some("first".to_string()), Some("second".to_string())]
        );
        assert_eq!(*queue_changes.read().unwrap(), 3);
    }
}

mod initialize_gui_dialog {
    use super::*;
    #[test]
    fn preserves_the_controller_identity() {
        let mut dialog: GuiDialog = flight_entity::allocate_entity();
        let id = flight_entity::get_entity_id(&dialog);
        initialize_gui_dialog(&mut dialog, None);
        assert_eq!(flight_entity::get_entity_id(&dialog), id);
        assert!(
            get_gui_controller_runtime(&dialog)
                .read()
                .unwrap()
                .fields
                .entries
                .is_empty()
        );
    }
}

mod parse_gui_dialog_close_reason {
    use super::*;
    #[test]
    fn rejects_foreign_literals() {
        assert_eq!(
            parse_gui_dialog_close_reason("accepted"),
            Some(GuiDialogCloseReason::Accepted)
        );
        assert_eq!(
            parse_gui_dialog_close_reason("cancelled"),
            Some(GuiDialogCloseReason::Cancelled)
        );
        assert_eq!(
            parse_gui_dialog_close_reason("dismissed"),
            Some(GuiDialogCloseReason::Dismissed)
        );
        assert_eq!(parse_gui_dialog_close_reason("unknown"), None);
    }
}

mod remove_gui_dialog_entry {
    use super::*;
    #[test]
    fn removes_queued_entries_only() {
        let first_root: Node2DRef = create_gui_test_node(None, None);
        let second_root: Node2DRef = create_gui_test_node(None, None);
        let dialog = create_gui_dialog(None);
        enqueue_gui_dialog(&dialog, &entry("first", first_root.clone()));
        enqueue_gui_dialog(&dialog, &entry("second", second_root.clone()));
        assert!(!remove_gui_dialog_entry(&dialog, "first"));
        assert!(remove_gui_dialog_entry(&dialog, "second"));
        let mut entries = Vec::new();
        get_gui_dialog_entries(&mut entries, &dialog);
        assert_eq!(
            entries
                .iter()
                .map(|entry| entry.read().unwrap().id.clone())
                .collect::<Vec<_>>(),
            ["first"]
        );
        assert_eq!([visible(&first_root), visible(&second_root)], [true, false]);
    }
}
