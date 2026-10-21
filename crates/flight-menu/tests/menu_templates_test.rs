use flight_entity::Ref;
use flight_menu::contract::*;

fn collect_ids(items: &[Ref<MenuItemTemplate>]) -> Vec<String> {
    let mut ids: Vec<String> = Vec::new();
    for item in items {
        let borrowed = item.read().unwrap();
        if let Some(id) = borrowed.id.as_ref() {
            ids.push(id.clone());
        }
        if let Some(submenu) = borrowed.submenu.as_ref() {
            ids.extend(collect_ids(submenu));
        }
    }
    return ids;
}

fn find<'a>(items: &'a [Ref<MenuItemTemplate>], id: &str) -> Option<&'a Ref<MenuItemTemplate>> {
    return items
        .iter()
        .find(|item| item.read().unwrap().id.as_deref() == Some(id));
}

mod create_default_app_menu_template {
    use super::*;

    #[test]
    fn returns_a_submenu_template_with_the_app_name_as_label() {
        let menu = create_default_app_menu_template("MyApp");
        let borrowed = menu.read().unwrap();
        assert_eq!(borrowed.type_, Some(MenuItemType::Submenu));
        assert_eq!(borrowed.label, Some("MyApp".to_string()));
        assert_eq!(borrowed.role, Some("appMenu".to_string()));
    }

    #[test]
    fn includes_about_hide_and_quit_with_app_name_interpolation() {
        let menu = create_default_app_menu_template("MyApp");
        let submenu = menu.read().unwrap().submenu.clone().unwrap();
        assert_eq!(
            find(&submenu, "about").unwrap().read().unwrap().label,
            Some("About MyApp".to_string())
        );
        assert_eq!(
            find(&submenu, "quit").unwrap().read().unwrap().label,
            Some("Quit MyApp".to_string())
        );
        assert_eq!(
            find(&submenu, "hide").unwrap().read().unwrap().label,
            Some("Hide MyApp".to_string())
        );
    }

    #[test]
    fn includes_accelerators_for_hide_and_quit() {
        let menu = create_default_app_menu_template("MyApp");
        let submenu = menu.read().unwrap().submenu.clone().unwrap();
        assert_eq!(
            find(&submenu, "quit").unwrap().read().unwrap().accelerator,
            Some("CmdOrCtrl+Q".to_string())
        );
        assert_eq!(
            find(&submenu, "hide").unwrap().read().unwrap().accelerator,
            Some("CmdOrCtrl+H".to_string())
        );
    }

    #[test]
    fn every_non_separator_item_is_enabled_by_default() {
        let menu = create_default_app_menu_template("MyApp");
        let submenu = menu.read().unwrap().submenu.clone().unwrap();
        let mut items: Vec<Ref<MenuItemTemplate>> = vec![menu.clone()];
        items.extend(submenu);
        for item in items {
            let borrowed = item.read().unwrap();
            if borrowed.type_ != Some(MenuItemType::Separator) {
                assert_eq!(borrowed.enabled, Some(true));
            }
        }
    }
}

mod create_default_edit_menu_template {
    use super::*;

    #[test]
    fn returns_a_submenu_template_with_label_edit_and_role_edit_menu() {
        let menu = create_default_edit_menu_template();
        let borrowed = menu.read().unwrap();
        assert_eq!(borrowed.type_, Some(MenuItemType::Submenu));
        assert_eq!(borrowed.label, Some("Edit".to_string()));
        assert_eq!(borrowed.role, Some("editMenu".to_string()));
    }

    #[test]
    fn includes_the_standard_editing_items() {
        let menu = create_default_edit_menu_template();
        let ids = collect_ids(&[menu]);
        for expected in [
            "undo",
            "redo",
            "cut",
            "copy",
            "paste",
            "delete",
            "selectAll",
        ] {
            assert!(ids.contains(&expected.to_string()), "missing {}", expected);
        }
    }

    #[test]
    fn items_carry_well_known_role_strings() {
        let menu = create_default_edit_menu_template();
        let submenu = menu.read().unwrap().submenu.clone().unwrap();
        assert_eq!(
            find(&submenu, "undo").unwrap().read().unwrap().role,
            Some("undo".to_string())
        );
    }

    #[test]
    fn includes_separators_between_groups() {
        let menu = create_default_edit_menu_template();
        let submenu = menu.read().unwrap().submenu.clone().unwrap();
        assert!(submenu.iter().any(|item| {
            return item.read().unwrap().type_ == Some(MenuItemType::Separator);
        }));
    }
}

mod create_default_file_menu_template {
    use super::*;

    #[test]
    fn returns_a_submenu_template_with_label_file_and_role_file_menu() {
        let menu = create_default_file_menu_template();
        let borrowed = menu.read().unwrap();
        assert_eq!(borrowed.type_, Some(MenuItemType::Submenu));
        assert_eq!(borrowed.label, Some("File".to_string()));
        assert_eq!(borrowed.role, Some("fileMenu".to_string()));
    }

    #[test]
    fn includes_the_standard_file_items() {
        let menu = create_default_file_menu_template();
        let ids = collect_ids(&[menu]);
        for expected in ["newFile", "openFile", "saveFile", "saveFileAs", "closeFile"] {
            assert!(ids.contains(&expected.to_string()), "missing {}", expected);
        }
    }

    #[test]
    fn includes_accelerators_for_new_and_save() {
        let menu = create_default_file_menu_template();
        let submenu = menu.read().unwrap().submenu.clone().unwrap();
        assert_eq!(
            find(&submenu, "newFile")
                .unwrap()
                .read()
                .unwrap()
                .accelerator,
            Some("CmdOrCtrl+N".to_string())
        );
        assert_eq!(
            find(&submenu, "saveFile")
                .unwrap()
                .read()
                .unwrap()
                .accelerator,
            Some("CmdOrCtrl+S".to_string())
        );
    }

    #[test]
    fn includes_separators_between_groups() {
        let menu = create_default_file_menu_template();
        let submenu = menu.read().unwrap().submenu.clone().unwrap();
        assert!(submenu.iter().any(|item| {
            return item.read().unwrap().type_ == Some(MenuItemType::Separator);
        }));
    }
}

mod create_default_help_menu_template {
    use super::*;

    #[test]
    fn returns_a_submenu_template_with_label_help_and_role_help_menu() {
        let menu = create_default_help_menu_template();
        let borrowed = menu.read().unwrap();
        assert_eq!(borrowed.type_, Some(MenuItemType::Submenu));
        assert_eq!(borrowed.label, Some("Help".to_string()));
        assert_eq!(borrowed.role, Some("helpMenu".to_string()));
    }

    #[test]
    fn includes_a_help_search_item() {
        let menu = create_default_help_menu_template();
        assert!(collect_ids(&[menu]).contains(&"help".to_string()));
    }
}

mod create_default_view_menu_template {
    use super::*;

    #[test]
    fn returns_a_submenu_template_with_label_view_and_role_view_menu() {
        let menu = create_default_view_menu_template();
        let borrowed = menu.read().unwrap();
        assert_eq!(borrowed.type_, Some(MenuItemType::Submenu));
        assert_eq!(borrowed.label, Some("View".to_string()));
        assert_eq!(borrowed.role, Some("viewMenu".to_string()));
    }

    #[test]
    fn includes_the_standard_view_items() {
        let menu = create_default_view_menu_template();
        let ids = collect_ids(&[menu]);
        for expected in [
            "reload",
            "zoomIn",
            "zoomOut",
            "resetZoom",
            "toggleFullscreen",
        ] {
            assert!(ids.contains(&expected.to_string()), "missing {}", expected);
        }
    }
}

mod create_default_window_menu_template {
    use super::*;

    #[test]
    fn returns_a_submenu_template_with_label_window_and_role_window_menu() {
        let menu = create_default_window_menu_template();
        let borrowed = menu.read().unwrap();
        assert_eq!(borrowed.type_, Some(MenuItemType::Submenu));
        assert_eq!(borrowed.label, Some("Window".to_string()));
        assert_eq!(borrowed.role, Some("windowMenu".to_string()));
    }

    #[test]
    fn includes_minimize_and_close_items() {
        let menu = create_default_window_menu_template();
        let ids = collect_ids(&[menu]);
        assert!(ids.contains(&"minimize".to_string()));
        assert!(ids.contains(&"close".to_string()));
    }
}
