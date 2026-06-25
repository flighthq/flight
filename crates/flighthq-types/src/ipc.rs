//! Inter-process messaging seam types.
//!
//! Free functions in `flighthq-ipc` delegate to the active [`IpcBackend`]
//! (defined in [`crate::platform`]); these are the value types that travel
//! across that seam. A channel is a string name (or an [`IpcChannel`]
//! descriptor), an invoke can be bounded by a timeout that yields an
//! [`IpcTimeoutError`], and a host may report its [`IpcBackendCapabilities`]
//! and deliver a richer [`IpcMessageEvent`] with a reply path.

use std::fmt;

use flighthq_signals::Signal;

/// A typed channel descriptor. Functions that accept a channel string also
/// accept an `IpcChannel`, so a feature can publish its channel constants once
/// and get a single grep target.
#[derive(Clone, Debug, PartialEq, Eq, Hash, Default)]
pub struct IpcChannel {
    pub name: String,
}

/// What a host IPC backend can do. The lazy native default reports every
/// capability as `false` (no main process); a real host reports `true` for the
/// surfaces it implements.
#[derive(Copy, Clone, Debug, PartialEq, Eq, Default)]
pub struct IpcBackendCapabilities {
    pub can_handle: bool,
    pub can_invoke: bool,
    pub can_send: bool,
    pub can_target: bool,
}

/// Identifies a specific target window/process for a targeted send.
#[derive(Copy, Clone, Debug, PartialEq, Eq, Hash, Default)]
pub struct IpcTarget {
    pub window_id: i64,
}

/// A received IPC message, carrying the channel, the sender id (`-1` when the
/// backend does not report one), the argument list, and a reply path that
/// targets the sender. `reply` is a no-op when `sender_id` is `-1`.
pub struct IpcMessageEvent {
    pub channel: String,
    pub sender_id: i64,
    pub args: Vec<crate::IpcValue>,
    /// Sends a reply back to the sender. No-ops when `sender_id` is `-1`.
    #[allow(clippy::type_complexity)]
    pub reply: Box<dyn Fn(&[crate::IpcValue]) + Send + Sync>,
}

impl fmt::Debug for IpcMessageEvent {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("IpcMessageEvent")
            .field("channel", &self.channel)
            .field("sender_id", &self.sender_id)
            .field("args_len", &self.args.len())
            .finish()
    }
}

/// The optional IpcSignals group, activated by `enable_ipc_signals`. `on_backend_changed`
/// fires when the active backend is swapped; `on_channel_message` carries the channel name
/// of every received message.
#[derive(Clone, Debug, Default)]
pub struct IpcSignals {
    pub on_backend_changed: Signal<()>,
    pub on_channel_message: Signal<String>,
}

/// The error an `invoke_ipc_with_timeout` produces when the host does not
/// respond within the deadline. Carries the channel and the elapsed budget.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct IpcTimeoutError {
    pub channel: String,
    pub timeout_ms: u64,
}

impl IpcTimeoutError {
    pub fn new(channel: impl Into<String>, timeout_ms: u64) -> Self {
        Self {
            channel: channel.into(),
            timeout_ms,
        }
    }
}

impl fmt::Display for IpcTimeoutError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(
            f,
            "IPC invoke on channel '{}' timed out after {}ms",
            self.channel, self.timeout_ms
        )
    }
}

impl std::error::Error for IpcTimeoutError {}
