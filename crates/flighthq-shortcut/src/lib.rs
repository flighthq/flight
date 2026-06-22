//! `flighthq-shortcut` — global OS hotkey registration over a swappable backend.
//!
//! Free functions delegate to the active [`ShortcutBackend`]. The web default
//! (lazily installed) returns false / no-op sentinels for every operation —
//! global shortcuts require a native host (Electron, Tauri). Install a backend
//! via [`set_shortcut_backend`].

pub mod shortcut;

pub use shortcut::{
    WebShortcutBackend, get_shortcut_backend, is_global_shortcut_registered,
    register_global_shortcut, set_shortcut_backend, unregister_all_global_shortcuts,
    unregister_global_shortcut,
};
