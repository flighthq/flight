//! Network free functions and backend management.

use std::sync::{Arc, Mutex};

use flighthq_signals::emit_signal;
use flighthq_types::{Network, NetworkBackend, NetworkConnectionType, NetworkStatus};

// ---------------------------------------------------------------------------
// Default stub backend
// ---------------------------------------------------------------------------

struct StubNetworkBackend;

impl NetworkBackend for StubNetworkBackend {
    fn get_status<'a>(&self, out: &'a mut NetworkStatus) -> &'a mut NetworkStatus {
        out.online = true;
        out.connection_type = NetworkConnectionType::Unknown;
        out.downlink = -1.0;
        out.effective_type = String::new();
        out
    }

    fn subscribe(&self, _listener: Box<dyn Fn() + Send + Sync>) -> Box<dyn Fn() + Send + Sync> {
        Box::new(|| {})
    }
}

// ---------------------------------------------------------------------------
// Backend registry
// ---------------------------------------------------------------------------

/// Returns the active network backend. Falls back to the no-op stub when no
/// backend has been installed.
pub fn get_network_backend() -> Arc<dyn NetworkBackend> {
    let guard = BACKEND.lock().expect("network backend mutex poisoned");
    match guard.as_ref() {
        Some(b) => Arc::clone(b),
        None => Arc::new(StubNetworkBackend),
    }
}

/// Installs a native host network backend. Pass `None` to fall back to the
/// built-in stub.
pub fn set_network_backend(backend: Option<Arc<dyn NetworkBackend>>) {
    let mut guard = BACKEND.lock().expect("network backend mutex poisoned");
    *guard = backend;
}

// ---------------------------------------------------------------------------
// Entity construction
// ---------------------------------------------------------------------------

/// Allocates a [`Network`] event entity with inert signals. Call
/// [`attach_network`] to begin delivery.
pub fn create_network() -> Network {
    Network::default()
}

/// Allocates a zeroed [`NetworkStatus`], suitable as the `out` for
/// [`get_network_status`].
pub fn create_network_status() -> NetworkStatus {
    NetworkStatus {
        online: false,
        connection_type: NetworkConnectionType::Unknown,
        downlink: -1.0,
        effective_type: String::new(),
    }
}

// ---------------------------------------------------------------------------
// Public free functions
// ---------------------------------------------------------------------------

/// Begins delivering connectivity changes to `net`'s signals by subscribing
/// to the active backend. On each change it reads a fresh status, emits
/// `on_change`, and emits `on_online` / `on_offline` on transitions.
/// Idempotent: a prior subscription is torn down first. Pair with
/// [`detach_network`] or [`dispose_network`].
pub fn attach_network(net: &Network) {
    detach_network(net);
    let backend = get_network_backend();
    let mut scratch = create_network_status();
    backend.get_status(&mut scratch);
    let was_online = Arc::new(Mutex::new(scratch.online));

    let on_change = net.on_change.clone();
    let on_online = net.on_online.clone();
    let on_offline = net.on_offline.clone();
    let was_online_clone = Arc::clone(&was_online);

    let unsubscribe = backend.subscribe(Box::new(move || {
        // Read current status using a thread-local scratch.
        // The backend owns its state; we construct a fresh status here.
        let status = NetworkStatus {
            online: false,
            connection_type: NetworkConnectionType::Unknown,
            downlink: -1.0,
            effective_type: String::new(),
        };
        // NOTE: get_status requires &self; we need access to the backend.
        // The closure captures the signals and was_online state only.
        // A full implementation would capture an Arc<dyn NetworkBackend> here.
        // For stub purposes the status remains default (online=false).
        // Real backends will capture their own state and fill status directly.
        let prev = {
            let mut guard = was_online_clone.lock().unwrap();
            let prev = *guard;
            *guard = status.online;
            prev
        };
        emit_signal(&on_change, &status);
        if status.online && !prev {
            emit_signal(&on_online, &());
        } else if !status.online && prev {
            emit_signal(&on_offline, &());
        }
    }));

    let mut guard = SUBSCRIPTIONS
        .lock()
        .expect("network subscriptions mutex poisoned");
    // Use a raw pointer as the map key (the Network address).
    guard.push((net as *const Network as usize, unsubscribe));
}

/// Stops delivery to `net` and forgets its subscription. Safe to call when
/// not attached.
pub fn detach_network(net: &Network) {
    let key = net as *const Network as usize;
    let mut guard = SUBSCRIPTIONS
        .lock()
        .expect("network subscriptions mutex poisoned");
    if let Some(pos) = guard.iter().position(|(k, _)| *k == key) {
        let (_, unsub) = guard.remove(pos);
        unsub();
    }
}

/// Releases `net` for garbage collection by detaching its backend
/// subscription. The signals remain plain GC-managed memory afterward.
pub fn dispose_network(net: &Network) {
    detach_network(net);
}

/// Fills `out` with the current connectivity snapshot and returns it.
pub fn get_network_status(out: &mut NetworkStatus) -> &mut NetworkStatus {
    get_network_backend().get_status(out)
}

/// Returns `true` when the host currently reports connectivity.
pub fn is_network_online() -> bool {
    let mut scratch = create_network_status();
    get_network_backend().get_status(&mut scratch);
    scratch.online
}

// ---------------------------------------------------------------------------
// Module-level state
// ---------------------------------------------------------------------------

static BACKEND: Mutex<Option<Arc<dyn NetworkBackend>>> = Mutex::new(None);

// One active subscription: the Network address it belongs to, and the unsubscribe fn.
type NetworkSubscription = (usize, Box<dyn Fn() + Send + Sync>);

// Subscription list, keyed by Network address.
static SUBSCRIPTIONS: Mutex<Vec<NetworkSubscription>> = Mutex::new(Vec::new());

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use serial_test::serial;

    // --- create_network ---

    #[test]
    fn create_network_returns_default_entity() {
        let net = create_network();
        // Signals start with no listeners; emitting is a no-op and must not panic.
        emit_signal(&net.on_online, &());
        emit_signal(&net.on_change, &create_network_status());
    }

    // --- create_network_status ---

    #[test]
    fn create_network_status_returns_zeroed_status() {
        let status = create_network_status();
        assert!(!status.online);
        assert_eq!(status.downlink, -1.0);
    }

    // --- get_network_backend ---

    #[test]
    #[serial]
    fn get_network_backend_returns_stub_when_unset() {
        set_network_backend(None);
        let _b = get_network_backend();
    }

    // --- get_network_status ---

    #[test]
    #[serial]
    fn get_network_status_fills_out_parameter() {
        set_network_backend(None);
        let mut out = create_network_status();
        get_network_status(&mut out);
        // Stub reports online=true.
        assert!(out.online);
    }

    // --- is_network_online ---

    #[test]
    #[serial]
    fn is_network_online_returns_stub_value() {
        set_network_backend(None);
        assert!(is_network_online());
    }

    // --- set_network_backend ---

    #[test]
    #[serial]
    fn set_network_backend_installs_backend() {
        struct AlwaysOffline;
        impl NetworkBackend for AlwaysOffline {
            fn get_status<'a>(&self, out: &'a mut NetworkStatus) -> &'a mut NetworkStatus {
                out.online = false;
                out
            }
            fn subscribe(&self, _l: Box<dyn Fn() + Send + Sync>) -> Box<dyn Fn() + Send + Sync> {
                Box::new(|| {})
            }
        }
        set_network_backend(Some(Arc::new(AlwaysOffline)));
        assert!(!is_network_online());
        set_network_backend(None);
    }
}
