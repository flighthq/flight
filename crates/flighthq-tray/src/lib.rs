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
    TrayIcon, WebTrayBackend, create_tray_icon, destroy_tray_icon, get_tray_backend, on_tray_event,
    set_tray_backend, set_tray_context_menu, set_tray_icon_title, set_tray_icon_tooltip,
};
