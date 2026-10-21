use std::sync::Arc;
use std::sync::Mutex;

use flight_entity::EntityRuntimeSlot;
use flight_entity::impl_entity;
use flight_signals::Signal;

// ── Enums (alphabetical) ──────────────────────────────────────────────────────

#[derive(Clone, Debug, PartialEq)]
pub enum StorageBatchMutationOutcome<F> {
    Ok { completed: usize },
    Err { completed: usize, failed_key: Option<String>, reason: F },
}

#[derive(Clone, Copy, Debug, Eq, Hash, PartialEq)]
pub enum StorageClearFailureReason {
    ClearFailed,
    QuotaExceeded,
    RuntimeUnavailable,
    SecurityDenied,
}

#[derive(Clone, Copy, Debug, Eq, Hash, PartialEq)]
pub enum StorageClearNamespaceFailureReason {
    PersistenceInvalid,
    QuotaExceeded,
    ReadFailed,
    RemoveFailed,
    RuntimeUnavailable,
    SecurityDenied,
}

#[derive(Clone, Debug, PartialEq)]
pub enum StorageFallbackOutcome<V> {
    Ok { value: V },
    ParseFailed { value: V },
    ProviderError { reason: StorageGetItemFailureReason },
}

#[derive(Clone, Copy, Debug, Eq, Hash, PartialEq)]
pub enum StorageGetItemFailureReason {
    PersistenceInvalid,
    ReadFailed,
    RuntimeUnavailable,
    SecurityDenied,
}

#[derive(Clone, Copy, Debug, Eq, Hash, PartialEq)]
pub enum StorageMigrationReadFailureReason {
    PersistenceInvalid,
    ReadFailed,
    RuntimeUnavailable,
    SecurityDenied,
    VersionParseFailed,
}

#[derive(Clone, Debug, PartialEq)]
pub enum StorageMigrationOutcomeInner {
    Ok { version: u32 },
    ReadVersionFailed { reason: StorageMigrationReadFailureReason },
    CheckpointFailed { failed_version: u32, reason: StorageSetItemFailureReason, version: u32 },
}

#[derive(Clone, Debug, PartialEq)]
pub enum StorageMutationOutcome<F> {
    Ok,
    Err { reason: F },
}

#[derive(Clone, Debug, PartialEq)]
pub enum StorageQueryOutcome<V> {
    Ok { value: V },
    Err { failed_key: Option<String>, reason: StorageGetItemFailureReason },
}

#[derive(Clone, Copy, Debug, Eq, Hash, PartialEq)]
pub enum StorageReadFailureReason {
    ParseFailed,
    PersistenceInvalid,
    ReadFailed,
    RuntimeUnavailable,
    SecurityDenied,
}

#[derive(Clone, Copy, Debug, Eq, Hash, PartialEq)]
pub enum StorageRemoveItemFailureReason {
    PersistenceInvalid,
    QuotaExceeded,
    ReadFailed,
    RemoveFailed,
    RuntimeUnavailable,
    SecurityDenied,
}

#[derive(Clone, Copy, Debug, Eq, Hash, PartialEq)]
pub enum StorageSetItemFailureReason {
    PersistenceInvalid,
    QuotaExceeded,
    ReadFailed,
    RuntimeUnavailable,
    SecurityDenied,
    WriteFailed,
}

#[derive(Clone, Debug, PartialEq)]
pub enum StorageValueOutcome<V, F> {
    Ok { value: V },
    Err { reason: F },
}

#[derive(Clone, Copy, Debug, Eq, Hash, PartialEq)]
pub enum StorageWriteFailureReason {
    PersistenceInvalid,
    QuotaExceeded,
    ReadFailed,
    RuntimeUnavailable,
    SecurityDenied,
    SerializationFailed,
    WriteFailed,
}

// ── Structs (alphabetical) ────────────────────────────────────────────────────

pub struct HostPreferencesCapability {
    pub clear: Arc<dyn Fn() -> StorageClearResult + Send + Sync>,
    pub get_item: Arc<dyn Fn(&str) -> StorageGetItemResult + Send + Sync>,
    pub keys: Arc<dyn Fn() -> StorageKeysResult + Send + Sync>,
    pub remove_item: Arc<dyn Fn(&str) -> StorageRemoveItemResult + Send + Sync>,
    pub set_item: Arc<dyn Fn(&str, &str) -> StorageSetItemResult + Send + Sync>,
}

pub struct HostPreferencesChangeCapability {
    pub destroy: Arc<dyn Fn() + Send + Sync>,
    pub subscribe: Arc<dyn Fn(Arc<dyn Fn(&StorageChange) + Send + Sync>) -> Option<Arc<dyn Fn() + Send + Sync>> + Send + Sync>,
}

#[derive(Clone, Debug, PartialEq)]
pub struct StorageChange {
    pub key: Option<String>,
    pub new_value: Option<String>,
    pub old_value: Option<String>,
}

pub struct StorageMigration {
    pub migrate: Arc<dyn Fn(Option<&str>) + Send + Sync>,
    pub version: u32,
}

pub struct StorageNamespace {
    pub prefix: String,
}

pub struct StorageSignals {
    runtime: EntityRuntimeSlot,
    pub on_change: Signal<StorageChange>,
    pub(crate) unsubscribe: Mutex<Option<Arc<dyn Fn() + Send + Sync>>>,
}

// ── Type aliases (alphabetical) ──────────────────────────────────────────────

pub type StorageBooleanOrResult = StorageFallbackOutcome<bool>;

pub type StorageBooleanResult = StorageValueOutcome<Option<bool>, StorageReadFailureReason>;

pub type StorageByteSizeResult = StorageQueryOutcome<usize>;

pub type StorageClearNamespaceResult = StorageBatchMutationOutcome<StorageClearNamespaceFailureReason>;

pub type StorageClearResult = StorageMutationOutcome<StorageClearFailureReason>;

pub type StorageEntriesResult = StorageQueryOutcome<Vec<(String, String)>>;

pub type StorageGetItemResult = StorageValueOutcome<Option<String>, StorageGetItemFailureReason>;

pub type StorageItemCountResult = StorageValueOutcome<usize, StorageGetItemFailureReason>;

pub type StorageItemOrResult = StorageValueOutcome<String, StorageGetItemFailureReason>;

pub type StorageItemsResult = StorageQueryOutcome<Vec<Option<String>>>;

// flight-lint: allow(contract-vocabulary) TS any/JSON storage values
pub type StorageJsonOrResult = StorageFallbackOutcome<Option<serde_json::Value>>;

// flight-lint: allow(contract-vocabulary) TS any/JSON storage values
pub type StorageJsonResult = StorageValueOutcome<Option<serde_json::Value>, StorageReadFailureReason>;

pub type StorageJsonWriteResult = StorageMutationOutcome<StorageWriteFailureReason>;

pub type StorageKeysResult = StorageValueOutcome<Vec<String>, StorageGetItemFailureReason>;

pub type StorageMigrationOutcome = StorageMigrationOutcomeInner;

// flight-lint: allow(f64) TS number type for numeric storage values
pub type StorageNumberOrResult = StorageFallbackOutcome<f64>;

// flight-lint: allow(f64) TS number type for numeric storage values
pub type StorageNumberResult = StorageValueOutcome<Option<f64>, StorageReadFailureReason>;

pub type StoragePresenceResult = StorageValueOutcome<bool, StorageGetItemFailureReason>;

pub type StorageRemoveItemResult = StorageMutationOutcome<StorageRemoveItemFailureReason>;

pub type StorageRemoveItemsResult = StorageBatchMutationOutcome<StorageRemoveItemFailureReason>;

pub type StorageSetItemResult = StorageMutationOutcome<StorageSetItemFailureReason>;

pub type StorageSetItemsResult = StorageBatchMutationOutcome<StorageSetItemFailureReason>;

// ── Free functions (alphabetical) ──────────────────────────────────────────

// flight-lint: allow(conform-extra) D9e: Rust string-table helper for the TS StorageClearFailureReason string union
pub fn get_storage_clear_failure_reason_string(value: StorageClearFailureReason) -> &'static str {
    return match value {
        StorageClearFailureReason::ClearFailed => "clear-failed",
        StorageClearFailureReason::QuotaExceeded => "quota-exceeded",
        StorageClearFailureReason::RuntimeUnavailable => "runtime-unavailable",
        StorageClearFailureReason::SecurityDenied => "security-denied",
    };
}

// flight-lint: allow(conform-extra) D9e: Rust string-table helper for the TS StorageClearNamespaceFailureReason string union
pub fn get_storage_clear_namespace_failure_reason_string(
    value: StorageClearNamespaceFailureReason,
) -> &'static str {
    return match value {
        StorageClearNamespaceFailureReason::PersistenceInvalid => "persistence-invalid",
        StorageClearNamespaceFailureReason::QuotaExceeded => "quota-exceeded",
        StorageClearNamespaceFailureReason::ReadFailed => "read-failed",
        StorageClearNamespaceFailureReason::RemoveFailed => "remove-failed",
        StorageClearNamespaceFailureReason::RuntimeUnavailable => "runtime-unavailable",
        StorageClearNamespaceFailureReason::SecurityDenied => "security-denied",
    };
}

// flight-lint: allow(conform-extra) D9e: Rust string-table helper for the TS StorageGetItemFailureReason string union
pub fn get_storage_get_item_failure_reason_string(
    value: StorageGetItemFailureReason,
) -> &'static str {
    return match value {
        StorageGetItemFailureReason::PersistenceInvalid => "persistence-invalid",
        StorageGetItemFailureReason::ReadFailed => "read-failed",
        StorageGetItemFailureReason::RuntimeUnavailable => "runtime-unavailable",
        StorageGetItemFailureReason::SecurityDenied => "security-denied",
    };
}

// flight-lint: allow(conform-extra) D9e: Rust string-table helper for the TS StorageMigrationReadFailureReason string union
pub fn get_storage_migration_read_failure_reason_string(
    value: StorageMigrationReadFailureReason,
) -> &'static str {
    return match value {
        StorageMigrationReadFailureReason::PersistenceInvalid => "persistence-invalid",
        StorageMigrationReadFailureReason::ReadFailed => "read-failed",
        StorageMigrationReadFailureReason::RuntimeUnavailable => "runtime-unavailable",
        StorageMigrationReadFailureReason::SecurityDenied => "security-denied",
        StorageMigrationReadFailureReason::VersionParseFailed => "version-parse-failed",
    };
}

// flight-lint: allow(conform-extra) D9e: Rust string-table helper for the TS StorageReadFailureReason string union
pub fn get_storage_read_failure_reason_string(value: StorageReadFailureReason) -> &'static str {
    return match value {
        StorageReadFailureReason::ParseFailed => "parse-failed",
        StorageReadFailureReason::PersistenceInvalid => "persistence-invalid",
        StorageReadFailureReason::ReadFailed => "read-failed",
        StorageReadFailureReason::RuntimeUnavailable => "runtime-unavailable",
        StorageReadFailureReason::SecurityDenied => "security-denied",
    };
}

// flight-lint: allow(conform-extra) D9e: Rust string-table helper for the TS StorageRemoveItemFailureReason string union
pub fn get_storage_remove_item_failure_reason_string(
    value: StorageRemoveItemFailureReason,
) -> &'static str {
    return match value {
        StorageRemoveItemFailureReason::PersistenceInvalid => "persistence-invalid",
        StorageRemoveItemFailureReason::QuotaExceeded => "quota-exceeded",
        StorageRemoveItemFailureReason::ReadFailed => "read-failed",
        StorageRemoveItemFailureReason::RemoveFailed => "remove-failed",
        StorageRemoveItemFailureReason::RuntimeUnavailable => "runtime-unavailable",
        StorageRemoveItemFailureReason::SecurityDenied => "security-denied",
    };
}

// flight-lint: allow(conform-extra) D9e: Rust string-table helper for the TS StorageSetItemFailureReason string union
pub fn get_storage_set_item_failure_reason_string(
    value: StorageSetItemFailureReason,
) -> &'static str {
    return match value {
        StorageSetItemFailureReason::PersistenceInvalid => "persistence-invalid",
        StorageSetItemFailureReason::QuotaExceeded => "quota-exceeded",
        StorageSetItemFailureReason::ReadFailed => "read-failed",
        StorageSetItemFailureReason::RuntimeUnavailable => "runtime-unavailable",
        StorageSetItemFailureReason::SecurityDenied => "security-denied",
        StorageSetItemFailureReason::WriteFailed => "write-failed",
    };
}

// flight-lint: allow(conform-extra) D9e: Rust string-table helper for the TS StorageWriteFailureReason string union
pub fn get_storage_write_failure_reason_string(
    value: StorageWriteFailureReason,
) -> &'static str {
    return match value {
        StorageWriteFailureReason::PersistenceInvalid => "persistence-invalid",
        StorageWriteFailureReason::QuotaExceeded => "quota-exceeded",
        StorageWriteFailureReason::ReadFailed => "read-failed",
        StorageWriteFailureReason::RuntimeUnavailable => "runtime-unavailable",
        StorageWriteFailureReason::SecurityDenied => "security-denied",
        StorageWriteFailureReason::SerializationFailed => "serialization-failed",
        StorageWriteFailureReason::WriteFailed => "write-failed",
    };
}

// flight-lint: allow(conform-extra) D9e: Rust parser for the TS StorageClearFailureReason string union
pub fn parse_storage_clear_failure_reason(value: &str) -> Option<StorageClearFailureReason> {
    return match value {
        "clear-failed" => Some(StorageClearFailureReason::ClearFailed),
        "quota-exceeded" => Some(StorageClearFailureReason::QuotaExceeded),
        "runtime-unavailable" => Some(StorageClearFailureReason::RuntimeUnavailable),
        "security-denied" => Some(StorageClearFailureReason::SecurityDenied),
        _ => None,
    };
}

// flight-lint: allow(conform-extra) D9e: Rust parser for the TS StorageClearNamespaceFailureReason string union
pub fn parse_storage_clear_namespace_failure_reason(
    value: &str,
) -> Option<StorageClearNamespaceFailureReason> {
    return match value {
        "persistence-invalid" => Some(StorageClearNamespaceFailureReason::PersistenceInvalid),
        "quota-exceeded" => Some(StorageClearNamespaceFailureReason::QuotaExceeded),
        "read-failed" => Some(StorageClearNamespaceFailureReason::ReadFailed),
        "remove-failed" => Some(StorageClearNamespaceFailureReason::RemoveFailed),
        "runtime-unavailable" => Some(StorageClearNamespaceFailureReason::RuntimeUnavailable),
        "security-denied" => Some(StorageClearNamespaceFailureReason::SecurityDenied),
        _ => None,
    };
}

// flight-lint: allow(conform-extra) D9e: Rust parser for the TS StorageGetItemFailureReason string union
pub fn parse_storage_get_item_failure_reason(
    value: &str,
) -> Option<StorageGetItemFailureReason> {
    return match value {
        "persistence-invalid" => Some(StorageGetItemFailureReason::PersistenceInvalid),
        "read-failed" => Some(StorageGetItemFailureReason::ReadFailed),
        "runtime-unavailable" => Some(StorageGetItemFailureReason::RuntimeUnavailable),
        "security-denied" => Some(StorageGetItemFailureReason::SecurityDenied),
        _ => None,
    };
}

// flight-lint: allow(conform-extra) D9e: Rust parser for the TS StorageMigrationReadFailureReason string union
pub fn parse_storage_migration_read_failure_reason(
    value: &str,
) -> Option<StorageMigrationReadFailureReason> {
    return match value {
        "persistence-invalid" => Some(StorageMigrationReadFailureReason::PersistenceInvalid),
        "read-failed" => Some(StorageMigrationReadFailureReason::ReadFailed),
        "runtime-unavailable" => Some(StorageMigrationReadFailureReason::RuntimeUnavailable),
        "security-denied" => Some(StorageMigrationReadFailureReason::SecurityDenied),
        "version-parse-failed" => Some(StorageMigrationReadFailureReason::VersionParseFailed),
        _ => None,
    };
}

// flight-lint: allow(conform-extra) D9e: Rust parser for the TS StorageReadFailureReason string union
pub fn parse_storage_read_failure_reason(value: &str) -> Option<StorageReadFailureReason> {
    return match value {
        "parse-failed" => Some(StorageReadFailureReason::ParseFailed),
        "persistence-invalid" => Some(StorageReadFailureReason::PersistenceInvalid),
        "read-failed" => Some(StorageReadFailureReason::ReadFailed),
        "runtime-unavailable" => Some(StorageReadFailureReason::RuntimeUnavailable),
        "security-denied" => Some(StorageReadFailureReason::SecurityDenied),
        _ => None,
    };
}

// flight-lint: allow(conform-extra) D9e: Rust parser for the TS StorageRemoveItemFailureReason string union
pub fn parse_storage_remove_item_failure_reason(
    value: &str,
) -> Option<StorageRemoveItemFailureReason> {
    return match value {
        "persistence-invalid" => Some(StorageRemoveItemFailureReason::PersistenceInvalid),
        "quota-exceeded" => Some(StorageRemoveItemFailureReason::QuotaExceeded),
        "read-failed" => Some(StorageRemoveItemFailureReason::ReadFailed),
        "remove-failed" => Some(StorageRemoveItemFailureReason::RemoveFailed),
        "runtime-unavailable" => Some(StorageRemoveItemFailureReason::RuntimeUnavailable),
        "security-denied" => Some(StorageRemoveItemFailureReason::SecurityDenied),
        _ => None,
    };
}

// flight-lint: allow(conform-extra) D9e: Rust parser for the TS StorageSetItemFailureReason string union
pub fn parse_storage_set_item_failure_reason(
    value: &str,
) -> Option<StorageSetItemFailureReason> {
    return match value {
        "persistence-invalid" => Some(StorageSetItemFailureReason::PersistenceInvalid),
        "quota-exceeded" => Some(StorageSetItemFailureReason::QuotaExceeded),
        "read-failed" => Some(StorageSetItemFailureReason::ReadFailed),
        "runtime-unavailable" => Some(StorageSetItemFailureReason::RuntimeUnavailable),
        "security-denied" => Some(StorageSetItemFailureReason::SecurityDenied),
        "write-failed" => Some(StorageSetItemFailureReason::WriteFailed),
        _ => None,
    };
}

// flight-lint: allow(conform-extra) D9e: Rust parser for the TS StorageWriteFailureReason string union
pub fn parse_storage_write_failure_reason(value: &str) -> Option<StorageWriteFailureReason> {
    return match value {
        "persistence-invalid" => Some(StorageWriteFailureReason::PersistenceInvalid),
        "quota-exceeded" => Some(StorageWriteFailureReason::QuotaExceeded),
        "read-failed" => Some(StorageWriteFailureReason::ReadFailed),
        "runtime-unavailable" => Some(StorageWriteFailureReason::RuntimeUnavailable),
        "security-denied" => Some(StorageWriteFailureReason::SecurityDenied),
        "serialization-failed" => Some(StorageWriteFailureReason::SerializationFailed),
        "write-failed" => Some(StorageWriteFailureReason::WriteFailed),
        _ => None,
    };
}

// flight-lint: allow(conform-extra) D9e: Rust free-function form of TS method isOk on StorageBatchMutationOutcome
pub fn storage_batch_mutation_outcome_is_ok<F>(outcome: &StorageBatchMutationOutcome<F>) -> bool {
    return matches!(outcome, StorageBatchMutationOutcome::Ok { .. });
}

// flight-lint: allow(conform-extra) D9e: Rust free-function form of TS method reason on StorageBatchMutationOutcome
// flight-lint: allow(contract-vocabulary) Copy bound required to extract failure reason from outcome variant
pub fn storage_batch_mutation_outcome_reason<F: Copy>(outcome: &StorageBatchMutationOutcome<F>) -> Option<F> {
    return match outcome {
        StorageBatchMutationOutcome::Ok { .. } => None,
        StorageBatchMutationOutcome::Err { reason, .. } => Some(*reason),
    };
}

// flight-lint: allow(conform-extra) D9e: Rust free-function form of TS enum mapping for StorageGetItemFailureReason
pub fn storage_get_item_failure_into_clear_namespace(value: StorageGetItemFailureReason) -> StorageClearNamespaceFailureReason {
    return match value {
        StorageGetItemFailureReason::PersistenceInvalid => StorageClearNamespaceFailureReason::PersistenceInvalid,
        StorageGetItemFailureReason::ReadFailed => StorageClearNamespaceFailureReason::ReadFailed,
        StorageGetItemFailureReason::RuntimeUnavailable => StorageClearNamespaceFailureReason::RuntimeUnavailable,
        StorageGetItemFailureReason::SecurityDenied => StorageClearNamespaceFailureReason::SecurityDenied,
    };
}

// flight-lint: allow(conform-extra) D9e: Rust free-function form of TS enum mapping for StorageGetItemFailureReason
pub fn storage_get_item_failure_into_migration_read(value: StorageGetItemFailureReason) -> StorageMigrationReadFailureReason {
    return match value {
        StorageGetItemFailureReason::PersistenceInvalid => StorageMigrationReadFailureReason::PersistenceInvalid,
        StorageGetItemFailureReason::ReadFailed => StorageMigrationReadFailureReason::ReadFailed,
        StorageGetItemFailureReason::RuntimeUnavailable => StorageMigrationReadFailureReason::RuntimeUnavailable,
        StorageGetItemFailureReason::SecurityDenied => StorageMigrationReadFailureReason::SecurityDenied,
    };
}

// flight-lint: allow(conform-extra) D9e: Rust free-function form of TS enum mapping for StorageGetItemFailureReason
pub fn storage_get_item_failure_into_read(value: StorageGetItemFailureReason) -> StorageReadFailureReason {
    return match value {
        StorageGetItemFailureReason::PersistenceInvalid => StorageReadFailureReason::PersistenceInvalid,
        StorageGetItemFailureReason::ReadFailed => StorageReadFailureReason::ReadFailed,
        StorageGetItemFailureReason::RuntimeUnavailable => StorageReadFailureReason::RuntimeUnavailable,
        StorageGetItemFailureReason::SecurityDenied => StorageReadFailureReason::SecurityDenied,
    };
}

// flight-lint: allow(conform-extra) D9e: Rust free-function form of TS method isOk on StorageMutationOutcome
pub fn storage_mutation_outcome_is_ok<F>(outcome: &StorageMutationOutcome<F>) -> bool {
    return matches!(outcome, StorageMutationOutcome::Ok);
}

// flight-lint: allow(conform-extra) D9e: Rust free-function form of TS method reason on StorageMutationOutcome
// flight-lint: allow(contract-vocabulary) Copy bound required to extract failure reason from outcome variant
pub fn storage_mutation_outcome_reason<F: Copy>(outcome: &StorageMutationOutcome<F>) -> Option<F> {
    return match outcome {
        StorageMutationOutcome::Ok => None,
        StorageMutationOutcome::Err { reason } => Some(*reason),
    };
}

// flight-lint: allow(conform-extra) D9e: Rust free-function form of TS enum mapping for StorageRemoveItemFailureReason
pub fn storage_remove_item_failure_into_clear_namespace(value: StorageRemoveItemFailureReason) -> StorageClearNamespaceFailureReason {
    return match value {
        StorageRemoveItemFailureReason::PersistenceInvalid => StorageClearNamespaceFailureReason::PersistenceInvalid,
        StorageRemoveItemFailureReason::QuotaExceeded => StorageClearNamespaceFailureReason::QuotaExceeded,
        StorageRemoveItemFailureReason::ReadFailed => StorageClearNamespaceFailureReason::ReadFailed,
        StorageRemoveItemFailureReason::RemoveFailed => StorageClearNamespaceFailureReason::RemoveFailed,
        StorageRemoveItemFailureReason::RuntimeUnavailable => StorageClearNamespaceFailureReason::RuntimeUnavailable,
        StorageRemoveItemFailureReason::SecurityDenied => StorageClearNamespaceFailureReason::SecurityDenied,
    };
}

// flight-lint: allow(conform-extra) D9e: Rust free-function form of TS method isOk on StorageValueOutcome
pub fn storage_value_outcome_is_ok<V, F>(outcome: &StorageValueOutcome<V, F>) -> bool {
    return matches!(outcome, StorageValueOutcome::Ok { .. });
}

// ── Impl blocks (alphabetical by type) ──────────────────────────────────────

impl Default for StorageSignals {
    fn default() -> Self {
        return StorageSignals {
            runtime: EntityRuntimeSlot::default(),
            on_change: Signal::default(),
            unsubscribe: Mutex::new(None),
        };
    }
}

impl StorageBatchMutationOutcome<StorageClearNamespaceFailureReason> {
    pub fn is_ok(&self) -> bool {
        return storage_batch_mutation_outcome_is_ok(self);
    }

    pub fn reason(&self) -> Option<StorageClearNamespaceFailureReason> {
        return storage_batch_mutation_outcome_reason(self);
    }
}

impl StorageBatchMutationOutcome<StorageRemoveItemFailureReason> {
    pub fn is_ok(&self) -> bool {
        return storage_batch_mutation_outcome_is_ok(self);
    }

    pub fn reason(&self) -> Option<StorageRemoveItemFailureReason> {
        return storage_batch_mutation_outcome_reason(self);
    }
}

impl StorageBatchMutationOutcome<StorageSetItemFailureReason> {
    pub fn is_ok(&self) -> bool {
        return storage_batch_mutation_outcome_is_ok(self);
    }

    pub fn reason(&self) -> Option<StorageSetItemFailureReason> {
        return storage_batch_mutation_outcome_reason(self);
    }
}

impl StorageGetItemFailureReason {
    pub fn into_clear_namespace(self) -> StorageClearNamespaceFailureReason {
        return storage_get_item_failure_into_clear_namespace(self);
    }

    pub fn into_migration_read(self) -> StorageMigrationReadFailureReason {
        return storage_get_item_failure_into_migration_read(self);
    }

    pub fn into_read(self) -> StorageReadFailureReason {
        return storage_get_item_failure_into_read(self);
    }
}

impl<F: Copy> StorageMutationOutcome<F> {
    pub fn is_ok(&self) -> bool {
        return storage_mutation_outcome_is_ok(self);
    }

    pub fn reason(&self) -> Option<F> {
        return storage_mutation_outcome_reason(self);
    }
}

impl StorageRemoveItemFailureReason {
    pub fn into_clear_namespace(self) -> StorageClearNamespaceFailureReason {
        return storage_remove_item_failure_into_clear_namespace(self);
    }
}

impl<V, F: Copy> StorageValueOutcome<V, F> {
    pub fn is_ok(&self) -> bool {
        return storage_value_outcome_is_ok(self);
    }
}

// ── Entity impl ─────────────────────────────────────────────────────────────

impl_entity!(StorageSignals);
