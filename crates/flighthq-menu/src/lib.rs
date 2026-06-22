//! `flighthq-menu` — native application and context menus over a swappable backend.
//!
//! Free functions delegate to the active [`MenuBackend`]. The web default
//! (lazily installed) returns false / null sentinels — a native app-menu bar and
//! OS context menu require a native host (Electron, Tauri). Install a backend
//! via [`set_menu_backend`].

pub mod menu;

pub use menu::{
    WebMenuBackend, create_menu_item_template, get_menu_backend, on_menu_select,
    set_application_menu, set_menu_backend, show_context_menu,
};
