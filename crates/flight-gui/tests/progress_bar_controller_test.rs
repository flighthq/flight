use flight_gui::contract::*;
use flight_scene2d::Node2DRef;
use std::sync::Arc;
fn progress_options(fill: Node2DRef, track: Node2DRef) -> ProgressBarControllerOptions {
    return ProgressBarControllerOptions {
        fill,
        maximum: None,
        minimum: None,
        orientation: None,
        track,
        value: None,
        transition: None,
    };
}
mod create_progress_bar_controller {
    use super::*;
    #[test]
    fn scales_the_caller_fill_without_changing_the_track() {
        let fill = create_gui_test_node(None, None);
        let track = create_gui_test_node(None, None);
        let mut options = progress_options(fill.clone(), track.clone());
        options.maximum = Some(100.0);
        options.value = Some(25.0);
        let _controller = create_progress_bar_controller(&options);
        assert_eq!(fill.read().unwrap().scale_x, 0.25);
        assert_eq!(track.read().unwrap().scale_x, 1.0);
    }
}
mod dispose_progress_bar_controller {
    use super::*;
    #[test]
    fn is_idempotent() {
        let controller = create_progress_bar_controller(&progress_options(
            create_gui_test_node(None, None),
            create_gui_test_node(None, None),
        ));
        dispose_progress_bar_controller(&controller);
        dispose_progress_bar_controller(&controller);
    }
}
mod get_progress_bar_controller_value {
    use super::*;
    #[test]
    fn returns_a_clamped_initial_value() {
        let mut options = progress_options(
            create_gui_test_node(None, None),
            create_gui_test_node(None, None),
        );
        options.maximum = Some(10.0);
        options.value = Some(20.0);
        assert_eq!(
            get_progress_bar_controller_value(&create_progress_bar_controller(&options)),
            10.0
        );
    }
}
mod initialize_progress_bar_controller {
    use super::*;
    #[test]
    fn captures_the_original_scale_and_required_visual_handles_without_replacing_the_controller() {
        let fill = create_gui_test_node(None, None);
        fill.write().unwrap().scale_x = 2.0;
        let track: Node2DRef = create_gui_test_node(None, None);
        let mut options = progress_options(fill.clone(), track.clone());
        options.value = Some(50.0);
        let mut controller: ProgressBarController = flight_entity::allocate_entity();
        let id = flight_entity::get_entity_id(&controller);
        initialize_progress_bar_controller(&mut controller, &options);
        assert_eq!(flight_entity::get_entity_id(&controller), id);
        assert_eq!(fill.read().unwrap().scale_x, 1.0);
        let runtime = get_gui_controller_runtime(&controller);
        assert!(Arc::ptr_eq(
            runtime.read().unwrap().fields.track.as_ref().unwrap(),
            &track
        ));
    }
}
mod set_progress_bar_controller_value {
    use super::*;
    #[test]
    fn updates_vertical_fill_scale() {
        let fill = create_gui_test_node(None, None);
        let mut options = progress_options(fill.clone(), create_gui_test_node(None, None));
        options.maximum = Some(10.0);
        options.orientation = Some(GuiOrientation::Vertical);
        let controller = create_progress_bar_controller(&options);
        set_progress_bar_controller_value(&controller, 5.0);
        assert_eq!(fill.read().unwrap().scale_y, 0.5);
    }
}
