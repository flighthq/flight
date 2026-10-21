use std::any::Any;
use std::sync::Arc;

use crate::types::*;

/// Caller-owned guard state with no guard installed (D5).
// flight-lint: allow(conform-extra) D5: caller-owned guard state replaces the TS module-level guard slot
pub fn create_snapshot_guard_state() -> SnapshotGuardState {
    return SnapshotGuardState {
        capture_guard: None,
    };
}

/// Captures `source` into an immutable snapshot: an owned clone behind an `Arc`, so the snapshot
/// does not alias `source` (later mutation of either never reaches the other) and exposes no write
/// access. The state's guard, when installed, inspects `source` first.
///
/// `source` must be plain owned data. A field holding a shared mutable handle (`Ref<_>`) is cloned
/// shallowly by `Clone`, so it is outside the typed snapshot contract.
// flight-lint: allow(conform-params) D5: caller-owned guard state replaces the TS module-level guard slot
// flight-lint: allow(contract-vocabulary) Principal f1f482ec batch10 item7: typed Snapshot<T> = Arc<T> over T: Clone; `Any` hands the source to the guard as the TS `unknown`
pub fn capture_snapshot<T: Clone + Any>(guards: &SnapshotGuardState, source: &T) -> Snapshot<T> {
    if let Some(guard) = &guards.capture_guard {
        guard(source);
    }
    return Arc::new(source.clone());
}

/// Installs the capture-time guard, or clears it with `None`. Called by `enable_snapshot_guards`.
// flight-lint: allow(conform-params) D5: caller-owned guard state replaces the TS module-level guard slot
pub fn set_snapshot_capture_guard(
    guards: &mut SnapshotGuardState,
    guard: Option<SnapshotCaptureGuard>,
) {
    guards.capture_guard = guard;
}
