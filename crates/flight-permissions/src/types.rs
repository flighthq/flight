use std::future::Future;
use std::pin::Pin;
use std::sync::Arc;

use flight_entity::FlightError;
use flight_host::ProviderRef;
use flight_notification::HostNotificationPermissionCapability;

/// An open OS/runtime permission name (TS `PermissionName`). Known names receive method-tight
/// routing; any other string receives the source's honest unsupported outcome.
pub type PermissionName = String;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum PermissionState {
    Denied,
    Granted,
    Prompt,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum PermissionQueryFailureReason {
    OperationFailed,
    RuntimeUnavailable,
    Unsupported,
}

/// The flattened reason field of the TS `PermissionQueryOutcome` union.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum PermissionQueryReason {
    BestEffort,
    Ok,
    OperationFailed,
    RuntimeUnavailable,
    Unsupported,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct PermissionQueryOutcome {
    pub reason: PermissionQueryReason,
    pub state: Option<PermissionState>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum PermissionRequestFailureReason {
    NoRequestRoute,
    OperationFailed,
    RuntimeUnavailable,
    Timeout,
    Unsupported,
}

/// The flattened reason field of the TS `PermissionRequestOutcome` union.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum PermissionRequestReason {
    BestEffort,
    CleanupFailed,
    Denied,
    Dismissed,
    Granted,
    NoRequestRoute,
    OperationFailed,
    RuntimeUnavailable,
    Timeout,
    Unsupported,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct PermissionRequestOutcome {
    pub reason: PermissionRequestReason,
    pub state: Option<PermissionState>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum StoragePersistenceOutcomeReason {
    BestEffort,
    OperationFailed,
    Persistent,
}

/// One coherent observation of bucket policy and the separately observed permission state (TS
/// `StoragePersistenceOutcome`). The two fields are never inferred from each other.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct StoragePersistenceOutcome {
    pub outcome: StoragePersistenceOutcomeReason,
    pub permission_state: Option<PermissionState>,
}

// flight-lint: allow(contract-vocabulary) D15/D10: Result preserves a rejected provider Promise so the facade can catch and project it
pub type PermissionQueryProviderResult = Result<PermissionQueryOutcome, FlightError>;
// flight-lint: allow(contract-vocabulary) D15/D10: Result preserves a rejected provider Promise so the facade can catch and project it
pub type PermissionRequestProviderResult = Result<PermissionRequestOutcome, FlightError>;
// flight-lint: allow(contract-vocabulary) D15/D10: Result preserves a rejected provider Promise so the facade can catch and project it
pub type StoragePersistenceProviderResult = Result<StoragePersistenceOutcome, FlightError>;

pub type PermissionQueryFuture =
    Pin<Box<dyn Future<Output = PermissionQueryProviderResult> + Send>>;
pub type PermissionRequestFuture =
    Pin<Box<dyn Future<Output = PermissionRequestProviderResult> + Send>>;
pub type StoragePersistenceFuture =
    Pin<Box<dyn Future<Output = StoragePersistenceProviderResult> + Send>>;

/// Relocated MIDI permission facet (TS `HostMidiPermissionCapability`).
#[derive(Clone)]
pub struct HostMidiPermissionCapability {
    pub get_permission: Arc<dyn Fn() -> PermissionQueryFuture + Send + Sync>,
    pub provider: ProviderRef,
}

/// Host-native permission operations (TS `HostPermissionsCapability`). Notification retains its
/// canonical owner type; this callback record carries the generic provider's shared identity.
#[derive(Clone)]
pub struct HostPermissionsCapability {
    pub notification: HostNotificationPermissionCapability,
    pub provider: ProviderRef,
    pub query_permission: Arc<dyn Fn(PermissionName) -> PermissionQueryFuture + Send + Sync>,
    pub request_media_access: Arc<dyn Fn(PermissionName) -> PermissionRequestFuture + Send + Sync>,
    pub request_wake_lock: Arc<dyn Fn() -> PermissionRequestFuture + Send + Sync>,
}

/// Relocated persistence query facet (TS `HostPreferencesPersistenceQueryCapability`).
#[derive(Clone)]
pub struct HostPreferencesPersistenceQueryCapability {
    pub get_persistence: Arc<dyn Fn() -> StoragePersistenceFuture + Send + Sync>,
    pub provider: ProviderRef,
}

/// Relocated persistence request facet (TS `HostPreferencesPersistenceRequestCapability`).
#[derive(Clone)]
pub struct HostPreferencesPersistenceRequestCapability {
    pub provider: ProviderRef,
    pub request_persistence: Arc<dyn Fn() -> StoragePersistenceFuture + Send + Sync>,
}

/// Host permission capability group (TS `HostPermissionsCapabilities`).
#[derive(Clone, Default)]
pub struct HostPermissionsCapabilities {
    pub query: Option<HostPermissionsCapability>,
}

// flight-lint: allow(conform-extra) D9e: Rust string-table helper for the TS PermissionQueryFailureReason string union
pub fn get_permission_query_failure_reason_string(
    value: PermissionQueryFailureReason,
) -> &'static str {
    return match value {
        PermissionQueryFailureReason::OperationFailed => "operation-failed",
        PermissionQueryFailureReason::RuntimeUnavailable => "runtime-unavailable",
        PermissionQueryFailureReason::Unsupported => "unsupported",
    };
}

// flight-lint: allow(conform-extra) D9e: Rust string-table helper for the flattened PermissionQueryOutcome reason field
pub fn get_permission_query_reason_string(value: PermissionQueryReason) -> &'static str {
    return match value {
        PermissionQueryReason::BestEffort => "best-effort",
        PermissionQueryReason::Ok => "ok",
        PermissionQueryReason::OperationFailed => "operation-failed",
        PermissionQueryReason::RuntimeUnavailable => "runtime-unavailable",
        PermissionQueryReason::Unsupported => "unsupported",
    };
}

// flight-lint: allow(conform-extra) D9e: Rust string-table helper for the TS PermissionRequestFailureReason string union
pub fn get_permission_request_failure_reason_string(
    value: PermissionRequestFailureReason,
) -> &'static str {
    return match value {
        PermissionRequestFailureReason::NoRequestRoute => "no-request-route",
        PermissionRequestFailureReason::OperationFailed => "operation-failed",
        PermissionRequestFailureReason::RuntimeUnavailable => "runtime-unavailable",
        PermissionRequestFailureReason::Timeout => "timeout",
        PermissionRequestFailureReason::Unsupported => "unsupported",
    };
}

// flight-lint: allow(conform-extra) D9e: Rust string-table helper for the flattened PermissionRequestOutcome reason field
pub fn get_permission_request_reason_string(value: PermissionRequestReason) -> &'static str {
    return match value {
        PermissionRequestReason::BestEffort => "best-effort",
        PermissionRequestReason::CleanupFailed => "cleanup-failed",
        PermissionRequestReason::Denied => "denied",
        PermissionRequestReason::Dismissed => "dismissed",
        PermissionRequestReason::Granted => "granted",
        PermissionRequestReason::NoRequestRoute => "no-request-route",
        PermissionRequestReason::OperationFailed => "operation-failed",
        PermissionRequestReason::RuntimeUnavailable => "runtime-unavailable",
        PermissionRequestReason::Timeout => "timeout",
        PermissionRequestReason::Unsupported => "unsupported",
    };
}

// flight-lint: allow(conform-extra) D9e: Rust string-table helper for the TS PermissionState string union
pub fn get_permission_state_string(value: PermissionState) -> &'static str {
    return match value {
        PermissionState::Denied => "denied",
        PermissionState::Granted => "granted",
        PermissionState::Prompt => "prompt",
    };
}

// flight-lint: allow(conform-extra) D9e: Rust string-table helper for StoragePersistenceOutcome.outcome
pub fn get_storage_persistence_outcome_reason_string(
    value: StoragePersistenceOutcomeReason,
) -> &'static str {
    return match value {
        StoragePersistenceOutcomeReason::BestEffort => "best-effort",
        StoragePersistenceOutcomeReason::OperationFailed => "operation-failed",
        StoragePersistenceOutcomeReason::Persistent => "persistent",
    };
}

// flight-lint: allow(conform-extra) D9e: Rust parser for the TS PermissionQueryFailureReason string union
pub fn parse_permission_query_failure_reason(value: &str) -> Option<PermissionQueryFailureReason> {
    return match value {
        "operation-failed" => Some(PermissionQueryFailureReason::OperationFailed),
        "runtime-unavailable" => Some(PermissionQueryFailureReason::RuntimeUnavailable),
        "unsupported" => Some(PermissionQueryFailureReason::Unsupported),
        _ => None,
    };
}

// flight-lint: allow(conform-extra) D9e: Rust parser for the flattened PermissionQueryOutcome reason field
pub fn parse_permission_query_reason(value: &str) -> Option<PermissionQueryReason> {
    return match value {
        "best-effort" => Some(PermissionQueryReason::BestEffort),
        "ok" => Some(PermissionQueryReason::Ok),
        "operation-failed" => Some(PermissionQueryReason::OperationFailed),
        "runtime-unavailable" => Some(PermissionQueryReason::RuntimeUnavailable),
        "unsupported" => Some(PermissionQueryReason::Unsupported),
        _ => None,
    };
}

// flight-lint: allow(conform-extra) D9e: Rust parser for the TS PermissionRequestFailureReason string union
pub fn parse_permission_request_failure_reason(
    value: &str,
) -> Option<PermissionRequestFailureReason> {
    return match value {
        "no-request-route" => Some(PermissionRequestFailureReason::NoRequestRoute),
        "operation-failed" => Some(PermissionRequestFailureReason::OperationFailed),
        "runtime-unavailable" => Some(PermissionRequestFailureReason::RuntimeUnavailable),
        "timeout" => Some(PermissionRequestFailureReason::Timeout),
        "unsupported" => Some(PermissionRequestFailureReason::Unsupported),
        _ => None,
    };
}

// flight-lint: allow(conform-extra) D9e: Rust parser for the flattened PermissionRequestOutcome reason field
pub fn parse_permission_request_reason(value: &str) -> Option<PermissionRequestReason> {
    return match value {
        "best-effort" => Some(PermissionRequestReason::BestEffort),
        "cleanup-failed" => Some(PermissionRequestReason::CleanupFailed),
        "denied" => Some(PermissionRequestReason::Denied),
        "dismissed" => Some(PermissionRequestReason::Dismissed),
        "granted" => Some(PermissionRequestReason::Granted),
        "no-request-route" => Some(PermissionRequestReason::NoRequestRoute),
        "operation-failed" => Some(PermissionRequestReason::OperationFailed),
        "runtime-unavailable" => Some(PermissionRequestReason::RuntimeUnavailable),
        "timeout" => Some(PermissionRequestReason::Timeout),
        "unsupported" => Some(PermissionRequestReason::Unsupported),
        _ => None,
    };
}

// flight-lint: allow(conform-extra) D9e: Rust parser for the TS PermissionState string union
pub fn parse_permission_state(value: &str) -> Option<PermissionState> {
    return match value {
        "denied" => Some(PermissionState::Denied),
        "granted" => Some(PermissionState::Granted),
        "prompt" => Some(PermissionState::Prompt),
        _ => None,
    };
}

// flight-lint: allow(conform-extra) D9e: Rust parser for StoragePersistenceOutcome.outcome
pub fn parse_storage_persistence_outcome_reason(
    value: &str,
) -> Option<StoragePersistenceOutcomeReason> {
    return match value {
        "best-effort" => Some(StoragePersistenceOutcomeReason::BestEffort),
        "operation-failed" => Some(StoragePersistenceOutcomeReason::OperationFailed),
        "persistent" => Some(StoragePersistenceOutcomeReason::Persistent),
        _ => None,
    };
}
