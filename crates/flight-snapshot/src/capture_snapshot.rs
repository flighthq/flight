use crate::snapshot_value::{clone_snapshot_value, freeze_snapshot_deep};
use crate::types::*;

/// Caller-owned guard state with no guard installed (D5).
// flight-lint: allow(conform-extra) D5: caller-owned guard state replaces the TS module-level guard slot
pub fn create_snapshot_guard_state() -> SnapshotGuardState {
    return SnapshotGuardState {
        capture_guard: None,
    };
}

/// Captures `source` into an immutable snapshot: a deep clone (shared subtrees and cycles preserved
/// within the clone, no storage shared with `source`), deep-frozen so the ordinary mutation paths
/// reject any write into it. The state's guard, when installed, inspects `source` first.
///
/// `source` must be plain, acyclic data: the other operations walk snapshots without cycle
/// tracking. Capture itself survives a cycle; `enable_snapshot_guards` reports one at capture time.
// flight-lint: allow(conform-params) D5: caller-owned guard state replaces the TS module-level guard slot
pub fn capture_snapshot(guards: &SnapshotGuardState, source: &SnapshotValue) -> Snapshot {
    if let Some(guard) = &guards.capture_guard {
        guard(source);
    }
    let clone = clone_snapshot_value(source);
    freeze_snapshot_deep(&clone);
    return clone;
}

/// Installs the capture-time guard, or clears it with `None`. Called by `enable_snapshot_guards`.
// flight-lint: allow(conform-params) D5: caller-owned guard state replaces the TS module-level guard slot
pub fn set_snapshot_capture_guard(
    guards: &mut SnapshotGuardState,
    guard: Option<SnapshotCaptureGuard>,
) {
    guards.capture_guard = guard;
}
