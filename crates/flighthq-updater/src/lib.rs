//! `flighthq-updater` — application auto-update lifecycle signals (checking,
//! available, progress, downloaded, error) over a swappable backend.
//!
//! Free functions delegate to the active [`UpdaterBackend`]. A no-op stub is
//! used when no backend has been installed; real hosts supply a backend via
//! [`set_updater_backend`]. The [`AppUpdater`] event entity carries ten signals
//! that stay inert until [`attach_app_updater`] wires them to the backend, and a
//! queryable [`flighthq_types::UpdaterState`] read via [`get_app_updater_state`].

pub mod updater;

pub use updater::{
    attach_app_updater, cancel_app_update_download, check_and_download_app_update,
    check_for_app_update, create_app_updater, create_updater_config, create_updater_state,
    create_web_updater_backend, detach_app_updater, dispose_app_updater, download_app_update,
    get_app_updater_state, get_updater_backend, get_updater_channel, get_updater_config,
    is_app_update_eligible, quit_and_install_update, rollback_app_update, set_updater_backend,
    set_updater_channel, set_updater_config, set_updater_feed_url, set_updater_signature_config,
};
