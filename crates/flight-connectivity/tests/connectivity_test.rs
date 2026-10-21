use std::sync::{Arc, Mutex};

use flight_connectivity::contract::*;
use flight_entity::{FlightError, FlightErrorKind};
use flight_signals::{connect_signal, has_signal_slots};

use crate::block_on;

struct FakeState {
    current: ConnectivityStatus,
    listeners: Vec<(u64, ConnectivityChangeListener)>,
    next_id: u64,
    destroys: usize,
    unsubscribes: usize,
    destroyed: bool,
    subscription_available: bool,
}

/// Mock provider implementing both the status and change capabilities over one shared state.
#[derive(Clone)]
struct FakeProvider {
    state: Arc<Mutex<FakeState>>,
    status: HostConnectivityStatusCapability,
    change: HostConnectivityChangeCapability,
}

impl FakeProvider {
    fn set(&self, edit: impl FnOnce(&mut ConnectivityStatus)) {
        edit(&mut self.state.lock().unwrap().current);
    }

    fn fire(&self) {
        let listeners: Vec<ConnectivityChangeListener> =
            self.state.lock().unwrap().listeners.iter().map(|(_, l)| l.clone()).collect();
        for listener in listeners {
            listener();
        }
    }

    fn active_subscriptions(&self) -> usize {
        return self.state.lock().unwrap().listeners.len();
    }

    fn destroy_calls(&self) -> usize {
        return self.state.lock().unwrap().destroys;
    }

    fn unsubscribe_calls(&self) -> usize {
        return self.state.lock().unwrap().unsubscribes;
    }
}

fn unreported_status() -> ConnectivityStatus {
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

fn fake_provider(overrides: impl FnOnce(&mut ConnectivityStatus), subscription_available: bool) -> FakeProvider {
    let mut current = ConnectivityStatus {
        downlink: 10.0,
        downlink_max: 100.0,
        effective_type: "4g".to_string(),
        online: Some(true),
        rtt: 50.0,
        type_: ConnectivityConnectionType::Wifi,
        ..unreported_status()
    };
    overrides(&mut current);
    let state = Arc::new(Mutex::new(FakeState {
        current,
        listeners: Vec::new(),
        next_id: 0,
        destroys: 0,
        unsubscribes: 0,
        destroyed: false,
        subscription_available,
    }));
    let s = state.clone();
    let get_status = Arc::new(move |out: &mut ConnectivityStatus| {
        *out = s.lock().unwrap().current.clone();
    });
    let s = state.clone();
    let destroy = Arc::new(move || {
        let mut st = s.lock().unwrap();
        if st.destroyed {
            return;
        }
        st.destroyed = true;
        st.destroys += 1;
        st.listeners.clear();
    });
    let s = state.clone();
    let subscribe = Arc::new(move |listener: ConnectivityChangeListener| -> Option<ConnectivityUnsubscribe> {
        let id = {
            let mut st = s.lock().unwrap();
            if !st.subscription_available || st.destroyed {
                return None;
            }
            st.next_id += 1;
            let id = st.next_id;
            st.listeners.push((id, listener));
            id
        };
        let s = s.clone();
        let active = Arc::new(Mutex::new(true));
        return Some(Arc::new(move || {
            let mut a = active.lock().unwrap();
            if !*a {
                return;
            }
            *a = false;
            let mut st = s.lock().unwrap();
            st.unsubscribes += 1;
            st.listeners.retain(|(lid, _)| *lid != id);
        }));
    });
    return FakeProvider {
        state,
        status: HostConnectivityStatusCapability { get_status },
        change: HostConnectivityChangeCapability { destroy, subscribe },
    };
}

fn default_provider() -> FakeProvider {
    return fake_provider(|_| {}, true);
}

fn collect<T: Clone + Send + 'static>(signal: &flight_signals::Signal<T>) -> Arc<Mutex<Vec<T>>> {
    let seen: Arc<Mutex<Vec<T>>> = Arc::new(Mutex::new(Vec::new()));
    let sink = seen.clone();
    connect_signal(signal, Arc::new(move |value: &T| sink.lock().unwrap().push(value.clone())), None);
    return seen;
}

mod attach_connectivity {
    use super::*;

    #[test]
    fn returns_true_and_emits_core_diffs_from_a_raw_provider_change() {
        let provider = default_provider();
        let mut connectivity = create_connectivity();
        let changes = collect(&connectivity.on_change);
        let types = collect(&connectivity.on_connection_type_change);
        let metered = collect(&connectivity.on_metered_change);
        let offline = collect(&connectivity.on_offline);
        assert!(attach_connectivity(&provider.status, &provider.change, &mut connectivity));
        provider.set(|s| {
            s.metered = true;
            s.online = Some(false);
            s.type_ = ConnectivityConnectionType::Cellular;
        });
        provider.fire();
        let changes = changes.lock().unwrap();
        assert_eq!(changes.len(), 1);
        assert!(changes[0].metered);
        assert_eq!(changes[0].online, Some(false));
        assert_eq!(changes[0].type_, ConnectivityConnectionType::Cellular);
        assert_eq!(*types.lock().unwrap(), vec![ConnectivityConnectionType::Cellular]);
        assert_eq!(*metered.lock().unwrap(), vec![true]);
        assert_eq!(offline.lock().unwrap().len(), 1);
    }

    #[test]
    fn treats_unknown_as_unmeasured_and_emits_offline_only_after_a_measured_transition() {
        let provider = fake_provider(|s| s.online = None, true);
        let mut connectivity = create_connectivity();
        let offline = collect(&connectivity.on_offline);
        attach_connectivity(&provider.status, &provider.change, &mut connectivity);
        provider.fire();
        assert_eq!(offline.lock().unwrap().len(), 0);
        provider.set(|s| s.online = Some(false));
        provider.fire();
        assert_eq!(offline.lock().unwrap().len(), 1);
    }

    #[test]
    fn returns_false_instead_of_retaining_a_silent_no_op_subscription() {
        let provider = fake_provider(|_| {}, false);
        let mut connectivity = create_connectivity();
        assert!(!attach_connectivity(&provider.status, &provider.change, &mut connectivity));
        assert_eq!(provider.active_subscriptions(), 0);
    }

    #[test]
    fn detaches_a_before_attaching_b_and_never_delivers_from_the_old_origin() {
        let a = default_provider();
        let b = default_provider();
        let mut connectivity = create_connectivity();
        let changes = collect(&connectivity.on_change);
        attach_connectivity(&a.status, &a.change, &mut connectivity);
        attach_connectivity(&b.status, &b.change, &mut connectivity);
        assert_eq!(a.unsubscribe_calls(), 1);
        assert_eq!(a.active_subscriptions(), 0);
        assert_eq!(b.active_subscriptions(), 1);
        a.fire();
        assert_eq!(changes.lock().unwrap().len(), 0);
        b.fire();
        assert_eq!(changes.lock().unwrap().len(), 1);
    }

    #[test]
    fn emits_distinct_status_snapshots_rather_than_mutating_a_retained_prior_payload() {
        let provider = default_provider();
        let mut connectivity = create_connectivity();
        let changes = collect(&connectivity.on_change);
        attach_connectivity(&provider.status, &provider.change, &mut connectivity);
        provider.fire();
        provider.set(|s| s.type_ = ConnectivityConnectionType::Cellular);
        provider.fire();
        let changes = changes.lock().unwrap();
        assert_eq!(changes[0].type_, ConnectivityConnectionType::Wifi);
        assert_eq!(changes[1].type_, ConnectivityConnectionType::Cellular);
    }

    #[test]
    fn delivers_synchronously_with_no_lock_held_so_a_slot_may_detach_reentrantly() {
        let provider = default_provider();
        let connectivity = Arc::new(Mutex::new(create_connectivity()));
        let on_change = connectivity.lock().unwrap().on_change.clone();
        let target = connectivity.clone();
        let deliveries = Arc::new(Mutex::new(0));
        let count = deliveries.clone();
        connect_signal(
            &on_change,
            Arc::new(move |_status: &ConnectivityStatus| {
                *count.lock().unwrap() += 1;
                detach_connectivity(&mut target.lock().unwrap());
            }),
            None,
        );
        {
            let mut c = connectivity.lock().unwrap();
            attach_connectivity(&provider.status, &provider.change, &mut c);
        }
        provider.fire();
        assert_eq!(*deliveries.lock().unwrap(), 1);
        assert_eq!(provider.unsubscribe_calls(), 1);
        provider.fire();
        assert_eq!(*deliveries.lock().unwrap(), 1);
    }
}

mod create_connectivity {
    use super::*;

    #[test]
    fn returns_an_entity_carrying_all_five_core_owned_signals() {
        let connectivity = create_connectivity();
        let _: &dyn flight_entity::Entity = &connectivity;
        for has in [
            has_signal_slots(&connectivity.on_change),
            has_signal_slots(&connectivity.on_connection_type_change),
            has_signal_slots(&connectivity.on_metered_change),
            has_signal_slots(&connectivity.on_offline),
            has_signal_slots(&connectivity.on_online),
        ] {
            assert!(!has);
        }
        let seen = collect(&connectivity.on_online);
        flight_signals::emit_signal(&connectivity.on_online, &());
        assert_eq!(seen.lock().unwrap().len(), 1);
    }
}

mod destroy_connectivity {
    use super::*;

    #[test]
    fn uses_the_supplied_change_provider_and_provider_teardown_is_terminal_and_idempotent() {
        let provider = default_provider();
        destroy_connectivity(&provider.change);
        destroy_connectivity(&provider.change);
        assert_eq!(provider.destroy_calls(), 1);
        assert!((provider.change.subscribe)(Arc::new(|| {})).is_none());
    }
}

mod detach_connectivity {
    use super::*;

    #[test]
    fn consumes_the_exact_unsubscribe_once() {
        let provider = default_provider();
        let mut connectivity = create_connectivity();
        attach_connectivity(&provider.status, &provider.change, &mut connectivity);
        detach_connectivity(&mut connectivity);
        detach_connectivity(&mut connectivity);
        assert_eq!(provider.unsubscribe_calls(), 1);
    }
}

mod detect_connectivity_reachability {
    use super::*;

    #[test]
    fn dispatches_reachability_only_to_the_supplied_reachability_slot() {
        let calls = Arc::new(Mutex::new(0));
        let counter = calls.clone();
        let reachability = HostConnectivityReachabilityCapability {
            detect_reachability: Arc::new(move |_options, mut out: ConnectivityReachability| {
                *counter.lock().unwrap() += 1;
                out.latency = 7.0;
                out.reachable = true;
                return Box::pin(async move { Ok(out) });
            }),
        };
        let mut out = ConnectivityReachability { latency: -1.0, reachable: false };
        let options = ConnectivityReachabilityOptions { url: "https://example.invalid".to_string(), timeout: None };
        let result = block_on(detect_connectivity_reachability(&mut out, &reachability, &options));
        assert_eq!(result, Ok(()));
        assert_eq!(out, ConnectivityReachability { latency: 7.0, reachable: true });
        assert_eq!(*calls.lock().unwrap(), 1);
    }

    #[test]
    fn passes_a_provider_rejection_through_unchanged_and_leaves_out_untouched() {
        let reachability = HostConnectivityReachabilityCapability {
            detect_reachability: Arc::new(|_options, _out| {
                return Box::pin(async {
                    Err(FlightError { kind: FlightErrorKind::TypeError, message: "probe failed".to_string() })
                });
            }),
        };
        let mut out = ConnectivityReachability { latency: -1.0, reachable: false };
        let options = ConnectivityReachabilityOptions { url: "https://example.invalid".to_string(), timeout: Some(250.0) };
        let result = block_on(detect_connectivity_reachability(&mut out, &reachability, &options));
        assert_eq!(result, Err(FlightError { kind: FlightErrorKind::TypeError, message: "probe failed".to_string() }));
        assert_eq!(out, ConnectivityReachability { latency: -1.0, reachable: false });
    }
}

mod dispose_connectivity {
    use super::*;

    #[test]
    fn unsubscribes_once_and_clears_listeners_from_every_signal() {
        let provider = default_provider();
        let mut connectivity = create_connectivity();
        attach_connectivity(&provider.status, &provider.change, &mut connectivity);
        connect_signal(&connectivity.on_change, Arc::new(|_: &ConnectivityStatus| {}), None);
        connect_signal(&connectivity.on_connection_type_change, Arc::new(|_: &ConnectivityConnectionType| {}), None);
        connect_signal(&connectivity.on_metered_change, Arc::new(|_: &bool| {}), None);
        connect_signal(&connectivity.on_offline, Arc::new(|_: &()| {}), None);
        connect_signal(&connectivity.on_online, Arc::new(|_: &()| {}), None);
        dispose_connectivity(&mut connectivity);
        dispose_connectivity(&mut connectivity);
        assert_eq!(provider.unsubscribe_calls(), 1);
        assert_eq!(
            [
                has_signal_slots(&connectivity.on_change),
                has_signal_slots(&connectivity.on_connection_type_change),
                has_signal_slots(&connectivity.on_metered_change),
                has_signal_slots(&connectivity.on_offline),
                has_signal_slots(&connectivity.on_online),
            ],
            [false, false, false, false, false]
        );
    }
}

mod get_connectivity_connection_type_string {
    use super::*;

    #[test]
    fn returns_the_exact_ts_strings() {
        let expected = [
            (ConnectivityConnectionType::Wifi, "wifi"),
            (ConnectivityConnectionType::Cellular, "cellular"),
            (ConnectivityConnectionType::Ethernet, "ethernet"),
            (ConnectivityConnectionType::Bluetooth, "bluetooth"),
            (ConnectivityConnectionType::Vpn, "vpn"),
            (ConnectivityConnectionType::Wimax, "wimax"),
            (ConnectivityConnectionType::Other, "other"),
            (ConnectivityConnectionType::None, "none"),
            (ConnectivityConnectionType::Unknown, "unknown"),
        ];
        for (value, text) in expected {
            assert_eq!(get_connectivity_connection_type_string(value), text);
        }
    }
}

mod get_connectivity_online {
    use super::*;

    #[test]
    fn preserves_unknown_and_measured_online_states() {
        assert_eq!(get_connectivity_online(&fake_provider(|s| s.online = None, true).status), None);
        assert_eq!(get_connectivity_online(&fake_provider(|s| s.online = Some(true), true).status), Some(true));
    }
}

mod get_connectivity_status {
    use super::*;

    #[test]
    fn reads_status_and_level_conveniences_only_from_the_supplied_host() {
        let provider = fake_provider(
            |s| {
                s.metered = true;
                s.online = Some(false);
                s.save_data = true;
            },
            true,
        );
        let mut out = unreported_status();
        get_connectivity_status(&mut out, &provider.status);
        assert_eq!(out.type_, ConnectivityConnectionType::Wifi);
        assert!(out.metered && out.save_data);
        assert_eq!(out.online, Some(false));
    }
}

mod has_connectivity_status_changed {
    use super::*;

    #[test]
    fn returns_false_for_equal_or_aliased_snapshots() {
        let a = unreported_status();
        assert!(!has_connectivity_status_changed(&a, &a.clone()));
        assert!(!has_connectivity_status_changed(&a, &a));
    }

    #[test]
    fn detects_every_status_axis() {
        let base = unreported_status();
        let variants = [
            ConnectivityStatus { online: Some(true), ..unreported_status() },
            ConnectivityStatus { type_: ConnectivityConnectionType::Wifi, ..unreported_status() },
            ConnectivityStatus { downlink: 1.0, ..unreported_status() },
            ConnectivityStatus { downlink_max: 1.0, ..unreported_status() },
            ConnectivityStatus { effective_type: "4g".to_string(), ..unreported_status() },
            ConnectivityStatus { rtt: 1.0, ..unreported_status() },
            ConnectivityStatus { save_data: true, ..unreported_status() },
            ConnectivityStatus { metered: true, ..unreported_status() },
        ];
        let changed: Vec<bool> = variants.iter().map(|v| has_connectivity_status_changed(&base, v)).collect();
        assert_eq!(changed, vec![true; 8]);
    }
}

mod initialize_connectivity {
    use super::*;

    #[test]
    fn is_the_construction_initializer_of_create_connectivity() {
        let mut out: Connectivity = flight_entity::allocate_entity();
        initialize_connectivity(&mut out);
        let seen = collect(&out.on_metered_change);
        flight_signals::emit_signal(&out.on_metered_change, &true);
        assert_eq!(*seen.lock().unwrap(), vec![true]);
    }
}

mod is_connectivity_metered {
    use super::*;

    #[test]
    fn reads_the_metered_level_from_the_supplied_status_witness() {
        assert!(is_connectivity_metered(&fake_provider(|s| s.metered = true, true).status));
    }
}

mod is_connectivity_save_data_enabled {
    use super::*;

    #[test]
    fn reads_the_save_data_level_from_the_supplied_status_witness() {
        assert!(is_connectivity_save_data_enabled(&fake_provider(|s| s.save_data = true, true).status));
    }
}

mod parse_connectivity_connection_type {
    use super::*;

    #[test]
    fn parses_the_exact_ts_strings_and_rejects_others() {
        assert_eq!(parse_connectivity_connection_type("wimax"), Some(ConnectivityConnectionType::Wimax));
        assert_eq!(parse_connectivity_connection_type("none"), Some(ConnectivityConnectionType::None));
        assert_eq!(parse_connectivity_connection_type("WIFI"), None);
        assert_eq!(parse_connectivity_connection_type(""), None);
    }
}
