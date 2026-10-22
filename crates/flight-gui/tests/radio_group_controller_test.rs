use flight_entity::Ref;
use flight_gui::contract::*;
use std::sync::{Arc, RwLock};
fn toggle() -> Ref<ToggleController> {
    return Arc::new(RwLock::new(create_toggle_controller(
        &ToggleControllerOptions {
            checked: None,
            checked_state: create_gui_test_node(None, None),
            label: None,
            over_state: None,
            unchecked_state: create_gui_test_node(None, None),
            transition: None,
        },
    )));
}
mod create_radio_group_controller {
    use super::*;
    #[test]
    fn enforces_mutual_exclusion_from_toggle_changes() {
        let toggles = vec![toggle(), toggle(), toggle()];
        let controller = create_radio_group_controller(&RadioGroupControllerOptions {
            selected_index: Some(0),
            toggles: toggles.clone(),
        });
        set_toggle_controller_checked(&toggles[2].read().unwrap(), true);
        assert_eq!(get_radio_group_controller_selected_index(&controller), 2);
        assert_eq!(
            toggles
                .iter()
                .map(|toggle| is_toggle_controller_checked(&toggle.read().unwrap()))
                .collect::<Vec<_>>(),
            [false, false, true]
        );
    }
}
mod dispose_radio_group_controller {
    use super::*;
    #[test]
    fn stops_observing_member_toggles() {
        let member = toggle();
        let controller = create_radio_group_controller(&RadioGroupControllerOptions {
            selected_index: Some(-1),
            toggles: vec![member.clone()],
        });
        dispose_radio_group_controller(&controller);
        set_toggle_controller_checked(&member.read().unwrap(), true);
        assert_eq!(get_radio_group_controller_selected_index(&controller), -1);
    }
}
mod get_radio_group_controller_selected_index {
    use super::*;
    #[test]
    fn normalizes_out_of_range_values_to_negative_one() {
        let controller = create_radio_group_controller(&RadioGroupControllerOptions {
            selected_index: Some(4),
            toggles: vec![toggle()],
        });
        assert_eq!(get_radio_group_controller_selected_index(&controller), -1);
    }
}
mod get_radio_group_controller_signals {
    use super::*;
    #[test]
    fn emits_selected_indices() {
        let controller = create_radio_group_controller(&RadioGroupControllerOptions {
            selected_index: None,
            toggles: vec![toggle(), toggle()],
        });
        let values = Arc::new(RwLock::new(Vec::new()));
        let copy = values.clone();
        let signals = get_radio_group_controller_signals(&controller);
        flight_signals::connect_signal(
            &signals.read().unwrap().on_change.read().unwrap(),
            Arc::new(move |value| copy.write().unwrap().push(*value)),
            None,
        );
        set_radio_group_controller_selected_index(&controller, 1);
        assert_eq!(*values.read().unwrap(), [1]);
    }
}
mod initialize_radio_group_controller {
    use super::*;
    #[test]
    fn preserves_controller_and_member_identities_and_releases_runtime_before_member_callbacks() {
        let member = toggle();
        let mut controller: RadioGroupController = flight_entity::allocate_entity();
        let id = flight_entity::get_entity_id(&controller);
        initialize_radio_group_controller(
            &mut controller,
            &RadioGroupControllerOptions {
                selected_index: Some(-1),
                toggles: vec![member.clone()],
            },
        );
        assert_eq!(flight_entity::get_entity_id(&controller), id);
        let runtime = get_gui_controller_runtime(&controller);
        assert!(Arc::ptr_eq(
            &runtime.read().unwrap().fields.toggles[0],
            &member
        ));
        let copy = runtime.clone();
        let signal = get_toggle_controller_signals(&member.read().unwrap())
            .read()
            .unwrap()
            .on_change
            .clone();
        flight_signals::connect_signal(
            &signal.read().unwrap(),
            Arc::new(move |_| {
                assert!(copy.try_write().is_ok());
            }),
            None,
        );
        set_radio_group_controller_selected_index(&controller, 0);
        assert!(is_toggle_controller_checked(&member.read().unwrap()));
    }
}
mod set_radio_group_controller_selected_index {
    use super::*;
    #[test]
    fn can_clear_the_selection() {
        let controller = create_radio_group_controller(&RadioGroupControllerOptions {
            selected_index: None,
            toggles: vec![toggle()],
        });
        set_radio_group_controller_selected_index(&controller, -1);
        assert_eq!(get_radio_group_controller_selected_index(&controller), -1);
    }
}
