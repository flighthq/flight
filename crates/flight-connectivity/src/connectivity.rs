use std::sync::{Arc, Mutex};

use flight_entity::{FlightError, allocate_entity};
use flight_signals::{clear_signal, create_signal, emit_signal};

use crate::types::*;

#[cfg(test)]
mod sugar_tests {
    use std::future::Future;
    use std::task::{Context, Poll, Waker};

    use flight_signals::{connect_signal, has_signal_slots};

    use super::*;

    fn block_on<F: Future>(future: F) -> F::Output {
        let mut future = Box::pin(future);
        let mut context = Context::from_waker(Waker::noop());
        loop {
            if let Poll::Ready(value) = future.as_mut().poll(&mut context) {
                return value;
            }
        }
    }

    fn reported() -> ConnectivityStatus {
        return ConnectivityStatus {
            online: Some(false),
            type_: ConnectivityConnectionType::Cellular,
            downlink: 2.5,
            downlink_max: 10.0,
            effective_type: "3g".to_string(),
            rtt: 300.0,
            save_data: true,
            metered: true,
        };
    }

    fn status_capability() -> HostConnectivityStatusCapability {
        return HostConnectivityStatusCapability { get_status: Arc::new(|out: &mut ConnectivityStatus| *out = reported()) };
    }

    /// A change capability counting subscribes, unsubscribes and destroys.
    fn change_capability(counts: Arc<Mutex<[usize; 3]>>) -> HostConnectivityChangeCapability {
        let on_destroy = counts.clone();
        return HostConnectivityChangeCapability {
            destroy: Arc::new(move || on_destroy.lock().unwrap()[2] += 1),
            subscribe: Arc::new(move |_listener: ConnectivityChangeListener| {
                counts.lock().unwrap()[0] += 1;
                let on_release = counts.clone();
                let release: ConnectivityUnsubscribe = Arc::new(move || on_release.lock().unwrap()[1] += 1);
                return Some(release);
            }),
        };
    }

    #[test]
    fn connectivity_new_matches_create_connectivity() {
        let a = Connectivity::new();
        let b = create_connectivity();
        assert_eq!(format!("{:?}", a), format!("{:?}", b));
        assert!(!has_signal_slots(&a.on_change));
    }

    #[test]
    fn connectivity_detach_matches_detach_connectivity() {
        let (ca, cb) = (Arc::new(Mutex::new([0; 3])), Arc::new(Mutex::new([0; 3])));
        let mut a = create_connectivity();
        let mut b = create_connectivity();
        attach_connectivity(&status_capability(), &change_capability(ca.clone()), &mut a);
        attach_connectivity(&status_capability(), &change_capability(cb.clone()), &mut b);
        a.detach();
        detach_connectivity(&mut b);
        assert_eq!(*ca.lock().unwrap(), *cb.lock().unwrap());
        assert_eq!(ca.lock().unwrap()[1], 1);
    }

    #[test]
    fn connectivity_dispose_matches_dispose_connectivity() {
        let mut a = create_connectivity();
        let mut b = create_connectivity();
        connect_signal(&a.on_online, Arc::new(|_: &()| {}), None);
        connect_signal(&b.on_online, Arc::new(|_: &()| {}), None);
        a.dispose();
        dispose_connectivity(&mut b);
        assert_eq!(has_signal_slots(&a.on_online), has_signal_slots(&b.on_online));
        assert!(!has_signal_slots(&a.on_online));
    }

    #[test]
    fn connectivity_status_has_changed_matches_has_connectivity_status_changed() {
        let base = reported();
        let other = ConnectivityStatus { rtt: 100.0, ..reported() };
        assert_eq!(base.has_changed(&other), has_connectivity_status_changed(&base, &other));
        assert!(base.has_changed(&other));
        assert!(!base.has_changed(&reported()));
    }

    #[test]
    fn host_connectivity_change_capability_destroy_matches_destroy_connectivity() {
        let (ca, cb) = (Arc::new(Mutex::new([0; 3])), Arc::new(Mutex::new([0; 3])));
        change_capability(ca.clone()).destroy();
        destroy_connectivity(&change_capability(cb.clone()));
        assert_eq!(*ca.lock().unwrap(), *cb.lock().unwrap());
        assert_eq!(ca.lock().unwrap()[2], 1);
    }

    #[test]
    fn host_connectivity_reachability_capability_detect_reachability_matches_detect_connectivity_reachability() {
        let capability = HostConnectivityReachabilityCapability {
            detect_reachability: Arc::new(|options: ConnectivityReachabilityOptions, mut out: ConnectivityReachability| {
                out.reachable = true;
                out.latency = options.timeout.unwrap_or(0.0) / 2.0;
                return Box::pin(async move { Ok(out) });
            }),
        };
        let options = ConnectivityReachabilityOptions { url: "https://example.invalid".to_string(), timeout: Some(80.0), signal: None };
        let mut a = ConnectivityReachability { reachable: false, latency: -1.0 };
        let mut b = a.clone();
        let ra = block_on(capability.detect_reachability(&mut a, &options));
        let rb = block_on(detect_connectivity_reachability(&mut b, &capability, &options));
        assert_eq!(ra, rb);
        assert_eq!(a, b);
        assert_eq!(a, ConnectivityReachability { reachable: true, latency: 40.0 });
    }

    #[test]
    fn host_connectivity_status_capability_attach_matches_attach_connectivity() {
        let (ca, cb) = (Arc::new(Mutex::new([0; 3])), Arc::new(Mutex::new([0; 3])));
        let mut a = create_connectivity();
        let mut b = create_connectivity();
        let ra = status_capability().attach(&change_capability(ca.clone()), &mut a);
        let rb = attach_connectivity(&status_capability(), &change_capability(cb.clone()), &mut b);
        assert_eq!(ra, rb);
        assert!(ra);
        assert_eq!(*ca.lock().unwrap(), *cb.lock().unwrap());
        assert_eq!(format!("{:?}", a), format!("{:?}", b));
    }

    #[test]
    fn host_connectivity_status_capability_is_metered_matches_is_connectivity_metered() {
        let capability = status_capability();
        assert_eq!(capability.is_metered(), is_connectivity_metered(&capability));
        assert!(capability.is_metered());
    }

    #[test]
    fn host_connectivity_status_capability_is_save_data_enabled_matches_is_connectivity_save_data_enabled() {
        let capability = status_capability();
        assert_eq!(capability.is_save_data_enabled(), is_connectivity_save_data_enabled(&capability));
        assert!(capability.is_save_data_enabled());
    }

    #[test]
    fn host_connectivity_status_capability_online_matches_get_connectivity_online() {
        let capability = status_capability();
        assert_eq!(capability.online(), get_connectivity_online(&capability));
        assert_eq!(capability.online(), Some(false));
    }

    #[test]
    fn host_connectivity_status_capability_status_matches_get_connectivity_status() {
        let capability = status_capability();
        let mut a = connectivity_status_out();
        let mut b = connectivity_status_out();
        capability.status(&mut a);
        get_connectivity_status(&mut b, &capability);
        assert_eq!(a, b);
        assert_eq!(a, reported());
    }
}

pub fn create_connectivity() -> Connectivity {
    let mut out: Connectivity = allocate_entity();
    initialize_connectivity(&mut out);
    return out;
}

/// The construction initializer of `create_connectivity`: five fresh signals and no subscription.
pub fn initialize_connectivity(out: &mut Connectivity) {
    out.on_change = create_signal();
    out.on_connection_type_change = create_signal();
    out.on_metered_change = create_signal();
    out.on_offline = create_signal();
    out.on_online = create_signal();
    out.subscription = None;
}

/// Starts raw host-change delivery and turns it into the five core-owned diff signals. Status and
/// change are separate providers: a snapshot command cannot stand in for an event subscription.
/// Re-attaching always consumes the prior provider's exact release before touching the new one.
/// Returns false when the change provider cannot establish a real subscription. Delivery is
/// synchronous inside the provider's listener call; the listener holds no lock while it emits, so
/// a slot may re-enter connectivity or provider operations.
pub fn attach_connectivity(
    host_connectivity_status: &HostConnectivityStatusCapability,
    host_connectivity_change: &HostConnectivityChangeCapability,
    connectivity: &mut Connectivity,
) -> bool {
    detach_connectivity(connectivity);
    let status_backend = host_connectivity_status.clone();
    let mut initial = connectivity_status_out();
    (status_backend.get_status)(&mut initial);
    let was = Arc::new(Mutex::new((initial.online, initial.type_, initial.metered)));
    let on_change = connectivity.on_change.clone();
    let on_connection_type_change = connectivity.on_connection_type_change.clone();
    let on_metered_change = connectivity.on_metered_change.clone();
    let on_offline = connectivity.on_offline.clone();
    let on_online = connectivity.on_online.clone();
    let listener: ConnectivityChangeListener = Arc::new(move || {
        let mut status = connectivity_status_out();
        (status_backend.get_status)(&mut status);
        emit_signal(&on_change, &status);
        let online_changed = {
            let mut was = was.lock().unwrap();
            let changed = status.online != was.0;
            if changed {
                was.0 = status.online;
            }
            changed
        };
        if online_changed {
            if status.online == Some(true) {
                emit_signal(&on_online, &());
            } else if status.online == Some(false) {
                emit_signal(&on_offline, &());
            }
        }
        let type_changed = {
            let mut was = was.lock().unwrap();
            let changed = status.type_ != was.1;
            if changed {
                was.1 = status.type_;
            }
            changed
        };
        if type_changed {
            emit_signal(&on_connection_type_change, &status.type_);
        }
        let metered_changed = {
            let mut was = was.lock().unwrap();
            let changed = status.metered != was.2;
            if changed {
                was.2 = status.metered;
            }
            changed
        };
        if metered_changed {
            emit_signal(&on_metered_change, &status.metered);
        }
    });
    let Some(unsubscribe) = (host_connectivity_change.subscribe)(listener) else {
        return false;
    };
    connectivity.subscription = Some(unsubscribe);
    return true;
}

/// The unreported-status sentinel a query writes into (TS package-private `connectivityStatusOut`).
/// ConnectivityStatus is provider-produced plain data, so this stays private: the public create_*
/// vocabulary remains entity-only.
fn connectivity_status_out() -> ConnectivityStatus {
    return ConnectivityStatus {
        downlink: -1.0,
        downlink_max: -1.0,
        effective_type: String::new(),
        metered: false,
        online: None,
        rtt: -1.0,
        save_data: false,
        type_: ConnectivityConnectionType::Unknown,
    };
}

/// Terminal provider teardown. Deliberately separate from per-entity detach: a caller that releases
/// one subscription must not destroy a shared host provider.
pub fn destroy_connectivity(host_connectivity_change: &HostConnectivityChangeCapability) {
    (host_connectivity_change.destroy)();
}

/// Consumes this entity's exact provider release, once. The release is taken out of the entity
/// before it is invoked, so detach is idempotent.
pub fn detach_connectivity(connectivity: &mut Connectivity) {
    let Some(unsubscribe) = connectivity.subscription.take() else {
        return;
    };
    unsubscribe();
}

/// Runs one reachability probe through the supplied capability and writes its result into `out`. The
/// options, including the caller's abort signal, go to the provider unchanged; the core adds no abort
/// policy of its own. A provider rejection is passed through unchanged, as the TS Promise rejects,
/// and leaves `out` untouched.
// flight-lint: allow(conform-params) D9b: TS takes `out` last and resolves to it; Rust takes `out` first and resolves to the pass-through status only
// flight-lint: allow(contract-vocabulary) D15/D10: a rejected TS Promise has no vocabulary row; Result<(), FlightError> passes the provider's rejection through unchanged
pub async fn detect_connectivity_reachability(
    out: &mut ConnectivityReachability,
    host_connectivity_reachability: &HostConnectivityReachabilityCapability,
    options: &ConnectivityReachabilityOptions,
) -> Result<(), FlightError> {
    let result = (host_connectivity_reachability.detect_reachability)(options.clone(), out.clone()).await?;
    *out = result;
    return Ok(());
}

/// Disposes only the caller-owned event entity: detaches it and clears every signal. Provider
/// teardown is terminal and explicit through `destroy_connectivity`, because one provider can fan
/// out to multiple Connectivity entities.
pub fn dispose_connectivity(connectivity: &mut Connectivity) {
    detach_connectivity(connectivity);
    clear_signal(&connectivity.on_change);
    clear_signal(&connectivity.on_connection_type_change);
    clear_signal(&connectivity.on_metered_change);
    clear_signal(&connectivity.on_offline);
    clear_signal(&connectivity.on_online);
}

// flight-lint: allow(conform-extra) D9e: Rust string-table helper for the TS ConnectivityConnectionType string union; the TS package exports no get_/parse_ free functions
pub fn get_connectivity_connection_type_string(value: ConnectivityConnectionType) -> &'static str {
    return match value {
        ConnectivityConnectionType::Wifi => "wifi",
        ConnectivityConnectionType::Cellular => "cellular",
        ConnectivityConnectionType::Ethernet => "ethernet",
        ConnectivityConnectionType::Bluetooth => "bluetooth",
        ConnectivityConnectionType::Vpn => "vpn",
        ConnectivityConnectionType::Wimax => "wimax",
        ConnectivityConnectionType::Other => "other",
        ConnectivityConnectionType::None => "none",
        ConnectivityConnectionType::Unknown => "unknown",
    };
}

/// The provider's online state: Some(true/false) when measured, None when not yet measured.
pub fn get_connectivity_online(host_connectivity_status: &HostConnectivityStatusCapability) -> Option<bool> {
    let mut status = connectivity_status_out();
    (host_connectivity_status.get_status)(&mut status);
    return status.online;
}

/// Writes the provider's current status into `out`.
// flight-lint: allow(conform-params) D9b: TS takes `out` last and returns it; Rust takes `out` first and returns nothing
pub fn get_connectivity_status(out: &mut ConnectivityStatus, host_connectivity_status: &HostConnectivityStatusCapability) {
    (host_connectivity_status.get_status)(out);
}

/// True when any status axis differs (online, type, downlink, downlink max, effective type, rtt,
/// save-data, metered). Exact comparison, as TS `!==`.
pub fn has_connectivity_status_changed(a: &ConnectivityStatus, b: &ConnectivityStatus) -> bool {
    return a.online != b.online
        || a.type_ != b.type_
        || a.downlink != b.downlink
        || a.downlink_max != b.downlink_max
        || a.effective_type != b.effective_type
        || a.rtt != b.rtt
        || a.save_data != b.save_data
        || a.metered != b.metered;
}

pub fn is_connectivity_metered(host_connectivity_status: &HostConnectivityStatusCapability) -> bool {
    let mut status = connectivity_status_out();
    (host_connectivity_status.get_status)(&mut status);
    return status.metered;
}

pub fn is_connectivity_save_data_enabled(host_connectivity_status: &HostConnectivityStatusCapability) -> bool {
    let mut status = connectivity_status_out();
    (host_connectivity_status.get_status)(&mut status);
    return status.save_data;
}

// flight-lint: allow(conform-extra) D9e: Rust string-table helper for the TS ConnectivityConnectionType string union; the TS package exports no get_/parse_ free functions
pub fn parse_connectivity_connection_type(value: &str) -> Option<ConnectivityConnectionType> {
    return match value {
        "wifi" => Some(ConnectivityConnectionType::Wifi),
        "cellular" => Some(ConnectivityConnectionType::Cellular),
        "ethernet" => Some(ConnectivityConnectionType::Ethernet),
        "bluetooth" => Some(ConnectivityConnectionType::Bluetooth),
        "vpn" => Some(ConnectivityConnectionType::Vpn),
        "wimax" => Some(ConnectivityConnectionType::Wimax),
        "other" => Some(ConnectivityConnectionType::Other),
        "none" => Some(ConnectivityConnectionType::None),
        "unknown" => Some(ConnectivityConnectionType::Unknown),
        _ => None,
    };
}

impl Connectivity {
    pub fn new() -> Self {
        return create_connectivity();
    }

    pub fn detach(&mut self) {
        detach_connectivity(self);
    }

    pub fn dispose(&mut self) {
        dispose_connectivity(self);
    }
}

impl ConnectivityStatus {
    pub fn has_changed(&self, other: &ConnectivityStatus) -> bool {
        return has_connectivity_status_changed(self, other);
    }
}

impl HostConnectivityChangeCapability {
    pub fn destroy(&self) {
        destroy_connectivity(self);
    }
}

impl HostConnectivityReachabilityCapability {
    pub async fn detect_reachability(
        &self,
        out: &mut ConnectivityReachability,
        options: &ConnectivityReachabilityOptions,
    ) -> Result<(), FlightError> {
        return detect_connectivity_reachability(out, self, options).await;
    }
}

impl HostConnectivityStatusCapability {
    pub fn attach(&self, host_connectivity_change: &HostConnectivityChangeCapability, connectivity: &mut Connectivity) -> bool {
        return attach_connectivity(self, host_connectivity_change, connectivity);
    }

    pub fn is_metered(&self) -> bool {
        return is_connectivity_metered(self);
    }

    pub fn is_save_data_enabled(&self) -> bool {
        return is_connectivity_save_data_enabled(self);
    }

    pub fn online(&self) -> Option<bool> {
        return get_connectivity_online(self);
    }

    pub fn status(&self, out: &mut ConnectivityStatus) {
        get_connectivity_status(out, self);
    }
}
