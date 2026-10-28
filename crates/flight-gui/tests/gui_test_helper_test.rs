use flight_gui::contract::*;
use flight_interaction::contract::{InteractionSignalName, enable_interaction_signals};
use flight_scene2d::Node2DRef;
use std::sync::{Arc, RwLock};
mod create_gui_test_node {
    use super::*;
    #[test]
    fn retains_the_source_dimensions_on_the_actual_display_object_runtime() {
        let node: Node2DRef = create_gui_test_node(None, None);
        assert_eq!(get_gui_length(&node, GuiOrientation::Horizontal), 100.0);
        assert_eq!(get_gui_length(&node, GuiOrientation::Vertical), 20.0);
    }
}
mod emit_gui_keyboard {
    use super::*;
    #[test]
    fn emits_the_source_default_keyboard_record_and_uses_utf16_length_for_key_codes() {
        let target: Node2DRef = create_gui_test_node(None, None);
        let node: flight_node::NodeRef = target.clone();
        let signals = enable_interaction_signals(&node);
        let values = Arc::new(RwLock::new(Vec::new()));
        let copy = values.clone();
        flight_signals::connect_signal(
            &signals.read().unwrap().on_key_down,
            Arc::new(move |data| {
                copy.write().unwrap().push((
                    data.key.clone(),
                    data.key_code,
                    data.alt_key,
                    data.ctrl_key,
                    data.meta_key,
                    data.shift_key,
                ))
            }),
            None,
        );
        emit_gui_keyboard(&target, InteractionSignalName::OnKeyDown, "a");
        emit_gui_keyboard(&target, InteractionSignalName::OnKeyDown, "😀");
        assert_eq!(
            *values.read().unwrap(),
            [
                ("a".to_string(), 97, false, false, false, false),
                ("😀".to_string(), 0, false, false, false, false)
            ]
        );
    }
}
mod emit_gui_pointer {
    use super::*;
    #[test]
    fn emits_original_target_handles_defaults_and_exact_authored_pointer_overrides() {
        let target: Node2DRef = create_gui_test_node(None, None);
        let runtime = create_gui_controller_runtime((), None);
        let seen = Arc::new(RwLock::new(Vec::new()));
        let copy = seen.clone();
        let expected = target.clone();
        connect_gui_interaction(
            &runtime,
            &target,
            InteractionSignalName::OnPointerMove,
            GuiInteractionSlot::Pointer(GuiPointerSlot {
                callback: Arc::new(move |data| {
                    assert!(std::ptr::addr_eq(
                        Arc::as_ptr(data.target.as_ref().unwrap()),
                        Arc::as_ptr(&expected)
                    ));
                    copy.write().unwrap().push((
                        data.pointer_id,
                        data.buttons,
                        data.world_x,
                        data.local_y,
                    ));
                }),
            }),
        );
        emit_gui_pointer(&target, InteractionSignalName::OnPointerMove, None);
        emit_gui_pointer(
            &target,
            InteractionSignalName::OnPointerMove,
            Some(&GuiPointerOptions {
                pointer_id: Some(7),
                buttons: Some(1),
                world_x: Some(42.0),
                local_y: Some(8.0),
                alt_key: None,
                button: None,
                ctrl_key: None,
                current_target: None,
                delta_x: None,
                delta_y: None,
                local_x: None,
                meta_key: None,
                pointer_type: None,
                shift_key: None,
                target: None,
                world_y: None,
                x: None,
                y: None,
            }),
        );
        assert_eq!(*seen.read().unwrap(), [(1, 0, 0.0, 0.0), (7, 1, 42.0, 8.0)]);
    }
}
