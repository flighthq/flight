use std::collections::{BTreeSet, HashSet};
use std::sync::Arc;

use flight_log::LogStateRef;

use crate::capture_snapshot::set_snapshot_capture_guard;
use crate::snapshot_guard_report::{SnapshotSourceFindings, report_snapshot_source_findings};
use crate::snapshot_value::{get_snapshot_keys, get_snapshot_value};
use crate::types::*;

/// Uninstalls the guard installed by `enable_snapshot_guards`.
// flight-lint: allow(conform-params) D5: caller-owned guard state replaces the TS module-level guard slot
pub fn disable_snapshot_guards(guards: &mut SnapshotGuardState) {
    set_snapshot_capture_guard(guards, None);
}

/// Installs the caller-facing snapshot guard (opt-in, dev-only) on `guards`. It walks each
/// `capture_snapshot` source and warns once, through flight-log, about the two shapes that clone
/// but break the package's guarantees: non-plain built-ins (`Map`, `Set`, `Date`, `RegExp`, typed
/// arrays, `ArrayBuffer`), which a freeze leaves mutable and `equals_snapshot` does not compare by
/// content; and cycles, which `equals_snapshot`, `interpolate_snapshots` and `restore_snapshot`
/// recurse into without tracking. The log state and clock are captured now; the clock is sampled
/// when a warning is logged.
// flight-lint: allow(f64) D0: the injected flight-log clock returns millisecond timestamps
// flight-lint: allow(conform-params) D5: caller-owned guard state, log state and clock replace hidden process state
pub fn enable_snapshot_guards(
    guards: &mut SnapshotGuardState,
    log_state: &LogStateRef,
    clock: Arc<dyn Fn() -> f64 + Send + Sync>,
) {
    let log_state = log_state.clone();
    let guard: SnapshotCaptureGuard = Arc::new(move |source: &SnapshotValue| {
        report_snapshot_source_findings(&log_state, &*clock, &get_snapshot_source_findings(source));
    });
    set_snapshot_capture_guard(guards, Some(guard));
}

fn get_snapshot_non_plain_kind_name(kind: SnapshotNonPlainKind) -> &'static str {
    return match kind {
        SnapshotNonPlainKind::ArrayBuffer => "ArrayBuffer",
        SnapshotNonPlainKind::Date => "Date",
        SnapshotNonPlainKind::Map => "Map",
        SnapshotNonPlainKind::RegExp => "RegExp",
        SnapshotNonPlainKind::Set => "Set",
        SnapshotNonPlainKind::TypedArray => "TypedArray",
    };
}

fn get_snapshot_object_address(value: &SnapshotValue) -> Option<usize> {
    return match value {
        SnapshotValue::Array(array) => Some(Arc::as_ptr(array) as *const () as usize),
        SnapshotValue::Object(object) => Some(Arc::as_ptr(object) as *const () as usize),
        SnapshotValue::NonPlain(non_plain) => non_plain
            .value
            .as_ref()
            .map(|value| Arc::as_ptr(value) as *const () as usize),
        _ => None,
    };
}

// Walks the source once, recording each non-plain kind and whether any object recurred. The seen set
// marks every object, so the walk terminates on the cycles it looks for; it also reports a shared
// (diamond) subtree as cyclic, which the source does too.
fn get_snapshot_source_findings(source: &SnapshotValue) -> SnapshotSourceFindings {
    let mut findings = SnapshotSourceFindings {
        cyclic: false,
        non_plain: BTreeSet::new(),
    };
    visit_snapshot_source(source, &mut HashSet::new(), &mut findings);
    return findings;
}

fn visit_snapshot_source(
    value: &SnapshotValue,
    seen: &mut HashSet<usize>,
    findings: &mut SnapshotSourceFindings,
) {
    if !matches!(
        value,
        SnapshotValue::Array(_) | SnapshotValue::Object(_) | SnapshotValue::NonPlain(_)
    ) {
        return;
    }
    if let Some(address) = get_snapshot_object_address(value) {
        if !seen.insert(address) {
            findings.cyclic = true;
            return;
        }
    }
    if let SnapshotValue::NonPlain(non_plain) = value {
        // A non-plain container's contents are not part of the plain-data tree; naming it is enough.
        findings
            .non_plain
            .insert(get_snapshot_non_plain_kind_name(non_plain.kind));
        return;
    }
    for key in get_snapshot_keys(value) {
        visit_snapshot_source(&get_snapshot_value(value, &key), seen, findings);
    }
}
