//! Web shell backend — opens external URLs/paths, reveal, trash, beep.
//!
//! Stub scaffold: a capability agent ports the TS `packages/shell` web backend
//! (sync `window.open(...)`) into a `ShellBackend` implementation here and wires
//! `set_web_shell_backend` to install it through `flighthq_shell`.

/// Installs the web shell backend as the active `flighthq-shell` backend.
///
/// `TODO(host-web)`: empty scaffold — the capability agent fills the body once
/// the `ShellBackend` web implementation lands in this module.
pub fn register_web_shell_backend() {}
