//! `flighthq-loader` — batch queue for loading multiple resources.
//!
//! A `ResourceLoader` accumulates async load tasks before they start. Call
//! `queue_resource_load` for each resource, then `start_resource_load` to
//! kick off all loads concurrently. Progress and completion are signalled via
//! `onProgress` and `onComplete`. Each queued task returns a `Future` that
//! resolves to the loaded value once the loader has been started.

pub mod resource_loader;

pub use resource_loader::{
    LoadError, ResourceLoadResult, ResourceLoaderHandle, create_resource_loader,
    get_resource_loader_progress, get_resource_loader_result, queue_resource_load,
    start_resource_load,
};
