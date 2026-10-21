use std::future::Future;
use std::pin::Pin;
use std::sync::Arc;

use flight_entity::{EntityRuntimeSlot, FlightError};

/// Why a position read failed (TS `GeolocationErrorReason`).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum GeolocationErrorReason {
    Denied,
    Timeout,
    Unavailable,
}

/// The reason arm of an access-prompt outcome (TS `GeolocationAccessOutcome['reason']`).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum GeolocationAccessReason {
    CleanupFailed,
    Denied,
    Dismissed,
    Granted,
    OperationFailed,
    RuntimeUnavailable,
    Timeout,
}

/// What happened when the capability raised its own access prompt (TS
/// `GeolocationAccessOutcome`). A capability outcome, deliberately not a permission state.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct GeolocationAccessOutcome {
    pub reason: GeolocationAccessReason,
}

/// A plain snapshot of a device location (TS `GeolocationPosition`, an Entity). Fields are zeroed
/// when unknown; `timestamp` is a millisecond epoch timestamp.
// flight-lint: allow(f64) D1: timestamp is a millisecond epoch timestamp, which exceeds f32 exactly
#[derive(Clone, Debug, Default)]
pub struct GeolocationPosition {
    runtime: EntityRuntimeSlot,
    pub latitude: f32,
    pub longitude: f32,
    pub accuracy: f32,
    pub altitude: f32,
    pub altitude_accuracy: f32,
    pub floor_level: f32,
    pub heading: f32,
    pub speed: f32,
    pub timestamp: f64,
}

/// A position read paired with its failure reason (TS `GeolocationPositionResult`).
#[derive(Clone, Debug)]
pub struct GeolocationPositionResult {
    pub position: Option<GeolocationPosition>,
    pub reason: Option<GeolocationErrorReason>,
}

/// Options for a position read (TS `GeolocationRequestOptions`). The millisecond members are `f64`
/// so large ages and deadlines keep their authored precision.
// flight-lint: allow(f64) D1: timeout and maximum age are millisecond durations, which exceed f32 exactly
#[derive(Clone, Debug, Default, PartialEq)]
pub struct GeolocationRequestOptions {
    pub enable_high_accuracy: Option<bool>,
    pub timeout_ms: Option<f64>,
    pub maximum_age_ms: Option<f64>,
}

/// Boxed Send future for a current-position read (D15).
pub type GeolocationPositionFuture = Pin<Box<dyn Future<Output = Option<GeolocationPosition>> + Send>>;

/// Boxed Send future for a position-or-reason read (D15).
pub type GeolocationPositionResultFuture =
    Pin<Box<dyn Future<Output = GeolocationPositionResult> + Send>>;

// flight-lint: allow(contract-vocabulary) D15/D10: a rejected TS Promise has no vocabulary row; Result<_, FlightError> models it and prompt_for_geolocation_access maps Err to operation-failed
pub type GeolocationPromptFuture =
    Pin<Box<dyn Future<Output = Result<GeolocationAccessOutcome, FlightError>> + Send>>;

/// Host geolocation provider (TS `HostGeolocationCapability`): dispatch infrastructure, plain data
/// with caller-supplied callbacks. The asynchronous members take owned options because a D15 boxed
/// future is `Send + 'static` and cannot borrow them.
#[derive(Clone)]
pub struct HostGeolocationCapability {
    pub clear_watch: Arc<dyn Fn(i32) + Send + Sync>,
    pub get_current_position:
        Arc<dyn Fn(GeolocationRequestOptions) -> GeolocationPositionFuture + Send + Sync>,
    pub get_current_position_result:
        Arc<dyn Fn(GeolocationRequestOptions) -> GeolocationPositionResultFuture + Send + Sync>,
    pub is_available: Arc<dyn Fn() -> bool + Send + Sync>,
    pub watch_position: Arc<
        dyn Fn(
                Arc<dyn Fn(&GeolocationPosition) + Send + Sync>,
                GeolocationRequestOptions,
                Option<Arc<dyn Fn(GeolocationErrorReason) + Send + Sync>>,
            ) -> i32
            + Send
            + Sync,
    >,
    /// `None` models the source's runtime `typeof host.promptForAccess !== 'function'` probe.
    pub prompt_for_access: Option<Arc<dyn Fn() -> GeolocationPromptFuture + Send + Sync>>,
}

/// Host geolocation capability group (TS `HostGeolocationCapabilities` in `Host.ts`).
#[derive(Clone, Default)]
pub struct HostGeolocationCapabilities {
    pub position: Option<HostGeolocationCapability>,
}

// flight-lint: allow(conform-extra) D9e: Rust string-table helper for the TS string union; the TS package exports no get_/parse_ free functions
pub fn get_geolocation_access_reason_string(value: GeolocationAccessReason) -> &'static str {
    return match value {
        GeolocationAccessReason::CleanupFailed => "cleanup-failed",
        GeolocationAccessReason::Denied => "denied",
        GeolocationAccessReason::Dismissed => "dismissed",
        GeolocationAccessReason::Granted => "granted",
        GeolocationAccessReason::OperationFailed => "operation-failed",
        GeolocationAccessReason::RuntimeUnavailable => "runtime-unavailable",
        GeolocationAccessReason::Timeout => "timeout",
    };
}

// flight-lint: allow(conform-extra) D9e: Rust string-table helper for the TS string union; the TS package exports no get_/parse_ free functions
pub fn get_geolocation_error_reason_string(value: GeolocationErrorReason) -> &'static str {
    return match value {
        GeolocationErrorReason::Denied => "denied",
        GeolocationErrorReason::Timeout => "timeout",
        GeolocationErrorReason::Unavailable => "unavailable",
    };
}

// flight-lint: allow(conform-extra) D9e: Rust string-table helper for the TS string union; the TS package exports no get_/parse_ free functions
pub fn parse_geolocation_access_reason(value: &str) -> Option<GeolocationAccessReason> {
    return match value {
        "cleanup-failed" => Some(GeolocationAccessReason::CleanupFailed),
        "denied" => Some(GeolocationAccessReason::Denied),
        "dismissed" => Some(GeolocationAccessReason::Dismissed),
        "granted" => Some(GeolocationAccessReason::Granted),
        "operation-failed" => Some(GeolocationAccessReason::OperationFailed),
        "runtime-unavailable" => Some(GeolocationAccessReason::RuntimeUnavailable),
        "timeout" => Some(GeolocationAccessReason::Timeout),
        _ => None,
    };
}

// flight-lint: allow(conform-extra) D9e: Rust string-table helper for the TS string union; the TS package exports no get_/parse_ free functions
pub fn parse_geolocation_error_reason(value: &str) -> Option<GeolocationErrorReason> {
    return match value {
        "denied" => Some(GeolocationErrorReason::Denied),
        "timeout" => Some(GeolocationErrorReason::Timeout),
        "unavailable" => Some(GeolocationErrorReason::Unavailable),
        _ => None,
    };
}

flight_entity::impl_entity!(GeolocationPosition);
