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
    NativeStorageBackend, clear_storage, get_storage_backend, get_storage_item, get_storage_keys,
    remove_storage_item, set_storage_backend, set_storage_item,
};

// Shared seam contract lives in the header layer.
pub use flighthq_types::StorageBackend;
