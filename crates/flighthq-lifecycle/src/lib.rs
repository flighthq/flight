//! `flighthq-lifecycle` — application foreground/background lifecycle state
//! and resume/pause/back/memory/save-restore signals over a swappable backend.
//!
//! The [`AppLifecycle`] entity holds seven signals: `on_state_change`,
//! `on_resume`, `on_pause`, `on_back_button`, `on_memory_warning`,
//! `on_save_state`, and `on_restore_state`. Call [`attach_app_lifecycle`] to
//! start delivery; call [`detach_app_lifecycle`] or [`dispose_app_lifecycle`]
//! to stop it. The active backend defaults to a no-op stub that reports
//! [`AppLifecycleState::Active`]; a native host installs its own via
//! [`set_lifecycle_backend`]. The stub never drives `on_back_button`; native
//! hosts emit it through their own backend.
//!
//! The web backend (`createWebLifecycleBackend` in TS) is a browser-only
//! concern that lives in `host-web`, not in this native-core crate; the seam is
//! the [`LifecycleBackend`](flighthq_types::LifecycleBackend) trait.

pub mod lifecycle;

pub use lifecycle::{
    attach_app_lifecycle, create_app_lifecycle, detach_app_lifecycle, dispose_app_lifecycle,
    get_app_launch_kind, get_app_lifecycle_state, get_lifecycle_backend, is_app_active,
    is_app_background, is_app_inactive, request_app_back, set_lifecycle_backend,
};
