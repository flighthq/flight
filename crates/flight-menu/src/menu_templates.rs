use std::sync::{Arc, RwLock};

use flight_entity::{NonEntityCreateResult, Ref};

use crate::types::*;

/// Returns a standard macOS-style application menu template labelled with the app name (TS
/// `createDefaultAppMenuTemplate`). Plain descriptor data, no entity runtime.
pub fn create_default_app_menu_template(
    app_name: &str,
) -> NonEntityCreateResult<Ref<MenuItemTemplate>> {
    let mut submenu: Vec<Ref<MenuItemTemplate>> = Vec::new();
    submenu.push(node(MenuItemTemplate {
        id: Some("about".to_string()),
        label: Some(format!("About {}", app_name)),
        role: Some(role_string(WellKnownMenuItemRoleValue::About)),
        type_: Some(MenuItemType::Normal),
        enabled: Some(true),
        ..MenuItemTemplate::default()
    }));
    submenu.push(separator());
    submenu.push(node(MenuItemTemplate {
        id: Some("services".to_string()),
        label: Some("Services".to_string()),
        role: Some(role_string(WellKnownMenuItemRoleValue::Services)),
        type_: Some(MenuItemType::Submenu),
        submenu: Some(Vec::new()),
        enabled: Some(true),
        ..MenuItemTemplate::default()
    }));
    submenu.push(separator());
    submenu.push(node(MenuItemTemplate {
        id: Some("hide".to_string()),
        label: Some(format!("Hide {}", app_name)),
        role: Some(role_string(WellKnownMenuItemRoleValue::Hide)),
        accelerator: Some("CmdOrCtrl+H".to_string()),
        type_: Some(MenuItemType::Normal),
        enabled: Some(true),
        ..MenuItemTemplate::default()
    }));
    submenu.push(node(MenuItemTemplate {
        id: Some("hideOthers".to_string()),
        label: Some("Hide Others".to_string()),
        role: Some(role_string(WellKnownMenuItemRoleValue::HideOthers)),
        accelerator: Some("CmdOrCtrl+Alt+H".to_string()),
        type_: Some(MenuItemType::Normal),
        enabled: Some(true),
        ..MenuItemTemplate::default()
    }));
    submenu.push(node(MenuItemTemplate {
        id: Some("unhide".to_string()),
        label: Some("Show All".to_string()),
        role: Some(role_string(WellKnownMenuItemRoleValue::Unhide)),
        type_: Some(MenuItemType::Normal),
        enabled: Some(true),
        ..MenuItemTemplate::default()
    }));
    submenu.push(separator());
    submenu.push(node(MenuItemTemplate {
        id: Some("quit".to_string()),
        label: Some(format!("Quit {}", app_name)),
        role: Some(role_string(WellKnownMenuItemRoleValue::Quit)),
        accelerator: Some("CmdOrCtrl+Q".to_string()),
        type_: Some(MenuItemType::Normal),
        enabled: Some(true),
        ..MenuItemTemplate::default()
    }));
    return node(MenuItemTemplate {
        label: Some(app_name.to_string()),
        role: Some(role_string(WellKnownMenuItemRoleValue::AppMenu)),
        type_: Some(MenuItemType::Submenu),
        submenu: Some(submenu),
        enabled: Some(true),
        ..MenuItemTemplate::default()
    });
}

/// Returns a standard Edit menu template (TS `createDefaultEditMenuTemplate`).
pub fn create_default_edit_menu_template() -> NonEntityCreateResult<Ref<MenuItemTemplate>> {
    let mut submenu: Vec<Ref<MenuItemTemplate>> = Vec::new();
    submenu.push(role_item(
        "undo",
        "Undo",
        "CmdOrCtrl+Z",
        WellKnownMenuItemRoleValue::Undo,
    ));
    submenu.push(role_item(
        "redo",
        "Redo",
        "Shift+CmdOrCtrl+Z",
        WellKnownMenuItemRoleValue::Redo,
    ));
    submenu.push(separator());
    submenu.push(role_item(
        "cut",
        "Cut",
        "CmdOrCtrl+X",
        WellKnownMenuItemRoleValue::Cut,
    ));
    submenu.push(role_item(
        "copy",
        "Copy",
        "CmdOrCtrl+C",
        WellKnownMenuItemRoleValue::Copy,
    ));
    submenu.push(role_item(
        "paste",
        "Paste",
        "CmdOrCtrl+V",
        WellKnownMenuItemRoleValue::Paste,
    ));
    submenu.push(role_item(
        "pasteAndMatchStyle",
        "Paste and Match Style",
        "Shift+CmdOrCtrl+V",
        WellKnownMenuItemRoleValue::PasteAndMatchStyle,
    ));
    submenu.push(node(MenuItemTemplate {
        id: Some("delete".to_string()),
        label: Some("Delete".to_string()),
        role: Some(role_string(WellKnownMenuItemRoleValue::Delete)),
        type_: Some(MenuItemType::Normal),
        enabled: Some(true),
        ..MenuItemTemplate::default()
    }));
    submenu.push(role_item(
        "selectAll",
        "Select All",
        "CmdOrCtrl+A",
        WellKnownMenuItemRoleValue::SelectAll,
    ));
    return node(MenuItemTemplate {
        label: Some("Edit".to_string()),
        role: Some(role_string(WellKnownMenuItemRoleValue::EditMenu)),
        type_: Some(MenuItemType::Submenu),
        submenu: Some(submenu),
        enabled: Some(true),
        ..MenuItemTemplate::default()
    });
}

/// Returns a standard File menu template (TS `createDefaultFileMenuTemplate`).
pub fn create_default_file_menu_template() -> NonEntityCreateResult<Ref<MenuItemTemplate>> {
    let mut submenu: Vec<Ref<MenuItemTemplate>> = Vec::new();
    submenu.push(plain_item("newFile", "New", "CmdOrCtrl+N"));
    submenu.push(plain_item("openFile", "Open…", "CmdOrCtrl+O"));
    submenu.push(separator());
    submenu.push(plain_item("saveFile", "Save", "CmdOrCtrl+S"));
    submenu.push(plain_item("saveFileAs", "Save As…", "Shift+CmdOrCtrl+S"));
    submenu.push(separator());
    submenu.push(role_item(
        "closeFile",
        "Close",
        "CmdOrCtrl+W",
        WellKnownMenuItemRoleValue::Close,
    ));
    return node(MenuItemTemplate {
        label: Some("File".to_string()),
        role: Some(role_string(WellKnownMenuItemRoleValue::FileMenu)),
        type_: Some(MenuItemType::Submenu),
        submenu: Some(submenu),
        enabled: Some(true),
        ..MenuItemTemplate::default()
    });
}

/// Returns a standard Help menu template (TS `createDefaultHelpMenuTemplate`).
pub fn create_default_help_menu_template() -> NonEntityCreateResult<Ref<MenuItemTemplate>> {
    let mut submenu: Vec<Ref<MenuItemTemplate>> = Vec::new();
    submenu.push(node(MenuItemTemplate {
        id: Some("help".to_string()),
        label: Some("Search".to_string()),
        role: Some(role_string(WellKnownMenuItemRoleValue::Help)),
        type_: Some(MenuItemType::Normal),
        enabled: Some(true),
        ..MenuItemTemplate::default()
    }));
    return node(MenuItemTemplate {
        label: Some("Help".to_string()),
        role: Some(role_string(WellKnownMenuItemRoleValue::HelpMenu)),
        type_: Some(MenuItemType::Submenu),
        submenu: Some(submenu),
        enabled: Some(true),
        ..MenuItemTemplate::default()
    });
}

/// Returns a standard View menu template (TS `createDefaultViewMenuTemplate`).
pub fn create_default_view_menu_template() -> NonEntityCreateResult<Ref<MenuItemTemplate>> {
    let mut submenu: Vec<Ref<MenuItemTemplate>> = Vec::new();
    submenu.push(role_item(
        "reload",
        "Reload",
        "CmdOrCtrl+R",
        WellKnownMenuItemRoleValue::Reload,
    ));
    submenu.push(separator());
    submenu.push(role_item(
        "resetZoom",
        "Actual Size",
        "CmdOrCtrl+0",
        WellKnownMenuItemRoleValue::ResetZoom,
    ));
    submenu.push(role_item(
        "zoomIn",
        "Zoom In",
        "CmdOrCtrl+Plus",
        WellKnownMenuItemRoleValue::ZoomIn,
    ));
    submenu.push(role_item(
        "zoomOut",
        "Zoom Out",
        "CmdOrCtrl+-",
        WellKnownMenuItemRoleValue::ZoomOut,
    ));
    submenu.push(separator());
    submenu.push(role_item(
        "toggleFullscreen",
        "Toggle Full Screen",
        "F11",
        WellKnownMenuItemRoleValue::ToggleFullscreen,
    ));
    return node(MenuItemTemplate {
        label: Some("View".to_string()),
        role: Some(role_string(WellKnownMenuItemRoleValue::ViewMenu)),
        type_: Some(MenuItemType::Submenu),
        submenu: Some(submenu),
        enabled: Some(true),
        ..MenuItemTemplate::default()
    });
}

/// Returns a standard Window menu template (TS `createDefaultWindowMenuTemplate`).
pub fn create_default_window_menu_template() -> NonEntityCreateResult<Ref<MenuItemTemplate>> {
    let mut submenu: Vec<Ref<MenuItemTemplate>> = Vec::new();
    submenu.push(role_item(
        "minimize",
        "Minimize",
        "CmdOrCtrl+M",
        WellKnownMenuItemRoleValue::Minimize,
    ));
    submenu.push(role_item(
        "close",
        "Close",
        "CmdOrCtrl+W",
        WellKnownMenuItemRoleValue::Close,
    ));
    return node(MenuItemTemplate {
        label: Some("Window".to_string()),
        role: Some(role_string(WellKnownMenuItemRoleValue::WindowMenu)),
        type_: Some(MenuItemType::Submenu),
        submenu: Some(submenu),
        enabled: Some(true),
        ..MenuItemTemplate::default()
    });
}

fn node(item: MenuItemTemplate) -> Ref<MenuItemTemplate> {
    return Arc::new(RwLock::new(item));
}

fn plain_item(id: &str, label: &str, accelerator: &str) -> Ref<MenuItemTemplate> {
    return node(MenuItemTemplate {
        id: Some(id.to_string()),
        label: Some(label.to_string()),
        accelerator: Some(accelerator.to_string()),
        type_: Some(MenuItemType::Normal),
        enabled: Some(true),
        ..MenuItemTemplate::default()
    });
}

fn role_item(
    id: &str,
    label: &str,
    accelerator: &str,
    role: WellKnownMenuItemRoleValue,
) -> Ref<MenuItemTemplate> {
    return node(MenuItemTemplate {
        id: Some(id.to_string()),
        label: Some(label.to_string()),
        role: Some(role_string(role)),
        accelerator: Some(accelerator.to_string()),
        type_: Some(MenuItemType::Normal),
        enabled: Some(true),
        ..MenuItemTemplate::default()
    });
}

fn role_string(role: WellKnownMenuItemRoleValue) -> String {
    return get_well_known_menu_item_role_value_string(role).to_string();
}

fn separator() -> Ref<MenuItemTemplate> {
    return node(MenuItemTemplate {
        type_: Some(MenuItemType::Separator),
        enabled: Some(true),
        ..MenuItemTemplate::default()
    });
}
