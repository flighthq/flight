use flight_entity::Ref;
use flight_gui::contract::*;
use flight_interaction::contract::InteractionSignalName;
use flight_scene2d::Node2DRef;
use std::sync::{Arc, RwLock};
struct Parts {
    options: ComboBoxControllerOptions,
    button_node: Node2DRef,
    item: Node2DRef,
    viewport: Ref<flight_scene2d::DisplayObject>,
}
fn parts() -> Parts {
    let button_node: Node2DRef = create_gui_test_node(None, None);
    let viewport = create_gui_test_node(None, None);
    let item: Node2DRef = create_gui_test_node(None, None);
    let button = Arc::new(RwLock::new(create_button_controller(
        &ButtonControllerOptions {
            up_state: button_node.clone(),
            disabled: None,
            down_state: None,
            hit_area: None,
            interactive_state_binding: None,
            over_state: None,
            transition: None,
        },
    )));
    let list = Arc::new(RwLock::new(create_list_controller(
        &ListControllerOptions {
            content: create_gui_test_node(None, None),
            items: vec![item.clone()],
            scroll_bar: None,
            selectable: None,
            selected_index: None,
            viewport: viewport.clone(),
            transition: None,
        },
    )));
    return Parts {
        options: ComboBoxControllerOptions {
            button,
            display: None,
            list,
            open: None,
            transition: None,
        },
        button_node,
        item,
        viewport,
    };
}
mod create_combo_box_controller {
    use super::*;
    #[test]
    fn opens_from_its_button_and_closes_on_list_selection() {
        let parts = parts();
        let controller = create_combo_box_controller(&parts.options);
        emit_gui_pointer(&parts.button_node, InteractionSignalName::OnClick, None);
        assert!(is_combo_box_controller_open(&controller));
        emit_gui_pointer(&parts.item, InteractionSignalName::OnClick, None);
        assert!(!is_combo_box_controller_open(&controller));
    }
}
mod dispose_combo_box_controller {
    use super::*;
    #[test]
    fn detaches_composed_controller_signals() {
        let parts = parts();
        let controller = create_combo_box_controller(&parts.options);
        dispose_combo_box_controller(&controller);
        emit_gui_pointer(&parts.button_node, InteractionSignalName::OnClick, None);
        assert!(!is_combo_box_controller_open(&controller));
    }
}
mod get_combo_box_controller_signals {
    use super::*;
    #[test]
    fn emits_open_state_transitions() {
        let controller = create_combo_box_controller(&parts().options);
        let values = Arc::new(RwLock::new(Vec::new()));
        let copy = values.clone();
        let signals = get_combo_box_controller_signals(&controller);
        flight_signals::connect_signal(
            &signals.read().unwrap().on_open_change.read().unwrap(),
            Arc::new(move |open| copy.write().unwrap().push(*open)),
            None,
        );
        set_combo_box_controller_open(&controller, true);
        assert_eq!(*values.read().unwrap(), [true]);
    }
}
mod initialize_combo_box_controller {
    use super::*;
    #[test]
    fn preserves_controller_identity_and_releases_composed_guards_before_visibility_callbacks() {
        let parts = parts();
        let mut controller: ComboBoxController = flight_entity::allocate_entity();
        let id = flight_entity::get_entity_id(&controller);
        initialize_combo_box_controller(&mut controller, &parts.options);
        assert_eq!(flight_entity::get_entity_id(&controller), id);
        let runtime = get_gui_controller_runtime(&controller);
        let copy = runtime.clone();
        let list = parts.options.list.clone();
        let seen = Arc::new(RwLock::new(false));
        let flag = seen.clone();
        let signals = get_combo_box_controller_signals(&controller);
        flight_signals::connect_signal(
            &signals.read().unwrap().on_open_change.read().unwrap(),
            Arc::new(move |_| {
                assert!(copy.try_write().is_ok());
                assert!(list.try_write().is_ok());
                *flag.write().unwrap() = true;
            }),
            None,
        );
        set_combo_box_controller_open(&controller, true);
        assert!(*seen.read().unwrap());
    }
}
mod is_combo_box_controller_open {
    use super::*;
    #[test]
    fn reads_initial_open_state() {
        let mut parts = parts();
        parts.options.open = Some(true);
        assert!(is_combo_box_controller_open(&create_combo_box_controller(
            &parts.options
        )));
    }
}
mod set_combo_box_controller_open {
    use super::*;
    #[test]
    fn updates_list_visibility() {
        let parts = parts();
        let controller = create_combo_box_controller(&parts.options);
        set_combo_box_controller_open(&controller, true);
        assert!(parts.viewport.read().unwrap().visible);
    }
}
