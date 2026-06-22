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
    can_share_content, create_web_share_backend, get_share_backend, set_share_backend,
    share_content,
};
