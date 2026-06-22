//! `flighthq-screen` — display/monitor enumeration over a swappable backend.
//!
//! Free functions report attached displays, their geometry, work area, scale
//! factor, and primary designation by delegating to the active [`ScreenBackend`].
//! A native default backend is lazily installed so every function works without a
//! host. A real host (Electron/Tauri/native) replaces it via
//! [`screen::set_screen_backend`] to enumerate every monitor.

pub mod screen;

pub use screen::{
    create_native_screen_backend, create_screen_info, get_primary_screen, get_screen_backend,
    get_screen_scale_factor, get_screen_work_area, get_screens, on_screen_change,
    set_screen_backend,
};
