use crate::enums::*;
use flight_buffer::{ArrayBuffer, ArrayBufferView, Blob};
use flight_entity::{FlightError, Record, Ref, Unknown};
use flight_signals::Signal;
use flight_stream::AbortSignal;
use std::future::Future;
use std::pin::Pin;
use std::sync::Arc;

pub use flight_hostcapability::ProviderRef;

/// Exact Principal batch8 native-body union; null is the surrounding Option.
#[derive(Clone)]
pub enum NetBody {
    Text(String),
    Buffer(ArrayBuffer),
    View(ArrayBufferView),
}

/// Parsed unknown values retain their actual object identity, without JSON conversion.
#[derive(Clone)]
pub enum NetResponseBody {
    Text(String),
    Unknown(Unknown),
    Buffer(ArrayBuffer),
    // flight-lint: allow(enum-payload-named) Principal batch8 requires canonical immutable Arc<Blob> directly in this native body union; retain Blob identity without a synthetic wrapper
    Blob(Arc<Blob>),
}

#[derive(Clone)]
pub struct NetRequest {
    pub method: NetMethod,
    pub url: String,
    pub headers: Option<Ref<Record<String>>>,
    /// None is absent; Some(None) is explicit null, matching the source optional body.
    pub body: Option<Option<NetBody>>,
    pub response_type: Option<NetResponseType>,
    pub timeout_ms: Option<f32>,
    pub credentials: Option<NetCredentials>,
    pub redirect: Option<NetRedirect>,
}

#[derive(Clone, Default)]
pub struct NetRequestOptions {
    pub progress: Option<Ref<Signal<Ref<NetProgress>>>>,
    pub signal: Option<AbortSignal>,
}

#[derive(Clone)]
pub struct NetGuardNotice {
    pub operation: NetGuardOperation,
    pub reason: NetGuardReason,
    pub request: Ref<NetRequest>,
}

pub type NetGuard = Arc<dyn Fn(Ref<NetGuardNotice>) + Send + Sync>;

// flight-lint: allow(contract-vocabulary) D15/D10 existing asynchronous programmer-error rejection arm; expected transport failures remain NetResponse sentinels
pub type NetRequestResult = Result<Ref<NetResponse>, FlightError>;
pub type NetResponseFuture = Pin<Box<dyn Future<Output = NetRequestResult> + Send>>;

#[derive(Clone)]
pub struct HostNetCapability {
    pub provider: ProviderRef,
    pub send_net_request: Arc<
        dyn Fn(Ref<NetRequest>, Option<Ref<NetRequestOptions>>) -> NetResponseFuture + Send + Sync,
    >,
}

#[derive(Clone, Default)]
pub struct HostNetCapabilities {
    pub http: Option<HostNetCapability>,
}

/// Explicit D5 context. Clones share this context; separate defaults are independent.
#[derive(Clone, Default)]
pub struct NetState {
    pub(crate) data: Ref<NetStateData>,
}

#[derive(Default)]
pub(crate) struct NetStateData {
    pub(crate) guard: Option<NetGuard>,
    pub(crate) enabled: bool,
}

#[derive(Clone)]
pub struct NetResponse {
    pub status: u32,
    pub status_text: String,
    pub ok: bool,
    pub headers: Ref<Record<String>>,
    pub body: Option<NetResponseBody>,
    pub url: String,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct NetResponseExplanation {
    pub reason: NetResponseExplanationReason,
    pub status: u32,
    pub status_text: String,
    pub url: String,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct NetProgress {
    pub phase: NetProgressPhase,
    pub loaded: usize,
    pub total: usize,
}

/// D5 injected live clock; diagnostics sample this at operation time.
// flight-lint: allow(f64) D1: existing log timestamps are millisecond instants, not transport payload arithmetic
pub type NetClock = Arc<dyn Fn() -> f64 + Send + Sync>;
