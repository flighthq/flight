use std::future::Future;
use std::pin::Pin;
use std::sync::Arc;

use flight_entity::{EntityRuntimeSlot, FlightError, Ref, allocate_entity};

/// Metadata the source's downloaded boundary can prove (TS `UpdateInfo`). A `None` field is
/// unknown; providers must not fabricate a sentinel, default or richer fact.
#[derive(Clone, Debug, Default, PartialEq, Eq)]
// flight-lint: allow(contract-vocabulary) D1 range declaration: download_size_bytes is a byte count below 2^53, exact in TS numbers and never lossy like f32
pub struct UpdateInfo {
    pub download_size_bytes: Option<i64>,
    pub is_mandatory: Option<bool>,
    pub minimum_os_version: Option<String>,
    pub notes: Option<String>,
    pub release_date: Option<String>,
    pub sha512: Option<String>,
    pub version: Option<String>,
}

/// A successful check's provider-pinned handle (TS `DownloadedUpdate`, an Entity). The originating
/// provider is attached to this entity's runtime slot, so replacing the selected host provider
/// never redirects an already-downloaded update.
#[derive(Clone, Debug, Default, PartialEq)]
pub struct DownloadedUpdate {
    runtime: EntityRuntimeSlot,
    pub info: UpdateInfo,
}

/// The reason arm of a check outcome (TS `AppUpdateCheckOutcome['reason']`).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum AppUpdateCheckReason {
    Downloaded,
    CheckInProgress,
    NotAvailable,
    OperationFailed,
}

/// The successful check arm, which carries the provider-pinned handle.
#[derive(Clone, Debug, PartialEq)]
pub struct AppUpdateCheckOutcomeDownloaded {
    pub update: DownloadedUpdate,
}

/// The arm reporting that a check was already running.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct AppUpdateCheckOutcomeCheckInProgress {}

/// The arm reporting that no update is available.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct AppUpdateCheckOutcomeNotAvailable {}

/// The arm reporting that the check could not complete.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct AppUpdateCheckOutcomeOperationFailed {}

/// What one explicit app update check produced (TS `AppUpdateCheckOutcome`). The source's grouped
/// three-reason arm splits into three payload-less variants so every reason string stays explicit.
#[derive(Clone, Debug, PartialEq)]
pub enum AppUpdateCheckOutcome {
    Downloaded(AppUpdateCheckOutcomeDownloaded),
    CheckInProgress(AppUpdateCheckOutcomeCheckInProgress),
    NotAvailable(AppUpdateCheckOutcomeNotAvailable),
    OperationFailed(AppUpdateCheckOutcomeOperationFailed),
}

/// The reason arm of an install outcome (TS `AppUpdateInstallOutcome['reason']`).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum AppUpdateInstallReason {
    Ok,
    OperationFailed,
}

/// What one install attempt produced (TS `AppUpdateInstallOutcome`).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct AppUpdateInstallOutcome {
    pub reason: AppUpdateInstallReason,
}

/// Boxed Send future for one explicit app update check (D15). A rejected source Promise maps to
/// `Err` and the check reports `operation-failed`, matching the source catch.
// flight-lint: allow(contract-vocabulary) D15/D10: a rejected TS Promise has no vocabulary row; Result<_, FlightError> models it and check_for_app_update maps Err to operation-failed
pub type AppUpdateCheckFuture =
    Pin<Box<dyn Future<Output = Result<AppUpdateCheckOutcome, FlightError>> + Send>>;

/// Boxed Send future for one install attempt (D15). A rejected source Promise maps to `Err` and
/// the install reports `operation-failed` without consuming the handle, matching the source catch.
// flight-lint: allow(contract-vocabulary) D15/D10: a rejected TS Promise has no vocabulary row; Result<_, FlightError> models it and install_downloaded_update maps Err to operation-failed
pub type AppUpdateInstallFuture =
    Pin<Box<dyn Future<Output = Result<AppUpdateInstallOutcome, FlightError>> + Send>>;

/// Plain dispatch infrastructure (TS `HostUpdaterCommandCapability`). Squirrel auto-downloads
/// during check, so the awaited check is the only download command.
#[derive(Clone)]
pub struct HostUpdaterCommandCapability {
    pub check: Arc<dyn Fn() -> AppUpdateCheckFuture + Send + Sync>,
    pub destroy: Arc<dyn Fn() + Send + Sync>,
    pub install: Arc<dyn Fn(&DownloadedUpdate) -> AppUpdateInstallFuture + Send + Sync>,
}

/// The updater capability group (TS `HostUpdaterCapabilities`). The shared handle preserves the
/// exact provider identity the source compares by object reference.
#[derive(Clone, Default)]
pub struct HostUpdaterCapabilities {
    pub command: Option<Ref<HostUpdaterCommandCapability>>,
}

// flight-lint: allow(conform-extra) D12 entity construction: DownloadedUpdate's private runtime slot requires a typed factory; TS providers construct the structural object in their adapters
pub fn create_downloaded_update(info: UpdateInfo) -> DownloadedUpdate {
    let mut out: DownloadedUpdate = allocate_entity();
    initialize_downloaded_update(&mut out, info);
    return out;
}

// flight-lint: allow(conform-extra) D12 entity construction: DownloadedUpdate's private runtime slot requires a typed initializer; TS providers construct the structural object in their adapters
pub fn initialize_downloaded_update(out: &mut DownloadedUpdate, info: UpdateInfo) {
    out.info = info;
}

// flight-lint: allow(conform-extra) Rust accessor for the TS discriminated-union reason field; TS reads `outcome.reason` directly
pub fn get_app_update_check_outcome_reason(value: &AppUpdateCheckOutcome) -> AppUpdateCheckReason {
    return match value {
        AppUpdateCheckOutcome::Downloaded(_) => AppUpdateCheckReason::Downloaded,
        AppUpdateCheckOutcome::CheckInProgress(_) => AppUpdateCheckReason::CheckInProgress,
        AppUpdateCheckOutcome::NotAvailable(_) => AppUpdateCheckReason::NotAvailable,
        AppUpdateCheckOutcome::OperationFailed(_) => AppUpdateCheckReason::OperationFailed,
    };
}

// flight-lint: allow(conform-extra) D9e: Rust string-table helper for the TS AppUpdateCheckOutcome reason union; the TS package exports no get_/parse_ free functions
pub fn get_app_update_check_reason_string(value: AppUpdateCheckReason) -> &'static str {
    return match value {
        AppUpdateCheckReason::Downloaded => "downloaded",
        AppUpdateCheckReason::CheckInProgress => "check-in-progress",
        AppUpdateCheckReason::NotAvailable => "not-available",
        AppUpdateCheckReason::OperationFailed => "operation-failed",
    };
}

// flight-lint: allow(conform-extra) D9e: Rust string-table helper for the TS AppUpdateInstallOutcome reason union; the TS package exports no get_/parse_ free functions
pub fn get_app_update_install_reason_string(value: AppUpdateInstallReason) -> &'static str {
    return match value {
        AppUpdateInstallReason::Ok => "ok",
        AppUpdateInstallReason::OperationFailed => "operation-failed",
    };
}

// flight-lint: allow(conform-extra) D9e: Rust string-table helper for the TS AppUpdateCheckOutcome reason union; the TS package exports no get_/parse_ free functions
pub fn parse_app_update_check_reason(value: &str) -> Option<AppUpdateCheckReason> {
    return match value {
        "downloaded" => Some(AppUpdateCheckReason::Downloaded),
        "check-in-progress" => Some(AppUpdateCheckReason::CheckInProgress),
        "not-available" => Some(AppUpdateCheckReason::NotAvailable),
        "operation-failed" => Some(AppUpdateCheckReason::OperationFailed),
        _ => None,
    };
}

// flight-lint: allow(conform-extra) D9e: Rust string-table helper for the TS AppUpdateInstallOutcome reason union; the TS package exports no get_/parse_ free functions
pub fn parse_app_update_install_reason(value: &str) -> Option<AppUpdateInstallReason> {
    return match value {
        "ok" => Some(AppUpdateInstallReason::Ok),
        "operation-failed" => Some(AppUpdateInstallReason::OperationFailed),
        _ => None,
    };
}

flight_entity::impl_entity!(DownloadedUpdate);
