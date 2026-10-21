use std::sync::{Arc, RwLock};

use flight_log::{
    LogData, LogEntry, LogStateRef, MemoryLogSink, add_log_sink, create_log_state,
    create_memory_log_sink, get_memory_log_sink_entries,
};
use flight_snapshot::contract::*;

use crate::support::*;

fn logs() -> (LogStateRef, MemoryLogSink) {
    let log_state: LogStateRef = Arc::new(RwLock::new(create_log_state()));
    let sink = create_memory_log_sink(8);
    add_log_sink(&log_state, sink.sink.clone());
    return (log_state, sink);
}

fn messages(entries: &[LogEntry]) -> Vec<String> {
    return entries
        .iter()
        .map(|entry| match &entry.data {
            LogData::Message(message) => message.clone(),
            _ => String::new(),
        })
        .collect();
}

fn enabled() -> (SnapshotGuardState, MemoryLogSink) {
    let (log_state, sink) = logs();
    let mut guards = guards();
    enable_snapshot_guards(&mut guards, &log_state, Arc::new(|| 0.0));
    return (guards, sink);
}

fn date() -> SnapshotValue {
    return create_snapshot_non_plain(SnapshotNonPlainKind::Date, Some(Arc::new(0_u64)));
}

mod disable_snapshot_guards {
    use super::*;

    #[test]
    fn stops_the_guard_from_inspecting_later_captures() {
        let (mut guards, sink) = enabled();
        disable_snapshot_guards(&mut guards);
        capture_snapshot(&guards, &obj(vec![("when", date())]));
        assert!(messages(&get_memory_log_sink_entries(&sink)).is_empty());
    }
}

mod enable_snapshot_guards {
    use super::*;

    #[test]
    fn says_nothing_for_a_plain_acyclic_source() {
        let (guards, sink) = enabled();
        capture_snapshot(
            &guards,
            &obj(vec![
                ("hp", num(1.0)),
                ("items", arr(vec![obj(vec![("id", text("a"))])])),
                (
                    "nested",
                    obj(vec![("deep", obj(vec![("ok", SnapshotValue::Bool(true))]))]),
                ),
            ]),
        );
        assert!(messages(&get_memory_log_sink_entries(&sink)).is_empty());
    }

    #[test]
    fn warns_about_a_map_which_clones_but_is_neither_frozen_nor_comparable() {
        let (guards, sink) = enabled();
        let map =
            create_snapshot_non_plain(SnapshotNonPlainKind::Map, Some(Arc::new(vec![("a", 1)])));
        capture_snapshot(&guards, &obj(vec![("byId", map)]));
        assert!(
            messages(&get_memory_log_sink_entries(&sink))
                .join("\n")
                .contains("Map")
        );
    }

    #[test]
    fn warns_about_a_cycle_naming_the_operations_that_cannot_walk_it() {
        let (guards, sink) = enabled();
        let node = obj(vec![("name", text("root"))]);
        set_snapshot_value(&node, "self", node.clone());
        capture_snapshot(&guards, &node);
        assert!(
            messages(&get_memory_log_sink_entries(&sink))
                .join("\n")
                .contains("cycle")
        );
    }

    #[test]
    fn terminates_on_the_cyclic_source_it_is_reporting() {
        let (guards, _sink) = enabled();
        let a = obj(vec![]);
        let b = obj(vec![("a", a.clone())]);
        set_snapshot_value(&a, "b", b);
        let captured = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            capture_snapshot(&guards, &a)
        }));
        assert!(captured.is_ok());
    }

    #[test]
    fn names_each_non_plain_kind_once_sorted_and_does_not_descend_into_it() {
        let (guards, sink) = enabled();
        let kinds = [
            SnapshotNonPlainKind::TypedArray,
            SnapshotNonPlainKind::Set,
            SnapshotNonPlainKind::Date,
        ];
        let values: Vec<SnapshotValue> = kinds
            .iter()
            .map(|kind| create_snapshot_non_plain(*kind, Some(Arc::new(()))))
            .collect();
        capture_snapshot(&guards, &arr(values));
        let entries = get_memory_log_sink_entries(&sink);
        assert_eq!(entries.len(), 1);
        assert!(messages(&entries)[0].contains("(Date, Set, TypedArray)"));
        assert_eq!(entries[0].channel, Some("snapshot".to_string()));
    }

    #[test]
    fn reports_a_shared_subtree_as_a_cycle_as_the_source_does() {
        let (guards, sink) = enabled();
        let shared = obj(vec![("v", num(1.0))]);
        capture_snapshot(
            &guards,
            &obj(vec![("left", shared.clone()), ("right", shared)]),
        );
        assert!(
            messages(&get_memory_log_sink_entries(&sink))
                .join("\n")
                .contains("cycle")
        );
    }
}
