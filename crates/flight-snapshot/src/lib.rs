mod capture_snapshot;
mod enable_snapshot_guards;
mod equals_snapshot;
mod interpolate_snapshots;
mod restore_snapshot;
mod snapshot_guard_report;
mod snapshot_schema;
mod types;

pub mod contract;

// Public lane: the six functions the pinned TS `index.ts` names, the D5 guard-state constructor
// they need, the per-field interpolation helper, and the types their signatures require.
// `set_snapshot_capture_guard` stays in `contract`.
pub use contract::Snapshot;
pub use contract::SnapshotCaptureGuard;
pub use contract::SnapshotGuardState;
pub use contract::SnapshotInterpolate;
pub use contract::SnapshotInterpolation;
pub use contract::SnapshotSchema;
pub use contract::capture_snapshot;
pub use contract::create_snapshot_guard_state;
pub use contract::disable_snapshot_guards;
pub use contract::enable_snapshot_guards;
pub use contract::equals_snapshot;
pub use contract::interpolate_snapshot_field;
pub use contract::interpolate_snapshots;
pub use contract::restore_snapshot;
