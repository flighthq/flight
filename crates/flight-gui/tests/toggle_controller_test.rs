use flight_gui::contract::*;
use flight_interaction::contract::InteractionSignalName;
use flight_scene2d::Node2DRef;
use std::sync::{Arc, RwLock};
fn toggle_options(unchecked_state: Node2DRef, checked_state: Node2DRef) -> ToggleControllerOptions {
    return ToggleControllerOptions {
        checked: None,
        checked_state,
        label: None,
        over_state: None,
        unchecked_state,
        transition: None,
    };
}
mod create_toggle_controller {
    use super::*;
    #[test]
    fn toggles_through_either_state_visual_and_an_optional_label() {
        let unchecked = create_gui_test_node(None, None);
        let checked = create_gui_test_node(None, None);
        let label: Node2DRef = create_gui_test_node(None, None);
        let mut options = toggle_options(unchecked.clone(), checked.clone());
        options.label = Some(label.clone());
        let controller = create_toggle_controller(&options);
        emit_gui_pointer(&label, InteractionSignalName::OnClick, None);
        assert!(is_toggle_controller_checked(&controller));
        assert_eq!(
            [
                unchecked.read().unwrap().visible,
                checked.read().unwrap().visible
            ],
            [false, true]
        );
    }
}
mod dispose_toggle_controller {
    use super::*;
    #[test]
    fn detaches_click_listeners() {
        let unchecked: Node2DRef = create_gui_test_node(None, None);
        let controller = create_toggle_controller(&toggle_options(
            unchecked.clone(),
            create_gui_test_node(None, None),
        ));
        dispose_toggle_controller(&controller);
        emit_gui_pointer(&unchecked, InteractionSignalName::OnClick, None);
        assert!(!is_toggle_controller_checked(&controller));
    }
}
mod get_toggle_controller_signals {
    use super::*;
    #[test]
    fn emits_only_real_state_changes() {
        let controller = create_toggle_controller(&toggle_options(
            create_gui_test_node(None, None),
            create_gui_test_node(None, None),
        ));
        let values = Arc::new(RwLock::new(Vec::new()));
        let copy = values.clone();
        let signals = get_toggle_controller_signals(&controller);
        flight_signals::connect_signal(
            &signals.read().unwrap().on_change.read().unwrap(),
            Arc::new(move |value| copy.write().unwrap().push(*value)),
            None,
        );
        set_toggle_controller_checked(&controller, true);
        set_toggle_controller_checked(&controller, true);
        assert_eq!(*values.read().unwrap(), [true]);
    }
}
mod initialize_toggle_controller {
    use super::*;
    #[test]
    fn retains_entity_identity_and_deduplicates_identical_visual_targets() {
        let shared: Node2DRef = create_gui_test_node(None, None);
        let mut controller: ToggleController = flight_entity::allocate_entity();
        let id = flight_entity::get_entity_id(&controller);
        let mut options = toggle_options(shared.clone(), shared.clone());
        options.label = Some(shared.clone());
        initialize_toggle_controller(&mut controller, &options);
        assert_eq!(flight_entity::get_entity_id(&controller), id);
        emit_gui_pointer(&shared, InteractionSignalName::OnClick, None);
        assert!(is_toggle_controller_checked(&controller));
        assert_eq!(
            get_gui_controller_runtime(&controller)
                .read()
                .unwrap()
                .hit_states
                .len(),
            1
        );
    }
}
mod is_toggle_controller_checked {
    use super::*;
    #[test]
    fn reads_the_current_value() {
        let mut options = toggle_options(
            create_gui_test_node(None, None),
            create_gui_test_node(None, None),
        );
        options.checked = Some(true);
        assert!(is_toggle_controller_checked(&create_toggle_controller(
            &options
        )));
    }
}
mod set_toggle_controller_checked {
    use super::*;
    #[test]
    fn sets_both_directions() {
        let mut options = toggle_options(
            create_gui_test_node(None, None),
            create_gui_test_node(None, None),
        );
        options.checked = Some(true);
        let controller = create_toggle_controller(&options);
        set_toggle_controller_checked(&controller, false);
        assert!(!is_toggle_controller_checked(&controller));
    }
}
