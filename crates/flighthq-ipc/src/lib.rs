//! `flighthq-ipc` — inter-process messaging over a swappable backend.
//!
//! Free functions delegate to the active [`IpcBackend`]. The default stub
//! is a no-op (no main process): `send_ipc_message` does nothing,
//! `invoke_ipc` resolves to `None`, and `on_ipc_message` returns an inert
//! unsubscribe. A native host installs a real backend via
//! [`set_ipc_backend`].

pub mod ipc;

pub use ipc::{get_ipc_backend, invoke_ipc, on_ipc_message, send_ipc_message, set_ipc_backend};
