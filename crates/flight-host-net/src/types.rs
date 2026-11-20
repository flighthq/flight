// flight-lint: allow-file(contract-vocabulary) native host: the host value carries the Rust callback form of the capability closure it fills

use std::sync::{Arc, RwLock};

use flight_host::ProviderRef;
use flight_net::{HostNetCapabilities, HostNetCapability};

use crate::net_transport::NetTransport;

/// A native HTTP host: one connection pool and the net capability that sends requests through it.
/// Plain host data, not an Entity. Each request runs on its own worker thread, so the capability's
/// futures need no particular async runtime.
pub struct NetHost {
    pub(crate) capabilities: HostNetCapabilities,
    pub(crate) http: HostNetCapability,
    pub(crate) provider: ProviderRef,
    /// Shared with the capability closure. `None` once the host is destroyed; requests already in
    /// flight hold their own reference and finish on it.
    pub(crate) transport: Arc<RwLock<Option<NetTransport>>>,
}

/// How a net host sends requests.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct NetHostOptions {
    /// Idle keep-alive connections the pool retains across requests.
    pub max_idle_connections: u32,
    /// Redirects followed before a `follow` request fails as `too many redirects`.
    pub redirect_limit: u32,
}

/// Why a net host answered a request with a status-0 transport-failure response. Each reason has
/// one canonical `status_text`, listed beside it.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
#[repr(u32)]
pub enum NetHostResponseExplanationReason {
    /// `aborted`: the caller's abort signal fired before the response completed.
    Aborted = 0,
    /// `timeout`: the request's `timeout_ms` elapsed, counting redirects and the response body.
    Timeout = 1,
    /// `host destroyed`: the request was sent after `destroy_net_host`.
    HostDestroyed = 2,
    /// `invalid request`: the method, URL or a header is malformed, or a GET or HEAD carries a body.
    InvalidRequest = 3,
    /// `unsupported scheme`: the URL scheme is not `http`, or `https` without the `https` feature.
    UnsupportedScheme = 4,
    /// `host not found`: the host name did not resolve.
    HostNotFound = 5,
    /// `connection failed`: no connection could be opened to the resolved address.
    ConnectionFailed = 6,
    /// `redirect rejected`: the server redirected a request whose redirect mode is `error`.
    RedirectRejected = 7,
    /// `too many redirects`: a `follow` request exceeded the host's redirect limit.
    TooManyRedirects = 8,
    /// `tls failure`: the TLS handshake or certificate verification failed.
    TlsFailure = 9,
    /// `protocol error`: the server's response is not valid HTTP.
    ProtocolError = 10,
    /// `network error`: the connection failed while the request or response was in transit.
    NetworkError = 11,
}

/// Plain-data answer to "why did this net host response fail?".
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct NetHostResponseExplanation {
    pub reason: NetHostResponseExplanationReason,
    pub url: String,
}
