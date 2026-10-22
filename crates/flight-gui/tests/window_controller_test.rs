use flight_gui::contract::*;
use flight_interaction::contract::InteractionSignalName;
use flight_node::contract::NodeRevisionState;
use std::sync::{Arc, RwLock};
#[path = "gui_pointer_fixture.rs"]
mod gui_pointer_fixture;
use gui_pointer_fixture::pointer_fields;
fn options(frame: flight_scene2d::Node2DRef) -> WindowControllerOptions {
    return WindowControllerOptions {
        frame,
        close_button: None,
        content: None,
        draggable: None,
        minimum_height: None,
        minimum_width: None,
        resizable: None,
        resize_handle: None,
        title_bar: None,
        transition: None,
    };
}
fn controller(options: &WindowControllerOptions) -> WindowController {
    return create_window_controller(
        options,
        Arc::new(RwLock::new(NodeRevisionState {
            world_transform_revision: 0,
        })),
    );
}
mod create_window_controller {
    use super::*;
    #[test]
    fn moves_from_a_title_bar_and_resizes_from_a_handle() {
        let frame = create_gui_test_node(Some(200.0), Some(100.0));
        let mut options = options(frame.clone());
        options.title_bar = Some(create_gui_test_node(None, None));
        options.resize_handle = Some(create_gui_test_node(None, None));
        let _controller = controller(&options);
        let mut fields = pointer_fields();
        fields.world_x = Some(10.0);
        fields.world_y = Some(10.0);
        emit_gui_pointer(
            options.title_bar.as_ref().unwrap(),
            InteractionSignalName::OnPointerDown,
            Some(&fields),
        );
        fields.world_x = Some(30.0);
        fields.world_y = Some(40.0);
        emit_gui_pointer(
            options.title_bar.as_ref().unwrap(),
            InteractionSignalName::OnPointerMove,
            Some(&fields),
        );
        assert_eq!(
            [frame.read().unwrap().x, frame.read().unwrap().y],
            [20.0, 30.0]
        );
        fields.world_x = Some(0.0);
        fields.world_y = Some(0.0);
        emit_gui_pointer(
            options.resize_handle.as_ref().unwrap(),
            InteractionSignalName::OnPointerDown,
            Some(&fields),
        );
        fields.world_x = Some(100.0);
        fields.world_y = Some(50.0);
        emit_gui_pointer(
            options.resize_handle.as_ref().unwrap(),
            InteractionSignalName::OnPointerMove,
            Some(&fields),
        );
        assert_eq!(
            [frame.read().unwrap().scale_x, frame.read().unwrap().scale_y],
            [1.5, 1.5]
        );
    }
    #[test]
    fn forwards_a_composed_close_button() {
        let close_node: flight_scene2d::Node2DRef = create_gui_test_node(None, None);
        let mut options = options(create_gui_test_node(None, None));
        options.close_button = Some(Arc::new(RwLock::new(create_button_controller(
            &ButtonControllerOptions {
                up_state: close_node.clone(),
                disabled: None,
                down_state: None,
                hit_area: None,
                interactive_state_binding: None,
                over_state: None,
                transition: None,
            },
        ))));
        let controller = controller(&options);
        let closed = Arc::new(RwLock::new(false));
        let copy = closed.clone();
        let signals = get_window_controller_signals(&controller);
        flight_signals::connect_signal(
            &signals.read().unwrap().on_close.read().unwrap(),
            Arc::new(move |_| *copy.write().unwrap() = true),
            None,
        );
        emit_gui_pointer(&close_node, InteractionSignalName::OnClick, None);
        assert!(*closed.read().unwrap());
    }
}
mod dispose_window_controller {
    use super::*;
    #[test]
    fn detaches_title_dragging() {
        let frame = create_gui_test_node(None, None);
        let mut options = options(frame.clone());
        options.title_bar = Some(create_gui_test_node(None, None));
        let controller = controller(&options);
        dispose_window_controller(&controller);
        let mut fields = pointer_fields();
        fields.world_x = Some(0.0);
        emit_gui_pointer(
            options.title_bar.as_ref().unwrap(),
            InteractionSignalName::OnPointerDown,
            Some(&fields),
        );
        fields.world_x = Some(20.0);
        emit_gui_pointer(
            options.title_bar.as_ref().unwrap(),
            InteractionSignalName::OnPointerMove,
            Some(&fields),
        );
        assert_eq!(frame.read().unwrap().x, 0.0);
    }
}
mod get_window_controller_signals {
    use super::*;
    #[test]
    fn returns_stable_signals() {
        let controller = controller(&options(create_gui_test_node(None, None)));
        assert!(Arc::ptr_eq(
            &get_window_controller_signals(&controller),
            &get_window_controller_signals(&controller)
        ));
    }
}
mod initialize_window_controller {
    use super::*;
    #[test]
    fn preserves_controller_identity_and_releases_runtime_before_move_signals() {
        let mut controller: WindowController = flight_entity::allocate_entity();
        let id = flight_entity::get_entity_id(&controller);
        initialize_window_controller(
            &mut controller,
            &options(create_gui_test_node(None, None)),
            Arc::new(RwLock::new(NodeRevisionState {
                world_transform_revision: 0,
            })),
        );
        assert_eq!(flight_entity::get_entity_id(&controller), id);
        let runtime = get_gui_controller_runtime(&controller);
        let copy = runtime.clone();
        let values = Arc::new(RwLock::new(Vec::new()));
        let seen = values.clone();
        let signals = get_window_controller_signals(&controller);
        flight_signals::connect_signal(
            &signals.read().unwrap().on_move.read().unwrap(),
            Arc::new(move |value| {
                assert!(copy.try_write().is_ok());
                seen.write().unwrap().push(*value);
            }),
            None,
        );
        set_window_controller_position(&controller, 4.0, 5.0);
        assert_eq!(*values.read().unwrap(), [(4.0, 5.0)]);
    }
}
mod set_window_controller_position {
    use super::*;
    #[test]
    fn sets_the_frame_transform() {
        let frame = create_gui_test_node(None, None);
        let controller = controller(&options(frame.clone()));
        set_window_controller_position(&controller, 4.0, 5.0);
        assert_eq!(
            [frame.read().unwrap().x, frame.read().unwrap().y],
            [4.0, 5.0]
        );
    }
}
mod set_window_controller_size {
    use super::*;
    #[test]
    fn honors_minimum_dimensions() {
        let frame = create_gui_test_node(Some(100.0), Some(100.0));
        let mut options = options(frame.clone());
        options.minimum_height = Some(50.0);
        options.minimum_width = Some(50.0);
        let controller = controller(&options);
        set_window_controller_size(&controller, 10.0, 20.0);
        assert_eq!(
            [frame.read().unwrap().scale_x, frame.read().unwrap().scale_y],
            [0.5, 0.5]
        );
    }
}
