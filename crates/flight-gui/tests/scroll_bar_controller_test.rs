use flight_gui::contract::*;
use flight_interaction::contract::InteractionSignalName;
use std::sync::{Arc, RwLock};
#[path = "gui_pointer_fixture.rs"]
mod gui_pointer_fixture;
use gui_pointer_fixture::pointer_fields;
#[path = "gui_timer_fixture.rs"]
mod gui_timer_fixture;
use gui_timer_fixture::{advance_timers, timer_fixture};
fn options(
    thumb: flight_scene2d::Node2DRef,
    track: flight_scene2d::Node2DRef,
) -> ScrollBarControllerOptions {
    return ScrollBarControllerOptions {
        maximum: None,
        minimum: None,
        orientation: None,
        thumb,
        track,
        value: None,
        transition: None,
        down_button: None,
        up_button: None,
        line_size: None,
        page_size: None,
        repeat_interval: None,
    };
}
fn controller(options: &ScrollBarControllerOptions) -> ScrollBarController {
    let (timer, _) = timer_fixture();
    return create_scroll_bar_controller(options, timer);
}
mod create_scroll_bar_controller {
    use super::*;
    #[test]
    fn pages_on_track_clicks_and_positions_the_thumb() {
        let thumb = create_gui_test_node(Some(20.0), Some(10.0));
        let mut options = options(thumb.clone(), create_gui_test_node(Some(20.0), Some(100.0)));
        options.maximum = Some(100.0);
        options.page_size = Some(20.0);
        let controller = controller(&options);
        let mut fields = pointer_fields();
        fields.local_y = Some(80.0);
        emit_gui_pointer(
            &options.track,
            InteractionSignalName::OnPointerDown,
            Some(&fields),
        );
        assert_eq!(get_scroll_bar_controller_value(&controller), 20.0);
        assert_eq!(thumb.read().unwrap().y, 18.0);
    }
    #[test]
    fn repeat_clicks_optional_line_buttons_and_cancels_the_timer() {
        let down = create_gui_test_node(None, None);
        let mut options = options(
            create_gui_test_node(None, None),
            create_gui_test_node(None, None),
        );
        options.down_button = Some(down.clone());
        options.maximum = Some(10.0);
        let (timer, time) = timer_fixture();
        let controller = create_scroll_bar_controller(&options, timer);
        emit_gui_pointer(
            &options.down_button.clone().unwrap(),
            InteractionSignalName::OnPointerDown,
            None,
        );
        advance_timers(&time, 250.0);
        emit_gui_pointer(
            &options.down_button.clone().unwrap(),
            InteractionSignalName::OnPointerUp,
            None,
        );
        assert_eq!(get_scroll_bar_controller_value(&controller), 3.0);
        advance_timers(&time, 500.0);
        assert_eq!(get_scroll_bar_controller_value(&controller), 3.0);
    }
}
mod dispose_scroll_bar_controller {
    use super::*;
    #[test]
    fn cancels_repeat_timers() {
        let mut options = options(
            create_gui_test_node(None, None),
            create_gui_test_node(None, None),
        );
        options.down_button = Some(create_gui_test_node(None, None));
        let (timer, time) = timer_fixture();
        let controller = create_scroll_bar_controller(&options, timer);
        emit_gui_pointer(
            &options.down_button.clone().unwrap(),
            InteractionSignalName::OnPointerDown,
            None,
        );
        dispose_scroll_bar_controller(&controller);
        advance_timers(&time, 500.0);
        assert_eq!(get_scroll_bar_controller_value(&controller), 1.0);
    }
}
mod get_scroll_bar_controller_signals {
    use super::*;
    #[test]
    fn emits_changes() {
        let options = options(
            create_gui_test_node(None, None),
            create_gui_test_node(None, None),
        );
        let controller = controller(&options);
        let values = Arc::new(RwLock::new(Vec::new()));
        let copy = values.clone();
        let signals = get_scroll_bar_controller_signals(&controller);
        flight_signals::connect_signal(
            &signals.read().unwrap().on_change.read().unwrap(),
            Arc::new(move |value| copy.write().unwrap().push(*value)),
            None,
        );
        set_scroll_bar_controller_value(&controller, 5.0);
        assert_eq!(*values.read().unwrap(), [5.0]);
    }
}
mod get_scroll_bar_controller_value {
    use super::*;
    #[test]
    fn returns_the_configured_value() {
        let mut options = options(
            create_gui_test_node(None, None),
            create_gui_test_node(None, None),
        );
        options.value = Some(5.0);
        assert_eq!(get_scroll_bar_controller_value(&controller(&options)), 5.0);
    }
}
mod initialize_scroll_bar_controller {
    use super::*;
    #[test]
    fn preserves_the_controller_identity_and_required_visual_handles() {
        let options = options(
            create_gui_test_node(None, None),
            create_gui_test_node(None, None),
        );
        let mut controller: ScrollBarController = flight_entity::allocate_entity();
        let id = flight_entity::get_entity_id(&controller);
        let (timer, _) = timer_fixture();
        initialize_scroll_bar_controller(&mut controller, &options, timer);
        assert_eq!(flight_entity::get_entity_id(&controller), id);
        let runtime = get_gui_controller_runtime(&controller);
        assert!(Arc::ptr_eq(
            runtime.read().unwrap().fields.thumb.as_ref().unwrap(),
            &options.thumb
        ));
    }
}
mod set_scroll_bar_controller_value {
    use super::*;
    #[test]
    fn clamps_to_the_range() {
        let mut options = options(
            create_gui_test_node(None, None),
            create_gui_test_node(None, None),
        );
        options.maximum = Some(10.0);
        let controller = controller(&options);
        set_scroll_bar_controller_value(&controller, 20.0);
        assert_eq!(get_scroll_bar_controller_value(&controller), 10.0);
    }
}
