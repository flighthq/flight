//! `flighthq-platform` — root platform identification seam.
//!
//! Free functions report the running platform (OS name, desktop/mobile/web kind,
//! arch, locale, touch) by delegating to the active [`PlatformBackend`]. A native
//! default backend is lazily installed and answers from `std::env::consts` and
//! `cfg!` macros, so every function works without a host. A real host
//! (Electron/Tauri/Capacitor/native shell) replaces it via
//! [`platform::set_platform_backend`].

pub mod platform;

pub use platform::{
    create_native_platform_backend, create_platform_info, get_platform_backend, get_platform_info,
    get_platform_kind, get_platform_name, is_platform_desktop, is_platform_mobile,
    is_platform_touch, is_platform_web, set_platform_backend,
};
