//! Network free functions and backend management.

use std::sync::{Arc, Mutex};

use flighthq_signals::emit_signal;
use flighthq_types::{
    Network, NetworkBackend, NetworkConnectionType, NetworkReachability,
    NetworkReachabilityOptions, NetworkStatus,
};

// ---------------------------------------------------------------------------
// Default stub backend
// ---------------------------------------------------------------------------

struct StubNetworkBackend;

impl NetworkBackend for StubNetworkBackend {
    fn get_status<'a>(&self, out: &'a mut NetworkStatus) -> &'a mut NetworkStatus {
        out.online = true;
        out.connection_type = NetworkConnectionType::Unknown;
        out.downlink = -1.0;
        out.downlink_max = -1.0;
        out.effective_type = String::new();
        out.rtt = -1.0;
        out.save_data = false;
        out.metered = false;
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

/// Allocates a zeroed [`NetworkStatus`] with all fields at sentinel values,
/// suitable as the `out` for [`get_network_status`].
pub fn create_network_status() -> NetworkStatus {
    NetworkStatus {
        online: false,
        connection_type: NetworkConnectionType::Unknown,
        downlink: -1.0,
        downlink_max: -1.0,
        effective_type: String::new(),
        rtt: -1.0,
        save_data: false,
        metered: false,
    }
}

// ---------------------------------------------------------------------------
// Public free functions
// ---------------------------------------------------------------------------

/// Begins delivering connectivity changes to `net`'s signals by subscribing to
/// the active backend. On each change it reads a fresh status, emits
/// `on_change`, and emits the edge-triggered `on_online` / `on_offline` /
/// `on_connection_type_change` / `on_metered_change` signals. Idempotent: a
/// prior subscription is torn down first. Pair with [`detach_network`] or
/// [`dispose_network`].
pub fn attach_network(net: &Network) {
    detach_network(net);
    let backend = get_network_backend();

    let mut initial = create_network_status();
    backend.get_status(&mut initial);
    let was = Arc::new(Mutex::new((
        initial.online,
        initial.connection_type,
        initial.metered,
    )));

    let on_change = net.on_change.clone();
    let on_online = net.on_online.clone();
    let on_offline = net.on_offline.clone();
    let on_connection_type_change = net.on_connection_type_change.clone();
    let on_metered_change = net.on_metered_change.clone();
    let was_clone = Arc::clone(&was);
    let backend_clone = Arc::clone(&backend);

    let unsubscribe = backend.subscribe(Box::new(move || {
        let mut status = create_network_status();
        backend_clone.get_status(&mut status);

        emit_signal(&on_change, &status);

        let (prev_online, prev_type, prev_metered) = {
            let guard = was_clone.lock().unwrap();
            *guard
        };
        if status.online != prev_online {
            if status.online {
                emit_signal(&on_online, &());
            } else {
                emit_signal(&on_offline, &());
            }
        }
        if status.connection_type != prev_type {
            emit_signal(&on_connection_type_change, &status.connection_type);
        }
        if status.metered != prev_metered {
            emit_signal(&on_metered_change, &status.metered);
        }

        let mut guard = was_clone.lock().unwrap();
        *guard = (status.online, status.connection_type, status.metered);
    }));

    let mut guard = SUBSCRIPTIONS
        .lock()
        .expect("network subscriptions mutex poisoned");
    // Use the Network address as the subscription key.
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

/// Returns `true` if any field of the two status snapshots differs.
/// Alias-safe: comparing a status with itself returns `false`.
pub fn has_network_status_changed(a: &NetworkStatus, b: &NetworkStatus) -> bool {
    a.online != b.online
        || a.connection_type != b.connection_type
        || a.downlink != b.downlink
        || a.downlink_max != b.downlink_max
        || a.effective_type != b.effective_type
        || a.rtt != b.rtt
        || a.save_data != b.save_data
        || a.metered != b.metered
}

/// Returns `true` when the connection is metered (cellular or save-data is
/// set). Convenience over [`get_network_status`].
pub fn is_network_metered() -> bool {
    let mut scratch = create_network_status();
    get_network_backend().get_status(&mut scratch);
    scratch.metered
}

/// Returns `true` when the host currently reports connectivity. Convenience
/// over [`get_network_status`].
pub fn is_network_online() -> bool {
    let mut scratch = create_network_status();
    get_network_backend().get_status(&mut scratch);
    scratch.online
}

/// Returns `true` when the user or OS has requested reduced data usage.
/// Convenience over [`get_network_status`].
pub fn is_network_save_data_enabled() -> bool {
    let mut scratch = create_network_status();
    get_network_backend().get_status(&mut scratch);
    scratch.save_data
}

/// Performs a one-shot reachability probe against the given URL using the
/// active backend's `probe_reachability`. Writes the result into `out` and
/// returns it. Returns a sentinel (`reachable = false`, `latency = -1`) when the
/// backend does not provide a probe implementation, rather than panicking.
///
/// NOTE: a network interface being up reports an interface, not internet
/// reachability. Use this function to distinguish "an interface is up" from
/// "the internet is actually reachable."
pub fn probe_network_reachability<'a>(
    options: &NetworkReachabilityOptions,
    out: &'a mut NetworkReachability,
) -> &'a mut NetworkReachability {
    let backend = get_network_backend();
    if backend.probe_reachability(options, out).is_some() {
        return out;
    }
    out.reachable = false;
    out.latency = -1.0;
    out
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

    // A fake backend whose reported status is shared and mutable, with a `fire`
    // that re-invokes the registered listener. Mirrors the TS test `fakeBackend`.
    struct FakeNetworkBackend {
        status: Arc<Mutex<NetworkStatus>>,
        listener: Arc<Mutex<Option<Box<dyn Fn() + Send + Sync>>>>,
    }

    impl FakeNetworkBackend {
        fn new(status: NetworkStatus) -> Arc<Self> {
            Arc::new(FakeNetworkBackend {
                status: Arc::new(Mutex::new(status)),
                listener: Arc::new(Mutex::new(None)),
            })
        }

        fn set_status(&self, mutate: impl FnOnce(&mut NetworkStatus)) {
            let mut s = self.status.lock().unwrap();
            mutate(&mut s);
        }

        fn fire(&self) {
            let guard = self.listener.lock().unwrap();
            if let Some(l) = guard.as_ref() {
                l();
            }
        }
    }

    impl NetworkBackend for FakeNetworkBackend {
        fn get_status<'a>(&self, out: &'a mut NetworkStatus) -> &'a mut NetworkStatus {
            let s = self.status.lock().unwrap();
            *out = s.clone();
            out
        }

        fn subscribe(&self, listener: Box<dyn Fn() + Send + Sync>) -> Box<dyn Fn() + Send + Sync> {
            *self.listener.lock().unwrap() = Some(listener);
            let slot = Arc::clone(&self.listener);
            Box::new(move || {
                *slot.lock().unwrap() = None;
            })
        }
    }

    fn online_status() -> NetworkStatus {
        NetworkStatus {
            online: true,
            connection_type: NetworkConnectionType::Wifi,
            downlink: 10.0,
            downlink_max: 100.0,
            effective_type: "4g".to_string(),
            rtt: 50.0,
            save_data: false,
            metered: false,
        }
    }

    // --- attach_network ---

    #[test]
    #[serial]
    fn attach_network_emits_on_change_and_on_offline_on_transition() {
        let backend = FakeNetworkBackend::new(online_status());
        set_network_backend(Some(backend.clone() as Arc<dyn NetworkBackend>));
        let net = create_network();

        let changes = Arc::new(Mutex::new(0u32));
        let offline = Arc::new(Mutex::new(0u32));
        let c = Arc::clone(&changes);
        let o = Arc::clone(&offline);
        let _g0 = flighthq_signals::connect_signal(
            &net.on_change,
            Arc::new(move |_: &NetworkStatus| *c.lock().unwrap() += 1),
            Default::default(),
        );
        let _g1 = flighthq_signals::connect_signal(
            &net.on_offline,
            Arc::new(move |_: &()| *o.lock().unwrap() += 1),
            Default::default(),
        );

        attach_network(&net);
        backend.set_status(|s| s.online = false);
        backend.fire();

        assert_eq!(*changes.lock().unwrap(), 1);
        assert_eq!(*offline.lock().unwrap(), 1);
        set_network_backend(None);
    }

    #[test]
    #[serial]
    fn attach_network_emits_on_online_on_transition_to_online() {
        let mut start = online_status();
        start.online = false;
        let backend = FakeNetworkBackend::new(start);
        set_network_backend(Some(backend.clone() as Arc<dyn NetworkBackend>));
        let net = create_network();

        let online = Arc::new(Mutex::new(0u32));
        let o = Arc::clone(&online);
        let _g = flighthq_signals::connect_signal(
            &net.on_online,
            Arc::new(move |_: &()| *o.lock().unwrap() += 1),
            Default::default(),
        );

        attach_network(&net);
        backend.set_status(|s| s.online = true);
        backend.fire();

        assert_eq!(*online.lock().unwrap(), 1);
        set_network_backend(None);
    }

    #[test]
    #[serial]
    fn attach_network_emits_on_connection_type_change_on_type_transition() {
        let backend = FakeNetworkBackend::new(online_status());
        set_network_backend(Some(backend.clone() as Arc<dyn NetworkBackend>));
        let net = create_network();

        let types = Arc::new(Mutex::new(Vec::new()));
        let t = Arc::clone(&types);
        let _g = flighthq_signals::connect_signal(
            &net.on_connection_type_change,
            Arc::new(move |ty: &NetworkConnectionType| t.lock().unwrap().push(*ty)),
            Default::default(),
        );

        attach_network(&net);
        backend.set_status(|s| s.connection_type = NetworkConnectionType::Cellular);
        backend.fire();

        assert_eq!(
            *types.lock().unwrap(),
            vec![NetworkConnectionType::Cellular]
        );
        set_network_backend(None);
    }

    #[test]
    #[serial]
    fn attach_network_does_not_emit_connection_type_change_when_unchanged() {
        let backend = FakeNetworkBackend::new(online_status());
        set_network_backend(Some(backend.clone() as Arc<dyn NetworkBackend>));
        let net = create_network();

        let count = Arc::new(Mutex::new(0u32));
        let c = Arc::clone(&count);
        let _g = flighthq_signals::connect_signal(
            &net.on_connection_type_change,
            Arc::new(move |_: &NetworkConnectionType| *c.lock().unwrap() += 1),
            Default::default(),
        );

        attach_network(&net);
        backend.fire();

        assert_eq!(*count.lock().unwrap(), 0);
        set_network_backend(None);
    }

    #[test]
    #[serial]
    fn attach_network_emits_on_metered_change_on_metered_transition() {
        let backend = FakeNetworkBackend::new(online_status());
        set_network_backend(Some(backend.clone() as Arc<dyn NetworkBackend>));
        let net = create_network();

        let metered = Arc::new(Mutex::new(Vec::new()));
        let m = Arc::clone(&metered);
        let _g = flighthq_signals::connect_signal(
            &net.on_metered_change,
            Arc::new(move |v: &bool| m.lock().unwrap().push(*v)),
            Default::default(),
        );

        attach_network(&net);
        backend.set_status(|s| s.metered = true);
        backend.fire();

        assert_eq!(*metered.lock().unwrap(), vec![true]);
        set_network_backend(None);
    }

    #[test]
    #[serial]
    fn attach_network_is_idempotent_replacing_prior_subscription() {
        let backend = FakeNetworkBackend::new(online_status());
        set_network_backend(Some(backend.clone() as Arc<dyn NetworkBackend>));
        let net = create_network();

        let changes = Arc::new(Mutex::new(0u32));
        let c = Arc::clone(&changes);
        let _g = flighthq_signals::connect_signal(
            &net.on_change,
            Arc::new(move |_: &NetworkStatus| *c.lock().unwrap() += 1),
            Default::default(),
        );

        attach_network(&net);
        attach_network(&net);
        backend.fire();

        assert_eq!(*changes.lock().unwrap(), 1);
        set_network_backend(None);
    }

    // --- create_network ---

    #[test]
    fn create_network_creates_entity_with_five_signals() {
        let net = create_network();
        // Emitting on every signal must be a no-op with no listeners and not panic.
        emit_signal(&net.on_change, &create_network_status());
        emit_signal(&net.on_connection_type_change, &NetworkConnectionType::Wifi);
        emit_signal(&net.on_metered_change, &false);
        emit_signal(&net.on_offline, &());
        emit_signal(&net.on_online, &());
    }

    // --- create_network_status ---

    #[test]
    fn create_network_status_zeroes_all_fields_at_sentinel_values() {
        let status = create_network_status();
        assert!(!status.online);
        assert_eq!(status.connection_type, NetworkConnectionType::Unknown);
        assert_eq!(status.downlink, -1.0);
        assert_eq!(status.downlink_max, -1.0);
        assert_eq!(status.effective_type, "");
        assert_eq!(status.rtt, -1.0);
        assert!(!status.save_data);
        assert!(!status.metered);
    }

    // --- detach_network ---

    #[test]
    #[serial]
    fn detach_network_stops_delivery() {
        let backend = FakeNetworkBackend::new(online_status());
        set_network_backend(Some(backend.clone() as Arc<dyn NetworkBackend>));
        let net = create_network();

        let changes = Arc::new(Mutex::new(0u32));
        let c = Arc::clone(&changes);
        let _g = flighthq_signals::connect_signal(
            &net.on_change,
            Arc::new(move |_: &NetworkStatus| *c.lock().unwrap() += 1),
            Default::default(),
        );

        attach_network(&net);
        detach_network(&net);
        backend.fire();

        assert_eq!(*changes.lock().unwrap(), 0);
        set_network_backend(None);
    }

    #[test]
    fn detach_network_is_safe_when_not_attached() {
        let net = create_network();
        detach_network(&net); // must not panic
    }

    // --- dispose_network ---

    #[test]
    fn dispose_network_is_safe_when_not_attached() {
        let net = create_network();
        dispose_network(&net); // must not panic
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

    // --- has_network_status_changed ---

    #[test]
    fn has_network_status_changed_returns_false_for_equal_statuses() {
        let a = create_network_status();
        let b = create_network_status();
        assert!(!has_network_status_changed(&a, &b));
    }

    #[test]
    fn has_network_status_changed_returns_true_when_online_differs() {
        let mut a = create_network_status();
        a.online = true;
        let b = create_network_status();
        assert!(has_network_status_changed(&a, &b));
    }

    #[test]
    fn has_network_status_changed_returns_true_when_type_differs() {
        let mut a = create_network_status();
        a.connection_type = NetworkConnectionType::Wifi;
        let b = create_network_status();
        assert!(has_network_status_changed(&a, &b));
    }

    #[test]
    fn has_network_status_changed_returns_true_when_rtt_differs() {
        let mut a = create_network_status();
        a.rtt = 30.0;
        let b = create_network_status();
        assert!(has_network_status_changed(&a, &b));
    }

    #[test]
    fn has_network_status_changed_returns_true_when_save_data_differs() {
        let mut a = create_network_status();
        a.save_data = true;
        let b = create_network_status();
        assert!(has_network_status_changed(&a, &b));
    }

    #[test]
    fn has_network_status_changed_returns_true_when_metered_differs() {
        let mut a = create_network_status();
        a.metered = true;
        let b = create_network_status();
        assert!(has_network_status_changed(&a, &b));
    }

    #[test]
    fn has_network_status_changed_is_alias_safe() {
        let s = create_network_status();
        assert!(!has_network_status_changed(&s, &s));
    }

    // --- is_network_metered ---

    #[test]
    #[serial]
    fn is_network_metered_returns_false_for_non_metered() {
        let mut status = online_status();
        status.metered = false;
        set_network_backend(Some(
            FakeNetworkBackend::new(status) as Arc<dyn NetworkBackend>
        ));
        assert!(!is_network_metered());
        set_network_backend(None);
    }

    #[test]
    #[serial]
    fn is_network_metered_returns_true_for_metered() {
        let mut status = online_status();
        status.metered = true;
        set_network_backend(Some(
            FakeNetworkBackend::new(status) as Arc<dyn NetworkBackend>
        ));
        assert!(is_network_metered());
        set_network_backend(None);
    }

    // --- is_network_online ---

    #[test]
    #[serial]
    fn is_network_online_returns_false_when_offline() {
        let mut status = online_status();
        status.online = false;
        set_network_backend(Some(
            FakeNetworkBackend::new(status) as Arc<dyn NetworkBackend>
        ));
        assert!(!is_network_online());
        set_network_backend(None);
    }

    #[test]
    #[serial]
    fn is_network_online_returns_true_when_online() {
        let mut status = online_status();
        status.online = true;
        set_network_backend(Some(
            FakeNetworkBackend::new(status) as Arc<dyn NetworkBackend>
        ));
        assert!(is_network_online());
        set_network_backend(None);
    }

    // --- is_network_save_data_enabled ---

    #[test]
    #[serial]
    fn is_network_save_data_enabled_returns_false_when_off() {
        let mut status = online_status();
        status.save_data = false;
        set_network_backend(Some(
            FakeNetworkBackend::new(status) as Arc<dyn NetworkBackend>
        ));
        assert!(!is_network_save_data_enabled());
        set_network_backend(None);
    }

    #[test]
    #[serial]
    fn is_network_save_data_enabled_returns_true_when_on() {
        let mut status = online_status();
        status.save_data = true;
        set_network_backend(Some(
            FakeNetworkBackend::new(status) as Arc<dyn NetworkBackend>
        ));
        assert!(is_network_save_data_enabled());
        set_network_backend(None);
    }

    // --- probe_network_reachability ---

    #[test]
    #[serial]
    fn probe_network_reachability_returns_sentinel_without_backend_probe() {
        // The fake backend does not implement probe_reachability, so the
        // default returns the sentinel rather than panicking.
        set_network_backend(Some(
            FakeNetworkBackend::new(online_status()) as Arc<dyn NetworkBackend>
        ));
        let options = NetworkReachabilityOptions {
            url: "https://example.com".to_string(),
            timeout: None,
        };
        let mut out = NetworkReachability {
            reachable: true,
            latency: 0.0,
        };
        probe_network_reachability(&options, &mut out);
        assert!(!out.reachable);
        assert_eq!(out.latency, -1.0);
        set_network_backend(None);
    }

    #[test]
    #[serial]
    fn probe_network_reachability_uses_backend_probe_when_available() {
        struct ProbeBackend;
        impl NetworkBackend for ProbeBackend {
            fn get_status<'a>(&self, out: &'a mut NetworkStatus) -> &'a mut NetworkStatus {
                out
            }
            fn subscribe(&self, _l: Box<dyn Fn() + Send + Sync>) -> Box<dyn Fn() + Send + Sync> {
                Box::new(|| {})
            }
            fn probe_reachability(
                &self,
                _options: &NetworkReachabilityOptions,
                out: &mut NetworkReachability,
            ) -> Option<()> {
                out.reachable = true;
                out.latency = 42.0;
                Some(())
            }
        }
        set_network_backend(Some(Arc::new(ProbeBackend)));
        let options = NetworkReachabilityOptions {
            url: "https://example.com".to_string(),
            timeout: None,
        };
        let mut out = NetworkReachability {
            reachable: false,
            latency: 0.0,
        };
        probe_network_reachability(&options, &mut out);
        assert!(out.reachable);
        assert_eq!(out.latency, 42.0);
        set_network_backend(None);
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
