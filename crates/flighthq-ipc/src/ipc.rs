//! IPC free functions and backend management.

use std::any::Any;
use std::future::Future;
use std::pin::Pin;
use std::sync::{Arc, Mutex};

use flighthq_types::IpcBackend;

// ---------------------------------------------------------------------------
// Default stub backend
// ---------------------------------------------------------------------------

struct StubIpcBackend;

impl IpcBackend for StubIpcBackend {
    fn send(&self, _channel: &str, _args: &[Box<dyn Any + Send + Sync>]) {
        // No main process on native without a host; fire and forget.
    }

    fn invoke(
        &self,
        _channel: &str,
        _args: &[Box<dyn Any + Send + Sync>],
    ) -> Pin<Box<dyn Future<Output = Option<Box<dyn Any + Send + Sync>>> + Send>> {
        Box::pin(async { None })
    }

    fn subscribe(
        &self,
        _channel: &str,
        _listener: Box<dyn Fn(Vec<Box<dyn Any + Send + Sync>>) + Send + Sync>,
    ) -> Box<dyn Fn() + Send + Sync> {
        Box::new(|| {})
    }
}

// ---------------------------------------------------------------------------
// Backend registry
// ---------------------------------------------------------------------------

/// Returns the active IPC backend. Falls back to the no-op stub when no
/// backend has been installed.
pub fn get_ipc_backend() -> Arc<dyn IpcBackend> {
    let guard = BACKEND.lock().expect("ipc backend mutex poisoned");
    match guard.as_ref() {
        Some(b) => Arc::clone(b),
        None => Arc::new(StubIpcBackend),
    }
}

/// Installs a native host IPC backend. Pass `None` to fall back to the
/// built-in no-op stub.
pub fn set_ipc_backend(backend: Option<Arc<dyn IpcBackend>>) {
    let mut guard = BACKEND.lock().expect("ipc backend mutex poisoned");
    *guard = backend;
}

// ---------------------------------------------------------------------------
// Public free functions
// ---------------------------------------------------------------------------

/// Sends a request on `channel` and resolves with the host's response, or
/// `None` when no backend is installed.
pub async fn invoke_ipc(
    channel: &str,
    args: &[Box<dyn Any + Send + Sync>],
) -> Option<Box<dyn Any + Send + Sync>> {
    get_ipc_backend().invoke(channel, args).await
}

/// Subscribes `listener` to messages on `channel`; returns an unsubscribe
/// function. The listener receives the argument list as a `Vec`.
pub fn on_ipc_message(
    channel: &str,
    listener: Box<dyn Fn(Vec<Box<dyn Any + Send + Sync>>) + Send + Sync>,
) -> Box<dyn Fn() + Send + Sync> {
    get_ipc_backend().subscribe(channel, listener)
}

/// Sends a fire-and-forget message on `channel`. No-ops when no backend is
/// installed.
pub fn send_ipc_message(channel: &str, args: &[Box<dyn Any + Send + Sync>]) {
    get_ipc_backend().send(channel, args);
}

// ---------------------------------------------------------------------------
// Module-level state
// ---------------------------------------------------------------------------

static BACKEND: Mutex<Option<Arc<dyn IpcBackend>>> = Mutex::new(None);

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use serial_test::serial;

    struct EchoBackend;

    impl IpcBackend for EchoBackend {
        fn send(&self, _channel: &str, _args: &[Box<dyn Any + Send + Sync>]) {}

        fn invoke(
            &self,
            _channel: &str,
            _args: &[Box<dyn Any + Send + Sync>],
        ) -> Pin<Box<dyn Future<Output = Option<Box<dyn Any + Send + Sync>>> + Send>> {
            Box::pin(async {
                let val: Box<dyn Any + Send + Sync> = Box::new(42u32);
                Some(val)
            })
        }

        fn subscribe(
            &self,
            _channel: &str,
            _listener: Box<dyn Fn(Vec<Box<dyn Any + Send + Sync>>) + Send + Sync>,
        ) -> Box<dyn Fn() + Send + Sync> {
            Box::new(|| {})
        }
    }

    // --- get_ipc_backend ---

    #[test]
    #[serial]
    fn get_ipc_backend_returns_stub_when_unset() {
        // Clearing any previously installed backend.
        set_ipc_backend(None);
        // Should not panic — falls back to stub.
        let _b = get_ipc_backend();
    }

    // --- send_ipc_message ---

    #[test]
    #[serial]
    fn send_ipc_message_does_not_panic_with_stub() {
        set_ipc_backend(None);
        send_ipc_message("test-channel", &[]);
    }

    // --- set_ipc_backend ---

    #[test]
    #[serial]
    fn set_ipc_backend_installs_backend() {
        set_ipc_backend(Some(Arc::new(EchoBackend)));
        let _b = get_ipc_backend();
        set_ipc_backend(None);
    }
}
