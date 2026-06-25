//! `flighthq-screen` — display enumeration, coordinate conversion, modes,
//! cursor, and change signals over a swappable backend.
//!
//! Free functions report attached displays and their metrics, convert between
//! DIP (logical) and physical screen coordinates, enumerate display modes, track
//! the cursor screen, and fan display-change events out to a [`ScreenSignals`]
//! group by delegating to the active [`ScreenBackend`]. A native default backend
//! is lazily installed so every function works without a host. A real host
//! (winit/Electron/Tauri) replaces it via [`screen::set_screen_backend`] to
//! enumerate every monitor.
//!
//! [`ScreenSignals`]: flighthq_types::ScreenSignals
//! [`ScreenBackend`]: flighthq_types::ScreenBackend

pub mod screen;

pub use screen::{
    attach_screen_signals, create_native_screen_backend, create_screen_info, create_screen_mode,
    create_screen_signals, detach_screen_signals, dip_to_screen_point, dip_to_screen_rect,
    dispose_screen_signals, enable_screen_signals, get_primary_screen, get_screen_backend,
    get_screen_bounds, get_screen_by_id, get_screen_containing_rect, get_screen_current_mode,
    get_screen_cursor_position, get_screen_cursor_screen, get_screen_detail_permission,
    get_screen_modes, get_screen_nearest_point, get_screen_nearest_rect, get_screen_work_area,
    get_screens, on_screen_change, refresh_screens, request_screen_details, screen_to_dip_point,
    screen_to_dip_rect, set_screen_backend,
};
