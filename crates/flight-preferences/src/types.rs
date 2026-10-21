use flight_entity::entity_key;
use flight_entity::impl_entity;
use flight_entity::Entity;
use flight_signals::Signal;

// ── Enums (alphabetical) ──────────────────────────────────────────────────────

#[derive(Clone, Copy, Debug, Eq, Hash, PartialEq)]
pub enum StorageClearFailureReason {
    ClearFailed,
    QuotaExceeded,
    RuntimeUnavailable,
    SecurityDenied,
}

#[derive(Clone, Copy, Debug, Eq, Hash, PartialEq)]
pub enum StorageGetItemFailureReason {
    PersistenceInvalid,
    ReadFailed,
    RuntimeUnavailable,
    SecurityDenied,
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
    pub clear: Box<dyn Fn() -> StorageClearResult + Send + Sync>,
    pub get_item: Box<dyn Fn(&str) -> StorageGetItemResult + Send + Sync>,
    pub keys: Box<dyn Fn() -> StorageKeysResult + Send + Sync>,
    pub remove_item: Box<dyn Fn(&str) -> StorageRemoveItemResult + Send + Sync>,
    pub set_item: Box<dyn Fn(&str, &str) -> StorageSetItemResult + Send + Sync>,
}

pub struct HostPreferencesChangeCapability {
    pub destroy: Box<dyn Fn() + Send + Sync>,
    pub subscribe: Box<dyn Fn(Box<dyn Fn(&StorageChange) + Send + Sync>) -> Option<Box<dyn Fn() + Send + Sync>> + Send + Sync>,
}

#[derive(Clone, Debug, PartialEq)]
pub struct StorageChange {
    pub key: Option<String>,
    pub new_value: Option<String>,
    pub old_value: Option<String>,
}

pub struct StorageMigration {
    pub migrate: Box<dyn Fn(Option<&str>) + Send + Sync>,
    pub version: u32,
}

pub struct StorageNamespace {
    pub prefix: String,
}

pub struct StorageSignals {
    entity_key: u64,
    pub on_change: Signal<StorageChange>,
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

pub type StorageJsonOrResult = StorageFallbackOutcome<Option<serde_json::Value>>;

pub type StorageJsonResult = StorageValueOutcome<Option<serde_json::Value>, StorageReadFailureReason>;

pub type StorageJsonWriteResult = StorageMutationOutcome<StorageWriteFailureReason>;

pub type StorageKeysResult = StorageValueOutcome<Vec<String>, StorageGetItemFailureReason>;

pub type StorageMigrationOutcome = StorageMigrationOutcomeInner;

pub type StorageNumberOrResult = StorageFallbackOutcome<f64>;

pub type StorageNumberResult = StorageValueOutcome<Option<f64>, StorageReadFailureReason>;

pub type StoragePresenceResult = StorageValueOutcome<bool, StorageGetItemFailureReason>;

pub type StorageRemoveItemResult = StorageMutationOutcome<StorageRemoveItemFailureReason>;

pub type StorageRemoveItemsResult = StorageBatchMutationOutcome<StorageRemoveItemFailureReason>;

pub type StorageSetItemResult = StorageMutationOutcome<StorageSetItemFailureReason>;

pub type StorageSetItemsResult = StorageBatchMutationOutcome<StorageSetItemFailureReason>;

// ── Outcome structures (alphabetical) ────────────────────────────────────────

#[derive(Clone, Debug, PartialEq)]
pub enum StorageBatchMutationOutcome<F> {
    Ok { completed: usize },
    Err { completed: usize, failed_key: Option<String>, reason: F },
}

#[derive(Clone, Debug, PartialEq)]
pub enum StorageFallbackOutcome<V> {
    Ok { value: V },
    ParseFailed { value: V },
    ProviderError { reason: StorageGetItemFailureReason },
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

#[derive(Clone, Debug, PartialEq)]
pub enum StorageValueOutcome<V, F> {
    Ok { value: V },
    Err { reason: F },
}

// ── Extra enums for combined failure types ───────────────────────────────────

#[derive(Clone, Copy, Debug, Eq, Hash, PartialEq)]
pub enum StorageClearNamespaceFailureReason {
    PersistenceInvalid,
    QuotaExceeded,
    ReadFailed,
    RemoveFailed,
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

// ── Impl blocks (alphabetical by type) ──────────────────────────────────────

impl StorageBatchMutationOutcome<StorageClearNamespaceFailureReason> {
    pub fn reason(&self) -> Option<StorageClearNamespaceFailureReason> {
        return match self {
            Self::Ok { .. } => None,
            Self::Err { reason, .. } => Some(*reason),
        };
    }

    pub fn is_ok(&self) -> bool {
        return matches!(self, Self::Ok { .. });
    }
}

impl StorageBatchMutationOutcome<StorageRemoveItemFailureReason> {
    pub fn reason(&self) -> Option<StorageRemoveItemFailureReason> {
        return match self {
            Self::Ok { .. } => None,
            Self::Err { reason, .. } => Some(*reason),
        };
    }

    pub fn is_ok(&self) -> bool {
        return matches!(self, Self::Ok { .. });
    }
}

impl StorageBatchMutationOutcome<StorageSetItemFailureReason> {
    pub fn reason(&self) -> Option<StorageSetItemFailureReason> {
        return match self {
            Self::Ok { .. } => None,
            Self::Err { reason, .. } => Some(*reason),
        };
    }

    pub fn is_ok(&self) -> bool {
        return matches!(self, Self::Ok { .. });
    }
}

impl<F: Copy> StorageMutationOutcome<F> {
    pub fn reason(&self) -> Option<F> {
        return match self {
            Self::Ok => None,
            Self::Err { reason } => Some(*reason),
        };
    }

    pub fn is_ok(&self) -> bool {
        return matches!(self, Self::Ok);
    }
}

impl<V, F: Copy> StorageValueOutcome<V, F> {
    pub fn is_ok(&self) -> bool {
        return matches!(self, Self::Ok { .. });
    }
}

impl StorageGetItemFailureReason {
    pub fn into_clear_namespace(self) -> StorageClearNamespaceFailureReason {
        return match self {
            Self::PersistenceInvalid => StorageClearNamespaceFailureReason::PersistenceInvalid,
            Self::ReadFailed => StorageClearNamespaceFailureReason::ReadFailed,
            Self::RuntimeUnavailable => StorageClearNamespaceFailureReason::RuntimeUnavailable,
            Self::SecurityDenied => StorageClearNamespaceFailureReason::SecurityDenied,
        };
    }

    pub fn into_read(self) -> StorageReadFailureReason {
        return match self {
            Self::PersistenceInvalid => StorageReadFailureReason::PersistenceInvalid,
            Self::ReadFailed => StorageReadFailureReason::ReadFailed,
            Self::RuntimeUnavailable => StorageReadFailureReason::RuntimeUnavailable,
            Self::SecurityDenied => StorageReadFailureReason::SecurityDenied,
        };
    }

    pub fn into_migration_read(self) -> StorageMigrationReadFailureReason {
        return match self {
            Self::PersistenceInvalid => StorageMigrationReadFailureReason::PersistenceInvalid,
            Self::ReadFailed => StorageMigrationReadFailureReason::ReadFailed,
            Self::RuntimeUnavailable => StorageMigrationReadFailureReason::RuntimeUnavailable,
            Self::SecurityDenied => StorageMigrationReadFailureReason::SecurityDenied,
        };
    }
}

impl StorageRemoveItemFailureReason {
    pub fn into_clear_namespace(self) -> StorageClearNamespaceFailureReason {
        return match self {
            Self::PersistenceInvalid => StorageClearNamespaceFailureReason::PersistenceInvalid,
            Self::QuotaExceeded => StorageClearNamespaceFailureReason::QuotaExceeded,
            Self::ReadFailed => StorageClearNamespaceFailureReason::ReadFailed,
            Self::RemoveFailed => StorageClearNamespaceFailureReason::RemoveFailed,
            Self::RuntimeUnavailable => StorageClearNamespaceFailureReason::RuntimeUnavailable,
            Self::SecurityDenied => StorageClearNamespaceFailureReason::SecurityDenied,
        };
    }
}

// ── Entity impl ─────────────────────────────────────────────────────────────

impl_entity!(StorageSignals, entity_key);
