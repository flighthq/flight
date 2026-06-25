//! `flighthq-tray` — system tray / menu-bar icon over a swappable backend.
//!
//! Free functions delegate to the active [`TrayBackend`]. The web default
//! (lazily installed) returns `None` / no-op sentinels — a tray icon requires a
//! native host (Electron's `Tray`, Tauri). Install a backend via
//! [`set_tray_backend`].
//!
//! The application / dock badge lives in `flighthq-app`; it is not part of this
//! package.

pub mod tray;

pub use tray::{
    TrayIcon, WebTrayBackend, create_tray_icon, destroy_tray_icon, display_tray_balloon,
    get_tray_backend, get_tray_capabilities, get_tray_icon_bounds, get_tray_icon_title,
    get_tray_icon_tooltip, get_tray_icons, is_tray_destroyed, on_tray_event,
    popup_tray_context_menu, remove_tray_balloon, set_tray_backend, set_tray_icon,
    set_tray_icon_context_menu, set_tray_icon_template, set_tray_icon_title, set_tray_icon_tooltip,
    set_tray_ignore_double_click_events, set_tray_pressed_icon, start_tray_icon_animation,
};
