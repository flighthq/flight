use flight_gui::contract::*;
use flight_interaction::contract::InteractionSignalName;
use flight_scene2d::Node2DRef;
use std::sync::{Arc, RwLock};
fn options(items: Vec<Node2DRef>) -> ListControllerOptions {
    return ListControllerOptions {
        content: create_gui_test_node(None, None),
        items,
        scroll_bar: None,
        selectable: None,
        selected_index: None,
        viewport: create_gui_test_node(None, None),
        transition: None,
    };
}
mod create_list_controller {
    use super::*;
    #[test]
    fn selects_and_activates_item_visuals() {
        let items: Vec<Node2DRef> = vec![
            create_gui_test_node(None, None),
            create_gui_test_node(None, None),
        ];
        let controller = create_list_controller(&options(items.clone()));
        let activations = Arc::new(RwLock::new(Vec::new()));
        let copy = activations.clone();
        let signals = get_list_controller_signals(&controller);
        flight_signals::connect_signal(
            &signals.read().unwrap().on_activate.read().unwrap(),
            Arc::new(move |index| copy.write().unwrap().push(*index)),
            None,
        );
        emit_gui_pointer(&items[1], InteractionSignalName::OnClick, None);
        emit_gui_pointer(&items[1], InteractionSignalName::OnDoubleClick, None);
        assert_eq!(get_list_controller_selected_index(&controller), 1);
        assert_eq!(*activations.read().unwrap(), [1]);
    }
    #[test]
    fn supports_flat_keyboard_navigation() {
        let options = options(vec![
            create_gui_test_node(None, None),
            create_gui_test_node(None, None),
        ]);
        let controller = create_list_controller(&options);
        emit_gui_keyboard(
            &options.viewport,
            InteractionSignalName::OnKeyDown,
            "ArrowDown",
        );
        assert_eq!(get_list_controller_selected_index(&controller), 0);
    }
}
mod dispose_list_controller {
    use super::*;
    #[test]
    fn detaches_item_input() {
        let item: Node2DRef = create_gui_test_node(None, None);
        let controller = create_list_controller(&options(vec![item.clone()]));
        dispose_list_controller(&controller);
        emit_gui_pointer(&item, InteractionSignalName::OnClick, None);
        assert_eq!(get_list_controller_selected_index(&controller), -1);
    }
}
mod get_list_controller_selected_index {
    use super::*;
    #[test]
    fn normalizes_invalid_initial_values() {
        let mut options = options(Vec::new());
        options.selected_index = Some(2);
        assert_eq!(
            get_list_controller_selected_index(&create_list_controller(&options)),
            -1
        );
    }
}
mod get_list_controller_signals {
    use super::*;
    #[test]
    fn returns_stable_signals() {
        let controller = create_list_controller(&options(Vec::new()));
        assert!(Arc::ptr_eq(
            &get_list_controller_signals(&controller),
            &get_list_controller_signals(&controller)
        ));
    }
}
mod initialize_list_controller {
    use super::*;
    #[test]
    fn preserves_the_controller_identity_and_copies_the_container_without_copying_items() {
        let item: Node2DRef = create_gui_test_node(None, None);
        let mut options = options(vec![item.clone()]);
        let mut controller: ListController = flight_entity::allocate_entity();
        let id = flight_entity::get_entity_id(&controller);
        initialize_list_controller(&mut controller, &options);
        options.items.clear();
        assert_eq!(flight_entity::get_entity_id(&controller), id);
        let runtime = get_gui_controller_runtime(&controller);
        assert_eq!(runtime.read().unwrap().fields.items.len(), 1);
        assert!(Arc::ptr_eq(&runtime.read().unwrap().fields.items[0], &item));
    }
}
mod set_list_controller_selected_index {
    use super::*;
    #[test]
    fn emits_only_real_changes() {
        let controller = create_list_controller(&options(vec![create_gui_test_node(None, None)]));
        let values = Arc::new(RwLock::new(Vec::new()));
        let copy = values.clone();
        let signals = get_list_controller_signals(&controller);
        flight_signals::connect_signal(
            &signals.read().unwrap().on_select.read().unwrap(),
            Arc::new(move |index| copy.write().unwrap().push(*index)),
            None,
        );
        set_list_controller_selected_index(&controller, 0);
        set_list_controller_selected_index(&controller, 0);
        assert_eq!(*values.read().unwrap(), [0]);
    }
}
mod set_list_controller_visible {
    use super::*;
    #[test]
    fn changes_both_caller_owned_references_without_creating_visuals() {
        let content = create_gui_test_node(None, None);
        let viewport = create_gui_test_node(None, None);
        let mut options = options(Vec::new());
        options.content = content.clone();
        options.viewport = viewport.clone();
        let controller = create_list_controller(&options);
        set_list_controller_visible(&controller, false);
        assert!(!content.read().unwrap().visible);
        assert!(!viewport.read().unwrap().visible);
    }
}
