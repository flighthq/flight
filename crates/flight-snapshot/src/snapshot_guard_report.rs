use std::collections::BTreeSet;

use flight_log::{LogLevel, LogStateRef, log_once};

#[cfg(test)]
mod tests {
    use std::sync::atomic::{AtomicUsize, Ordering};
    use std::sync::{Arc, RwLock};

    use flight_log::{
        LogData, add_log_sink, create_log_state, create_memory_log_sink,
        get_memory_log_sink_entries,
    };

    use super::*;

    fn findings(non_plain: &[&'static str], cyclic: bool) -> SnapshotSourceFindings {
        return SnapshotSourceFindings {
            cyclic,
            non_plain: non_plain.iter().copied().collect(),
        };
    }

    #[test]
    fn sorts_non_plain_kinds_and_warns_once_per_log_state() {
        let log_state: LogStateRef = Arc::new(RwLock::new(create_log_state()));
        let sink = create_memory_log_sink(8);
        add_log_sink(&log_state, sink.sink.clone());
        let calls = Arc::new(AtomicUsize::new(0));
        let counted = calls.clone();
        let clock = move || {
            counted.fetch_add(1, Ordering::SeqCst);
            return 250.0;
        };
        report_snapshot_source_findings(
            &log_state,
            &clock,
            &findings(&["TypedArray", "Map", "Date"], false),
        );
        report_snapshot_source_findings(&log_state, &clock, &findings(&["Set"], false));
        let mut entries = Vec::new();
        get_memory_log_sink_entries(&mut entries, &sink);
        assert_eq!(entries.len(), 1);
        let LogData::Message(message) = &entries[0].data else {
            panic!("expected a message");
        };
        assert!(message.starts_with(
            "captureSnapshot: source contains non-plain value(s) (Date, Map, TypedArray). "
        ));
        assert_eq!(entries[0].level, LogLevel::Warn);
        assert_eq!(entries[0].channel, Some("snapshot".to_string()));
        assert_eq!(entries[0].timestamp_ms, 250.0);
        assert_eq!(calls.load(Ordering::SeqCst), 2);
    }

    #[test]
    fn reports_a_cycle_separately_from_non_plain_values() {
        let log_state: LogStateRef = Arc::new(RwLock::new(create_log_state()));
        let sink = create_memory_log_sink(8);
        add_log_sink(&log_state, sink.sink.clone());
        let clock = || 0.0;
        report_snapshot_source_findings(&log_state, &clock, &findings(&["Map"], true));
        let mut entries = Vec::new();
        get_memory_log_sink_entries(&mut entries, &sink);
        assert_eq!(entries.len(), 2);
        let LogData::Message(message) = &entries[1].data else {
            panic!("expected a message");
        };
        assert!(message.contains("source contains a cycle"));
    }

    #[test]
    fn stays_silent_without_findings() {
        let log_state: LogStateRef = Arc::new(RwLock::new(create_log_state()));
        let sink = create_memory_log_sink(8);
        add_log_sink(&log_state, sink.sink.clone());
        report_snapshot_source_findings(&log_state, &|| 0.0, &findings(&[], false));
        assert!(
            {
                let mut collected = Vec::new();
                get_memory_log_sink_entries(&mut collected, &sink);
                collected
            }
            .is_empty()
        );
    }
}

/// What one guard walk of a capture source found: the non-plain built-in kinds (sorted, as the
/// source's `Array.from(set).sort()` orders these ASCII names) and whether a seen object recurred.
/// The source's seen-set marks any repeated reference, so a shared (diamond) subtree reports as
/// cyclic too; that quirk is preserved.
pub(crate) struct SnapshotSourceFindings {
    pub(crate) cyclic: bool,
    pub(crate) non_plain: BTreeSet<&'static str>,
}

/// Logs each finding once per log state, with the source's keys, level, channel and messages. The
/// clock is sampled at each warning, as the source's `logOnce` reads the time per call.
// flight-lint: allow(f64) D0: the injected flight-log clock returns millisecond timestamps
pub(crate) fn report_snapshot_source_findings(
    log_state: &LogStateRef,
    clock: &(dyn Fn() -> f64 + Send + Sync),
    findings: &SnapshotSourceFindings,
) {
    if !findings.non_plain.is_empty() {
        let kinds: Vec<&str> = findings.non_plain.iter().copied().collect();
        let message = format!(
            "captureSnapshot: source contains non-plain value(s) ({}). They clone, but a frozen Map/Set stays mutable and equalsSnapshot compares them by reference, so the snapshot is neither immutable nor comparable. Convert to plain arrays/objects first.",
            kinds.join(", ")
        );
        log_once(
            log_state,
            clock(),
            "snapshot:non-plain-source",
            LogLevel::Warn,
            message.into(),
            Some("snapshot".to_string()),
        );
    }
    if findings.cyclic {
        log_once(
            log_state,
            clock(),
            "snapshot:cyclic-source",
            LogLevel::Warn,
            "captureSnapshot: source contains a cycle. Capture handles it, but equalsSnapshot, interpolateSnapshots, and restoreSnapshot recurse without cycle tracking and will overflow the stack — restoreSnapshot only on the second restore into the same target.".into(),
            Some("snapshot".to_string()),
        );
    }
}
