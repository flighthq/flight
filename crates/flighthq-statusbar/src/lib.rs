//! `flighthq-statusbar` — mobile status-bar control over a swappable backend.
//!
//! Ports the TypeScript `@flighthq/statusbar` package. There is always a
//! backend: a lazily created web default, swappable by a native host. Web has no
//! real status bar; the default is a sentinel that no-ops every command. The
//! TS web backend's only observable effect — upserting a `<meta theme-color>`
//! hint in `set_background_color` — is DOM-bound and owned by `host-web`.

pub mod statusbar;

pub use statusbar::{
    create_web_status_bar_backend, get_status_bar_backend, set_status_bar_backend,
    set_status_bar_color, set_status_bar_overlays_content, set_status_bar_style,
    set_status_bar_visible,
};
