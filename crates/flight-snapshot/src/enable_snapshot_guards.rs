use std::any::Any;
use std::collections::BTreeSet;
use std::sync::Arc;

use flight_log::LogStateRef;

use crate::capture_snapshot::set_snapshot_capture_guard;
use crate::snapshot_guard_report::{SnapshotSourceFindings, report_snapshot_source_findings};
use crate::types::*;

/// Uninstalls the guard installed by `enable_snapshot_guards`.
// flight-lint: allow(conform-params) D5: caller-owned guard state replaces the TS module-level guard slot
pub fn disable_snapshot_guards(guards: &mut SnapshotGuardState) {
    set_snapshot_capture_guard(guards, None);
}

/// Installs the caller-facing snapshot guard (opt-in, dev-only) on `guards`. In the source it walks
/// each capture source and warns once, through flight-log, about non-plain built-ins (`Map`, `Set`,
/// `Date`, `RegExp`, typed arrays, `ArrayBuffer`) and cycles: shapes that clone but break the
/// package's immutability and comparison contracts. The log state and clock are captured now; the
/// clock is sampled when a warning is logged.
///
/// Typed snapshot state has no runtime shape to inspect: a value reaches capture as an opaque
/// `&dyn Any`, owned data cannot form a cycle, and the source's non-plain built-ins have no typed
/// counterpart here. So the walk finds nothing and the guard stays silent for every typed source, as
/// the source guard does for plain acyclic data. The source's non-plain and cyclic cases are not
/// representable.
// flight-lint: allow(f64) D0: the injected flight-log clock returns millisecond timestamps
// flight-lint: allow(conform-params) D5: caller-owned guard state, log state and clock replace hidden process state
pub fn enable_snapshot_guards(
    guards: &mut SnapshotGuardState,
    log_state: &LogStateRef,
    clock: Arc<dyn Fn() -> f64 + Send + Sync>,
) {
    let log_state = log_state.clone();
    let guard: SnapshotCaptureGuard = Arc::new(move |source: &dyn Any| {
        let findings = get_snapshot_source_findings(source);
        report_snapshot_source_findings(&log_state, &*clock, &findings);
    });
    set_snapshot_capture_guard(guards, Some(guard));
}

fn get_snapshot_source_findings(_source: &dyn Any) -> SnapshotSourceFindings {
    return SnapshotSourceFindings {
        cyclic: false,
        non_plain: BTreeSet::new(),
    };
}
