// Work in progress: the plain-value traversal (capture/restore/interpolate/equals and the guard
// walk) awaits the representation ruling; these modules hold the representation-independent parts.
#![allow(dead_code)]

mod snapshot_guard_report;
mod snapshot_schema;
mod types;

pub use types::SnapshotSchema;
