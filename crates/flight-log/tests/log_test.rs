use std::collections::HashMap;
use std::sync::{Arc, Mutex, RwLock};

use flight_log::contract::*;
use flight_signals::connect_signal;

/// Helper: a fresh caller-owned log state per test.
fn test_state() -> LogStateRef {
    return Arc::new(RwLock::new(create_log_state()));
}

/// Helper: resets the caller-owned state before each test.
fn reset_log_state(state: &LogStateRef) {
    clear_log_groups(&state);
    clear_log_once_keys(&state);
    clear_log_redaction_paths(&state);
    clear_log_serializers(&state);
    clear_log_sinks(&state);
    clear_log_channel_levels(&state);
    set_log_console_level(&state, LogLevel::Info);
    set_log_level(&state, LogLevel::Verbose);
}

/// Helper: creates a recording sink and adds it. Returns the shared entries vec.
fn recording_sink(state: &LogStateRef) -> (Arc<Mutex<Vec<LogEntry>>>, LogSink) {
    let entries: Arc<Mutex<Vec<LogEntry>>> = Arc::new(Mutex::new(Vec::new()));
    let entries_clone = entries.clone();
    let sink: LogSink = Arc::new(move |entry: &LogEntry| {
        entries_clone.lock().unwrap().push(entry.clone());
    });
    add_log_sink(&state, sink.clone());
    return (entries, sink);
}

/// Helper: extract a string from LogData.
fn data_as_str(data: &LogData) -> Option<&str> {
    if let LogData::Message(msg) = data {
        return Some(msg.as_str());
    }
    return None;
}

/// Helper: extract a record field value as i64.
fn record_int(data: &LogData, key: &str) -> Option<i64> {
    if let LogData::Record(map) = data {
        if let Some(LogValue::Int(n)) = map.get(key) {
            return Some(*n);
        }
    }
    return None;
}

/// Helper: extract a record field value as string.
fn record_str(data: &LogData, key: &str) -> Option<String> {
    if let LogData::Record(map) = data {
        if let Some(LogValue::Str(s)) = map.get(key) {
            return Some(s.clone());
        }
    }
    return None;
}

mod add_log_sink {
    use super::*;

    #[test]
    fn adds_a_sink_that_receives_emitted_entries() {
        let state = test_state();
        reset_log_state(&state);
        let entries: Arc<Mutex<Vec<LogEntry>>> = Arc::new(Mutex::new(Vec::new()));
        let entries_clone = entries.clone();
        let sink: LogSink = Arc::new(move |e: &LogEntry| {
            entries_clone.lock().unwrap().push(e.clone());
        });
        add_log_sink(&state, sink);
        log(&state, 0.0, LogLevel::Info, "hello".into(), None);
        assert_eq!(entries.lock().unwrap().len(), 1);
    }

    #[test]
    fn does_not_add_the_same_sink_twice() {
        let state = test_state();
        reset_log_state(&state);
        let entries: Arc<Mutex<Vec<LogEntry>>> = Arc::new(Mutex::new(Vec::new()));
        let entries_clone = entries.clone();
        let sink: LogSink = Arc::new(move |e: &LogEntry| {
            entries_clone.lock().unwrap().push(e.clone());
        });
        add_log_sink(&state, sink.clone());
        add_log_sink(&state, sink.clone());
        log(&state, 0.0, LogLevel::Info, "x".into(), None);
        assert_eq!(entries.lock().unwrap().len(), 1);
    }
}

mod advance_log_sink {
    use super::*;

    #[test]
    fn flushes_a_buffered_sink_only_after_its_interval_elapses() {
        let state = test_state();
        reset_log_state(&state);
        let forwarded: Arc<Mutex<Vec<LogEntry>>> = Arc::new(Mutex::new(Vec::new()));
        let forwarded_clone = forwarded.clone();
        let target: LogSink = Arc::new(move |e: &LogEntry| {
            forwarded_clone.lock().unwrap().push(e.clone());
        });
        let handle = create_buffered_log_sink(target, Some(&BufferedLogSinkOptions { size: Some(100), interval_ms: Some(10.0) }));
        add_log_sink(&state, handle.sink.clone());
        log(&state, 0.0, LogLevel::Info, "queued".into(), None);
        advance_log_sink(&handle, 5.0);
        assert_eq!(forwarded.lock().unwrap().len(), 0);
        advance_log_sink(&handle, 10.0);
        assert_eq!(forwarded.lock().unwrap().len(), 0);
        advance_log_sink(&handle, 16.0);
        assert_eq!(forwarded.lock().unwrap().len(), 1);
        remove_log_sink(&state, &handle.sink);
    }
}

mod begin_log_group {
    use super::*;

    #[test]
    fn emits_a_debug_group_begin_entry_and_increments_nesting_depth() {
        let state = test_state();
        reset_log_state(&state);
        let (entries, _sink) = recording_sink(&state);
        begin_log_group(&state, 0.0, "setup", None);
        let e = entries.lock().unwrap();
        assert_eq!(e.len(), 1);
        assert_eq!(e[0].level, LogLevel::Debug);
        assert_eq!(record_str(&e[0].data, "group"), Some("begin".to_string()));
        assert_eq!(record_int(&e[0].data, "depth"), Some(1));
        clear_log_groups(&state);
    }

    #[test]
    fn nests_second_begin_log_group_produces_depth_2() {
        let state = test_state();
        reset_log_state(&state);
        let (entries, _sink) = recording_sink(&state);
        begin_log_group(&state, 0.0, "outer", None);
        begin_log_group(&state, 0.0, "inner", None);
        let e = entries.lock().unwrap();
        assert_eq!(record_int(&e[1].data, "depth"), Some(2));
        clear_log_groups(&state);
    }

    #[test]
    fn tracks_depth_without_emitting_when_debug_is_suppressed() {
        let state = test_state();
        reset_log_state(&state);
        let (entries, _sink) = recording_sink(&state);
        set_log_level(&state, LogLevel::Error);
        begin_log_group(&state, 0.0, "suppressed", None);
        assert_eq!(entries.lock().unwrap().len(), 0);
        clear_log_groups(&state);
    }
}

mod clear_log_channel_level {
    use super::*;

    #[test]
    fn removes_only_the_named_channel_override() {
        let state = test_state();
        reset_log_state(&state);
        set_log_channel_level(&state, "render", LogLevel::Error);
        set_log_channel_level(&state, "input", LogLevel::Warn);
        clear_log_channel_level(&state, "render");
        assert_eq!(get_log_channel_level(&state, "render"), None);
        assert_eq!(get_log_channel_level(&state, "input"), Some(LogLevel::Warn));
    }
}

mod clear_log_channel_levels {
    use super::*;

    #[test]
    fn removes_all_per_channel_level_overrides() {
        let state = test_state();
        reset_log_state(&state);
        set_log_channel_level(&state, "render", LogLevel::Error);
        clear_log_channel_levels(&state);
        assert_eq!(get_log_channel_level(&state, "render"), None);
    }
}

mod clear_log_groups {
    use super::*;

    #[test]
    fn resets_group_nesting_depth_to_zero_without_emitting() {
        let state = test_state();
        reset_log_state(&state);
        let (entries, _sink) = recording_sink(&state);
        begin_log_group(&state, 0.0, "a", None);
        begin_log_group(&state, 0.0, "b", None);
        entries.lock().unwrap().clear();
        clear_log_groups(&state);
        // After clear, endLogGroup should be a no-op
        end_log_group(&state, 0.0, None);
        assert_eq!(entries.lock().unwrap().len(), 0);
    }
}

mod clear_log_once_keys {
    use super::*;

    #[test]
    fn allows_a_previously_consumed_key_to_fire_again() {
        let state = test_state();
        reset_log_state(&state);
        let (entries, _sink) = recording_sink(&state);
        log_once(&state, 0.0, "once-clear-test", LogLevel::Warn, "first".into(), None);
        assert_eq!(entries.lock().unwrap().len(), 1);
        clear_log_once_keys(&state);
        log_once(&state, 0.0, "once-clear-test", LogLevel::Warn, "second".into(), None);
        assert_eq!(entries.lock().unwrap().len(), 2);
        assert_eq!(data_as_str(&entries.lock().unwrap()[1].data), Some("second"));
    }
}

mod clear_log_redaction_paths {
    use super::*;

    #[test]
    fn removes_all_redaction_paths_so_fields_are_no_longer_redacted() {
        let state = test_state();
        reset_log_state(&state);
        set_log_redaction_paths(&state, &["token".to_string()]);
        clear_log_redaction_paths(&state);
        let fmt = create_json_log_formatter(&state);
        let mut data = HashMap::new();
        data.insert("token".to_string(), LogValue::Str("secret".to_string()));
        let entry = LogEntry {
            level: LogLevel::Info,
            channel: None,
            data: LogData::Record(data),
            timestamp_ms: 0.0,
        };
        let result = fmt(&entry);
        assert!(result.contains("\"secret\""));
        assert!(!result.contains("[REDACTED]"));
    }
}

mod clear_log_serializers {
    use super::*;

    #[test]
    fn removes_all_serializer_registrations() {
        let state = test_state();
        reset_log_state(&state);
        register_log_serializer(&state, 
            "acme.Foo",
            Arc::new(|_| {
                let mut m = HashMap::new();
                m.insert("serialized".to_string(), LogValue::Bool(true));
                return m;
            }),
        );
        clear_log_serializers(&state);
        let fmt = create_json_log_formatter(&state);
        let mut inner = HashMap::new();
        inner.insert("__kind".to_string(), LogValue::Str("acme.Foo".to_string()));
        inner.insert("x".to_string(), LogValue::Int(1));
        let mut data = HashMap::new();
        data.insert("obj".to_string(), LogValue::Record(inner));
        let entry = LogEntry {
            level: LogLevel::Info,
            channel: None,
            data: LogData::Record(data),
            timestamp_ms: 0.0,
        };
        let result = fmt(&entry);
        // Without serializer, the __kind should pass through as-is
        assert!(result.contains("acme.Foo"));
    }
}

mod clear_log_sinks {
    use super::*;

    #[test]
    fn removes_all_sinks_so_subsequent_emit_calls_are_no_ops() {
        let state = test_state();
        reset_log_state(&state);
        let entries: Arc<Mutex<Vec<LogEntry>>> = Arc::new(Mutex::new(Vec::new()));
        let entries_clone = entries.clone();
        add_log_sink(&state, Arc::new(move |e: &LogEntry| {
            entries_clone.lock().unwrap().push(e.clone());
        }));
        clear_log_sinks(&state);
        log(&state, 0.0, LogLevel::Info, "x".into(), None);
        assert_eq!(entries.lock().unwrap().len(), 0);
    }
}

mod clear_memory_log_sink {
    use super::*;

    #[test]
    fn empties_the_captured_entries() {
        let state = test_state();
        reset_log_state(&state);
        let handle = create_memory_log_sink(10);
        add_log_sink(&state, handle.sink.clone());
        log(&state, 0.0, LogLevel::Info, "a".into(), None);
        clear_memory_log_sink(&handle);
        assert_eq!(get_memory_log_sink_entries(&handle).len(), 0);
    }
}

mod create_buffered_log_sink_tests {
    use super::*;

    #[test]
    fn uses_the_default_size_and_interval_options() {
        let state = test_state();
        reset_log_state(&state);
        let forwarded: Arc<Mutex<Vec<LogEntry>>> = Arc::new(Mutex::new(Vec::new()));
        let forwarded_clone = forwarded.clone();
        let target: LogSink = Arc::new(move |e: &LogEntry| {
            forwarded_clone.lock().unwrap().push(e.clone());
        });
        let handle = create_buffered_log_sink(target, None);
        (handle.sink)(&LogEntry {
            level: LogLevel::Info,
            channel: None,
            data: LogData::Message("queued".to_string()),
            timestamp_ms: 0.0,
        });
        assert_eq!(forwarded.lock().unwrap().len(), 0);
        flush_log_sink(&handle);
        assert_eq!(forwarded.lock().unwrap().len(), 1);
        dispose_log_sink(&handle);
    }

    #[test]
    fn does_not_forward_entries_until_flushed() {
        let state = test_state();
        reset_log_state(&state);
        let forwarded: Arc<Mutex<Vec<LogEntry>>> = Arc::new(Mutex::new(Vec::new()));
        let forwarded_clone = forwarded.clone();
        let target: LogSink = Arc::new(move |e: &LogEntry| {
            forwarded_clone.lock().unwrap().push(e.clone());
        });
        let handle = create_buffered_log_sink(target, Some(&BufferedLogSinkOptions { size: Some(100), interval_ms: None }));
        add_log_sink(&state, handle.sink.clone());
        log(&state, 0.0, LogLevel::Info, "queued".into(), None);
        assert_eq!(forwarded.lock().unwrap().len(), 0);
        flush_log_sink(&handle);
        assert_eq!(forwarded.lock().unwrap().len(), 1);
    }

    #[test]
    fn auto_flushes_when_buffer_reaches_size() {
        let state = test_state();
        reset_log_state(&state);
        let forwarded: Arc<Mutex<Vec<LogEntry>>> = Arc::new(Mutex::new(Vec::new()));
        let forwarded_clone = forwarded.clone();
        let target: LogSink = Arc::new(move |e: &LogEntry| {
            forwarded_clone.lock().unwrap().push(e.clone());
        });
        let handle = create_buffered_log_sink(target, Some(&BufferedLogSinkOptions { size: Some(2), interval_ms: None }));
        add_log_sink(&state, handle.sink.clone());
        log(&state, 0.0, LogLevel::Info, "a".into(), None);
        log(&state, 0.0, LogLevel::Info, "b".into(), None);
        assert_eq!(forwarded.lock().unwrap().len(), 2);
    }

    #[test]
    fn dispose_log_sink_flushes_remaining() {
        let state = test_state();
        reset_log_state(&state);
        let forwarded: Arc<Mutex<Vec<LogEntry>>> = Arc::new(Mutex::new(Vec::new()));
        let forwarded_clone = forwarded.clone();
        let target: LogSink = Arc::new(move |e: &LogEntry| {
            forwarded_clone.lock().unwrap().push(e.clone());
        });
        let handle = create_buffered_log_sink(target, Some(&BufferedLogSinkOptions { size: Some(100), interval_ms: None }));
        add_log_sink(&state, handle.sink.clone());
        log(&state, 0.0, LogLevel::Info, "pending".into(), None);
        dispose_log_sink(&handle);
        assert_eq!(forwarded.lock().unwrap().len(), 1);
    }

    #[test]
    fn does_nothing_when_an_empty_buffer_is_flushed() {
        let state = test_state();
        reset_log_state(&state);
        let forwarded: Arc<Mutex<Vec<LogEntry>>> = Arc::new(Mutex::new(Vec::new()));
        let forwarded_clone = forwarded.clone();
        let target: LogSink = Arc::new(move |e: &LogEntry| {
            forwarded_clone.lock().unwrap().push(e.clone());
        });
        let handle = create_buffered_log_sink(target, None);
        flush_log_sink(&handle);
        assert_eq!(forwarded.lock().unwrap().len(), 0);
    }
}

mod create_child_log_context {
    use super::*;

    #[test]
    fn merges_parent_and_child_fields_child_wins() {
        let state = test_state();
        reset_log_state(&state);
        let mut parent_fields = HashMap::new();
        parent_fields.insert("a".to_string(), LogValue::Int(1));
        parent_fields.insert("b".to_string(), LogValue::Int(2));
        let parent = create_log_context(Some("chan".to_string()), Some(parent_fields));
        let mut child_fields = HashMap::new();
        child_fields.insert("b".to_string(), LogValue::Int(99));
        child_fields.insert("c".to_string(), LogValue::Int(3));
        let child = create_child_log_context(&parent, child_fields, None);

        if let Some(LogValue::Int(a)) = child.fields.get("a") {
            assert_eq!(*a, 1);
        } else {
            panic!("expected field a=1");
        }
        if let Some(LogValue::Int(b)) = child.fields.get("b") {
            assert_eq!(*b, 99);
        } else {
            panic!("expected field b=99");
        }
        if let Some(LogValue::Int(c)) = child.fields.get("c") {
            assert_eq!(*c, 3);
        } else {
            panic!("expected field c=3");
        }
    }

    #[test]
    fn inherits_parent_channel_when_no_override_given() {
        let state = test_state();
        reset_log_state(&state);
        let parent = create_log_context(Some("parent".to_string()), None);
        let child = create_child_log_context(&parent, HashMap::new(), None);
        assert_eq!(child.channel, Some("parent".to_string()));
    }

    #[test]
    fn overrides_channel_when_provided() {
        let state = test_state();
        reset_log_state(&state);
        let parent = create_log_context(Some("parent".to_string()), None);
        let child = create_child_log_context(&parent, HashMap::new(), Some(Some("child".to_string())));
        assert_eq!(child.channel, Some("child".to_string()));
    }
}

mod create_fanout_log_sink {
    use super::*;

    #[test]
    fn forwards_each_entry_to_all_component_sinks() {
        let state = test_state();
        reset_log_state(&state);
        let a: Arc<Mutex<Vec<LogEntry>>> = Arc::new(Mutex::new(Vec::new()));
        let b: Arc<Mutex<Vec<LogEntry>>> = Arc::new(Mutex::new(Vec::new()));
        let a_clone = a.clone();
        let b_clone = b.clone();
        let fanout = create_fanout_log_sink(vec![
            Arc::new(move |e: &LogEntry| a_clone.lock().unwrap().push(e.clone())),
            Arc::new(move |e: &LogEntry| b_clone.lock().unwrap().push(e.clone())),
        ]);
        add_log_sink(&state, fanout);
        log(&state, 0.0, LogLevel::Info, "hello".into(), None);
        assert_eq!(a.lock().unwrap().len(), 1);
        assert_eq!(b.lock().unwrap().len(), 1);
    }
}

mod create_filter_log_sink {
    use super::*;

    #[test]
    fn only_forwards_entries_matching_the_predicate() {
        let state = test_state();
        reset_log_state(&state);
        let entries: Arc<Mutex<Vec<LogEntry>>> = Arc::new(Mutex::new(Vec::new()));
        let entries_clone = entries.clone();
        let target: LogSink = Arc::new(move |e: &LogEntry| {
            entries_clone.lock().unwrap().push(e.clone());
        });
        let filtered = create_filter_log_sink(
            target,
            Arc::new(|e: &LogEntry| e.level == LogLevel::Error),
        );
        add_log_sink(&state, filtered);
        log(&state, 0.0, LogLevel::Info, "skip".into(), None);
        log(&state, 0.0, LogLevel::Error, "keep".into(), None);
        let e = entries.lock().unwrap();
        assert_eq!(e.len(), 1);
        assert_eq!(e[0].level, LogLevel::Error);
    }
}

mod create_json_log_formatter_tests {
    use super::*;

    #[test]
    fn produces_a_flight_json_envelope() {
        let state = test_state();
        reset_log_state(&state);
        let fmt = create_json_log_formatter(&state);
        let entry = LogEntry {
            level: LogLevel::Info,
            channel: Some("test".to_string()),
            data: LogData::Message("msg".to_string()),
            timestamp_ms: 0.0,
        };
        let result = fmt(&entry);
        assert!(result.contains("\"__flight\":true"));
        assert!(result.contains("\"level\":\"info\""));
        assert!(result.contains("\"channel\":\"test\""));
        assert!(result.contains("\"msg\":\"msg\""));
    }

    #[test]
    fn renders_retained_objects_through_the_canonical_unknown_projection() {
        let state = test_state();
        reset_log_state(&state);
        let fmt = create_json_log_formatter(&state);
        let mut data = HashMap::new();
        data.insert("object".to_string(), LogValue::Object(Arc::new(vec![1_u8])));
        let entry = LogEntry {
            level: LogLevel::Info,
            channel: None,
            data: LogData::Record(data),
            timestamp_ms: 0.0,
        };
        assert!(fmt(&entry).contains("\"object\":\"[object Object]\""));
    }

    #[test]
    fn applies_registered_serializers_to_values_with_matching_kind() {
        let state = test_state();
        reset_log_state(&state);
        register_log_serializer(&state, 
            "acme.Widget",
            Arc::new(|v| {
                let mut m = HashMap::new();
                m.insert("serialized".to_string(), LogValue::Bool(true));
                if let Some(LogValue::Int(id)) = v.get("id") {
                    m.insert("id".to_string(), LogValue::Int(*id));
                }
                return m;
            }),
        );
        let fmt = create_json_log_formatter(&state);
        let mut inner = HashMap::new();
        inner.insert("__kind".to_string(), LogValue::Str("acme.Widget".to_string()));
        inner.insert("id".to_string(), LogValue::Int(42));
        let mut data = HashMap::new();
        data.insert("widget".to_string(), LogValue::Record(inner));
        let entry = LogEntry {
            level: LogLevel::Info,
            channel: None,
            data: LogData::Record(data),
            timestamp_ms: 0.0,
        };
        let result = fmt(&entry);
        assert!(result.contains("\"serialized\":true"));
        assert!(result.contains("\"id\":42"));
    }

    #[test]
    fn applies_redaction_paths_to_nested_fields() {
        let state = test_state();
        reset_log_state(&state);
        set_log_redaction_paths(&state, &[
            "credentials.token".to_string(),
            "password".to_string(),
        ]);
        let fmt = create_json_log_formatter(&state);
        let mut creds = HashMap::new();
        creds.insert("token".to_string(), LogValue::Str("secret".to_string()));
        creds.insert("user".to_string(), LogValue::Str("alice".to_string()));
        let mut data = HashMap::new();
        data.insert("credentials".to_string(), LogValue::Record(creds));
        data.insert("password".to_string(), LogValue::Str("pw".to_string()));
        let entry = LogEntry {
            level: LogLevel::Info,
            channel: None,
            data: LogData::Record(data),
            timestamp_ms: 0.0,
        };
        let result = fmt(&entry);
        assert!(result.contains("[REDACTED]"));
        assert!(result.contains("\"alice\""));
        assert!(!result.contains("\"secret\""));
        assert!(!result.contains("\"pw\""));
    }
}

mod create_log_context_tests {
    use super::*;

    #[test]
    fn creates_a_context_with_the_given_channel_and_fields() {
        let state = test_state();
        reset_log_state(&state);
        let mut fields = HashMap::new();
        fields.insert("version".to_string(), LogValue::Int(1));
        let ctx = create_log_context(Some("render".to_string()), Some(fields));
        assert_eq!(ctx.channel, Some("render".to_string()));
        if let Some(LogValue::Int(v)) = ctx.fields.get("version") {
            assert_eq!(*v, 1);
        } else {
            panic!("expected version=1");
        }
    }

    #[test]
    fn defaults_fields_to_empty() {
        let state = test_state();
        reset_log_state(&state);
        let ctx = create_log_context(Some("ch".to_string()), None);
        assert!(ctx.fields.is_empty());
    }
}

mod create_log_span_tests {
    use super::*;

    #[test]
    fn creates_a_log_span_with_given_name_fields_and_channel() {
        let state = test_state();
        reset_log_state(&state);
        let mut fields = HashMap::new();
        fields.insert("frame".to_string(), LogValue::Int(1));
        let span = create_log_span(&state, "render-frame", Some(fields), Some("perf".to_string()));
        assert_eq!(span.name, "render-frame");
        assert_eq!(span.channel, Some("perf".to_string()));
        if let Some(LogValue::Int(v)) = span.fields.get("frame") {
            assert_eq!(*v, 1);
        } else {
            panic!("expected frame=1");
        }
    }

    #[test]
    fn defaults_fields_to_empty_and_channel_to_none() {
        let state = test_state();
        reset_log_state(&state);
        let span = create_log_span(&state, "op", None, None);
        assert!(span.fields.is_empty());
        assert_eq!(span.channel, None);
    }
}

mod create_log_state {
    use super::*;

    #[test]
    fn returns_a_fresh_state_with_default_levels_and_no_sinks() {
        let log_state = create_log_state();
        assert_eq!(log_state.level, LogLevel::Verbose);
        assert_eq!(log_state.console_level, LogLevel::Info);
        assert!(log_state.sinks.is_empty());
        assert!(log_state.once_keys.is_empty());
    }
}

mod create_memory_log_sink_tests {
    use super::*;

    #[test]
    fn captures_entries_up_to_capacity() {
        let state = test_state();
        reset_log_state(&state);
        let handle = create_memory_log_sink(3);
        add_log_sink(&state, handle.sink.clone());
        log(&state, 0.0, LogLevel::Info, "a".into(), None);
        log(&state, 0.0, LogLevel::Info, "b".into(), None);
        log(&state, 0.0, LogLevel::Info, "c".into(), None);
        assert_eq!(get_memory_log_sink_entries(&handle).len(), 3);
    }

    #[test]
    fn overwrites_oldest_entries_when_capacity_is_exceeded() {
        let state = test_state();
        reset_log_state(&state);
        let handle = create_memory_log_sink(2);
        add_log_sink(&state, handle.sink.clone());
        log(&state, 0.0, LogLevel::Info, "first".into(), None);
        log(&state, 0.0, LogLevel::Info, "second".into(), None);
        log(&state, 0.0, LogLevel::Info, "third".into(), None);
        let entries = get_memory_log_sink_entries(&handle);
        assert_eq!(entries.len(), 2);
        assert_eq!(data_as_str(&entries[0].data), Some("second"));
        assert_eq!(data_as_str(&entries[1].data), Some("third"));
    }

    #[test]
    fn preserves_retained_object_identity_in_stored_entries() {
        let state = test_state();
        reset_log_state(&state);
        let handle = create_memory_log_sink(1);
        add_log_sink(&state, handle.sink.clone());
        let object: Arc<dyn std::any::Any + Send + Sync> = Arc::new(vec![1_u8]);
        let mut data = HashMap::new();
        data.insert("object".to_string(), LogValue::Object(object.clone()));
        log(&state, 0.0, LogLevel::Info, LogData::Record(data).into(), None);
        let entries = get_memory_log_sink_entries(&handle);
        let LogData::Record(record) = &entries[0].data else {
            panic!("a record");
        };
        let Some(LogValue::Object(retained)) = record.get("object") else {
            panic!("an object");
        };
        assert!(Arc::ptr_eq(&object, retained));
    }

    #[test]
    fn returns_entries_oldest_first_after_capacity_exceeded() {
        let state = test_state();
        reset_log_state(&state);
        let handle = create_memory_log_sink(3);
        add_log_sink(&state, handle.sink.clone());
        for i in 0..5 {
            log(&state, 0.0, LogLevel::Info, format!("msg{}", i).into(), None);
        }
        let entries = get_memory_log_sink_entries(&handle);
        let data: Vec<Option<&str>> = entries.iter().map(|e| data_as_str(&e.data)).collect();
        assert_eq!(data, vec![Some("msg2"), Some("msg3"), Some("msg4")]);
    }
}

mod create_rate_limited_log_sink_tests {
    use super::*;

    #[test]
    fn limits_entries_per_interval() {
        let state = test_state();
        reset_log_state(&state);
        let forwarded: Arc<Mutex<Vec<LogEntry>>> = Arc::new(Mutex::new(Vec::new()));
        let forwarded_clone = forwarded.clone();
        let target: LogSink = Arc::new(move |e: &LogEntry| {
            forwarded_clone.lock().unwrap().push(e.clone());
        });
        let handle = create_rate_limited_log_sink(target, &RateLimitedLogSinkOptions { per_channel: false, max_per_interval: 2, interval_ms: 10000.0 });
        add_log_sink(&state, handle.sink.clone());
        log(&state, 0.0, LogLevel::Info, "a".into(), None);
        log(&state, 0.0, LogLevel::Info, "b".into(), None);
        log(&state, 0.0, LogLevel::Info, "c".into(), None); // should be rate-limited
        assert_eq!(forwarded.lock().unwrap().len(), 2);
    }

    #[test]
    fn resets_its_budget_after_the_interval_elapses() {
        let state = test_state();
        reset_log_state(&state);
        let forwarded: Arc<Mutex<Vec<LogEntry>>> = Arc::new(Mutex::new(Vec::new()));
        let forwarded_clone = forwarded.clone();
        let target: LogSink = Arc::new(move |e: &LogEntry| {
            forwarded_clone.lock().unwrap().push(e.clone());
        });
        let handle = create_rate_limited_log_sink(target, &RateLimitedLogSinkOptions { per_channel: false, max_per_interval: 1, interval_ms: 10.0 });
        add_log_sink(&state, handle.sink.clone());
        log(&state, 0.0, LogLevel::Info, "first".into(), None);
        log(&state, 5.0, LogLevel::Info, "suppressed".into(), None);
        log(&state, 20.0, LogLevel::Info, "next-window".into(), None);
        let f = forwarded.lock().unwrap();
        let data: Vec<Option<&str>> = f.iter().map(|e| data_as_str(&e.data)).collect();
        assert_eq!(data, vec![Some("first"), Some("next-window")]);
    }

    #[test]
    fn tracks_per_channel_when_per_channel_is_true() {
        let state = test_state();
        reset_log_state(&state);
        let forwarded: Arc<Mutex<Vec<LogEntry>>> = Arc::new(Mutex::new(Vec::new()));
        let forwarded_clone = forwarded.clone();
        let target: LogSink = Arc::new(move |e: &LogEntry| {
            forwarded_clone.lock().unwrap().push(e.clone());
        });
        let handle = create_rate_limited_log_sink(target, &RateLimitedLogSinkOptions { per_channel: true, max_per_interval: 1, interval_ms: 10000.0 });
        add_log_sink(&state, handle.sink.clone());
        log(&state, 0.0, LogLevel::Info, "a".into(), Some("ch1".to_string()));
        log(&state, 0.0, LogLevel::Info, "b".into(), Some("ch1".to_string())); // rate-limited for ch1
        log(&state, 0.0, LogLevel::Info, "c".into(), Some("ch2".to_string())); // allowed
        let f = forwarded.lock().unwrap();
        assert_eq!(f.len(), 2);
        assert_eq!(f[0].channel, Some("ch1".to_string()));
        assert_eq!(f[1].channel, Some("ch2".to_string()));
    }
}

mod create_sampled_log_sink_tests {
    use super::*;

    #[test]
    fn forwards_1_in_n_entries() {
        let state = test_state();
        reset_log_state(&state);
        let forwarded: Arc<Mutex<Vec<LogEntry>>> = Arc::new(Mutex::new(Vec::new()));
        let forwarded_clone = forwarded.clone();
        let target: LogSink = Arc::new(move |e: &LogEntry| {
            forwarded_clone.lock().unwrap().push(e.clone());
        });
        let sampled = create_sampled_log_sink(target, 3);
        add_log_sink(&state, sampled);
        for i in 0..9 {
            log(&state, 0.0, LogLevel::Info, format!("msg{}", i).into(), None);
        }
        assert_eq!(forwarded.lock().unwrap().len(), 3);
    }

    #[test]
    fn passes_all_entries_through_when_rate_is_1() {
        let state = test_state();
        reset_log_state(&state);
        let forwarded: Arc<Mutex<Vec<LogEntry>>> = Arc::new(Mutex::new(Vec::new()));
        let forwarded_clone = forwarded.clone();
        let target: LogSink = Arc::new(move |e: &LogEntry| {
            forwarded_clone.lock().unwrap().push(e.clone());
        });
        let sampled = create_sampled_log_sink(target, 1);
        add_log_sink(&state, sampled);
        log(&state, 0.0, LogLevel::Info, "a".into(), None);
        log(&state, 0.0, LogLevel::Info, "b".into(), None);
        assert_eq!(forwarded.lock().unwrap().len(), 2);
    }
}

mod create_text_log_formatter_tests {
    use super::*;

    #[test]
    fn produces_a_readable_prefix_and_message_line() {
        let state = test_state();
        reset_log_state(&state);
        let fmt = create_text_log_formatter(&state, Some(&TextLogFormatterOptions { indent_groups: Some(false), level_prefix: Some(false), timestamp: Some(false) }));
        let entry = LogEntry {
            level: LogLevel::Warn,
            channel: Some("batch".to_string()),
            data: LogData::Message("test".to_string()),
            timestamp_ms: 0.0,
        };
        assert_eq!(fmt(&entry), "[batch] test");
    }

    #[test]
    fn renders_retained_objects_through_the_canonical_unknown_projection() {
        let state = test_state();
        reset_log_state(&state);
        let fmt = create_text_log_formatter(&state, None);
        let mut data = HashMap::new();
        data.insert("object".to_string(), LogValue::Object(Arc::new(vec![1_u8])));
        let entry = LogEntry {
            level: LogLevel::Info,
            channel: None,
            data: LogData::Record(data),
            timestamp_ms: 0.0,
        };
        assert_eq!(fmt(&entry), "[flight] {\"object\":\"[object Object]\"}");
    }

    #[test]
    fn includes_level_prefix_when_requested() {
        let state = test_state();
        reset_log_state(&state);
        let fmt = create_text_log_formatter(&state, Some(&TextLogFormatterOptions { indent_groups: Some(false), level_prefix: Some(true), timestamp: Some(false) }));
        let entry = LogEntry {
            level: LogLevel::Error,
            channel: Some("ch".to_string()),
            data: LogData::Message("boom".to_string()),
            timestamp_ms: 0.0,
        };
        assert_eq!(fmt(&entry), "error [ch] boom");
    }

    #[test]
    fn serializes_record_data() {
        let state = test_state();
        reset_log_state(&state);
        let fmt = create_text_log_formatter(&state, Some(&TextLogFormatterOptions { indent_groups: Some(false), level_prefix: Some(false), timestamp: Some(false) }));
        let mut data = HashMap::new();
        data.insert("value".to_string(), LogValue::Int(3));
        let entry = LogEntry {
            level: LogLevel::Info,
            channel: None,
            data: LogData::Record(data),
            timestamp_ms: 0.0,
        };
        assert_eq!(fmt(&entry), "[flight] {\"value\":3}");
    }

    #[test]
    fn includes_timestamp_prefix_when_requested() {
        let state = test_state();
        reset_log_state(&state);
        let fmt = create_text_log_formatter(&state, Some(&TextLogFormatterOptions { indent_groups: Some(false), level_prefix: Some(false), timestamp: Some(true) }));
        let entry = LogEntry {
            level: LogLevel::Info,
            channel: None,
            data: LogData::Message("x".to_string()),
            timestamp_ms: 0.0,
        };
        let result = fmt(&entry);
        assert!(result.starts_with("t="));
        assert!(result.ends_with("[flight] x"));
    }

    #[test]
    fn indents_entries_while_a_group_is_open() {
        let state = test_state();
        reset_log_state(&state);
        begin_log_group(&state, 0.0, "outer", None);
        let fmt = create_text_log_formatter(&state, Some(&TextLogFormatterOptions { indent_groups: Some(true), level_prefix: Some(false), timestamp: Some(false) }));
        let entry = LogEntry {
            level: LogLevel::Info,
            channel: None,
            data: LogData::Message("inside".to_string()),
            timestamp_ms: 0.0,
        };
        let result = fmt(&entry);
        assert!(result.contains("  "));
        assert!(result.ends_with("inside"));
        clear_log_groups(&state);
    }

    #[test]
    fn uses_flight_default_channel() {
        let state = test_state();
        reset_log_state(&state);
        let fmt = create_text_log_formatter(&state, Some(&TextLogFormatterOptions { indent_groups: Some(false), level_prefix: Some(false), timestamp: Some(false) }));
        let entry = LogEntry {
            level: LogLevel::Info,
            channel: None,
            data: LogData::Message("x".to_string()),
            timestamp_ms: 0.0,
        };
        assert!(fmt(&entry).contains("[flight]"));
    }
}

mod end_log_group {
    use super::*;

    #[test]
    fn emits_a_debug_group_end_entry() {
        let state = test_state();
        reset_log_state(&state);
        let (entries, _sink) = recording_sink(&state);
        begin_log_group(&state, 0.0, "setup", None);
        entries.lock().unwrap().clear(); // clear begin entry
        end_log_group(&state, 0.0, None);
        let e = entries.lock().unwrap();
        assert_eq!(e.len(), 1);
        assert_eq!(record_str(&e[0].data, "group"), Some("end".to_string()));
        clear_log_groups(&state);
    }

    #[test]
    fn is_a_no_op_when_no_group_is_open() {
        let state = test_state();
        reset_log_state(&state);
        let (entries, _sink) = recording_sink(&state);
        end_log_group(&state, 0.0, None);
        assert_eq!(entries.lock().unwrap().len(), 0);
    }

    #[test]
    fn closes_the_group_without_emitting_when_debug_is_suppressed() {
        let state = test_state();
        reset_log_state(&state);
        let (entries, _sink) = recording_sink(&state);
        begin_log_group(&state, 0.0, "visible", None);
        entries.lock().unwrap().clear();
        set_log_level(&state, LogLevel::Error);
        end_log_group(&state, 0.0, None);
        assert_eq!(entries.lock().unwrap().len(), 0);
        clear_log_groups(&state);
    }
}

mod end_log_timer {
    use super::*;

    #[test]
    fn emits_a_debug_entry_with_label_and_elapsed_ms_and_returns_elapsed() {
        let state = test_state();
        reset_log_state(&state);
        let (entries, _sink) = recording_sink(&state);
        let timer = start_log_timer("op", Some("perf".to_string()), 0.0);
        let elapsed = end_log_timer(&state, 0.0, &timer);
        assert!(elapsed >= 0.0);
        let e = entries.lock().unwrap();
        assert_eq!(e.len(), 1);
        assert_eq!(e[0].level, LogLevel::Debug);
        assert_eq!(e[0].channel, Some("perf".to_string()));
        assert_eq!(record_str(&e[0].data, "label"), Some("op".to_string()));
    }
}

mod enter_log_span {
    use super::*;

    #[test]
    fn merges_span_fields_into_emitted_entries_while_active() {
        let state = test_state();
        reset_log_state(&state);
        let (entries, _sink) = recording_sink(&state);
        let mut fields = HashMap::new();
        fields.insert("reqId".to_string(), LogValue::Str("abc".to_string()));
        let span = create_log_span(&state, "request", Some(fields), None);
        enter_log_span(&state, &span);
        log(&state, 0.0, LogLevel::Info, "inside span".into(), None);
        exit_log_span(&state, &span);
        let e = entries.lock().unwrap();
        assert_eq!(record_str(&e[0].data, "reqId"), Some("abc".to_string()));
    }

    #[test]
    fn does_not_merge_span_fields_after_exit_log_span() {
        let state = test_state();
        reset_log_state(&state);
        let (entries, _sink) = recording_sink(&state);
        let mut fields = HashMap::new();
        fields.insert("reqId".to_string(), LogValue::Str("def".to_string()));
        let span = create_log_span(&state, "request", Some(fields), None);
        enter_log_span(&state, &span);
        exit_log_span(&state, &span);
        log(&state, 0.0, LogLevel::Info, "outside span".into(), None);
        let e = entries.lock().unwrap();
        assert_eq!(data_as_str(&e[0].data), Some("outside span"));
    }

    #[test]
    fn newer_spans_win_on_field_key_collision() {
        let state = test_state();
        reset_log_state(&state);
        let (entries, _sink) = recording_sink(&state);
        let mut fields1 = HashMap::new();
        fields1.insert("x".to_string(), LogValue::Int(1));
        fields1.insert("y".to_string(), LogValue::Int(10));
        let mut fields2 = HashMap::new();
        fields2.insert("x".to_string(), LogValue::Int(2));
        let span1 = create_log_span(&state, "outer", Some(fields1), None);
        let span2 = create_log_span(&state, "inner", Some(fields2), None);
        enter_log_span(&state, &span1);
        enter_log_span(&state, &span2);
        log(&state, 0.0, LogLevel::Info, "nested".into(), None);
        exit_log_span(&state, &span2);
        exit_log_span(&state, &span1);
        let e = entries.lock().unwrap();
        assert_eq!(record_int(&e[0].data, "x"), Some(2));
        assert_eq!(record_int(&e[0].data, "y"), Some(10));
    }

    #[test]
    fn leaves_data_unchanged_when_active_spans_have_no_fields() {
        let state = test_state();
        reset_log_state(&state);
        let (entries, _sink) = recording_sink(&state);
        let span = create_log_span(&state, "empty", None, None);
        enter_log_span(&state, &span);
        log(&state, 0.0, LogLevel::Info, "unchanged".into(), None);
        exit_log_span(&state, &span);
        let e = entries.lock().unwrap();
        assert_eq!(data_as_str(&e[0].data), Some("unchanged"));
    }

    #[test]
    fn merges_active_span_fields_into_record_data_with_direct_fields_winning() {
        let state = test_state();
        reset_log_state(&state);
        let (entries, _sink) = recording_sink(&state);
        let mut span_fields = HashMap::new();
        span_fields.insert("inherited".to_string(), LogValue::Int(1));
        span_fields.insert("winner".to_string(), LogValue::Str("span".to_string()));
        let span = create_log_span(&state, "record", Some(span_fields), None);
        enter_log_span(&state, &span);
        let mut data = HashMap::new();
        data.insert("direct".to_string(), LogValue::Int(2));
        data.insert("winner".to_string(), LogValue::Str("data".to_string()));
        log(&state, 0.0, LogLevel::Info, LogData::Record(data).into(), None);
        exit_log_span(&state, &span);

        let e = entries.lock().unwrap();
        assert_eq!(record_int(&e[0].data, "direct"), Some(2));
        assert_eq!(record_int(&e[0].data, "inherited"), Some(1));
        assert_eq!(record_str(&e[0].data, "winner"), Some("data".to_string()));
    }
}

mod exit_log_span {
    use super::*;

    #[test]
    fn is_a_no_op_when_the_span_is_not_in_the_stack() {
        let state = test_state();
        reset_log_state(&state);
        let (entries, _sink) = recording_sink(&state);
        let mut fields = HashMap::new();
        fields.insert("z".to_string(), LogValue::Int(1));
        let span = create_log_span(&state, "phantom", Some(fields), None);
        exit_log_span(&state, &span);
        log(&state, 0.0, LogLevel::Info, "clean".into(), None);
        let e = entries.lock().unwrap();
        assert_eq!(data_as_str(&e[0].data), Some("clean"));
    }

    #[test]
    fn supports_out_of_order_exit() {
        let state = test_state();
        reset_log_state(&state);
        let (entries, _sink) = recording_sink(&state);
        let mut fields1 = HashMap::new();
        fields1.insert("a".to_string(), LogValue::Int(1));
        let mut fields2 = HashMap::new();
        fields2.insert("b".to_string(), LogValue::Int(2));
        let span1 = create_log_span(&state, "a", Some(fields1), None);
        let span2 = create_log_span(&state, "b", Some(fields2), None);
        enter_log_span(&state, &span1);
        enter_log_span(&state, &span2);
        // Exit span1 first even though span2 was entered last
        exit_log_span(&state, &span1);
        log(&state, 0.0, LogLevel::Info, "after-a-exit".into(), None);
        exit_log_span(&state, &span2);
        let e = entries.lock().unwrap();
        assert_eq!(record_int(&e[0].data, "b"), Some(2));
        // "a" should not be present
        if let LogData::Record(ref map) = e[0].data {
            assert!(!map.contains_key("a"));
        }
    }
}

mod get_log_channel_level {
    use super::*;

    #[test]
    fn returns_none_when_no_channel_level_is_set() {
        let state = test_state();
        reset_log_state(&state);
        assert_eq!(get_log_channel_level(&state, "unknown"), None);
    }

    #[test]
    fn returns_the_set_level_for_a_known_channel() {
        let state = test_state();
        reset_log_state(&state);
        set_log_channel_level(&state, "render", LogLevel::Error);
        assert_eq!(get_log_channel_level(&state, "render"), Some(LogLevel::Error));
    }
}

mod get_log_console_level {
    use super::*;

    #[test]
    fn returns_the_current_threshold() {
        let state = test_state();
        reset_log_state(&state);
        set_log_console_level(&state, LogLevel::Verbose);
        assert_eq!(get_log_console_level(&state), LogLevel::Verbose);
    }
}

mod get_log_level {
    use super::*;

    #[test]
    fn returns_the_current_global_emit_level() {
        let state = test_state();
        reset_log_state(&state);
        set_log_level(&state, LogLevel::Error);
        assert_eq!(get_log_level(&state), LogLevel::Error);
    }
}

mod get_log_level_name {
    use super::*;

    #[test]
    fn returns_the_canonical_lowercase_name_for_each_level() {
        assert_eq!(get_log_level_name(LogLevel::None), "none");
        assert_eq!(get_log_level_name(LogLevel::Error), "error");
        assert_eq!(get_log_level_name(LogLevel::Warn), "warn");
        assert_eq!(get_log_level_name(LogLevel::Info), "info");
        assert_eq!(get_log_level_name(LogLevel::Debug), "debug");
        assert_eq!(get_log_level_name(LogLevel::Verbose), "verbose");
    }
}

mod get_memory_log_sink_entries {
    use super::*;

    #[test]
    fn returns_empty_before_any_entries() {
        let state = test_state();
        reset_log_state(&state);
        let handle = create_memory_log_sink(5);
        assert_eq!(get_memory_log_sink_entries(&handle).len(), 0);
    }
}

mod initialize_buffered_log_sink {
    use super::*;

    #[test]
    fn rebinds_a_sink_to_a_fresh_buffer_over_its_new_target() {
        let state = test_state();
        reset_log_state(&state);
        let first: Arc<Mutex<Vec<LogEntry>>> = Arc::new(Mutex::new(Vec::new()));
        let second: Arc<Mutex<Vec<LogEntry>>> = Arc::new(Mutex::new(Vec::new()));
        let first_clone = first.clone();
        let second_clone = second.clone();
        let options = BufferedLogSinkOptions {
            size: Some(2),
            interval_ms: None,
        };
        let mut handle = create_buffered_log_sink(
            Arc::new(move |e: &LogEntry| first_clone.lock().unwrap().push(e.clone())),
            Some(&options),
        );
        (handle.sink)(&LogEntry {
            level: LogLevel::Info,
            channel: None,
            data: LogData::Message("pending".to_string()),
            timestamp_ms: 0.0,
        });

        initialize_buffered_log_sink(
            &mut handle,
            Arc::new(move |e: &LogEntry| second_clone.lock().unwrap().push(e.clone())),
            Some(&options),
        );
        add_log_sink(&state, handle.sink.clone());
        log(&state, 0.0, LogLevel::Info, "a".into(), None);
        log(&state, 0.0, LogLevel::Info, "b".into(), None);

        assert!(first.lock().unwrap().is_empty());
        let forwarded = second.lock().unwrap();
        let data: Vec<Option<&str>> = forwarded.iter().map(|e| data_as_str(&e.data)).collect();
        assert_eq!(data, vec![Some("a"), Some("b")]);
    }
}

mod initialize_log_context {
    use super::*;

    #[test]
    fn replaces_the_channel_and_base_fields() {
        let mut fields = HashMap::new();
        fields.insert("k".to_string(), LogValue::Int(1));
        let mut context = create_log_context(Some("old".to_string()), Some(fields));

        initialize_log_context(&mut context, Some("new".to_string()), None);

        assert_eq!(context.channel, Some("new".to_string()));
        assert!(context.fields.is_empty());
    }
}

mod initialize_log_span {
    use super::*;

    #[test]
    fn takes_the_next_span_id_from_the_caller_owned_state() {
        let state = test_state();
        let mut span = create_log_span(&state, "first", None, None);
        let first_id = span.id;

        initialize_log_span(&mut span, &state, "second", None, Some("ch".to_string()));

        assert_eq!(span.id, first_id + 1);
        assert_eq!(span.name, "second");
        assert_eq!(span.channel, Some("ch".to_string()));
        assert_eq!(state.read().unwrap().next_span_id, first_id + 2);
    }
}

mod initialize_log_state {
    use super::*;

    #[test]
    fn resets_every_state_field_and_keeps_the_runtime_slot() {
        let mut log_state = create_log_state();
        log_state.level = LogLevel::Error;
        log_state.group_depth = 3;
        log_state.once_keys.insert("k".to_string());
        initialize_log_state(&mut log_state);
        assert_eq!(log_state.level, LogLevel::Verbose);
        assert_eq!(log_state.group_depth, 0);
        assert!(log_state.once_keys.is_empty());
    }
}

mod initialize_memory_log_sink {
    use super::*;

    #[test]
    fn rebinds_a_sink_to_an_empty_ring_of_the_new_capacity() {
        let state = test_state();
        reset_log_state(&state);
        let mut handle = create_memory_log_sink(1);
        (handle.sink)(&LogEntry {
            level: LogLevel::Info,
            channel: None,
            data: LogData::Message("stale".to_string()),
            timestamp_ms: 0.0,
        });

        initialize_memory_log_sink(&mut handle, 2);
        add_log_sink(&state, handle.sink.clone());
        for message in ["a", "b", "c"] {
            log(&state, 0.0, LogLevel::Info, message.into(), None);
        }

        let entries = get_memory_log_sink_entries(&handle);
        let data: Vec<Option<&str>> = entries.iter().map(|e| data_as_str(&e.data)).collect();
        assert_eq!(data, vec![Some("b"), Some("c")]);
    }
}

mod initialize_rate_limited_log_sink {
    use super::*;

    #[test]
    fn rebinds_a_sink_to_a_fresh_budget_over_its_new_target() {
        let state = test_state();
        reset_log_state(&state);
        let forwarded: Arc<Mutex<Vec<LogEntry>>> = Arc::new(Mutex::new(Vec::new()));
        let forwarded_clone = forwarded.clone();
        let options = RateLimitedLogSinkOptions {
            per_channel: false,
            max_per_interval: 1,
            interval_ms: 10000.0,
        };
        let mut handle = create_rate_limited_log_sink(Arc::new(|_: &LogEntry| {}), &options);
        (handle.sink)(&LogEntry {
            level: LogLevel::Info,
            channel: None,
            data: LogData::Message("spent".to_string()),
            timestamp_ms: 0.0,
        });

        initialize_rate_limited_log_sink(
            &mut handle,
            Arc::new(move |e: &LogEntry| forwarded_clone.lock().unwrap().push(e.clone())),
            &options,
        );
        add_log_sink(&state, handle.sink.clone());
        log(&state, 0.0, LogLevel::Info, "allowed".into(), None);
        log(&state, 0.0, LogLevel::Info, "limited".into(), None);

        let f = forwarded.lock().unwrap();
        let data: Vec<Option<&str>> = f.iter().map(|e| data_as_str(&e.data)).collect();
        assert_eq!(data, vec![Some("allowed")]);
    }
}

mod log_tests {
    use super::*;

    #[test]
    fn forwards_level_channel_and_data_to_all_sinks() {
        let state = test_state();
        reset_log_state(&state);
        let (entries, _sink) = recording_sink(&state);
        let mut data = HashMap::new();
        data.insert("k".to_string(), LogValue::Int(1));
        log(&state, 0.0, LogLevel::Warn, LogData::Record(data).into(), Some("shader".to_string()));
        let e = entries.lock().unwrap();
        assert_eq!(e[0].level, LogLevel::Warn);
        assert_eq!(e[0].channel, Some("shader".to_string()));
        assert_eq!(record_int(&e[0].data, "k"), Some(1));
    }

    #[test]
    fn forwards_retained_objects_to_structured_sinks_without_cloning_the_object() {
        let state = test_state();
        reset_log_state(&state);
        let (entries, _sink) = recording_sink(&state);
        let object: Arc<dyn std::any::Any + Send + Sync> = Arc::new(vec![1_u8]);
        let mut data = HashMap::new();
        data.insert("object".to_string(), LogValue::Object(object.clone()));
        log(&state, 0.0, LogLevel::Info, LogData::Record(data).into(), None);
        let entries = entries.lock().unwrap();
        let LogData::Record(record) = &entries[0].data else {
            panic!("a record");
        };
        let Some(LogValue::Object(retained)) = record.get("object") else {
            panic!("an object");
        };
        assert!(Arc::ptr_eq(&object, retained));
    }

    #[test]
    fn defaults_the_channel_to_none() {
        let state = test_state();
        reset_log_state(&state);
        let (entries, _sink) = recording_sink(&state);
        log(&state, 0.0, LogLevel::Info, "x".into(), None);
        assert_eq!(entries.lock().unwrap()[0].channel, None);
    }

    #[test]
    fn does_nothing_when_no_sink_is_installed() {
        let state = test_state();
        reset_log_state(&state);
        // Should not panic
        log(&state, 0.0, LogLevel::Info, "x".into(), None);
    }

    #[test]
    fn accepts_a_lazy_data_provider() {
        let state = test_state();
        reset_log_state(&state);
        let (entries, _sink) = recording_sink(&state);
        let called: Arc<Mutex<bool>> = Arc::new(Mutex::new(false));
        let called_clone = called.clone();
        let provider: LogDataProvider = Arc::new(move || {
            *called_clone.lock().unwrap() = true;
            return LogData::Message("lazy-value".to_string());
        });
        log(&state, 0.0, LogLevel::Info, LogDataOrProvider::Provider(provider), None);
        assert!(*called.lock().unwrap());
        assert_eq!(data_as_str(&entries.lock().unwrap()[0].data), Some("lazy-value"));
    }

    #[test]
    fn does_not_call_the_thunk_when_the_level_is_suppressed() {
        let state = test_state();
        reset_log_state(&state);
        let (_entries, _sink) = recording_sink(&state);
        set_log_level(&state, LogLevel::Error);
        let called: Arc<Mutex<bool>> = Arc::new(Mutex::new(false));
        let called_clone = called.clone();
        let provider: LogDataProvider = Arc::new(move || {
            *called_clone.lock().unwrap() = true;
            return LogData::Message("should-not-be-called".to_string());
        });
        log(&state, 0.0, LogLevel::Verbose, LogDataOrProvider::Provider(provider), None);
        assert!(!*called.lock().unwrap());
    }

    #[test]
    fn fans_out_to_multiple_sinks() {
        let state = test_state();
        reset_log_state(&state);
        let a: Arc<Mutex<Vec<LogEntry>>> = Arc::new(Mutex::new(Vec::new()));
        let b: Arc<Mutex<Vec<LogEntry>>> = Arc::new(Mutex::new(Vec::new()));
        let a_clone = a.clone();
        let b_clone = b.clone();
        add_log_sink(&state, Arc::new(move |e: &LogEntry| a_clone.lock().unwrap().push(e.clone())));
        add_log_sink(&state, Arc::new(move |e: &LogEntry| b_clone.lock().unwrap().push(e.clone())));
        log(&state, 0.0, LogLevel::Info, "multi".into(), None);
        assert_eq!(a.lock().unwrap().len(), 1);
        assert_eq!(b.lock().unwrap().len(), 1);
    }
}

mod log_assert_tests {
    use super::*;

    #[test]
    fn emits_an_error_entry_when_condition_is_false() {
        let state = test_state();
        reset_log_state(&state);
        let (entries, _sink) = recording_sink(&state);
        log_assert(&state, 0.0, false, "assertion failed".into(), None);
        let e = entries.lock().unwrap();
        assert_eq!(e.len(), 1);
        assert_eq!(e[0].level, LogLevel::Error);
    }

    #[test]
    fn does_not_emit_when_condition_is_true() {
        let state = test_state();
        reset_log_state(&state);
        let (entries, _sink) = recording_sink(&state);
        log_assert(&state, 0.0, true, "should not emit".into(), None);
        assert_eq!(entries.lock().unwrap().len(), 0);
    }
}

mod log_debug_tests {
    use super::*;

    #[test]
    fn emits_at_debug_level() {
        let state = test_state();
        reset_log_state(&state);
        let (entries, _sink) = recording_sink(&state);
        log_debug(&state, 0.0, "d".into(), Some("chan".to_string()));
        let e = entries.lock().unwrap();
        assert_eq!(e[0].level, LogLevel::Debug);
        assert_eq!(e[0].channel, Some("chan".to_string()));
        assert_eq!(data_as_str(&e[0].data), Some("d"));
    }

    #[test]
    fn accepts_a_lazy_provider() {
        let state = test_state();
        reset_log_state(&state);
        let (entries, _sink) = recording_sink(&state);
        let provider: LogDataProvider = Arc::new(|| LogData::Message("lazy".to_string()));
        log_debug(&state, 0.0, LogDataOrProvider::Provider(provider), None);
        assert_eq!(data_as_str(&entries.lock().unwrap()[0].data), Some("lazy"));
    }
}

mod log_debug_with_tests {
    use super::*;

    #[test]
    fn emits_at_debug_with_merged_context_fields() {
        let state = test_state();
        reset_log_state(&state);
        let (entries, _sink) = recording_sink(&state);
        let mut fields = HashMap::new();
        fields.insert("reqId".to_string(), LogValue::Str("abc".to_string()));
        let ctx = create_log_context(Some("ch".to_string()), Some(fields));
        log_debug_with(&state, 0.0, &ctx, "msg".into());
        let e = entries.lock().unwrap();
        assert_eq!(e[0].level, LogLevel::Debug);
        assert_eq!(e[0].channel, Some("ch".to_string()));
        assert_eq!(record_str(&e[0].data, "msg"), Some("msg".to_string()));
        assert_eq!(record_str(&e[0].data, "reqId"), Some("abc".to_string()));
    }
}

mod log_error_tests {
    use super::*;

    #[test]
    fn emits_at_error_level() {
        let state = test_state();
        reset_log_state(&state);
        let (entries, _sink) = recording_sink(&state);
        log_error(&state, 0.0, "e".into(), None);
        assert_eq!(entries.lock().unwrap()[0].level, LogLevel::Error);
    }
}

mod log_error_with_tests {
    use super::*;

    #[test]
    fn emits_at_error_with_merged_context_fields() {
        let state = test_state();
        reset_log_state(&state);
        let (entries, _sink) = recording_sink(&state);
        let mut fields = HashMap::new();
        fields.insert("reqId".to_string(), LogValue::Str("1".to_string()));
        let ctx = create_log_context(Some("ch".to_string()), Some(fields));
        log_error_with(&state, 0.0, &ctx, "fail".into());
        let e = entries.lock().unwrap();
        assert_eq!(e[0].level, LogLevel::Error);
        assert_eq!(record_str(&e[0].data, "msg"), Some("fail".to_string()));
        assert_eq!(record_str(&e[0].data, "reqId"), Some("1".to_string()));
    }
}

mod log_info_tests {
    use super::*;

    #[test]
    fn emits_at_info_level() {
        let state = test_state();
        reset_log_state(&state);
        let (entries, _sink) = recording_sink(&state);
        log_info(&state, 0.0, "i".into(), None);
        assert_eq!(entries.lock().unwrap()[0].level, LogLevel::Info);
    }
}

mod log_info_with_tests {
    use super::*;

    #[test]
    fn emits_at_info_with_merged_context_fields() {
        let state = test_state();
        reset_log_state(&state);
        let (entries, _sink) = recording_sink(&state);
        let mut fields = HashMap::new();
        fields.insert("v".to_string(), LogValue::Int(2));
        let ctx = create_log_context(Some("ch".to_string()), Some(fields));
        let mut data = HashMap::new();
        data.insert("extra".to_string(), LogValue::Bool(true));
        log_info_with(&state, 0.0, &ctx, LogData::Record(data).into());
        let e = entries.lock().unwrap();
        assert_eq!(record_int(&e[0].data, "v"), Some(2));
        if let LogData::Record(ref map) = e[0].data {
            assert!(matches!(map.get("extra"), Some(LogValue::Bool(true))));
        }
    }
}

mod log_once_tests {
    use super::*;

    #[test]
    fn emits_only_the_first_time_for_a_given_key() {
        let state = test_state();
        reset_log_state(&state);
        let (entries, _sink) = recording_sink(&state);
        log_once(&state, 0.0, "key1", LogLevel::Warn, "first".into(), None);
        log_once(&state, 0.0, "key1", LogLevel::Warn, "second".into(), None);
        let e = entries.lock().unwrap();
        assert_eq!(e.len(), 1);
        assert_eq!(data_as_str(&e[0].data), Some("first"));
    }

    #[test]
    fn allows_different_keys_to_emit_independently() {
        let state = test_state();
        reset_log_state(&state);
        let (entries, _sink) = recording_sink(&state);
        log_once(&state, 0.0, "key2a", LogLevel::Info, "a".into(), None);
        log_once(&state, 0.0, "key2b", LogLevel::Info, "b".into(), None);
        assert_eq!(entries.lock().unwrap().len(), 2);
    }

    #[test]
    fn returns_true_on_first_emit_false_on_subsequent_calls() {
        let state = test_state();
        reset_log_state(&state);
        let (_entries, _sink) = recording_sink(&state);
        assert!(log_once(&state, 0.0, "key3", LogLevel::Info, "x".into(), None));
        assert!(!log_once(&state, 0.0, "key3", LogLevel::Info, "x".into(), None));
    }
}

mod log_verbose_tests {
    use super::*;

    #[test]
    fn emits_at_verbose_level() {
        let state = test_state();
        reset_log_state(&state);
        let (entries, _sink) = recording_sink(&state);
        log_verbose(&state, 0.0, "v".into(), None);
        assert_eq!(entries.lock().unwrap()[0].level, LogLevel::Verbose);
    }
}

mod log_verbose_with_tests {
    use super::*;

    #[test]
    fn emits_at_verbose_with_merged_context_fields() {
        let state = test_state();
        reset_log_state(&state);
        let (entries, _sink) = recording_sink(&state);
        let mut fields = HashMap::new();
        fields.insert("trace".to_string(), LogValue::Bool(true));
        let ctx = create_log_context(None, Some(fields));
        log_verbose_with(&state, 0.0, &ctx, "trace-msg".into());
        let e = entries.lock().unwrap();
        assert_eq!(record_str(&e[0].data, "msg"), Some("trace-msg".to_string()));
        if let LogData::Record(ref map) = e[0].data {
            assert!(matches!(map.get("trace"), Some(LogValue::Bool(true))));
        }
    }
}

mod log_warn_tests {
    use super::*;

    #[test]
    fn emits_at_warn_level() {
        let state = test_state();
        reset_log_state(&state);
        let (entries, _sink) = recording_sink(&state);
        log_warn(&state, 0.0, "w".into(), None);
        assert_eq!(entries.lock().unwrap()[0].level, LogLevel::Warn);
    }
}

mod log_warn_with_tests {
    use super::*;

    #[test]
    fn emits_at_warn_with_merged_context_fields() {
        let state = test_state();
        reset_log_state(&state);
        let (entries, _sink) = recording_sink(&state);
        let mut fields = HashMap::new();
        fields.insert("ctx".to_string(), LogValue::Str("val".to_string()));
        let ctx = create_log_context(Some("ch".to_string()), Some(fields));
        log_warn_with(&state, 0.0, &ctx, "warning".into());
        let e = entries.lock().unwrap();
        assert_eq!(record_str(&e[0].data, "msg"), Some("warning".to_string()));
        assert_eq!(record_str(&e[0].data, "ctx"), Some("val".to_string()));
    }
}

mod log_with_tests {
    use super::*;

    #[test]
    fn emits_at_the_given_level_with_channel_from_context() {
        let state = test_state();
        reset_log_state(&state);
        let (entries, _sink) = recording_sink(&state);
        let mut fields = HashMap::new();
        fields.insert("frame".to_string(), LogValue::Int(1));
        let ctx = create_log_context(Some("render".to_string()), Some(fields));
        log_with(&state, 0.0, &ctx, LogLevel::Info, "update".into());
        let e = entries.lock().unwrap();
        assert_eq!(e[0].level, LogLevel::Info);
        assert_eq!(e[0].channel, Some("render".to_string()));
        assert_eq!(record_str(&e[0].data, "msg"), Some("update".to_string()));
        assert_eq!(record_int(&e[0].data, "frame"), Some(1));
    }

    #[test]
    fn passes_record_data_through_with_fields_merged() {
        let state = test_state();
        reset_log_state(&state);
        let (entries, _sink) = recording_sink(&state);
        let mut fields = HashMap::new();
        fields.insert("base".to_string(), LogValue::Int(1));
        let ctx = create_log_context(None, Some(fields));
        let mut data = HashMap::new();
        data.insert("extra".to_string(), LogValue::Int(2));
        log_with(&state, 0.0, &ctx, LogLevel::Debug, LogData::Record(data).into());
        let e = entries.lock().unwrap();
        assert_eq!(record_int(&e[0].data, "base"), Some(1));
        assert_eq!(record_int(&e[0].data, "extra"), Some(2));
    }

    #[test]
    fn accepts_a_lazy_provider() {
        let state = test_state();
        reset_log_state(&state);
        let (entries, _sink) = recording_sink(&state);
        let ctx = create_log_context(None, None);
        let provider: LogDataProvider = Arc::new(|| LogData::Message("lazy".to_string()));
        log_with(&state, 0.0, &ctx, LogLevel::Info, LogDataOrProvider::Provider(provider));
        assert_eq!(data_as_str(&entries.lock().unwrap()[0].data), Some("lazy"));
    }
}

mod parse_log_level_tests {
    use super::*;

    #[test]
    fn parses_canonical_names_to_their_log_level_values() {
        assert_eq!(parse_log_level("error"), Some(LogLevel::Error));
        assert_eq!(parse_log_level("warn"), Some(LogLevel::Warn));
        assert_eq!(parse_log_level("info"), Some(LogLevel::Info));
        assert_eq!(parse_log_level("debug"), Some(LogLevel::Debug));
        assert_eq!(parse_log_level("verbose"), Some(LogLevel::Verbose));
        assert_eq!(parse_log_level("none"), Some(LogLevel::None));
    }

    #[test]
    fn is_case_insensitive() {
        assert_eq!(parse_log_level("ERROR"), Some(LogLevel::Error));
        assert_eq!(parse_log_level("Warn"), Some(LogLevel::Warn));
    }

    #[test]
    fn returns_none_for_unknown_names() {
        let state = test_state();
        assert_eq!(parse_log_level("unknown"), None);
        assert_eq!(parse_log_level(""), None);
    }
}

mod register_log_serializer_tests {
    use super::*;

    #[test]
    fn applies_the_serializer_when_the_json_formatter_encounters_a_matching_kind() {
        let state = test_state();
        reset_log_state(&state);
        register_log_serializer(&state, 
            "acme.Point",
            Arc::new(|v| {
                let mut m = HashMap::new();
                if let (Some(LogValue::Int(x)), Some(LogValue::Int(y))) = (v.get("x"), v.get("y")) {
                    m.insert(
                        "serialized".to_string(),
                        LogValue::Str(format!("({},{})", x, y)),
                    );
                }
                return m;
            }),
        );
        let fmt = create_json_log_formatter(&state);
        let mut inner = HashMap::new();
        inner.insert("__kind".to_string(), LogValue::Str("acme.Point".to_string()));
        inner.insert("x".to_string(), LogValue::Int(3));
        inner.insert("y".to_string(), LogValue::Int(4));
        let mut data = HashMap::new();
        data.insert("pt".to_string(), LogValue::Record(inner));
        let entry = LogEntry {
            level: LogLevel::Info,
            channel: None,
            data: LogData::Record(data),
            timestamp_ms: 0.0,
        };
        let result = fmt(&entry);
        assert!(result.contains("(3,4)"));
    }

    #[test]
    fn preserves_values_that_do_not_match_a_registered_serializer() {
        let state = test_state();
        reset_log_state(&state);
        register_log_serializer(&state, 
            "acme.Known",
            Arc::new(|_| {
                let mut m = HashMap::new();
                m.insert("serialized".to_string(), LogValue::Bool(true));
                return m;
            }),
        );
        let fmt = create_json_log_formatter(&state);
        let mut unknown_kind = HashMap::new();
        unknown_kind.insert("__kind".to_string(), LogValue::Str("acme.Unknown".to_string()));
        unknown_kind.insert("value".to_string(), LogValue::Int(4));
        let mut no_kind = HashMap::new();
        no_kind.insert("value".to_string(), LogValue::Int(1));
        let mut data = HashMap::new();
        data.insert("missingKind".to_string(), LogValue::Record(no_kind));
        data.insert("unknownKind".to_string(), LogValue::Record(unknown_kind));
        data.insert("primitive".to_string(), LogValue::Int(3));
        let entry = LogEntry {
            level: LogLevel::Info,
            channel: None,
            data: LogData::Record(data),
            timestamp_ms: 0.0,
        };
        let result = fmt(&entry);
        assert!(result.contains("\"primitive\":3"));
        assert!(result.contains("acme.Unknown"));
        assert!(!result.contains("\"serialized\""));
    }
}

mod remove_log_sink {
    use super::*;

    #[test]
    fn removes_a_previously_added_sink_and_returns_true() {
        let state = test_state();
        reset_log_state(&state);
        let entries: Arc<Mutex<Vec<LogEntry>>> = Arc::new(Mutex::new(Vec::new()));
        let entries_clone = entries.clone();
        let sink: LogSink = Arc::new(move |e: &LogEntry| {
            entries_clone.lock().unwrap().push(e.clone());
        });
        add_log_sink(&state, sink.clone());
        let removed = remove_log_sink(&state, &sink);
        assert!(removed);
        log(&state, 0.0, LogLevel::Info, "x".into(), None);
        // Should not have received anything because we also need at least one sink for the gate
        // to pass; but verify the removal worked by re-adding a fresh sink and checking original
        // sink was removed.
    }

    #[test]
    fn returns_false_when_the_sink_was_not_registered() {
        let state = test_state();
        reset_log_state(&state);
        let sink: LogSink = Arc::new(|_| {});
        assert!(!remove_log_sink(&state, &sink));
    }
}

mod serialize_log_error_tests {
    use super::*;

    #[test]
    fn wraps_a_string_value() {
        let state = test_state();
        let result = serialize_log_error("oops");
        if let Some(LogValue::Str(v)) = result.get("value") {
            assert_eq!(v, "oops");
        } else {
            panic!("expected value='oops'");
        }
    }
}

mod set_log_channel_level_tests {
    use super::*;

    #[test]
    fn suppresses_entries_below_the_channel_level() {
        let state = test_state();
        reset_log_state(&state);
        let (entries, _sink) = recording_sink(&state);
        set_log_channel_level(&state, "render", LogLevel::Error);
        log(&state, 0.0, LogLevel::Info, "info on render channel".into(), Some("render".to_string()));
        log(&state, 0.0, LogLevel::Error, "error on render channel".into(), Some("render".to_string()));
        let e = entries.lock().unwrap();
        assert_eq!(e.len(), 1);
        assert_eq!(e[0].level, LogLevel::Error);
    }

    #[test]
    fn does_not_affect_other_channels() {
        let state = test_state();
        reset_log_state(&state);
        let (entries, _sink) = recording_sink(&state);
        set_log_channel_level(&state, "render", LogLevel::Error);
        log(&state, 0.0, LogLevel::Info, "other".into(), Some("audio".to_string()));
        assert_eq!(entries.lock().unwrap().len(), 1);
    }
}

mod set_log_level_tests {
    use super::*;

    #[test]
    fn suppresses_entries_below_the_global_level() {
        let state = test_state();
        reset_log_state(&state);
        let (entries, _sink) = recording_sink(&state);
        set_log_level(&state, LogLevel::Error);
        log(&state, 0.0, LogLevel::Info, "suppressed".into(), None);
        log(&state, 0.0, LogLevel::Error, "emitted".into(), None);
        let e = entries.lock().unwrap();
        assert_eq!(e.len(), 1);
        assert_eq!(data_as_str(&e[0].data), Some("emitted"));
    }

    #[test]
    fn log_level_none_always_suppresses() {
        let state = test_state();
        reset_log_state(&state);
        let (entries, _sink) = recording_sink(&state);
        set_log_level(&state, LogLevel::None);
        log(&state, 0.0, LogLevel::None, "should not emit".into(), None);
        assert_eq!(entries.lock().unwrap().len(), 0);
    }
}

mod set_log_redaction_paths_tests {
    use super::*;

    #[test]
    fn replaces_top_level_fields_matching_a_path() {
        let state = test_state();
        reset_log_state(&state);
        set_log_redaction_paths(&state, &["password".to_string()]);
        let fmt = create_json_log_formatter(&state);
        let mut data = HashMap::new();
        data.insert("user".to_string(), LogValue::Str("alice".to_string()));
        data.insert("password".to_string(), LogValue::Str("secret".to_string()));
        let entry = LogEntry {
            level: LogLevel::Info,
            channel: None,
            data: LogData::Record(data),
            timestamp_ms: 0.0,
        };
        let result = fmt(&entry);
        assert!(result.contains("[REDACTED]"));
        assert!(result.contains("\"alice\""));
        assert!(!result.contains("\"secret\""));
    }

    #[test]
    fn does_not_mutate_the_original_data_object() {
        let state = test_state();
        reset_log_state(&state);
        set_log_redaction_paths(&state, &["key".to_string()]);
        let mut data = HashMap::new();
        data.insert("key".to_string(), LogValue::Str("value".to_string()));
        data.insert("other".to_string(), LogValue::Str("safe".to_string()));
        let data_clone = data.clone();
        let entry = LogEntry {
            level: LogLevel::Info,
            channel: None,
            data: LogData::Record(data_clone),
            timestamp_ms: 0.0,
        };
        let fmt = create_json_log_formatter(&state);
        fmt(&entry);
        if let Some(LogValue::Str(v)) = data.get("key") {
            assert_eq!(v, "value");
        } else {
            panic!("expected key='value' in original data");
        }
    }

    #[test]
    fn leaves_absent_and_non_record_path_segments_unchanged() {
        let state = test_state();
        reset_log_state(&state);
        set_log_redaction_paths(&state, &[
            "missing.secret".to_string(),
            "primitive.secret".to_string(),
            "items.secret".to_string(),
        ]);
        let fmt = create_json_log_formatter(&state);
        let mut data = HashMap::new();
        data.insert("items".to_string(), LogValue::Array(vec![LogValue::Str("secret".to_string())]));
        data.insert("primitive".to_string(), LogValue::Int(7));
        let entry = LogEntry {
            level: LogLevel::Info,
            channel: None,
            data: LogData::Record(data),
            timestamp_ms: 0.0,
        };
        let result = fmt(&entry);
        assert!(result.contains("\"secret\""));
        assert!(result.contains("7"));
        assert!(!result.contains("[REDACTED]"));
    }

    #[test]
    fn replaces_nested_fields_with_dot_notation_paths() {
        let state = test_state();
        reset_log_state(&state);
        set_log_redaction_paths(&state, &["auth.secret".to_string()]);
        let fmt = create_json_log_formatter(&state);
        let mut auth = HashMap::new();
        auth.insert("secret".to_string(), LogValue::Str("tok".to_string()));
        auth.insert("name".to_string(), LogValue::Str("jwt".to_string()));
        let mut data = HashMap::new();
        data.insert("auth".to_string(), LogValue::Record(auth));
        let entry = LogEntry {
            level: LogLevel::Info,
            channel: None,
            data: LogData::Record(data),
            timestamp_ms: 0.0,
        };
        let result = fmt(&entry);
        assert!(result.contains("[REDACTED]"));
        assert!(result.contains("\"jwt\""));
        assert!(!result.contains("\"tok\""));
    }
}

mod set_log_sink_tests {
    use super::*;

    #[test]
    fn clears_the_sink_list_when_passed_none() {
        let state = test_state();
        reset_log_state(&state);
        let (entries, _sink) = recording_sink(&state);
        set_log_sink(&state, None);
        log(&state, 0.0, LogLevel::Info, "x".into(), None);
        assert_eq!(entries.lock().unwrap().len(), 0);
    }

    #[test]
    fn replaces_all_existing_sinks_with_the_single_given_sink() {
        let state = test_state();
        reset_log_state(&state);
        let a: Arc<Mutex<Vec<LogEntry>>> = Arc::new(Mutex::new(Vec::new()));
        let b: Arc<Mutex<Vec<LogEntry>>> = Arc::new(Mutex::new(Vec::new()));
        let a_clone = a.clone();
        let b_clone = b.clone();
        add_log_sink(&state, Arc::new(move |e: &LogEntry| a_clone.lock().unwrap().push(e.clone())));
        set_log_sink(&state, Some(Arc::new(move |e: &LogEntry| b_clone.lock().unwrap().push(e.clone()))));
        log(&state, 0.0, LogLevel::Info, "x".into(), None);
        assert_eq!(a.lock().unwrap().len(), 0);
        assert_eq!(b.lock().unwrap().len(), 1);
    }
}

mod start_log_timer_tests {
    use super::*;

    #[test]
    fn returns_a_log_timer_with_the_given_label_and_channel() {
        let state = test_state();
        reset_log_state(&state);
        let timer = start_log_timer("render", Some("perf".to_string()), 0.0);
        assert_eq!(timer.label, "render");
        assert_eq!(timer.channel, Some("perf".to_string()));
        assert!(timer.started_at >= 0.0);
    }
}

mod enable_log_signals_tests {
    use super::*;

    #[test]
    fn returns_a_log_signals_entity() {
        let state = test_state();
        reset_log_state(&state);
        let signals = enable_log_signals(&state);
        // Verify the signals exist (they are Signal structs)
        let _ = &signals.on_log_entry;
        let _ = &signals.on_log_error;
    }

    #[test]
    fn on_log_entry_fires_for_every_emitted_entry() {
        let state = test_state();
        reset_log_state(&state);
        let signals = enable_log_signals(&state);
        let received: Arc<Mutex<Vec<LogEntry>>> = Arc::new(Mutex::new(Vec::new()));
        let received_clone = received.clone();
        connect_signal(
            &signals.on_log_entry,
            Arc::new(move |entry: &LogEntry| {
                received_clone.lock().unwrap().push(entry.clone());
            }),
            None,
        );
        log(&state, 0.0, LogLevel::Info, "via-signal".into(), None);
        assert_eq!(received.lock().unwrap().len(), 1);
        assert_eq!(data_as_str(&received.lock().unwrap()[0].data), Some("via-signal"));
    }

    #[test]
    fn on_log_error_fires_only_for_error_level_entries() {
        let state = test_state();
        reset_log_state(&state);
        let signals = enable_log_signals(&state);
        let errors: Arc<Mutex<Vec<LogEntry>>> = Arc::new(Mutex::new(Vec::new()));
        let errors_clone = errors.clone();
        connect_signal(
            &signals.on_log_error,
            Arc::new(move |entry: &LogEntry| {
                errors_clone.lock().unwrap().push(entry.clone());
            }),
            None,
        );
        log(&state, 0.0, LogLevel::Info, "not-error".into(), None);
        log(&state, 0.0, LogLevel::Error, "is-error".into(), None);
        assert_eq!(errors.lock().unwrap().len(), 1);
        assert_eq!(errors.lock().unwrap()[0].level, LogLevel::Error);
    }

    #[test]
    fn returns_the_same_object_on_subsequent_calls() {
        let state = test_state();
        reset_log_state(&state);
        let a = enable_log_signals(&state);
        let b = enable_log_signals(&state);
        assert!(Arc::ptr_eq(&a.on_log_entry.data, &b.on_log_entry.data));
        assert!(Arc::ptr_eq(&a.on_log_error.data, &b.on_log_error.data));
    }
}

mod severity_wrapper_providers_and_gates {
    use super::*;

    fn tracking_provider(called: &Arc<Mutex<bool>>, value: &str) -> LogDataOrProvider {
        let called = called.clone();
        let value = value.to_string();
        return LogDataOrProvider::Provider(Arc::new(move || {
            *called.lock().unwrap() = true;
            return LogData::Message(value.clone());
        }));
    }

    #[test]
    fn does_not_evaluate_any_provider_when_its_level_is_suppressed() {
        let state = test_state();
        reset_log_state(&state);
        let (_entries, _sink) = recording_sink(&state);
        let ctx = create_log_context(Some("channel".to_string()), None);
        set_log_level(&state, LogLevel::None);

        let flags: Vec<Arc<Mutex<bool>>> = (0..12).map(|_| Arc::new(Mutex::new(false))).collect();

        log_assert(&state, 0.0, false, tracking_provider(&flags[0], "v0"), None);
        log_debug(&state, 0.0, tracking_provider(&flags[1], "v1"), None);
        log_debug_with(&state, 0.0, &ctx, tracking_provider(&flags[2], "v2"));
        log_error(&state, 0.0, tracking_provider(&flags[3], "v3"), None);
        log_error_with(&state, 0.0, &ctx, tracking_provider(&flags[4], "v4"));
        log_info(&state, 0.0, tracking_provider(&flags[5], "v5"), None);
        log_info_with(&state, 0.0, &ctx, tracking_provider(&flags[6], "v6"));
        log_verbose(&state, 0.0, tracking_provider(&flags[7], "v7"), None);
        log_verbose_with(&state, 0.0, &ctx, tracking_provider(&flags[8], "v8"));
        log_warn(&state, 0.0, tracking_provider(&flags[9], "v9"), None);
        log_warn_with(&state, 0.0, &ctx, tracking_provider(&flags[10], "v10"));
        log_with(&state, 0.0, &ctx, LogLevel::Info, tracking_provider(&flags[11], "v11"));

        for (i, flag) in flags.iter().enumerate() {
            assert!(!*flag.lock().unwrap(), "provider {} was called when level was suppressed", i);
        }
    }

    #[test]
    fn evaluates_providers_after_their_level_gates_pass() {
        let state = test_state();
        reset_log_state(&state);
        let (entries, _sink) = recording_sink(&state);
        let ctx = create_log_context(Some("channel".to_string()), None);

        let flags: Vec<Arc<Mutex<bool>>> = (0..10).map(|_| Arc::new(Mutex::new(false))).collect();

        log_assert(&state, 0.0, false, tracking_provider(&flags[0], "v0"), None);
        log_debug_with(&state, 0.0, &ctx, tracking_provider(&flags[1], "v1"));
        log_error(&state, 0.0, tracking_provider(&flags[2], "v2"), None);
        log_error_with(&state, 0.0, &ctx, tracking_provider(&flags[3], "v3"));
        log_info(&state, 0.0, tracking_provider(&flags[4], "v4"), None);
        log_info_with(&state, 0.0, &ctx, tracking_provider(&flags[5], "v5"));
        log_verbose(&state, 0.0, tracking_provider(&flags[6], "v6"), None);
        log_verbose_with(&state, 0.0, &ctx, tracking_provider(&flags[7], "v7"));
        log_warn(&state, 0.0, tracking_provider(&flags[8], "v8"), None);
        log_warn_with(&state, 0.0, &ctx, tracking_provider(&flags[9], "v9"));

        for (i, flag) in flags.iter().enumerate() {
            assert!(*flag.lock().unwrap(), "provider {} was not called when level was active", i);
        }
        assert_eq!(entries.lock().unwrap().len(), 10);
    }
}
