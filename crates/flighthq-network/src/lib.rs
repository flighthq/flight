//! `flighthq-network` — connectivity status and online/offline signals over a
//! swappable backend.
//!
//! The [`Network`] entity holds three signals: `on_change`, `on_online`, and
//! `on_offline`. Call [`attach_network`] to start delivery; call
//! [`detach_network`] or [`dispose_network`] to stop it. The active backend
//! defaults to a no-op stub that reports `online = true`; a native host
//! installs its own via [`set_network_backend`].

pub mod network;

pub use network::{
    attach_network, create_network, create_network_status, detach_network, dispose_network,
    get_network_backend, get_network_status, is_network_online, set_network_backend,
};
