use flight_gui::contract::*;
use flight_interaction::contract::{InteractionSignalName, create_node_interactive_state_binding};
use flight_scene_document::{
    FlightDocumentInteractiveState, FlightDocumentInteractiveStates, FlightDocumentSchemaRegistry,
};
use flight_scene2d::Node2DRef;
use flight_signals::connect_signal;
use std::sync::{Arc, RwLock};
fn button_options(up_state: Node2DRef) -> ButtonControllerOptions {
    return ButtonControllerOptions {
        disabled: None,
        down_state: None,
        hit_area: None,
        interactive_state_binding: None,
        over_state: None,
        up_state,
        transition: None,
    };
}
fn empty_kind_map<T>() -> flight_registry::KindMap<T> {
    return flight_registry::KindMap {
        entries: std::collections::HashMap::new(),
        key_order: Vec::new(),
    };
}
fn empty_schemas() -> FlightDocumentSchemaRegistry {
    return FlightDocumentSchemaRegistry {
        interactive_state_extension_schemas: empty_kind_map(),
        interactive_state_transition_schemas: empty_kind_map(),
        node_schemas: empty_kind_map(),
        resource_schemas: empty_kind_map(),
        shape_command_schemas: empty_kind_map(),
    };
}
mod create_button_controller {
    use super::*;
    #[test]
    fn drives_optional_states_and_emits_the_complete_pointer_lifecycle() {
        let up = create_gui_test_node(None, None);
        let over = create_gui_test_node(None, None);
        let down = create_gui_test_node(None, None);
        let mut options = button_options(up.clone());
        options.down_state = Some(down.clone());
        options.over_state = Some(over.clone());
        let controller = create_button_controller(&options);
        let events = Arc::new(RwLock::new(Vec::new()));
        let signals = get_button_controller_signals(&controller);
        for (signal, event) in [
            (signals.read().unwrap().on_press.clone(), "press"),
            (signals.read().unwrap().on_release.clone(), "release"),
            (signals.read().unwrap().on_click.clone(), "click"),
        ] {
            let events = events.clone();
            connect_signal(
                &signal.read().unwrap(),
                Arc::new(move |_| events.write().unwrap().push(event)),
                None,
            );
        }
        let target: Node2DRef = up.clone();
        emit_gui_pointer(&target, InteractionSignalName::OnPointerOver, None);
        assert_eq!(
            [
                up.read().unwrap().visible,
                over.read().unwrap().visible,
                down.read().unwrap().visible
            ],
            [false, true, false]
        );
        emit_gui_pointer(&target, InteractionSignalName::OnPointerDown, None);
        assert_eq!(
            [
                up.read().unwrap().visible,
                over.read().unwrap().visible,
                down.read().unwrap().visible
            ],
            [false, false, true]
        );
        emit_gui_pointer(&target, InteractionSignalName::OnPointerUp, None);
        emit_gui_pointer(&target, InteractionSignalName::OnClick, None);
        assert_eq!(*events.read().unwrap(), ["press", "release", "click"]);
    }
    #[test]
    fn delegates_property_assignment_only_when_a_transition_is_supplied() {
        let up = create_gui_test_node(None, None);
        let over = create_gui_test_node(None, None);
        let applies: Arc<RwLock<Vec<GuiTransitionRequest>>> = Arc::new(RwLock::new(Vec::new()));
        let copy = applies.clone();
        let mut options = button_options(up.clone());
        options.over_state = Some(over.clone());
        options.transition = Some(Arc::new(GuiTransitionDescriptor {
            run: Arc::new(move |request| copy.write().unwrap().push(request.clone())),
        }));
        let _controller = create_button_controller(&options);
        let pending = std::mem::take(&mut *applies.write().unwrap());
        for request in pending {
            (request.apply)(None);
        }
        assert_eq!(
            [up.read().unwrap().visible, over.read().unwrap().visible],
            [true, false]
        );
        let target: Node2DRef = up.clone();
        emit_gui_pointer(&target, InteractionSignalName::OnPointerOver, None);
        assert_eq!(
            [up.read().unwrap().visible, over.read().unwrap().visible],
            [true, false]
        );
        let pending = std::mem::take(&mut *applies.write().unwrap());
        for request in pending {
            (request.apply)(None);
        }
        assert_eq!(
            [up.read().unwrap().visible, over.read().unwrap().visible],
            [false, true]
        );
    }
    #[test]
    fn explicitly_drives_one_shared_interactive_state_binding_without_replacing_legacy_visuals() {
        let up = create_gui_test_node(None, None);
        let node: flight_node::NodeRef = up.clone();
        let phase = |alpha, scale_x| FlightDocumentInteractiveState {
            alpha,
            extensions: Vec::new(),
            scale_x,
            scale_y: None,
            visible: None,
            x: None,
            y: None,
        };
        let states = FlightDocumentInteractiveStates {
            disabled: Some(phase(Some(0.4), None)),
            hover: Some(phase(Some(0.8), None)),
            pressed: Some(phase(None, Some(0.9))),
        };
        let binding = Arc::new(RwLock::new(
            create_node_interactive_state_binding(&node, &states, &empty_schemas(), None).unwrap(),
        ));
        let mut options = button_options(up.clone());
        options.interactive_state_binding = Some(binding.clone());
        let controller = create_button_controller(&options);
        let target: Node2DRef = up.clone();
        emit_gui_pointer(&target, InteractionSignalName::OnPointerOver, None);
        // D1 f32 bound (TS: 0)
        assert!((up.read().unwrap().alpha - 0.8).abs() <= 4.0 * f32::EPSILON);
        emit_gui_pointer(&target, InteractionSignalName::OnPointerDown, None);
        // D1 f32 bound (TS: 0)
        assert!((up.read().unwrap().scale_x - 0.9).abs() <= 4.0 * f32::EPSILON);
        set_button_controller_disabled(&controller, true);
        // D1 f32 bound (TS: 0)
        assert!((up.read().unwrap().alpha - 0.4).abs() <= 4.0 * f32::EPSILON);
        assert_eq!(up.read().unwrap().scale_x, 1.0);
        dispose_button_controller(&controller);
        assert_eq!(up.read().unwrap().alpha, 1.0);
        assert_eq!(up.read().unwrap().scale_x, 1.0);
        assert!(Arc::ptr_eq(
            options.interactive_state_binding.as_ref().unwrap(),
            &binding
        ));
    }
}
mod dispose_button_controller {
    use super::*;
    #[test]
    fn detaches_listeners_idempotently() {
        let up: Node2DRef = create_gui_test_node(None, None);
        let controller = create_button_controller(&button_options(up.clone()));
        let clicks = Arc::new(RwLock::new(0));
        let copy = clicks.clone();
        let signals = get_button_controller_signals(&controller);
        connect_signal(
            &signals.read().unwrap().on_click.read().unwrap(),
            Arc::new(move |_| *copy.write().unwrap() += 1),
            None,
        );
        dispose_button_controller(&controller);
        dispose_button_controller(&controller);
        emit_gui_pointer(&up, InteractionSignalName::OnClick, None);
        assert_eq!(*clicks.read().unwrap(), 0);
    }
}
mod get_button_controller_signals {
    use super::*;
    #[test]
    fn returns_a_stable_signal_group() {
        let controller =
            create_button_controller(&button_options(create_gui_test_node(None, None)));
        assert!(Arc::ptr_eq(
            &get_button_controller_signals(&controller),
            &get_button_controller_signals(&controller)
        ));
    }
}
mod initialize_button_controller {
    use super::*;
    #[test]
    fn initializes_the_allocated_controller_once_and_keeps_its_entity_identity() {
        let mut controller: ButtonController = flight_entity::allocate_entity();
        let id = flight_entity::get_entity_id(&controller);
        let uid = flight_entity::get_entity_uid(&mut controller);
        let up: Node2DRef = create_gui_test_node(None, None);
        initialize_button_controller(&mut controller, &button_options(up.clone()));
        assert_eq!(flight_entity::get_entity_id(&controller), id);
        assert_eq!(flight_entity::get_entity_uid(&mut controller), uid);
        let runtime = get_gui_controller_runtime(&controller);
        assert!(Arc::ptr_eq(
            runtime.read().unwrap().fields.up_state.as_ref().unwrap(),
            &up
        ));
    }
}
mod is_button_controller_disabled {
    use super::*;
    #[test]
    fn reads_the_configured_state() {
        let mut options = button_options(create_gui_test_node(None, None));
        options.disabled = Some(true);
        assert!(is_button_controller_disabled(&create_button_controller(
            &options
        )));
    }
}
mod set_button_controller_disabled {
    use super::*;
    #[test]
    fn blocks_click_emission() {
        let up: Node2DRef = create_gui_test_node(None, None);
        let controller = create_button_controller(&button_options(up.clone()));
        let clicks = Arc::new(RwLock::new(0));
        let copy = clicks.clone();
        let signals = get_button_controller_signals(&controller);
        connect_signal(
            &signals.read().unwrap().on_click.read().unwrap(),
            Arc::new(move |_| *copy.write().unwrap() += 1),
            None,
        );
        set_button_controller_disabled(&controller, true);
        emit_gui_pointer(&up, InteractionSignalName::OnClick, None);
        assert_eq!(*clicks.read().unwrap(), 0);
    }
}
