use flight_gui::contract::*;
use flight_interaction::contract::InteractionSignalName;
use std::sync::{Arc, RwLock};
#[path = "gui_pointer_fixture.rs"]
mod gui_pointer_fixture;
use gui_pointer_fixture::pointer_fields;
fn options(
    thumb: flight_scene2d::Node2DRef,
    track: flight_scene2d::Node2DRef,
) -> SliderControllerOptions {
    return SliderControllerOptions {
        maximum: None,
        minimum: None,
        orientation: None,
        thumb,
        track,
        value: None,
        transition: None,
        step: None,
    };
}
fn controller(options: &SliderControllerOptions) -> SliderController {
    return create_slider_controller(options);
}
mod create_slider_controller {
    use super::*;
    #[test]
    fn maps_track_positions_and_thumb_drags_to_values() {
        let track = create_gui_test_node(Some(100.0), Some(10.0));
        let thumb = create_gui_test_node(Some(10.0), Some(10.0));
        let mut options = options(thumb.clone(), track.clone());
        options.maximum = Some(10.0);
        let controller = controller(&options);
        let mut fields = pointer_fields();
        fields.local_x = Some(50.0);
        emit_gui_pointer(
            &options.track,
            InteractionSignalName::OnPointerDown,
            Some(&fields),
        );
        assert_eq!(get_slider_controller_value(&controller), 5.0);
        assert_eq!(thumb.read().unwrap().x, 45.0);
        let mut fields = pointer_fields();
        fields.world_x = Some(45.0);
        emit_gui_pointer(
            &options.thumb,
            InteractionSignalName::OnPointerDown,
            Some(&fields),
        );
        fields.world_x = Some(90.0);
        emit_gui_pointer(
            &options.thumb,
            InteractionSignalName::OnPointerMove,
            Some(&fields),
        );
        assert_eq!(get_slider_controller_value(&controller), 10.0);
    }
    #[test]
    fn supports_keyboard_selection() {
        let mut options = options(
            create_gui_test_node(None, None),
            create_gui_test_node(None, None),
        );
        options.maximum = Some(10.0);
        options.step = Some(2.0);
        let controller = controller(&options);
        emit_gui_keyboard(
            &options.track,
            InteractionSignalName::OnKeyDown,
            "ArrowRight",
        );
        assert_eq!(get_slider_controller_value(&controller), 2.0);
    }
}
mod dispose_slider_controller {
    use super::*;
    #[test]
    fn detaches_track_input() {
        let options = options(
            create_gui_test_node(None, None),
            create_gui_test_node(None, None),
        );
        let controller = controller(&options);
        dispose_slider_controller(&controller);
        let mut fields = pointer_fields();
        fields.local_x = Some(100.0);
        emit_gui_pointer(
            &options.track,
            InteractionSignalName::OnPointerDown,
            Some(&fields),
        );
        assert_eq!(get_slider_controller_value(&controller), 0.0);
    }
}
mod get_slider_controller_signals {
    use super::*;
    #[test]
    fn emits_snapped_values() {
        let mut options = options(
            create_gui_test_node(None, None),
            create_gui_test_node(None, None),
        );
        options.maximum = Some(10.0);
        options.step = Some(2.0);
        let controller = controller(&options);
        let values = Arc::new(RwLock::new(Vec::new()));
        let copy = values.clone();
        let signals = get_slider_controller_signals(&controller);
        flight_signals::connect_signal(
            &signals.read().unwrap().on_change.read().unwrap(),
            Arc::new(move |value| copy.write().unwrap().push(*value)),
            None,
        );
        set_slider_controller_value(&controller, 3.0);
        assert_eq!(*values.read().unwrap(), [4.0]);
    }
}
mod get_slider_controller_value {
    use super::*;
    #[test]
    fn returns_the_configured_value() {
        let mut options = options(
            create_gui_test_node(None, None),
            create_gui_test_node(None, None),
        );
        options.value = Some(0.5);
        assert_eq!(get_slider_controller_value(&controller(&options)), 0.5);
    }
}
mod initialize_slider_controller {
    use super::*;
    #[test]
    fn preserves_the_controller_identity_and_required_visual_handles() {
        let options = options(
            create_gui_test_node(None, None),
            create_gui_test_node(None, None),
        );
        let mut controller: SliderController = flight_entity::allocate_entity();
        let id = flight_entity::get_entity_id(&controller);
        initialize_slider_controller(&mut controller, &options);
        assert_eq!(flight_entity::get_entity_id(&controller), id);
        let runtime = get_gui_controller_runtime(&controller);
        assert!(Arc::ptr_eq(
            runtime.read().unwrap().fields.thumb.as_ref().unwrap(),
            &options.thumb
        ));
    }
}
mod set_slider_controller_value {
    use super::*;
    #[test]
    fn clamps_to_the_range() {
        let options = options(
            create_gui_test_node(None, None),
            create_gui_test_node(None, None),
        );
        let controller = controller(&options);
        set_slider_controller_value(&controller, 5.0);
        assert_eq!(get_slider_controller_value(&controller), 1.0);
    }
}
