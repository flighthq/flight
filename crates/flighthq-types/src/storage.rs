//! Shared storage value types for the `@flighthq/storage` seam.
//!
//! The [`StorageBackend`](crate::StorageBackend) trait itself lives in `platform`; these are the
//! plain-data descriptors the storage free functions operate over — namespaces, change records,
//! versioned migrations, the quota estimate, and the change-notification signal group.

use flighthq_signals::Signal;

/// A prefix-scoped view into the keyspace.
///
/// Keys under the namespace are stored as `prefix + '.' + key` and never collide with the global
/// keyspace or other namespaces.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct StorageNamespace {
    /// The key prefix that scopes this namespace.
    pub prefix: String,
}

/// A single change to the store, delivered to `StorageSignals::on_change`.
///
/// `key` is `None` for a whole-store clear. `old_value`/`new_value` are `None` when absent.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct StorageChange {
    /// The key that changed, or `None` for a whole-store clear.
    pub key: Option<String>,
    /// The value before the change, or `None` when previously absent.
    pub old_value: Option<String>,
    /// The value after the change, or `None` on removal/clear.
    pub new_value: Option<String>,
}

/// One versioned migration step applied by `migrate_storage`.
///
/// Migrations run in ascending `version` order, starting from the stored version + 1. The `migrate`
/// callback receives the namespace prefix (or `None` for the global keyspace) and returns `false`
/// to signal failure — the Rust analogue of the TS migration throwing, which aborts the run.
pub struct StorageMigration {
    /// The version this migration brings the store up to.
    pub version: i32,
    /// Runs the migration. Receives the namespace prefix or `None`; returns `false` on failure.
    #[allow(clippy::type_complexity)]
    pub migrate: Box<dyn Fn(Option<&str>) -> bool + Send + Sync>,
}

/// A best-effort storage quota estimate. Both fields are byte counts; `-1` marks an unknown value.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct StorageQuota {
    /// Bytes currently used, or `-1` when unknown.
    pub used: f64,
    /// Bytes still available, or `-1` when unknown.
    pub available: f64,
}

/// The storage change-notification group, enabled via `enable_storage_signals`.
pub struct StorageSignals {
    /// Fires for each same-tab write/removal/clear and for cross-tab backend changes.
    pub on_change: Signal<StorageChange>,
}
