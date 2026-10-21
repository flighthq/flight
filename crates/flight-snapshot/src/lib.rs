mod capture_snapshot;
mod enable_snapshot_guards;
mod equals_snapshot;
mod interpolate_snapshots;
mod restore_snapshot;
mod snapshot_guard_report;
mod snapshot_schema;
mod snapshot_value;
mod types;

pub mod contract;

// Public lane: the six functions the pinned TS `index.ts` names, the D5 guard-state constructor
// they need, the snapshot-owned plain-value graph and its access functions, and the types their
// signatures require. `set_snapshot_capture_guard` stays in `contract`.
pub use contract::Snapshot;
pub use contract::SnapshotArray;
pub use contract::SnapshotArrayRef;
pub use contract::SnapshotCaptureGuard;
pub use contract::SnapshotGuardState;
pub use contract::SnapshotNonPlain;
pub use contract::SnapshotNonPlainKind;
pub use contract::SnapshotObject;
pub use contract::SnapshotObjectRef;
pub use contract::SnapshotSchema;
pub use contract::SnapshotValue;
pub use contract::capture_snapshot;
pub use contract::create_snapshot_array;
pub use contract::create_snapshot_guard_state;
pub use contract::create_snapshot_non_plain;
pub use contract::create_snapshot_object;
pub use contract::disable_snapshot_guards;
pub use contract::enable_snapshot_guards;
pub use contract::equals_snapshot;
pub use contract::get_snapshot_keys;
pub use contract::get_snapshot_length;
pub use contract::get_snapshot_value;
pub use contract::interpolate_snapshots;
pub use contract::is_snapshot_array;
pub use contract::is_snapshot_frozen;
pub use contract::restore_snapshot;
pub use contract::set_snapshot_length;
pub use contract::set_snapshot_value;
