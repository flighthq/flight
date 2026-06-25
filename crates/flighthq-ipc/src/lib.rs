//! `flighthq-ipc` — inter-process messaging over a swappable backend.
//!
//! Free functions delegate to the active [`IpcBackend`]. The default stub
//! is a no-op (no main process): `send_ipc_message` does nothing,
//! `invoke_ipc` resolves to `None`, and `on_ipc_message` returns an inert
//! unsubscribe. A native host installs a real backend via
//! [`set_ipc_backend`].

pub mod ipc;

pub use ipc::{
    create_ipc_channel, enable_ipc_signals, get_ipc_backend, get_ipc_listener_count,
    get_ipc_signals, has_ipc_backend, invoke_ipc, invoke_ipc_with_timeout, on_ipc_invoke,
    on_ipc_message, on_ipc_message_event, once_ipc_message, remove_all_ipc_listeners,
    remove_all_ipc_listeners_for_all_channels, send_ipc_message, send_ipc_message_to,
    set_ipc_backend,
};
