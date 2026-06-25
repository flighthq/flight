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
    NativeAppBackend, add_app_recent_document, attach_app, bounce_app_dock, cancel_app_attention,
    cancel_app_dock_bounce, clear_app_recent_documents, create_app, create_app_login_item,
    detach_app, dispose_app, focus_app, get_app_backend, get_app_command_line,
    get_app_command_line_switch, get_app_directory_path, get_app_executable_path, get_app_locale,
    get_app_login_item, get_app_name, get_app_path, get_app_preferred_system_languages,
    get_app_system_locale, get_app_version, has_app_command_line_switch,
    has_app_single_instance_lock, hide_app, is_app_hidden, quit_app, relaunch_app,
    release_app_single_instance_lock, request_app_attention, request_app_single_instance_lock,
    set_app_activation_policy, set_app_backend, set_app_badge_count, set_app_dock_badge,
    set_app_dock_menu, set_app_login_item, set_app_name, set_app_user_model_id, show_app,
};
