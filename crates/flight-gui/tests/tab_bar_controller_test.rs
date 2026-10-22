use flight_entity::Ref;
use flight_gui::contract::*;
use flight_interaction::contract::InteractionSignalName;
use flight_scene2d::Node2DRef;
use std::sync::{Arc, RwLock};
fn tab() -> Ref<TabBarControllerItem> {
    return Arc::new(RwLock::new(TabBarControllerItem {
        selected_state: create_gui_test_node(None, None),
        unselected_state: create_gui_test_node(None, None),
    }));
}
mod create_tab_bar_controller {
    use super::*;
    #[test]
    fn swaps_selected_and_unselected_visuals_from_clicks() {
        let a = tab();
        let b = tab();
        let controller = create_tab_bar_controller(&TabBarControllerOptions {
            selected_index: None,
            tabs: vec![a, b.clone()],
            transition: None,
        });
        let target = b.read().unwrap().unselected_state.clone();
        emit_gui_pointer(&target, InteractionSignalName::OnClick, None);
        assert_eq!(get_tab_bar_controller_selected_index(&controller), 1);
        let (selected, unselected) = {
            let b = b.read().unwrap();
            (b.selected_state.clone(), b.unselected_state.clone())
        };
        assert_eq!(
            [
                selected.read().unwrap().node2d_fields().visible,
                unselected.read().unwrap().node2d_fields().visible
            ],
            [true, false]
        );
    }
}
mod dispose_tab_bar_controller {
    use super::*;
    #[test]
    fn detaches_tab_listeners() {
        let tab = tab();
        let controller = create_tab_bar_controller(&TabBarControllerOptions {
            selected_index: Some(-1),
            tabs: vec![tab.clone()],
            transition: None,
        });
        dispose_tab_bar_controller(&controller);
        let target = tab.read().unwrap().unselected_state.clone();
        emit_gui_pointer(&target, InteractionSignalName::OnClick, None);
        assert_eq!(get_tab_bar_controller_selected_index(&controller), -1);
    }
}
mod get_tab_bar_controller_selected_index {
    use super::*;
    #[test]
    fn reports_the_initial_index() {
        let controller = create_tab_bar_controller(&TabBarControllerOptions {
            selected_index: Some(-1),
            tabs: Vec::new(),
            transition: None,
        });
        assert_eq!(get_tab_bar_controller_selected_index(&controller), -1);
    }
}
mod get_tab_bar_controller_signals {
    use super::*;
    #[test]
    fn returns_stable_signals() {
        let controller = create_tab_bar_controller(&TabBarControllerOptions {
            selected_index: None,
            tabs: Vec::new(),
            transition: None,
        });
        assert!(Arc::ptr_eq(
            &get_tab_bar_controller_signals(&controller),
            &get_tab_bar_controller_signals(&controller)
        ));
    }
}
mod initialize_tab_bar_controller {
    use super::*;
    #[test]
    fn retains_the_original_tab_record_and_controller_identity_while_deduplicating_its_target() {
        let shared: Node2DRef = create_gui_test_node(None, None);
        let record = Arc::new(RwLock::new(TabBarControllerItem {
            selected_state: shared.clone(),
            unselected_state: shared.clone(),
        }));
        let mut controller: TabBarController = flight_entity::allocate_entity();
        let id = flight_entity::get_entity_id(&controller);
        initialize_tab_bar_controller(
            &mut controller,
            &TabBarControllerOptions {
                selected_index: Some(-1),
                tabs: vec![record.clone()],
                transition: None,
            },
        );
        assert_eq!(flight_entity::get_entity_id(&controller), id);
        let runtime = get_gui_controller_runtime(&controller);
        assert!(Arc::ptr_eq(
            &runtime.read().unwrap().fields.tabs[0],
            &record
        ));
        assert_eq!(runtime.read().unwrap().hit_states.len(), 1);
        emit_gui_pointer(&shared, InteractionSignalName::OnClick, None);
        assert_eq!(get_tab_bar_controller_selected_index(&controller), 0);
    }
}
mod set_tab_bar_controller_selected_index {
    use super::*;
    #[test]
    fn normalizes_invalid_indices() {
        let controller = create_tab_bar_controller(&TabBarControllerOptions {
            selected_index: None,
            tabs: Vec::new(),
            transition: None,
        });
        set_tab_bar_controller_selected_index(&controller, 2);
        assert_eq!(get_tab_bar_controller_selected_index(&controller), -1);
    }
}
