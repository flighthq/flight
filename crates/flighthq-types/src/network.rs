//! Network connectivity types: status snapshot, connection classification,
//! reachability probe, the backend seam, and the event entity.

#[repr(u8)]
#[derive(Copy, Clone, PartialEq, Eq, Hash, Debug, Default)]
pub enum NetworkConnectionType {
    Wifi,
    Cellular,
    Ethernet,
    Bluetooth,
    Vpn,
    Wimax,
    None,
    Other,
    #[default]
    Unknown,
}

#[derive(Clone, Debug)]
pub struct NetworkStatus {
    pub online: bool,
    pub connection_type: NetworkConnectionType,
    /// Estimated downlink in Mbps, or -1 when the host does not report it.
    pub downlink: f32,
    /// Estimated maximum downlink in Mbps, or -1 when not reported.
    pub downlink_max: f32,
    /// Effective connection class ('4g', '3g', …) or '' when unknown.
    pub effective_type: String,
    /// Estimated round-trip time in ms, or -1 when not reported.
    pub rtt: f32,
    /// True when the user or OS has requested reduced data usage.
    pub save_data: bool,
    /// True when the connection is metered (cellular or save-data is set).
    pub metered: bool,
}

impl Default for NetworkStatus {
    fn default() -> Self {
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
}

/// Result of a one-shot reachability probe.
#[derive(Clone, Debug, Default)]
pub struct NetworkReachability {
    pub reachable: bool,
    /// Round-trip latency in ms, or -1 on failure.
    pub latency: f32,
}

/// Inputs to a reachability probe.
#[derive(Clone, Debug, Default)]
pub struct NetworkReachabilityOptions {
    pub url: String,
    /// Timeout in ms; `None` uses the backend default.
    pub timeout: Option<f32>,
}

// Event seam for connectivity: a snapshot reader plus a change subscription. The web backend wraps
// navigator.onLine + the Network Information API; a native host emits its own connectivity changes
// through the same subscribe callback.
pub trait NetworkBackend: Send + Sync {
    fn get_status<'a>(&self, out: &'a mut NetworkStatus) -> &'a mut NetworkStatus;
    /// Registers a listener invoked on any connectivity change; returns an unsubscribe function.
    fn subscribe(&self, listener: Box<dyn Fn() + Send + Sync>) -> Box<dyn Fn() + Send + Sync>;
    /// Optional one-shot reachability probe. Returns `None` when the backend does not provide one,
    /// in which case callers fall back to the default implementation.
    fn probe_reachability(
        &self,
        _options: &NetworkReachabilityOptions,
        _out: &mut NetworkReachability,
    ) -> Option<()> {
        None
    }
}

// Connectivity event entity. Enable delivery with attach_network; the signals stay inert until then.
#[derive(Debug, Default)]
pub struct Network {
    pub on_change: flighthq_signals::Signal<NetworkStatus>,
    pub on_connection_type_change: flighthq_signals::Signal<NetworkConnectionType>,
    pub on_metered_change: flighthq_signals::Signal<bool>,
    pub on_offline: flighthq_signals::Signal<()>,
    pub on_online: flighthq_signals::Signal<()>,
}
