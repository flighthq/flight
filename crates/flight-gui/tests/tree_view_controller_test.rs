use flight_entity::Ref;
use flight_gui::contract::*;
use flight_interaction::contract::InteractionSignalName;
use std::sync::{Arc, RwLock};
fn tree() -> (Ref<TreeViewControllerItem>, Ref<TreeViewControllerItem>) {
    let child = Arc::new(RwLock::new(TreeViewControllerItem {
        children: None,
        expanded: None,
        visual: create_gui_test_node(None, None),
    }));
    let root = Arc::new(RwLock::new(TreeViewControllerItem {
        children: Some(vec![child.clone()]),
        expanded: None,
        visual: create_gui_test_node(None, None),
    }));
    return (child, root);
}
fn options(root: Ref<TreeViewControllerItem>) -> TreeViewControllerOptions {
    return TreeViewControllerOptions {
        items: vec![root],
        selected_item: None,
        transition: None,
    };
}
mod create_tree_view_controller {
    use super::*;
    #[test]
    fn models_expansion_separately_from_flat_list_state() {
        let (child, root) = tree();
        let controller = create_tree_view_controller(&options(root.clone()));
        assert!(
            !child
                .read()
                .unwrap()
                .visual
                .read()
                .unwrap()
                .node2d_fields()
                .visible
        );
        emit_gui_pointer(
            &root.read().unwrap().visual,
            InteractionSignalName::OnDoubleClick,
            None,
        );
        assert!(is_tree_view_controller_item_expanded(&controller, &root));
        assert!(
            child
                .read()
                .unwrap()
                .visual
                .read()
                .unwrap()
                .node2d_fields()
                .visible
        );
    }
    #[test]
    fn navigates_hierarchy_with_left_and_right() {
        let (child, root) = tree();
        let mut options = options(root.clone());
        options.selected_item = Some(root.clone());
        let controller = create_tree_view_controller(&options);
        emit_gui_keyboard(
            &root.read().unwrap().visual,
            InteractionSignalName::OnKeyDown,
            "ArrowRight",
        );
        emit_gui_keyboard(
            &root.read().unwrap().visual,
            InteractionSignalName::OnKeyDown,
            "ArrowRight",
        );
        assert!(Arc::ptr_eq(
            get_tree_view_controller_selected_item(&controller)
                .as_ref()
                .unwrap(),
            &child
        ));
    }
}
mod dispose_tree_view_controller {
    use super::*;
    #[test]
    fn detaches_item_input() {
        let (_, root) = tree();
        let controller = create_tree_view_controller(&options(root.clone()));
        dispose_tree_view_controller(&controller);
        emit_gui_pointer(
            &root.read().unwrap().visual,
            InteractionSignalName::OnClick,
            None,
        );
        assert!(get_tree_view_controller_selected_item(&controller).is_none());
    }
}
mod get_tree_view_controller_selected_item {
    use super::*;
    #[test]
    fn returns_configured_selection() {
        let (_, root) = tree();
        let mut options = options(root.clone());
        options.selected_item = Some(root.clone());
        assert!(Arc::ptr_eq(
            get_tree_view_controller_selected_item(&create_tree_view_controller(&options))
                .as_ref()
                .unwrap(),
            &root
        ));
    }
}
mod get_tree_view_controller_signals {
    use super::*;
    #[test]
    fn emits_activation_separately_from_expansion() {
        let (_, root) = tree();
        let controller = create_tree_view_controller(&options(root.clone()));
        let activated = Arc::new(RwLock::new(false));
        let copy = activated.clone();
        let signals = get_tree_view_controller_signals(&controller);
        flight_signals::connect_signal(
            &signals.read().unwrap().on_activate.read().unwrap(),
            Arc::new(move |_| *copy.write().unwrap() = true),
            None,
        );
        emit_gui_pointer(
            &root.read().unwrap().visual,
            InteractionSignalName::OnDoubleClick,
            None,
        );
        assert!(*activated.read().unwrap());
    }
}
mod initialize_tree_view_controller {
    use super::*;
    #[test]
    fn retains_source_item_identity_and_releases_guards_before_expansion_callbacks() {
        let (child, root) = tree();
        let mut controller: TreeViewController = flight_entity::allocate_entity();
        let id = flight_entity::get_entity_id(&controller);
        initialize_tree_view_controller(&mut controller, &options(root.clone()));
        assert_eq!(flight_entity::get_entity_id(&controller), id);
        let runtime = get_gui_controller_runtime(&controller);
        assert!(Arc::ptr_eq(
            &runtime.read().unwrap().fields.items[1],
            &child
        ));
        let copy = runtime.clone();
        let expected = root.clone();
        let seen = Arc::new(RwLock::new(false));
        let flag = seen.clone();
        let signals = get_tree_view_controller_signals(&controller);
        flight_signals::connect_signal(
            &signals.read().unwrap().on_expand_change.read().unwrap(),
            Arc::new(move |(item, expanded)| {
                assert!(copy.try_write().is_ok());
                assert!(item.try_write().is_ok());
                assert!(Arc::ptr_eq(item, &expected));
                assert!(*expanded);
                *flag.write().unwrap() = true;
            }),
            None,
        );
        set_tree_view_controller_item_expanded(&controller, &root, true);
        assert!(*seen.read().unwrap());
    }
}
mod is_tree_view_controller_item_expanded {
    use super::*;
    #[test]
    fn reads_authored_initial_expansion() {
        let (_, root) = tree();
        root.write().unwrap().expanded = Some(true);
        assert!(is_tree_view_controller_item_expanded(
            &create_tree_view_controller(&options(root.clone())),
            &root
        ));
    }
}
mod set_tree_view_controller_item_expanded {
    use super::*;
    #[test]
    fn ignores_leaves() {
        let (child, root) = tree();
        let controller = create_tree_view_controller(&options(root));
        set_tree_view_controller_item_expanded(&controller, &child, true);
        assert!(!is_tree_view_controller_item_expanded(&controller, &child));
    }
}
mod set_tree_view_controller_selected_item {
    use super::*;
    #[test]
    fn rejects_foreign_items() {
        let (_, root) = tree();
        let controller = create_tree_view_controller(&options(root));
        let foreign = Arc::new(RwLock::new(TreeViewControllerItem {
            children: None,
            expanded: None,
            visual: create_gui_test_node(None, None),
        }));
        set_tree_view_controller_selected_item(&controller, Some(foreign));
        assert!(get_tree_view_controller_selected_item(&controller).is_none());
    }
}
mod toggle_tree_view_controller_item {
    use super::*;
    #[test]
    fn toggles_expansion_in_both_directions() {
        let (_, root) = tree();
        let controller = create_tree_view_controller(&options(root.clone()));
        toggle_tree_view_controller_item(&controller, &root);
        toggle_tree_view_controller_item(&controller, &root);
        assert!(!is_tree_view_controller_item_expanded(&controller, &root));
    }
}
