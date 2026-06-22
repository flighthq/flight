//! `flighthq-notification` — OS notifications over a swappable backend.
//!
//! Free functions delegate to the active [`NotificationBackend`]. `notify` and
//! `request_notification_permission` resolve to `false` when the host lacks the
//! surface or the user denies permission — denial is an expected outcome, not a
//! programmer error. Click and action subscriptions return unsubscribe closures.

pub mod notification;

pub use notification::{
    get_notification_backend, is_notification_supported, on_notification_action,
    on_notification_click, request_notification_permission, set_notification_backend,
    show_notification,
};
