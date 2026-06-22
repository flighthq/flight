//! `flighthq-updater` — application auto-update lifecycle signals (checking,
//! available, progress, downloaded, error) over a swappable backend.
//!
//! Free functions delegate to the active [`UpdaterBackend`]. A no-op stub is
//! used when no backend has been installed; real hosts supply a backend via
//! [`set_updater_backend`]. The [`AppUpdater`] event entity carries six
//! signals that stay inert until [`attach_app_updater`] wires them to the
//! backend.

pub mod updater;

pub use updater::{
    attach_app_updater, check_for_updates, create_app_updater, create_web_updater_backend,
    detach_app_updater, dispose_app_updater, download_update, get_updater_backend,
    quit_and_install_update, set_updater_backend, set_updater_feed_url,
};
