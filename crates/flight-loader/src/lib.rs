mod enums;
mod load;
mod resource_loader;
mod sugar;
mod types;

#[cfg(test)]
#[path = "../tests/mock_host.rs"]
mod test_host;

pub mod contract;

pub use enums::{
    ResourceLoadItemStatus, ResourceLoadReportStatus, ResourceLoaderErrorPolicy,
    ResourceLoaderRetryBackoff,
};
pub use load::{load_bytes, load_text};
pub use resource_loader::{
    cancel_resource_load, create_resource_loader, dispose_resource_loader,
    enable_resource_loader_item_signals, get_resource_load_bytes, get_resource_load_counts,
    get_resource_load_item_status, get_resource_load_progress, pause_resource_load,
    queue_resource_load, reset_resource_loader, resume_resource_load, set_resource_load_priority,
    set_resource_loader_concurrency, start_resource_load,
};
pub use sugar::ResourceLoaderMethods;
pub use types::*;
