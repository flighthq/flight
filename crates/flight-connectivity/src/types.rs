use std::fmt;
use std::future::Future;
use std::pin::Pin;
use std::sync::Arc;

use flight_entity::{EntityRuntimeSlot, FlightError};
use flight_signals::Signal;
use flight_stream::{AbortSignal, is_abort_signal_aborted};

/// The connection technology a provider reports (TS `ConnectivityConnectionType`).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ConnectivityConnectionType {
    Wifi,
    Cellular,
    Ethernet,
    Bluetooth,
    Vpn,
    Wimax,
    Other,
    None,
    Unknown,
}

/// A connectivity snapshot (TS `ConnectivityStatus`): plain provider-produced data, written into a
/// caller-owned `out`. `online: None` means the provider has not measured connectivity yet and must
/// never be read as offline; the other sentinels (-1, '') likewise mean unreported. Rates and times
/// are f32: they are reported estimates (Mbps, milliseconds) compared for change, never accumulated.
#[derive(Clone, Debug, PartialEq)]
pub struct ConnectivityStatus {
    pub online: Option<bool>,
    pub type_: ConnectivityConnectionType,
    /// Estimated downlink in Mbps, or -1 when the host does not report it.
    pub downlink: f32,
    /// Maximum downlink of the underlying connection technology in Mbps, or -1 when not reported.
    pub downlink_max: f32,
    /// Effective connection class ("4g", "3g", ...) or "" when unknown.
    pub effective_type: String,
    /// Estimated round-trip time in milliseconds, or -1 when the host does not report it.
    pub rtt: f32,
    /// True when the user or OS has requested reduced data usage.
    pub save_data: bool,
    /// True when the connection is metered (cellular or save-data is set).
    pub metered: bool,
}

/// One-shot reachability probe result (TS `ConnectivityReachability`), written into a caller-owned
/// `out`. Sentinels (reachable false, latency -1) mean the probe failed rather than rejecting.
#[derive(Clone, Debug, PartialEq)]
pub struct ConnectivityReachability {
    pub reachable: bool,
    /// Round-trip latency of the probe in milliseconds, or -1 on failure.
    pub latency: f32,
}

/// Inputs to a reachability probe (TS `ConnectivityReachabilityOptions`): the URL, an optional
/// timeout in milliseconds (the backend chooses a default when None), and an optional caller-supplied
/// abort signal that the backend combines with its internal timeout. The core forwards the signal
/// unchanged; a clone shares the caller's abort state, so a later abort reaches the running provider.
#[derive(Clone)]
pub struct ConnectivityReachabilityOptions {
    pub url: String,
    pub timeout: Option<f32>,
    pub signal: Option<AbortSignal>,
}

/// The raw change listener a provider calls on every host connectivity change.
pub type ConnectivityChangeListener = Arc<dyn Fn() + Send + Sync>;

/// The exact release a provider returns from `subscribe`.
pub type ConnectivityUnsubscribe = Arc<dyn Fn() + Send + Sync>;

/// A probe's written result, or the error carried by a rejected TS Promise.
// flight-lint: allow(contract-vocabulary) D15/D10: a rejected TS Promise has no vocabulary row; Result<_, FlightError> models it and detect_connectivity_reachability passes the rejection through unchanged, as TS does
pub type ConnectivityReachabilityResult = Result<ConnectivityReachability, FlightError>;

/// Boxed, Send future returned by a reachability provider (D15).
pub type ConnectivityReachabilityFuture = Pin<Box<dyn Future<Output = ConnectivityReachabilityResult> + Send>>;

/// Snapshot query capability (TS `HostConnectivityStatusCapability`): writes the current status into
/// `out`. Plain dispatch data.
#[derive(Clone)]
pub struct HostConnectivityStatusCapability {
    pub get_status: Arc<dyn Fn(&mut ConnectivityStatus) + Send + Sync>,
}

/// Raw host change delivery (TS `HostConnectivityChangeCapability`). `subscribe` returns None when
/// the provider cannot establish a real subscription (a no-op release would falsely claim success).
/// `destroy` is terminal provider teardown; per-entity detach consumes only the returned release.
#[derive(Clone)]
pub struct HostConnectivityChangeCapability {
    pub destroy: Arc<dyn Fn() + Send + Sync>,
    pub subscribe: Arc<dyn Fn(ConnectivityChangeListener) -> Option<ConnectivityUnsubscribe> + Send + Sync>,
}

/// Active reachability capability (TS `HostConnectivityReachabilityCapability`). The provider
/// receives the options and the caller's current `out` value and resolves to the written result; it
/// takes them owned because a D15 boxed future is `Send + 'static` and cannot borrow.
#[derive(Clone)]
pub struct HostConnectivityReachabilityCapability {
    pub detect_reachability: Arc<
        dyn Fn(ConnectivityReachabilityOptions, ConnectivityReachability) -> ConnectivityReachabilityFuture
            + Send
            + Sync,
    >,
}

/// Host connectivity capability group (TS `HostConnectivityCapabilities` in `Host.ts`).
#[derive(Clone, Default)]
pub struct HostConnectivityCapabilities {
    pub change: Option<HostConnectivityChangeCapability>,
    pub reachability: Option<HostConnectivityReachabilityCapability>,
    pub status: Option<HostConnectivityStatusCapability>,
}

/// The core connectivity event entity (TS `Connectivity extends Entity`). The five signals are
/// emitted by this crate after it reads and diffs a status snapshot; they are not host capability
/// slots. The private `subscription` is the exact release returned by the provider this entity is
/// attached to (TS keeps it in a module WeakMap keyed by the entity; here it is the entity's own
/// explicit state, so there is no hidden global registry).
#[derive(Default)]
pub struct Connectivity {
    runtime: EntityRuntimeSlot,
    pub on_change: Signal<ConnectivityStatus>,
    pub on_connection_type_change: Signal<ConnectivityConnectionType>,
    pub on_metered_change: Signal<bool>,
    pub on_offline: Signal<()>,
    pub on_online: Signal<()>,
    pub(crate) subscription: Option<ConnectivityUnsubscribe>,
}

// flight-lint: allow(sugar-delegates) trait boilerplate: a clone shares the five signals (identity, as TS) but not the attach subscription, which TS keys to the original entity only
impl Clone for Connectivity {
    fn clone(&self) -> Self {
        return Connectivity {
            runtime: EntityRuntimeSlot::default(),
            on_change: self.on_change.clone(),
            on_connection_type_change: self.on_connection_type_change.clone(),
            on_metered_change: self.on_metered_change.clone(),
            on_offline: self.on_offline.clone(),
            on_online: self.on_online.clone(),
            subscription: None,
        };
    }
}

// flight-lint: allow(sugar-delegates) trait boilerplate: the subscription is a closure, so Debug reports whether one is held
impl fmt::Debug for Connectivity {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        return f
            .debug_struct("Connectivity")
            .field("on_change", &self.on_change)
            .field("on_connection_type_change", &self.on_connection_type_change)
            .field("on_metered_change", &self.on_metered_change)
            .field("on_offline", &self.on_offline)
            .field("on_online", &self.on_online)
            .field("attached", &self.subscription.is_some())
            .finish();
    }
}

// flight-lint: allow(sugar-delegates) trait boilerplate: AbortSignal is a shared handle without Debug, so Debug reports whether a signal is present and aborted
impl fmt::Debug for ConnectivityReachabilityOptions {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        return f
            .debug_struct("ConnectivityReachabilityOptions")
            .field("url", &self.url)
            .field("timeout", &self.timeout)
            .field("signal_aborted", &self.signal.as_ref().map(is_abort_signal_aborted))
            .finish();
    }
}

flight_entity::impl_entity!(Connectivity);
