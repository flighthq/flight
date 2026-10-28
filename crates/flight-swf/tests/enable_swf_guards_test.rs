use std::sync::{Arc, RwLock};

use flight_log::{
    LogData, LogEntry, LogStateRef, LogValue, add_log_sink, create_log_state,
    create_memory_log_sink, get_memory_log_sink_entries, remove_log_sink,
};
use flight_swf::contract::*;

use crate::support::reader;

fn guard_state() -> SwfGuardStateRef {
    return Arc::new(RwLock::new(SwfGuardState {
        enabled: false,
        filter_list_guard: None,
    }));
}

fn log_state() -> LogStateRef {
    return Arc::new(RwLock::new(create_log_state()));
}

fn capture_log(log_state: &LogStateRef, run: impl FnOnce()) -> Vec<LogEntry> {
    let sink = create_memory_log_sink(8);
    add_log_sink(log_state, sink.sink.clone());
    run();
    let _ = remove_log_sink(log_state, &sink.sink);
    let mut entries = Vec::new();
    get_memory_log_sink_entries(&mut entries, &sink);
    return entries;
}

fn read_unknown_filter(guard_state: &SwfGuardStateRef) -> bool {
    let mut source = reader(vec![1, 0xfe, 13]);
    return read_swf_filter_list(
        guard_state,
        &mut source,
        &mut Vec::new(),
        &mut Vec::new(),
        None,
    );
}

fn integer_field(entry: &LogEntry, key: &str) -> i64 {
    let LogData::Record(data) = &entry.data else {
        panic!("expected record log data");
    };
    let Some(LogValue::Number(value)) = data.get(key) else {
        panic!("expected integer field {key}");
    };
    return *value;
}

fn string_field<'a>(entry: &'a LogEntry, key: &str) -> &'a str {
    let LogData::Record(data) = &entry.data else {
        panic!("expected record log data");
    };
    let Some(LogValue::Str(value)) = data.get(key) else {
        panic!("expected string field {key}");
    };
    return value;
}

mod are_swf_guards_enabled {
    use super::*;

    #[test]
    fn reports_whether_unknown_filter_diagnostics_are_installed() {
        let guards = guard_state();
        let logs = log_state();
        assert!(!are_swf_guards_enabled(&guards));
        enable_swf_guards(&guards, &logs, Arc::new(|| 0.0));
        assert!(are_swf_guards_enabled(&guards));
        disable_swf_guards(&guards);
        assert!(!are_swf_guards_enabled(&guards));
    }
}

mod disable_swf_guards {
    use super::*;

    #[test]
    fn restores_silence_without_changing_the_safe_incomplete_list_result() {
        let guards = guard_state();
        let logs = log_state();
        enable_swf_guards(&guards, &logs, Arc::new(|| 0.0));
        disable_swf_guards(&guards);
        let entries = capture_log(&logs, || assert!(!read_unknown_filter(&guards)));
        assert!(entries.is_empty());
    }
}

mod enable_swf_guards {
    use super::*;

    #[test]
    fn warns_once_with_the_unknown_filter_identity_and_trailing_field_consequence() {
        let guards = guard_state();
        let logs = log_state();
        enable_swf_guards(&guards, &logs, Arc::new(|| 12.0));
        let entries = capture_log(&logs, || {
            assert!(!read_unknown_filter(&guards));
            assert!(!read_unknown_filter(&guards));
        });
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].channel.as_deref(), Some("swf"));
        assert_eq!(integer_field(&entries[0], "filterId"), 0xfe);
        assert_eq!(integer_field(&entries[0], "filterIndex"), 0);
        assert!(string_field(&entries[0], "message").contains("trailing blend mode"));
        assert_eq!(entries[0].timestamp_ms, 12.0);
    }
}
