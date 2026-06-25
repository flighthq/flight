//! `flighthq-loader` — batch queue for loading multiple resources.
//!
//! A `ResourceLoaderHandle` accumulates load tasks before they start. Call
//! `queue_resource_load` (or `queue_resource_load_item` for a descriptor) for
//! each resource, then `start_resource_load` to run them in priority order.
//! Progress, errors, completion, and the cancel/pause/resume lifecycle are
//! signalled via the `ResourceLoader` signals; per-item signals are opt-in via
//! `enable_resource_loader_item_signals`. Each queued task returns a
//! `ResourceLoadResult` handle that holds the loaded value once the loader has
//! run.

pub mod resource_loader;

pub use resource_loader::{
    LoadError, ResourceLoadItem, ResourceLoadResult, ResourceLoaderHandle, cancel_resource_load,
    create_resource_load_item, create_resource_loader, create_resource_loader_with_options,
    dispose_resource_loader, enable_resource_loader_item_signals, get_resource_load_item_status,
    get_resource_load_progress, get_resource_loader_result, pause_resource_load,
    queue_resource_load, queue_resource_load_item, reset_resource_loader, resume_resource_load,
    set_resource_load_priority, set_resource_loader_concurrency, start_resource_load,
};
