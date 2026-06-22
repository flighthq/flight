//! `flighthq-app` — application identity, lifecycle control, single-instance
//! locking, dock control, and app event signals over a swappable backend.
//!
//! Free functions delegate to the active [`AppBackend`]. The default backend is
//! [`NativeAppBackend`], which serves application identity, lifecycle control,
//! and a file-based single-instance lock from `std`; host-only capabilities
//! return clean sentinels until a native host supplies a backend via
//! [`set_app_backend`]. The [`App`] event entity carries three signals
//! ([`App::on_activate`], [`App::on_open_file`], [`App::on_second_instance`])
//! that stay inert until [`attach_app`] wires them to the backend.

pub mod app;

pub use app::{
    NativeAppBackend, attach_app, bounce_app_dock, cancel_app_dock_bounce, create_app, detach_app,
    dispose_app, focus_app, get_app_backend, get_app_locale, get_app_name, get_app_version,
    has_app_single_instance_lock, quit_app, relaunch_app, release_app_single_instance_lock,
    request_app_single_instance_lock, set_app_backend, set_app_badge_count, set_app_dock_badge,
    set_app_dock_menu,
};
