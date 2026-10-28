use flight_gui::contract::*;
use flight_interaction::contract::InteractionSignalName;
use std::sync::{Arc, RwLock};
#[path = "gui_pointer_fixture.rs"]
mod gui_pointer_fixture;
use gui_pointer_fixture::pointer_fields;
fn options(
    content: flight_scene2d::Node2DRef,
    viewport: flight_scene2d::Node2DRef,
) -> ScrollViewControllerOptions {
    return ScrollViewControllerOptions {
        content,
        viewport,
        horizontal_scroll_bar: None,
        vertical_scroll_bar: None,
        mouse_wheel_enabled: None,
        transition: None,
    };
}
fn controller(options: &ScrollViewControllerOptions) -> ScrollViewController {
    return create_scroll_view_controller(options);
}
mod create_scroll_view_controller {
    use super::*;
    #[test]
    fn pans_content_by_drag_and_wheel_within_viewport_bounds() {
        let content = create_gui_test_node(Some(300.0), Some(300.0));
        let options = options(
            content.clone(),
            create_gui_test_node(Some(100.0), Some(100.0)),
        );
        let controller = controller(&options);
        let mut fields = pointer_fields();
        fields.world_x = Some(50.0);
        fields.world_y = Some(50.0);
        emit_gui_pointer(
            &options.viewport,
            InteractionSignalName::OnPointerDown,
            Some(&fields),
        );
        fields.world_x = Some(20.0);
        fields.world_y = Some(10.0);
        emit_gui_pointer(
            &options.viewport,
            InteractionSignalName::OnPointerMove,
            Some(&fields),
        );
        assert_eq!(
            [
                get_scroll_view_controller_x(&controller),
                get_scroll_view_controller_y(&controller)
            ],
            [30.0, 40.0]
        );
        let mut fields = pointer_fields();
        fields.delta_y = Some(20.0);
        emit_gui_pointer(
            &options.viewport,
            InteractionSignalName::OnWheel,
            Some(&fields),
        );
        assert_eq!(content.read().unwrap().y, -60.0);
    }
}
mod dispose_scroll_view_controller {
    use super::*;
    #[test]
    fn detaches_viewport_input() {
        let options = options(
            create_gui_test_node(Some(200.0), Some(200.0)),
            create_gui_test_node(Some(100.0), Some(100.0)),
        );
        let controller = controller(&options);
        dispose_scroll_view_controller(&controller);
        let mut fields = pointer_fields();
        fields.delta_y = Some(50.0);
        emit_gui_pointer(
            &options.viewport,
            InteractionSignalName::OnWheel,
            Some(&fields),
        );
        assert_eq!(get_scroll_view_controller_y(&controller), 0.0);
    }
}
mod get_scroll_view_controller_signals {
    use super::*;
    #[test]
    fn emits_both_axes() {
        let controller = controller(&options(
            create_gui_test_node(Some(200.0), Some(200.0)),
            create_gui_test_node(None, None),
        ));
        let values = Arc::new(RwLock::new(Vec::new()));
        let copy = values.clone();
        let signals = get_scroll_view_controller_signals(&controller);
        flight_signals::connect_signal(
            &signals.read().unwrap().on_scroll.read().unwrap(),
            Arc::new(move |value| copy.write().unwrap().push(*value)),
            None,
        );
        set_scroll_view_controller_position(&controller, 10.0, 20.0);
        assert_eq!(*values.read().unwrap(), [(10.0, 20.0)]);
    }
}
mod get_scroll_view_controller_x {
    use super::*;
    #[test]
    fn returns_horizontal_offset() {
        let controller = controller(&options(
            create_gui_test_node(Some(200.0), Some(200.0)),
            create_gui_test_node(None, None),
        ));
        set_scroll_view_controller_position(&controller, 5.0, 0.0);
        assert_eq!(get_scroll_view_controller_x(&controller), 5.0);
    }
}
mod get_scroll_view_controller_y {
    use super::*;
    #[test]
    fn returns_vertical_offset() {
        let controller = controller(&options(
            create_gui_test_node(Some(200.0), Some(200.0)),
            create_gui_test_node(None, None),
        ));
        set_scroll_view_controller_position(&controller, 0.0, 5.0);
        assert_eq!(get_scroll_view_controller_y(&controller), 5.0);
    }
}
mod initialize_scroll_view_controller {
    use super::*;
    #[test]
    fn preserves_controller_identity_and_captured_content_origin() {
        let content = create_gui_test_node(Some(200.0), Some(200.0));
        content.write().unwrap().x = 7.0;
        let options = options(content.clone(), create_gui_test_node(None, None));
        let mut controller: ScrollViewController = flight_entity::allocate_entity();
        let id = flight_entity::get_entity_id(&controller);
        initialize_scroll_view_controller(&mut controller, &options);
        assert_eq!(flight_entity::get_entity_id(&controller), id);
        set_scroll_view_controller_position(&controller, 5.0, 0.0);
        assert_eq!(content.read().unwrap().x, 2.0);
    }
}
mod set_scroll_view_controller_position {
    use super::*;
    #[test]
    fn clamps_to_content_extent() {
        let controller = controller(&options(
            create_gui_test_node(Some(150.0), Some(150.0)),
            create_gui_test_node(Some(100.0), Some(100.0)),
        ));
        set_scroll_view_controller_position(&controller, 500.0, 500.0);
        assert_eq!(
            [
                get_scroll_view_controller_x(&controller),
                get_scroll_view_controller_y(&controller)
            ],
            [50.0, 50.0]
        );
    }
}
