//! `flighthq-application` — application lifecycle, main loop, and windowing API.
//!
//! Provides:
//! - [`Application`] lifecycle signals and a `start_application_loop` driver.
//! - [`ApplicationWindow`] entity with its [`ApplicationWindowSignals`] companion.
//! - [`WindowBackend`] trait — the control seam a native host implements to
//!   manage real OS windows (winit/tao, Electron, Tauri, …).
//! - All `attach_window_*` / `detach_window_*` helpers and the full suite of
//!   window command functions.

pub mod application;
pub mod window;

// ---------------------------------------------------------------------------
// Re-exports — full public surface at the crate root
// ---------------------------------------------------------------------------

// application
pub use application::{
    create_application, dispose_application, run_application_frame, start_application_loop,
    stop_application_loop,
};

// window
pub use window::{
    ApplicationWindowSignals, WindowBackend, WindowCloseRequest, WindowEventGuard,
    attach_window_close, attach_window_drop_file, attach_window_focus, attach_window_fullscreen,
    attach_window_orientation, attach_window_render_context, attach_window_render_state,
    attach_window_resize, attach_window_visibility, center_window, close_window,
    compute_window_device_transform, create_application_window, create_application_window_signals,
    create_native_window_backend, detach_window_close, detach_window_drop_file,
    detach_window_focus, detach_window_fullscreen, detach_window_orientation,
    detach_window_render_context, detach_window_render_state, detach_window_resize,
    detach_window_visibility, dispose_application_window, focus_window, get_window_backend,
    get_window_bounds, hide_window, maximize_window, minimize_window, open_window,
    request_window_attention, request_window_close, restore_window, set_window_always_on_top,
    set_window_backend, set_window_fullscreen, set_window_icon, set_window_maximum_size,
    set_window_menu_bar_visible, set_window_minimum_size, set_window_opacity, set_window_parent,
    set_window_position, set_window_progress, set_window_resizable, set_window_size,
    set_window_skip_taskbar, set_window_title, show_window,
};
