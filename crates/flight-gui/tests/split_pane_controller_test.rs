use flight_gui::contract::*;
use flight_interaction::contract::InteractionSignalName;
use flight_node::contract::NodeRevisionState;
use std::sync::{Arc, RwLock};
#[path = "gui_pointer_fixture.rs"]
mod gui_pointer_fixture;
use gui_pointer_fixture::pointer_fields;
fn options(
    divider: flight_scene2d::Node2DRef,
    first_region: flight_scene2d::Node2DRef,
    second_region: flight_scene2d::Node2DRef,
) -> SplitPaneControllerOptions {
    return SplitPaneControllerOptions {
        divider,
        first_region,
        second_region,
        maximum_first: None,
        minimum_first: None,
        minimum_second: None,
        orientation: None,
        position: None,
        total_size: None,
        transition: None,
    };
}
fn controller(options: &SplitPaneControllerOptions) -> SplitPaneController {
    return create_split_pane_controller(
        options,
        Arc::new(RwLock::new(NodeRevisionState {
            world_transform_revision: 0,
        })),
    );
}
fn default_options() -> SplitPaneControllerOptions {
    return options(
        create_gui_test_node(None, None),
        create_gui_test_node(None, None),
        create_gui_test_node(None, None),
    );
}
mod create_split_pane_controller {
    use super::*;
    #[test]
    fn drags_a_distinct_constrained_divider_behavior() {
        let divider = create_gui_test_node(Some(10.0), Some(20.0));
        let mut options = options(
            divider.clone(),
            create_gui_test_node(Some(100.0), Some(20.0)),
            create_gui_test_node(Some(100.0), Some(20.0)),
        );
        options.minimum_first = Some(50.0);
        options.minimum_second = Some(50.0);
        options.total_size = Some(210.0);
        let controller = controller(&options);
        let mut fields = pointer_fields();
        fields.world_x = Some(100.0);
        emit_gui_pointer(
            &options.divider,
            InteractionSignalName::OnPointerDown,
            Some(&fields),
        );
        fields.world_x = Some(170.0);
        emit_gui_pointer(
            &options.divider,
            InteractionSignalName::OnPointerMove,
            Some(&fields),
        );
        assert_eq!(get_split_pane_controller_position(&controller), 150.0);
        assert_eq!(divider.read().unwrap().x, 150.0);
    }
}
mod dispose_split_pane_controller {
    use super::*;
    #[test]
    fn detaches_divider_dragging() {
        let options = default_options();
        let controller = controller(&options);
        dispose_split_pane_controller(&controller);
        let mut fields = pointer_fields();
        fields.world_x = Some(0.0);
        emit_gui_pointer(
            &options.divider,
            InteractionSignalName::OnPointerDown,
            Some(&fields),
        );
        fields.world_x = Some(50.0);
        emit_gui_pointer(
            &options.divider,
            InteractionSignalName::OnPointerMove,
            Some(&fields),
        );
        assert_eq!(get_split_pane_controller_position(&controller), 100.0);
    }
}
mod get_split_pane_controller_position {
    use super::*;
    #[test]
    fn returns_the_clamped_initial_position() {
        let mut options = default_options();
        options.minimum_first = Some(20.0);
        options.position = Some(0.0);
        assert_eq!(
            get_split_pane_controller_position(&controller(&options)),
            20.0
        );
    }
}
mod get_split_pane_controller_signals {
    use super::*;
    #[test]
    fn emits_changed_positions() {
        let controller = controller(&default_options());
        let values = Arc::new(RwLock::new(Vec::new()));
        let copy = values.clone();
        let signals = get_split_pane_controller_signals(&controller);
        flight_signals::connect_signal(
            &signals.read().unwrap().on_change.read().unwrap(),
            Arc::new(move |value| copy.write().unwrap().push(*value)),
            None,
        );
        set_split_pane_controller_position(&controller, 50.0);
        assert_eq!(*values.read().unwrap(), [50.0]);
    }
}
mod initialize_split_pane_controller {
    use super::*;
    #[test]
    fn preserves_the_controller_identity_and_captures_authored_scales() {
        let first = create_gui_test_node(Some(100.0), Some(20.0));
        first.write().unwrap().scale_x = 2.0;
        let options = options(
            create_gui_test_node(Some(10.0), Some(20.0)),
            first.clone(),
            create_gui_test_node(None, None),
        );
        let mut controller: SplitPaneController = flight_entity::allocate_entity();
        let id = flight_entity::get_entity_id(&controller);
        initialize_split_pane_controller(
            &mut controller,
            &options,
            Arc::new(RwLock::new(NodeRevisionState {
                world_transform_revision: 0,
            })),
        );
        assert_eq!(flight_entity::get_entity_id(&controller), id);
        set_split_pane_controller_position(&controller, 50.0);
        // Source getNodeWidth uses self space for an unparented leaf: 2 * 50 / 100.
        assert_eq!(first.read().unwrap().scale_x, 1.0);
    }
}
mod set_split_pane_controller_position {
    use super::*;
    #[test]
    fn honors_the_maximum() {
        let mut options = default_options();
        options.maximum_first = Some(60.0);
        let controller = controller(&options);
        set_split_pane_controller_position(&controller, 90.0);
        assert_eq!(get_split_pane_controller_position(&controller), 60.0);
    }
}
