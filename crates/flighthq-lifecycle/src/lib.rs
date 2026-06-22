//! `flighthq-lifecycle` — application foreground/background lifecycle state
//! and resume/pause/back signals over a swappable backend.
//!
//! The [`AppLifecycle`] entity holds four signals: `on_state_change`,
//! `on_resume`, `on_pause`, and `on_back_button`. Call
//! [`attach_app_lifecycle`] to start delivery; call
//! [`detach_app_lifecycle`] or [`dispose_app_lifecycle`] to stop it. The
//! active backend defaults to a no-op stub that reports
//! [`AppLifecycleState::Active`]; a native host installs its own via
//! [`set_lifecycle_backend`]. The stub never drives `on_back_button`; native
//! hosts emit it through their own backend.

pub mod lifecycle;

pub use lifecycle::{
    attach_app_lifecycle, create_app_lifecycle, detach_app_lifecycle, dispose_app_lifecycle,
    get_app_lifecycle_state, get_lifecycle_backend, set_lifecycle_backend,
};
