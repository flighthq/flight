use flight_menu::contract::*;

mod get_menu_item_type_string {
    use super::*;

    #[test]
    fn returns_every_exact_ts_type_string() {
        let cases = [
            (MenuItemType::Normal, "normal"),
            (MenuItemType::Separator, "separator"),
            (MenuItemType::Submenu, "submenu"),
            (MenuItemType::Checkbox, "checkbox"),
            (MenuItemType::Radio, "radio"),
        ];
        for (value, string) in cases {
            assert_eq!(get_menu_item_type_string(value), string);
        }
    }
}

mod get_well_known_menu_item_role_value_string {
    use super::*;

    #[test]
    fn returns_every_exact_ts_role_string() {
        let cases = [
            (WellKnownMenuItemRoleValue::Copy, "copy"),
            (WellKnownMenuItemRoleValue::Cut, "cut"),
            (WellKnownMenuItemRoleValue::Delete, "delete"),
            (WellKnownMenuItemRoleValue::Paste, "paste"),
            (
                WellKnownMenuItemRoleValue::PasteAndMatchStyle,
                "pasteAndMatchStyle",
            ),
            (WellKnownMenuItemRoleValue::Redo, "redo"),
            (WellKnownMenuItemRoleValue::SelectAll, "selectAll"),
            (
                WellKnownMenuItemRoleValue::ToggleSpellChecker,
                "toggleSpellChecker",
            ),
            (WellKnownMenuItemRoleValue::Undo, "undo"),
            (WellKnownMenuItemRoleValue::About, "about"),
            (WellKnownMenuItemRoleValue::Close, "close"),
            (WellKnownMenuItemRoleValue::Front, "front"),
            (WellKnownMenuItemRoleValue::Hide, "hide"),
            (WellKnownMenuItemRoleValue::HideOthers, "hideOthers"),
            (
                WellKnownMenuItemRoleValue::MergeAllWindows,
                "mergeAllWindows",
            ),
            (WellKnownMenuItemRoleValue::Minimize, "minimize"),
            (
                WellKnownMenuItemRoleValue::MoveTabToNewWindow,
                "moveTabToNewWindow",
            ),
            (WellKnownMenuItemRoleValue::Quit, "quit"),
            (WellKnownMenuItemRoleValue::SelectNextTab, "selectNextTab"),
            (
                WellKnownMenuItemRoleValue::SelectPreviousTab,
                "selectPreviousTab",
            ),
            (WellKnownMenuItemRoleValue::ToggleTabBar, "toggleTabBar"),
            (WellKnownMenuItemRoleValue::Unhide, "unhide"),
            (WellKnownMenuItemRoleValue::Zoom, "zoom"),
            (WellKnownMenuItemRoleValue::ForceReload, "forceReload"),
            (WellKnownMenuItemRoleValue::Reload, "reload"),
            (WellKnownMenuItemRoleValue::ResetZoom, "resetZoom"),
            (WellKnownMenuItemRoleValue::ToggleDevTools, "toggleDevTools"),
            (
                WellKnownMenuItemRoleValue::ToggleFullscreen,
                "toggleFullscreen",
            ),
            (WellKnownMenuItemRoleValue::ZoomIn, "zoomIn"),
            (WellKnownMenuItemRoleValue::ZoomOut, "zoomOut"),
            (WellKnownMenuItemRoleValue::Help, "help"),
            (WellKnownMenuItemRoleValue::Services, "services"),
            (WellKnownMenuItemRoleValue::StartSpeaking, "startSpeaking"),
            (WellKnownMenuItemRoleValue::StopSpeaking, "stopSpeaking"),
            (
                WellKnownMenuItemRoleValue::ClearRecentDocuments,
                "clearRecentDocuments",
            ),
            (
                WellKnownMenuItemRoleValue::RecentDocuments,
                "recentDocuments",
            ),
            (WellKnownMenuItemRoleValue::AppMenu, "appMenu"),
            (WellKnownMenuItemRoleValue::EditMenu, "editMenu"),
            (WellKnownMenuItemRoleValue::FileMenu, "fileMenu"),
            (WellKnownMenuItemRoleValue::HelpMenu, "helpMenu"),
            (WellKnownMenuItemRoleValue::ShareMenu, "shareMenu"),
            (WellKnownMenuItemRoleValue::ViewMenu, "viewMenu"),
            (WellKnownMenuItemRoleValue::WindowMenu, "windowMenu"),
        ];
        for (value, string) in cases {
            assert_eq!(get_well_known_menu_item_role_value_string(value), string);
        }
    }
}

mod parse_menu_item_type {
    use super::*;

    #[test]
    fn round_trips_exact_strings_and_rejects_other_spellings() {
        let values = [
            MenuItemType::Normal,
            MenuItemType::Separator,
            MenuItemType::Submenu,
            MenuItemType::Checkbox,
            MenuItemType::Radio,
        ];
        for value in values {
            assert_eq!(
                parse_menu_item_type(get_menu_item_type_string(value)),
                Some(value)
            );
        }
        assert_eq!(parse_menu_item_type("Normal"), None);
        assert_eq!(parse_menu_item_type(""), None);
    }
}

mod parse_well_known_menu_item_role_value {
    use super::*;

    #[test]
    fn round_trips_every_exact_string_and_rejects_unknown_roles() {
        let values = [
            WellKnownMenuItemRoleValue::Copy,
            WellKnownMenuItemRoleValue::Cut,
            WellKnownMenuItemRoleValue::Delete,
            WellKnownMenuItemRoleValue::Paste,
            WellKnownMenuItemRoleValue::PasteAndMatchStyle,
            WellKnownMenuItemRoleValue::Redo,
            WellKnownMenuItemRoleValue::SelectAll,
            WellKnownMenuItemRoleValue::ToggleSpellChecker,
            WellKnownMenuItemRoleValue::Undo,
            WellKnownMenuItemRoleValue::About,
            WellKnownMenuItemRoleValue::Close,
            WellKnownMenuItemRoleValue::Front,
            WellKnownMenuItemRoleValue::Hide,
            WellKnownMenuItemRoleValue::HideOthers,
            WellKnownMenuItemRoleValue::MergeAllWindows,
            WellKnownMenuItemRoleValue::Minimize,
            WellKnownMenuItemRoleValue::MoveTabToNewWindow,
            WellKnownMenuItemRoleValue::Quit,
            WellKnownMenuItemRoleValue::SelectNextTab,
            WellKnownMenuItemRoleValue::SelectPreviousTab,
            WellKnownMenuItemRoleValue::ToggleTabBar,
            WellKnownMenuItemRoleValue::Unhide,
            WellKnownMenuItemRoleValue::Zoom,
            WellKnownMenuItemRoleValue::ForceReload,
            WellKnownMenuItemRoleValue::Reload,
            WellKnownMenuItemRoleValue::ResetZoom,
            WellKnownMenuItemRoleValue::ToggleDevTools,
            WellKnownMenuItemRoleValue::ToggleFullscreen,
            WellKnownMenuItemRoleValue::ZoomIn,
            WellKnownMenuItemRoleValue::ZoomOut,
            WellKnownMenuItemRoleValue::Help,
            WellKnownMenuItemRoleValue::Services,
            WellKnownMenuItemRoleValue::StartSpeaking,
            WellKnownMenuItemRoleValue::StopSpeaking,
            WellKnownMenuItemRoleValue::ClearRecentDocuments,
            WellKnownMenuItemRoleValue::RecentDocuments,
            WellKnownMenuItemRoleValue::AppMenu,
            WellKnownMenuItemRoleValue::EditMenu,
            WellKnownMenuItemRoleValue::FileMenu,
            WellKnownMenuItemRoleValue::HelpMenu,
            WellKnownMenuItemRoleValue::ShareMenu,
            WellKnownMenuItemRoleValue::ViewMenu,
            WellKnownMenuItemRoleValue::WindowMenu,
        ];
        for value in values {
            assert_eq!(
                parse_well_known_menu_item_role_value(get_well_known_menu_item_role_value_string(
                    value
                )),
                Some(value)
            );
        }
        assert_eq!(
            parse_well_known_menu_item_role_value("acme.customRole"),
            None
        );
        assert_eq!(parse_well_known_menu_item_role_value(""), None);
    }
}
