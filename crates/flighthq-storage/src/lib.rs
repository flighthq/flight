//! `flighthq-storage` — synchronous key/value persistence over a swappable native backend.
//!
//! Provides free functions for reading and writing persistent string key/value pairs.
//! The default backend is an in-memory store; install a file-backed backend with
//! [`set_storage_backend`] (e.g. [`NativeStorageBackend`] for a JSON file on disk).
//!
//! Writes return `false` and reads return `None` on expected failures rather than
//! panicking — quota exceeded and access denied are expected-failure surfaces.
//!
//! The [`StorageBackend`] trait defining the seam lives in `flighthq-types`.

pub mod storage;

// Re-export the complete public surface at the crate root.

// storage
pub use storage::{
    NativeStorageBackend, clear_storage, clear_storage_namespace, create_storage_namespace,
    create_web_storage_backend, disable_storage_signals, enable_storage_signals,
    get_namespaced_storage_byte_size, get_namespaced_storage_entries, get_namespaced_storage_item,
    get_namespaced_storage_keys, get_storage_backend, get_storage_boolean, get_storage_boolean_or,
    get_storage_byte_size, get_storage_entries, get_storage_item, get_storage_item_count,
    get_storage_item_or, get_storage_items, get_storage_json, get_storage_json_or,
    get_storage_keys, get_storage_number, get_storage_number_or, get_storage_quota_estimate,
    get_storage_signals, has_namespaced_storage_item, has_storage_item, migrate_storage,
    remove_namespaced_storage_item, remove_storage_item, remove_storage_items,
    set_namespaced_storage_item, set_storage_backend, set_storage_boolean, set_storage_item,
    set_storage_items, set_storage_json, set_storage_number,
};

// Shared seam contract + value types live in the header layer.
pub use flighthq_types::{
    StorageBackend, StorageChange, StorageMigration, StorageNamespace, StorageQuota, StorageSignals,
};
