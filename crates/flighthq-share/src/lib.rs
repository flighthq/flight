//! `flighthq-share` — native share sheet over a swappable backend.
//!
//! Ports the TypeScript `@flighthq/share` package. `share` resolves to `false`
//! when the host denies, cancels, or lacks the capability — an expected-failure
//! surface, not a programmer error.
//!
//! There is always a backend: [`get_share_backend`] lazily installs a sentinel
//! web default that returns `false` until a native host installs its own via
//! [`set_share_backend`].

pub mod share;

pub use share::{
    attach_share_signals, can_share_content, create_web_share_backend, detach_share_signals,
    dispose_share_signals, enable_share_signals, get_share_backend, is_share_available,
    is_share_content_valid, set_share_backend, share_content, share_content_with_result,
    share_text, share_url,
};
