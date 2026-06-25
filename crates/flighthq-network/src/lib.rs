//! `flighthq-network` — connectivity status and online/offline signals over a
//! swappable backend.
//!
//! The [`Network`] entity holds five signals: `on_change`, `on_online`,
//! `on_offline`, `on_connection_type_change`, and `on_metered_change`. Call
//! [`attach_network`] to start delivery; call [`detach_network`] or
//! [`dispose_network`] to stop it. The active backend defaults to a no-op stub
//! that reports `online = true`; a native host installs its own via
//! [`set_network_backend`].

pub mod network;

pub use network::{
    attach_network, create_network, create_network_status, detach_network, dispose_network,
    get_network_backend, get_network_status, has_network_status_changed, is_network_metered,
    is_network_online, is_network_save_data_enabled, probe_network_reachability,
    set_network_backend,
};
