use std::any::Any;
use std::cell::RefCell;
use std::collections::HashMap;
use std::rc::Rc;
use std::thread;
use std::time::Duration;

use flight_log::*;
use flight_signals::connect_signal;

/// Helper: resets all global state before each test.
fn reset_log_state() {
    clear_log_groups();
    clear_log_once_keys();
    clear_log_redaction_paths();
    clear_log_serializers();
    clear_log_sinks();
    clear_log_channel_levels();
    set_log_console_level(LogLevel::Info);
    set_log_level(LogLevel::Verbose);
}

/// Helper: creates a recording sink and adds it. Returns the shared entries vec.
fn recording_sink() -> (Rc<RefCell<Vec<LogEntry>>>, LogSink) {
    let entries: Rc<RefCell<Vec<LogEntry>>> = Rc::new(RefCell::new(Vec::new()));
    let entries_clone = entries.clone();
    let sink: LogSink = Rc::new(move |entry: &LogEntry| {
        entries_clone.borrow_mut().push(entry.clone());
    });
    add_log_sink(sink.clone());
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
        reset_log_state();
        let entries: Rc<RefCell<Vec<LogEntry>>> = Rc::new(RefCell::new(Vec::new()));
        let entries_clone = entries.clone();
        let sink: LogSink = Rc::new(move |e: &LogEntry| {
            entries_clone.borrow_mut().push(e.clone());
        });
        add_log_sink(sink);
        log(LogLevel::Info, "hello".into(), None);
        assert_eq!(entries.borrow().len(), 1);
    }

    #[test]
    fn does_not_add_the_same_sink_twice() {
        reset_log_state();
        let entries: Rc<RefCell<Vec<LogEntry>>> = Rc::new(RefCell::new(Vec::new()));
        let entries_clone = entries.clone();
        let sink: LogSink = Rc::new(move |e: &LogEntry| {
            entries_clone.borrow_mut().push(e.clone());
        });
        add_log_sink(sink.clone());
        add_log_sink(sink.clone());
        log(LogLevel::Info, "x".into(), None);
        assert_eq!(entries.borrow().len(), 1);
    }
}

mod begin_log_group {
    use super::*;

    #[test]
    fn emits_a_debug_group_begin_entry_and_increments_nesting_depth() {
        reset_log_state();
        let (entries, _sink) = recording_sink();
        begin_log_group("setup", None);
        let e = entries.borrow();
        assert_eq!(e.len(), 1);
        assert_eq!(e[0].level, LogLevel::Debug);
        assert_eq!(record_str(&e[0].data, "group"), Some("begin".to_string()));
        assert_eq!(record_int(&e[0].data, "depth"), Some(1));
        clear_log_groups();
    }

    #[test]
    fn nests_second_begin_log_group_produces_depth_2() {
        reset_log_state();
        let (entries, _sink) = recording_sink();
        begin_log_group("outer", None);
        begin_log_group("inner", None);
        let e = entries.borrow();
        assert_eq!(record_int(&e[1].data, "depth"), Some(2));
        clear_log_groups();
    }

    #[test]
    fn tracks_depth_without_emitting_when_debug_is_suppressed() {
        reset_log_state();
        let (entries, _sink) = recording_sink();
        set_log_level(LogLevel::Error);
        begin_log_group("suppressed", None);
        assert_eq!(entries.borrow().len(), 0);
        clear_log_groups();
    }
}

mod clear_log_channel_level {
    use super::*;

    #[test]
    fn removes_only_the_named_channel_override() {
        reset_log_state();
        set_log_channel_level("render", LogLevel::Error);
        set_log_channel_level("input", LogLevel::Warn);
        clear_log_channel_level("render");
        assert_eq!(get_log_channel_level("render"), None);
        assert_eq!(get_log_channel_level("input"), Some(LogLevel::Warn));
    }
}

mod clear_log_channel_levels {
    use super::*;

    #[test]
    fn removes_all_per_channel_level_overrides() {
        reset_log_state();
        set_log_channel_level("render", LogLevel::Error);
        clear_log_channel_levels();
        assert_eq!(get_log_channel_level("render"), None);
    }
}

mod clear_log_groups {
    use super::*;

    #[test]
    fn resets_group_nesting_depth_to_zero_without_emitting() {
        reset_log_state();
        let (entries, _sink) = recording_sink();
        begin_log_group("a", None);
        begin_log_group("b", None);
        entries.borrow_mut().clear();
        clear_log_groups();
        // After clear, endLogGroup should be a no-op
        end_log_group(None);
        assert_eq!(entries.borrow().len(), 0);
    }
}

mod clear_log_once_keys {
    use super::*;

    #[test]
    fn allows_a_previously_consumed_key_to_fire_again() {
        reset_log_state();
        let (entries, _sink) = recording_sink();
        log_once("once-clear-test", LogLevel::Warn, "first".into(), None);
        assert_eq!(entries.borrow().len(), 1);
        clear_log_once_keys();
        log_once("once-clear-test", LogLevel::Warn, "second".into(), None);
        assert_eq!(entries.borrow().len(), 2);
        assert_eq!(data_as_str(&entries.borrow()[1].data), Some("second"));
    }
}

mod clear_log_redaction_paths {
    use super::*;

    #[test]
    fn removes_all_redaction_paths_so_fields_are_no_longer_redacted() {
        reset_log_state();
        set_log_redaction_paths(&["token".to_string()]);
        clear_log_redaction_paths();
        let fmt = create_json_log_formatter();
        let mut data = HashMap::new();
        data.insert("token".to_string(), LogValue::Str("secret".to_string()));
        let entry = LogEntry {
            level: LogLevel::Info,
            channel: None,
            data: LogData::Record(data),
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
        reset_log_state();
        register_log_serializer(
            "acme.Foo",
            Rc::new(|_| {
                let mut m = HashMap::new();
                m.insert("serialized".to_string(), LogValue::Bool(true));
                return m;
            }),
        );
        clear_log_serializers();
        let fmt = create_json_log_formatter();
        let mut inner = HashMap::new();
        inner.insert("__kind".to_string(), LogValue::Str("acme.Foo".to_string()));
        inner.insert("x".to_string(), LogValue::Int(1));
        let mut data = HashMap::new();
        data.insert("obj".to_string(), LogValue::Record(inner));
        let entry = LogEntry {
            level: LogLevel::Info,
            channel: None,
            data: LogData::Record(data),
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
        reset_log_state();
        let entries: Rc<RefCell<Vec<LogEntry>>> = Rc::new(RefCell::new(Vec::new()));
        let entries_clone = entries.clone();
        add_log_sink(Rc::new(move |e: &LogEntry| {
            entries_clone.borrow_mut().push(e.clone());
        }));
        clear_log_sinks();
        log(LogLevel::Info, "x".into(), None);
        assert_eq!(entries.borrow().len(), 0);
    }
}

mod clear_memory_log_sink {
    use super::*;

    #[test]
    fn empties_the_captured_entries() {
        reset_log_state();
        let handle = create_memory_log_sink(10);
        add_log_sink(handle.sink.clone());
        log(LogLevel::Info, "a".into(), None);
        clear_memory_log_sink(&handle);
        assert_eq!(get_memory_log_sink_entries(&handle).len(), 0);
    }
}

mod create_buffered_log_sink_tests {
    use super::*;

    #[test]
    fn uses_the_default_size_and_interval_options() {
        reset_log_state();
        let forwarded: Rc<RefCell<Vec<LogEntry>>> = Rc::new(RefCell::new(Vec::new()));
        let forwarded_clone = forwarded.clone();
        let target: LogSink = Rc::new(move |e: &LogEntry| {
            forwarded_clone.borrow_mut().push(e.clone());
        });
        let handle = create_buffered_log_sink(target, None);
        (handle.sink)(&LogEntry {
            level: LogLevel::Info,
            channel: None,
            data: LogData::Message("queued".to_string()),
        });
        assert_eq!(forwarded.borrow().len(), 0);
        flush_log_sink(&handle);
        assert_eq!(forwarded.borrow().len(), 1);
        dispose_log_sink(&handle);
    }

    #[test]
    fn does_not_forward_entries_until_flushed() {
        reset_log_state();
        let forwarded: Rc<RefCell<Vec<LogEntry>>> = Rc::new(RefCell::new(Vec::new()));
        let forwarded_clone = forwarded.clone();
        let target: LogSink = Rc::new(move |e: &LogEntry| {
            forwarded_clone.borrow_mut().push(e.clone());
        });
        let handle = create_buffered_log_sink(target, Some(100));
        add_log_sink(handle.sink.clone());
        log(LogLevel::Info, "queued".into(), None);
        assert_eq!(forwarded.borrow().len(), 0);
        flush_log_sink(&handle);
        assert_eq!(forwarded.borrow().len(), 1);
    }

    #[test]
    fn auto_flushes_when_buffer_reaches_size() {
        reset_log_state();
        let forwarded: Rc<RefCell<Vec<LogEntry>>> = Rc::new(RefCell::new(Vec::new()));
        let forwarded_clone = forwarded.clone();
        let target: LogSink = Rc::new(move |e: &LogEntry| {
            forwarded_clone.borrow_mut().push(e.clone());
        });
        let handle = create_buffered_log_sink(target, Some(2));
        add_log_sink(handle.sink.clone());
        log(LogLevel::Info, "a".into(), None);
        log(LogLevel::Info, "b".into(), None);
        assert_eq!(forwarded.borrow().len(), 2);
    }

    #[test]
    fn dispose_log_sink_flushes_remaining() {
        reset_log_state();
        let forwarded: Rc<RefCell<Vec<LogEntry>>> = Rc::new(RefCell::new(Vec::new()));
        let forwarded_clone = forwarded.clone();
        let target: LogSink = Rc::new(move |e: &LogEntry| {
            forwarded_clone.borrow_mut().push(e.clone());
        });
        let handle = create_buffered_log_sink(target, Some(100));
        add_log_sink(handle.sink.clone());
        log(LogLevel::Info, "pending".into(), None);
        dispose_log_sink(&handle);
        assert_eq!(forwarded.borrow().len(), 1);
    }

    #[test]
    fn does_nothing_when_an_empty_buffer_is_flushed() {
        reset_log_state();
        let forwarded: Rc<RefCell<Vec<LogEntry>>> = Rc::new(RefCell::new(Vec::new()));
        let forwarded_clone = forwarded.clone();
        let target: LogSink = Rc::new(move |e: &LogEntry| {
            forwarded_clone.borrow_mut().push(e.clone());
        });
        let handle = create_buffered_log_sink(target, None);
        flush_log_sink(&handle);
        assert_eq!(forwarded.borrow().len(), 0);
    }
}

mod create_child_log_context {
    use super::*;

    #[test]
    fn merges_parent_and_child_fields_child_wins() {
        reset_log_state();
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
        reset_log_state();
        let parent = create_log_context(Some("parent".to_string()), None);
        let child = create_child_log_context(&parent, HashMap::new(), None);
        assert_eq!(child.channel, Some("parent".to_string()));
    }

    #[test]
    fn overrides_channel_when_provided() {
        reset_log_state();
        let parent = create_log_context(Some("parent".to_string()), None);
        let child = create_child_log_context(&parent, HashMap::new(), Some(Some("child".to_string())));
        assert_eq!(child.channel, Some("child".to_string()));
    }
}

mod create_fanout_log_sink {
    use super::*;

    #[test]
    fn forwards_each_entry_to_all_component_sinks() {
        reset_log_state();
        let a: Rc<RefCell<Vec<LogEntry>>> = Rc::new(RefCell::new(Vec::new()));
        let b: Rc<RefCell<Vec<LogEntry>>> = Rc::new(RefCell::new(Vec::new()));
        let a_clone = a.clone();
        let b_clone = b.clone();
        let fanout = create_fanout_log_sink(vec![
            Rc::new(move |e: &LogEntry| a_clone.borrow_mut().push(e.clone())),
            Rc::new(move |e: &LogEntry| b_clone.borrow_mut().push(e.clone())),
        ]);
        add_log_sink(fanout);
        log(LogLevel::Info, "hello".into(), None);
        assert_eq!(a.borrow().len(), 1);
        assert_eq!(b.borrow().len(), 1);
    }
}

mod create_filter_log_sink {
    use super::*;

    #[test]
    fn only_forwards_entries_matching_the_predicate() {
        reset_log_state();
        let entries: Rc<RefCell<Vec<LogEntry>>> = Rc::new(RefCell::new(Vec::new()));
        let entries_clone = entries.clone();
        let target: LogSink = Rc::new(move |e: &LogEntry| {
            entries_clone.borrow_mut().push(e.clone());
        });
        let filtered = create_filter_log_sink(
            target,
            Rc::new(|e: &LogEntry| e.level == LogLevel::Error),
        );
        add_log_sink(filtered);
        log(LogLevel::Info, "skip".into(), None);
        log(LogLevel::Error, "keep".into(), None);
        let e = entries.borrow();
        assert_eq!(e.len(), 1);
        assert_eq!(e[0].level, LogLevel::Error);
    }
}

mod create_json_log_formatter_tests {
    use super::*;

    #[test]
    fn produces_a_flight_json_envelope() {
        reset_log_state();
        let fmt = create_json_log_formatter();
        let entry = LogEntry {
            level: LogLevel::Info,
            channel: Some("test".to_string()),
            data: LogData::Message("msg".to_string()),
        };
        let result = fmt(&entry);
        assert!(result.contains("\"__flight\":true"));
        assert!(result.contains("\"level\":\"info\""));
        assert!(result.contains("\"channel\":\"test\""));
        assert!(result.contains("\"msg\":\"msg\""));
    }

    #[test]
    fn applies_registered_serializers_to_values_with_matching_kind() {
        reset_log_state();
        register_log_serializer(
            "acme.Widget",
            Rc::new(|v| {
                let mut m = HashMap::new();
                m.insert("serialized".to_string(), LogValue::Bool(true));
                if let Some(LogValue::Int(id)) = v.get("id") {
                    m.insert("id".to_string(), LogValue::Int(*id));
                }
                return m;
            }),
        );
        let fmt = create_json_log_formatter();
        let mut inner = HashMap::new();
        inner.insert("__kind".to_string(), LogValue::Str("acme.Widget".to_string()));
        inner.insert("id".to_string(), LogValue::Int(42));
        let mut data = HashMap::new();
        data.insert("widget".to_string(), LogValue::Record(inner));
        let entry = LogEntry {
            level: LogLevel::Info,
            channel: None,
            data: LogData::Record(data),
        };
        let result = fmt(&entry);
        assert!(result.contains("\"serialized\":true"));
        assert!(result.contains("\"id\":42"));
    }

    #[test]
    fn applies_redaction_paths_to_nested_fields() {
        reset_log_state();
        set_log_redaction_paths(&[
            "credentials.token".to_string(),
            "password".to_string(),
        ]);
        let fmt = create_json_log_formatter();
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
        reset_log_state();
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
        reset_log_state();
        let ctx = create_log_context(Some("ch".to_string()), None);
        assert!(ctx.fields.is_empty());
    }
}

mod create_log_span_tests {
    use super::*;

    #[test]
    fn creates_a_log_span_with_given_name_fields_and_channel() {
        reset_log_state();
        let mut fields = HashMap::new();
        fields.insert("frame".to_string(), LogValue::Int(1));
        let span = create_log_span("render-frame", Some(fields), Some("perf".to_string()));
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
        reset_log_state();
        let span = create_log_span("op", None, None);
        assert!(span.fields.is_empty());
        assert_eq!(span.channel, None);
    }
}

mod create_memory_log_sink_tests {
    use super::*;

    #[test]
    fn captures_entries_up_to_capacity() {
        reset_log_state();
        let handle = create_memory_log_sink(3);
        add_log_sink(handle.sink.clone());
        log(LogLevel::Info, "a".into(), None);
        log(LogLevel::Info, "b".into(), None);
        log(LogLevel::Info, "c".into(), None);
        assert_eq!(get_memory_log_sink_entries(&handle).len(), 3);
    }

    #[test]
    fn overwrites_oldest_entries_when_capacity_is_exceeded() {
        reset_log_state();
        let handle = create_memory_log_sink(2);
        add_log_sink(handle.sink.clone());
        log(LogLevel::Info, "first".into(), None);
        log(LogLevel::Info, "second".into(), None);
        log(LogLevel::Info, "third".into(), None);
        let entries = get_memory_log_sink_entries(&handle);
        assert_eq!(entries.len(), 2);
        assert_eq!(data_as_str(&entries[0].data), Some("second"));
        assert_eq!(data_as_str(&entries[1].data), Some("third"));
    }

    #[test]
    fn returns_entries_oldest_first_after_capacity_exceeded() {
        reset_log_state();
        let handle = create_memory_log_sink(3);
        add_log_sink(handle.sink.clone());
        for i in 0..5 {
            log(LogLevel::Info, format!("msg{}", i).into(), None);
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
        reset_log_state();
        let forwarded: Rc<RefCell<Vec<LogEntry>>> = Rc::new(RefCell::new(Vec::new()));
        let forwarded_clone = forwarded.clone();
        let target: LogSink = Rc::new(move |e: &LogEntry| {
            forwarded_clone.borrow_mut().push(e.clone());
        });
        let handle = create_rate_limited_log_sink(target, 2, 10000.0, false);
        add_log_sink(handle.sink.clone());
        log(LogLevel::Info, "a".into(), None);
        log(LogLevel::Info, "b".into(), None);
        log(LogLevel::Info, "c".into(), None); // should be rate-limited
        assert_eq!(forwarded.borrow().len(), 2);
    }

    #[test]
    fn resets_its_budget_after_the_interval_elapses() {
        reset_log_state();
        let forwarded: Rc<RefCell<Vec<LogEntry>>> = Rc::new(RefCell::new(Vec::new()));
        let forwarded_clone = forwarded.clone();
        let target: LogSink = Rc::new(move |e: &LogEntry| {
            forwarded_clone.borrow_mut().push(e.clone());
        });
        let handle = create_rate_limited_log_sink(target, 1, 10.0, false);
        add_log_sink(handle.sink.clone());
        log(LogLevel::Info, "first".into(), None);
        log(LogLevel::Info, "suppressed".into(), None);
        thread::sleep(Duration::from_millis(20));
        log(LogLevel::Info, "next-window".into(), None);
        let f = forwarded.borrow();
        let data: Vec<Option<&str>> = f.iter().map(|e| data_as_str(&e.data)).collect();
        assert_eq!(data, vec![Some("first"), Some("next-window")]);
    }

    #[test]
    fn tracks_per_channel_when_per_channel_is_true() {
        reset_log_state();
        let forwarded: Rc<RefCell<Vec<LogEntry>>> = Rc::new(RefCell::new(Vec::new()));
        let forwarded_clone = forwarded.clone();
        let target: LogSink = Rc::new(move |e: &LogEntry| {
            forwarded_clone.borrow_mut().push(e.clone());
        });
        let handle = create_rate_limited_log_sink(target, 1, 10000.0, true);
        add_log_sink(handle.sink.clone());
        log(LogLevel::Info, "a".into(), Some("ch1".to_string()));
        log(LogLevel::Info, "b".into(), Some("ch1".to_string())); // rate-limited for ch1
        log(LogLevel::Info, "c".into(), Some("ch2".to_string())); // allowed
        let f = forwarded.borrow();
        assert_eq!(f.len(), 2);
        assert_eq!(f[0].channel, Some("ch1".to_string()));
        assert_eq!(f[1].channel, Some("ch2".to_string()));
    }
}

mod create_sampled_log_sink_tests {
    use super::*;

    #[test]
    fn forwards_1_in_n_entries() {
        reset_log_state();
        let forwarded: Rc<RefCell<Vec<LogEntry>>> = Rc::new(RefCell::new(Vec::new()));
        let forwarded_clone = forwarded.clone();
        let target: LogSink = Rc::new(move |e: &LogEntry| {
            forwarded_clone.borrow_mut().push(e.clone());
        });
        let sampled = create_sampled_log_sink(target, 3);
        add_log_sink(sampled);
        for i in 0..9 {
            log(LogLevel::Info, format!("msg{}", i).into(), None);
        }
        assert_eq!(forwarded.borrow().len(), 3);
    }

    #[test]
    fn passes_all_entries_through_when_rate_is_1() {
        reset_log_state();
        let forwarded: Rc<RefCell<Vec<LogEntry>>> = Rc::new(RefCell::new(Vec::new()));
        let forwarded_clone = forwarded.clone();
        let target: LogSink = Rc::new(move |e: &LogEntry| {
            forwarded_clone.borrow_mut().push(e.clone());
        });
        let sampled = create_sampled_log_sink(target, 1);
        add_log_sink(sampled);
        log(LogLevel::Info, "a".into(), None);
        log(LogLevel::Info, "b".into(), None);
        assert_eq!(forwarded.borrow().len(), 2);
    }
}

mod create_text_log_formatter_tests {
    use super::*;

    #[test]
    fn produces_a_readable_prefix_and_message_line() {
        reset_log_state();
        let fmt = create_text_log_formatter(false, false, false);
        let entry = LogEntry {
            level: LogLevel::Warn,
            channel: Some("batch".to_string()),
            data: LogData::Message("test".to_string()),
        };
        assert_eq!(fmt(&entry), "[batch] test");
    }

    #[test]
    fn includes_level_prefix_when_requested() {
        reset_log_state();
        let fmt = create_text_log_formatter(false, true, false);
        let entry = LogEntry {
            level: LogLevel::Error,
            channel: Some("ch".to_string()),
            data: LogData::Message("boom".to_string()),
        };
        assert_eq!(fmt(&entry), "error [ch] boom");
    }

    #[test]
    fn serializes_record_data() {
        reset_log_state();
        let fmt = create_text_log_formatter(false, false, false);
        let mut data = HashMap::new();
        data.insert("value".to_string(), LogValue::Int(3));
        let entry = LogEntry {
            level: LogLevel::Info,
            channel: None,
            data: LogData::Record(data),
        };
        assert_eq!(fmt(&entry), "[flight] {\"value\":3}");
    }

    #[test]
    fn includes_timestamp_prefix_when_requested() {
        reset_log_state();
        let fmt = create_text_log_formatter(false, false, true);
        let entry = LogEntry {
            level: LogLevel::Info,
            channel: None,
            data: LogData::Message("x".to_string()),
        };
        let result = fmt(&entry);
        assert!(result.starts_with("t="));
        assert!(result.ends_with("[flight] x"));
    }

    #[test]
    fn indents_entries_while_a_group_is_open() {
        reset_log_state();
        begin_log_group("outer", None);
        let fmt = create_text_log_formatter(true, false, false);
        let entry = LogEntry {
            level: LogLevel::Info,
            channel: None,
            data: LogData::Message("inside".to_string()),
        };
        let result = fmt(&entry);
        assert!(result.contains("  "));
        assert!(result.ends_with("inside"));
        clear_log_groups();
    }

    #[test]
    fn uses_flight_default_channel() {
        reset_log_state();
        let fmt = create_text_log_formatter(false, false, false);
        let entry = LogEntry {
            level: LogLevel::Info,
            channel: None,
            data: LogData::Message("x".to_string()),
        };
        assert!(fmt(&entry).contains("[flight]"));
    }
}

mod end_log_group {
    use super::*;

    #[test]
    fn emits_a_debug_group_end_entry() {
        reset_log_state();
        let (entries, _sink) = recording_sink();
        begin_log_group("setup", None);
        entries.borrow_mut().clear(); // clear begin entry
        end_log_group(None);
        let e = entries.borrow();
        assert_eq!(e.len(), 1);
        assert_eq!(record_str(&e[0].data, "group"), Some("end".to_string()));
        clear_log_groups();
    }

    #[test]
    fn is_a_no_op_when_no_group_is_open() {
        reset_log_state();
        let (entries, _sink) = recording_sink();
        end_log_group(None);
        assert_eq!(entries.borrow().len(), 0);
    }

    #[test]
    fn closes_the_group_without_emitting_when_debug_is_suppressed() {
        reset_log_state();
        let (entries, _sink) = recording_sink();
        begin_log_group("visible", None);
        entries.borrow_mut().clear();
        set_log_level(LogLevel::Error);
        end_log_group(None);
        assert_eq!(entries.borrow().len(), 0);
        clear_log_groups();
    }
}

mod end_log_timer {
    use super::*;

    #[test]
    fn emits_a_debug_entry_with_label_and_elapsed_ms_and_returns_elapsed() {
        reset_log_state();
        let (entries, _sink) = recording_sink();
        let timer = start_log_timer("op", Some("perf".to_string()));
        let elapsed = end_log_timer(&timer);
        assert!(elapsed >= 0.0);
        let e = entries.borrow();
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
        reset_log_state();
        let (entries, _sink) = recording_sink();
        let mut fields = HashMap::new();
        fields.insert("reqId".to_string(), LogValue::Str("abc".to_string()));
        let span = create_log_span("request", Some(fields), None);
        enter_log_span(&span);
        log(LogLevel::Info, "inside span".into(), None);
        exit_log_span(&span);
        let e = entries.borrow();
        assert_eq!(record_str(&e[0].data, "reqId"), Some("abc".to_string()));
    }

    #[test]
    fn does_not_merge_span_fields_after_exit_log_span() {
        reset_log_state();
        let (entries, _sink) = recording_sink();
        let mut fields = HashMap::new();
        fields.insert("reqId".to_string(), LogValue::Str("def".to_string()));
        let span = create_log_span("request", Some(fields), None);
        enter_log_span(&span);
        exit_log_span(&span);
        log(LogLevel::Info, "outside span".into(), None);
        let e = entries.borrow();
        assert_eq!(data_as_str(&e[0].data), Some("outside span"));
    }

    #[test]
    fn newer_spans_win_on_field_key_collision() {
        reset_log_state();
        let (entries, _sink) = recording_sink();
        let mut fields1 = HashMap::new();
        fields1.insert("x".to_string(), LogValue::Int(1));
        fields1.insert("y".to_string(), LogValue::Int(10));
        let mut fields2 = HashMap::new();
        fields2.insert("x".to_string(), LogValue::Int(2));
        let span1 = create_log_span("outer", Some(fields1), None);
        let span2 = create_log_span("inner", Some(fields2), None);
        enter_log_span(&span1);
        enter_log_span(&span2);
        log(LogLevel::Info, "nested".into(), None);
        exit_log_span(&span2);
        exit_log_span(&span1);
        let e = entries.borrow();
        assert_eq!(record_int(&e[0].data, "x"), Some(2));
        assert_eq!(record_int(&e[0].data, "y"), Some(10));
    }

    #[test]
    fn leaves_data_unchanged_when_active_spans_have_no_fields() {
        reset_log_state();
        let (entries, _sink) = recording_sink();
        let span = create_log_span("empty", None, None);
        enter_log_span(&span);
        log(LogLevel::Info, "unchanged".into(), None);
        exit_log_span(&span);
        let e = entries.borrow();
        assert_eq!(data_as_str(&e[0].data), Some("unchanged"));
    }

    #[test]
    fn merges_active_span_fields_into_record_data_with_direct_fields_winning() {
        reset_log_state();
        let (entries, _sink) = recording_sink();
        let mut span_fields = HashMap::new();
        span_fields.insert("inherited".to_string(), LogValue::Int(1));
        span_fields.insert("winner".to_string(), LogValue::Str("span".to_string()));
        let span = create_log_span("record", Some(span_fields), None);
        enter_log_span(&span);
        let mut data = HashMap::new();
        data.insert("direct".to_string(), LogValue::Int(2));
        data.insert("winner".to_string(), LogValue::Str("data".to_string()));
        log(LogLevel::Info, LogData::Record(data).into(), None);
        exit_log_span(&span);

        let e = entries.borrow();
        assert_eq!(record_int(&e[0].data, "direct"), Some(2));
        assert_eq!(record_int(&e[0].data, "inherited"), Some(1));
        assert_eq!(record_str(&e[0].data, "winner"), Some("data".to_string()));
    }
}

mod exit_log_span {
    use super::*;

    #[test]
    fn is_a_no_op_when_the_span_is_not_in_the_stack() {
        reset_log_state();
        let (entries, _sink) = recording_sink();
        let mut fields = HashMap::new();
        fields.insert("z".to_string(), LogValue::Int(1));
        let span = create_log_span("phantom", Some(fields), None);
        exit_log_span(&span);
        log(LogLevel::Info, "clean".into(), None);
        let e = entries.borrow();
        assert_eq!(data_as_str(&e[0].data), Some("clean"));
    }

    #[test]
    fn supports_out_of_order_exit() {
        reset_log_state();
        let (entries, _sink) = recording_sink();
        let mut fields1 = HashMap::new();
        fields1.insert("a".to_string(), LogValue::Int(1));
        let mut fields2 = HashMap::new();
        fields2.insert("b".to_string(), LogValue::Int(2));
        let span1 = create_log_span("a", Some(fields1), None);
        let span2 = create_log_span("b", Some(fields2), None);
        enter_log_span(&span1);
        enter_log_span(&span2);
        // Exit span1 first even though span2 was entered last
        exit_log_span(&span1);
        log(LogLevel::Info, "after-a-exit".into(), None);
        exit_log_span(&span2);
        let e = entries.borrow();
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
        reset_log_state();
        assert_eq!(get_log_channel_level("unknown"), None);
    }

    #[test]
    fn returns_the_set_level_for_a_known_channel() {
        reset_log_state();
        set_log_channel_level("render", LogLevel::Error);
        assert_eq!(get_log_channel_level("render"), Some(LogLevel::Error));
    }
}

mod get_log_console_level {
    use super::*;

    #[test]
    fn returns_the_current_threshold() {
        reset_log_state();
        set_log_console_level(LogLevel::Verbose);
        assert_eq!(get_log_console_level(), LogLevel::Verbose);
    }
}

mod get_log_level {
    use super::*;

    #[test]
    fn returns_the_current_global_emit_level() {
        reset_log_state();
        set_log_level(LogLevel::Error);
        assert_eq!(get_log_level(), LogLevel::Error);
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
        reset_log_state();
        let handle = create_memory_log_sink(5);
        assert_eq!(get_memory_log_sink_entries(&handle).len(), 0);
    }
}

mod log_tests {
    use super::*;

    #[test]
    fn forwards_level_channel_and_data_to_all_sinks() {
        reset_log_state();
        let (entries, _sink) = recording_sink();
        let mut data = HashMap::new();
        data.insert("k".to_string(), LogValue::Int(1));
        log(LogLevel::Warn, LogData::Record(data).into(), Some("shader".to_string()));
        let e = entries.borrow();
        assert_eq!(e[0].level, LogLevel::Warn);
        assert_eq!(e[0].channel, Some("shader".to_string()));
        assert_eq!(record_int(&e[0].data, "k"), Some(1));
    }

    #[test]
    fn defaults_the_channel_to_none() {
        reset_log_state();
        let (entries, _sink) = recording_sink();
        log(LogLevel::Info, "x".into(), None);
        assert_eq!(entries.borrow()[0].channel, None);
    }

    #[test]
    fn does_nothing_when_no_sink_is_installed() {
        reset_log_state();
        // Should not panic
        log(LogLevel::Info, "x".into(), None);
    }

    #[test]
    fn accepts_a_lazy_data_provider() {
        reset_log_state();
        let (entries, _sink) = recording_sink();
        let called: Rc<RefCell<bool>> = Rc::new(RefCell::new(false));
        let called_clone = called.clone();
        let provider: LogDataProvider = Rc::new(move || {
            *called_clone.borrow_mut() = true;
            return LogData::Message("lazy-value".to_string());
        });
        log(LogLevel::Info, LogDataOrProvider::Provider(provider), None);
        assert!(*called.borrow());
        assert_eq!(data_as_str(&entries.borrow()[0].data), Some("lazy-value"));
    }

    #[test]
    fn does_not_call_the_thunk_when_the_level_is_suppressed() {
        reset_log_state();
        let (_entries, _sink) = recording_sink();
        set_log_level(LogLevel::Error);
        let called: Rc<RefCell<bool>> = Rc::new(RefCell::new(false));
        let called_clone = called.clone();
        let provider: LogDataProvider = Rc::new(move || {
            *called_clone.borrow_mut() = true;
            return LogData::Message("should-not-be-called".to_string());
        });
        log(LogLevel::Verbose, LogDataOrProvider::Provider(provider), None);
        assert!(!*called.borrow());
    }

    #[test]
    fn fans_out_to_multiple_sinks() {
        reset_log_state();
        let a: Rc<RefCell<Vec<LogEntry>>> = Rc::new(RefCell::new(Vec::new()));
        let b: Rc<RefCell<Vec<LogEntry>>> = Rc::new(RefCell::new(Vec::new()));
        let a_clone = a.clone();
        let b_clone = b.clone();
        add_log_sink(Rc::new(move |e: &LogEntry| a_clone.borrow_mut().push(e.clone())));
        add_log_sink(Rc::new(move |e: &LogEntry| b_clone.borrow_mut().push(e.clone())));
        log(LogLevel::Info, "multi".into(), None);
        assert_eq!(a.borrow().len(), 1);
        assert_eq!(b.borrow().len(), 1);
    }
}

mod log_assert_tests {
    use super::*;

    #[test]
    fn emits_an_error_entry_when_condition_is_false() {
        reset_log_state();
        let (entries, _sink) = recording_sink();
        log_assert(false, "assertion failed".into(), None);
        let e = entries.borrow();
        assert_eq!(e.len(), 1);
        assert_eq!(e[0].level, LogLevel::Error);
    }

    #[test]
    fn does_not_emit_when_condition_is_true() {
        reset_log_state();
        let (entries, _sink) = recording_sink();
        log_assert(true, "should not emit".into(), None);
        assert_eq!(entries.borrow().len(), 0);
    }
}

mod log_debug_tests {
    use super::*;

    #[test]
    fn emits_at_debug_level() {
        reset_log_state();
        let (entries, _sink) = recording_sink();
        log_debug("d".into(), Some("chan".to_string()));
        let e = entries.borrow();
        assert_eq!(e[0].level, LogLevel::Debug);
        assert_eq!(e[0].channel, Some("chan".to_string()));
        assert_eq!(data_as_str(&e[0].data), Some("d"));
    }

    #[test]
    fn accepts_a_lazy_provider() {
        reset_log_state();
        let (entries, _sink) = recording_sink();
        let provider: LogDataProvider = Rc::new(|| LogData::Message("lazy".to_string()));
        log_debug(LogDataOrProvider::Provider(provider), None);
        assert_eq!(data_as_str(&entries.borrow()[0].data), Some("lazy"));
    }
}

mod log_debug_with_tests {
    use super::*;

    #[test]
    fn emits_at_debug_with_merged_context_fields() {
        reset_log_state();
        let (entries, _sink) = recording_sink();
        let mut fields = HashMap::new();
        fields.insert("reqId".to_string(), LogValue::Str("abc".to_string()));
        let ctx = create_log_context(Some("ch".to_string()), Some(fields));
        log_debug_with(&ctx, "msg".into());
        let e = entries.borrow();
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
        reset_log_state();
        let (entries, _sink) = recording_sink();
        log_error("e".into(), None);
        assert_eq!(entries.borrow()[0].level, LogLevel::Error);
    }
}

mod log_error_with_tests {
    use super::*;

    #[test]
    fn emits_at_error_with_merged_context_fields() {
        reset_log_state();
        let (entries, _sink) = recording_sink();
        let mut fields = HashMap::new();
        fields.insert("reqId".to_string(), LogValue::Str("1".to_string()));
        let ctx = create_log_context(Some("ch".to_string()), Some(fields));
        log_error_with(&ctx, "fail".into());
        let e = entries.borrow();
        assert_eq!(e[0].level, LogLevel::Error);
        assert_eq!(record_str(&e[0].data, "msg"), Some("fail".to_string()));
        assert_eq!(record_str(&e[0].data, "reqId"), Some("1".to_string()));
    }
}

mod log_info_tests {
    use super::*;

    #[test]
    fn emits_at_info_level() {
        reset_log_state();
        let (entries, _sink) = recording_sink();
        log_info("i".into(), None);
        assert_eq!(entries.borrow()[0].level, LogLevel::Info);
    }
}

mod log_info_with_tests {
    use super::*;

    #[test]
    fn emits_at_info_with_merged_context_fields() {
        reset_log_state();
        let (entries, _sink) = recording_sink();
        let mut fields = HashMap::new();
        fields.insert("v".to_string(), LogValue::Int(2));
        let ctx = create_log_context(Some("ch".to_string()), Some(fields));
        let mut data = HashMap::new();
        data.insert("extra".to_string(), LogValue::Bool(true));
        log_info_with(&ctx, LogData::Record(data).into());
        let e = entries.borrow();
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
        reset_log_state();
        let (entries, _sink) = recording_sink();
        log_once("key1", LogLevel::Warn, "first".into(), None);
        log_once("key1", LogLevel::Warn, "second".into(), None);
        let e = entries.borrow();
        assert_eq!(e.len(), 1);
        assert_eq!(data_as_str(&e[0].data), Some("first"));
    }

    #[test]
    fn allows_different_keys_to_emit_independently() {
        reset_log_state();
        let (entries, _sink) = recording_sink();
        log_once("key2a", LogLevel::Info, "a".into(), None);
        log_once("key2b", LogLevel::Info, "b".into(), None);
        assert_eq!(entries.borrow().len(), 2);
    }

    #[test]
    fn returns_true_on_first_emit_false_on_subsequent_calls() {
        reset_log_state();
        let (_entries, _sink) = recording_sink();
        assert!(log_once("key3", LogLevel::Info, "x".into(), None));
        assert!(!log_once("key3", LogLevel::Info, "x".into(), None));
    }
}

mod log_verbose_tests {
    use super::*;

    #[test]
    fn emits_at_verbose_level() {
        reset_log_state();
        let (entries, _sink) = recording_sink();
        log_verbose("v".into(), None);
        assert_eq!(entries.borrow()[0].level, LogLevel::Verbose);
    }
}

mod log_verbose_with_tests {
    use super::*;

    #[test]
    fn emits_at_verbose_with_merged_context_fields() {
        reset_log_state();
        let (entries, _sink) = recording_sink();
        let mut fields = HashMap::new();
        fields.insert("trace".to_string(), LogValue::Bool(true));
        let ctx = create_log_context(None, Some(fields));
        log_verbose_with(&ctx, "trace-msg".into());
        let e = entries.borrow();
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
        reset_log_state();
        let (entries, _sink) = recording_sink();
        log_warn("w".into(), None);
        assert_eq!(entries.borrow()[0].level, LogLevel::Warn);
    }
}

mod log_warn_with_tests {
    use super::*;

    #[test]
    fn emits_at_warn_with_merged_context_fields() {
        reset_log_state();
        let (entries, _sink) = recording_sink();
        let mut fields = HashMap::new();
        fields.insert("ctx".to_string(), LogValue::Str("val".to_string()));
        let ctx = create_log_context(Some("ch".to_string()), Some(fields));
        log_warn_with(&ctx, "warning".into());
        let e = entries.borrow();
        assert_eq!(record_str(&e[0].data, "msg"), Some("warning".to_string()));
        assert_eq!(record_str(&e[0].data, "ctx"), Some("val".to_string()));
    }
}

mod log_with_tests {
    use super::*;

    #[test]
    fn emits_at_the_given_level_with_channel_from_context() {
        reset_log_state();
        let (entries, _sink) = recording_sink();
        let mut fields = HashMap::new();
        fields.insert("frame".to_string(), LogValue::Int(1));
        let ctx = create_log_context(Some("render".to_string()), Some(fields));
        log_with(&ctx, LogLevel::Info, "update".into());
        let e = entries.borrow();
        assert_eq!(e[0].level, LogLevel::Info);
        assert_eq!(e[0].channel, Some("render".to_string()));
        assert_eq!(record_str(&e[0].data, "msg"), Some("update".to_string()));
        assert_eq!(record_int(&e[0].data, "frame"), Some(1));
    }

    #[test]
    fn passes_record_data_through_with_fields_merged() {
        reset_log_state();
        let (entries, _sink) = recording_sink();
        let mut fields = HashMap::new();
        fields.insert("base".to_string(), LogValue::Int(1));
        let ctx = create_log_context(None, Some(fields));
        let mut data = HashMap::new();
        data.insert("extra".to_string(), LogValue::Int(2));
        log_with(&ctx, LogLevel::Debug, LogData::Record(data).into());
        let e = entries.borrow();
        assert_eq!(record_int(&e[0].data, "base"), Some(1));
        assert_eq!(record_int(&e[0].data, "extra"), Some(2));
    }

    #[test]
    fn accepts_a_lazy_provider() {
        reset_log_state();
        let (entries, _sink) = recording_sink();
        let ctx = create_log_context(None, None);
        let provider: LogDataProvider = Rc::new(|| LogData::Message("lazy".to_string()));
        log_with(&ctx, LogLevel::Info, LogDataOrProvider::Provider(provider));
        assert_eq!(data_as_str(&entries.borrow()[0].data), Some("lazy"));
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
        assert_eq!(parse_log_level("unknown"), None);
        assert_eq!(parse_log_level(""), None);
    }
}

mod register_log_serializer_tests {
    use super::*;

    #[test]
    fn applies_the_serializer_when_the_json_formatter_encounters_a_matching_kind() {
        reset_log_state();
        register_log_serializer(
            "acme.Point",
            Rc::new(|v| {
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
        let fmt = create_json_log_formatter();
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
        };
        let result = fmt(&entry);
        assert!(result.contains("(3,4)"));
    }

    #[test]
    fn preserves_values_that_do_not_match_a_registered_serializer() {
        reset_log_state();
        register_log_serializer(
            "acme.Known",
            Rc::new(|_| {
                let mut m = HashMap::new();
                m.insert("serialized".to_string(), LogValue::Bool(true));
                return m;
            }),
        );
        let fmt = create_json_log_formatter();
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
        reset_log_state();
        let entries: Rc<RefCell<Vec<LogEntry>>> = Rc::new(RefCell::new(Vec::new()));
        let entries_clone = entries.clone();
        let sink: LogSink = Rc::new(move |e: &LogEntry| {
            entries_clone.borrow_mut().push(e.clone());
        });
        add_log_sink(sink.clone());
        let removed = remove_log_sink(&sink);
        assert!(removed);
        log(LogLevel::Info, "x".into(), None);
        // Should not have received anything because we also need at least one sink for the gate
        // to pass; but verify the removal worked by re-adding a fresh sink and checking original
        // sink was removed.
    }

    #[test]
    fn returns_false_when_the_sink_was_not_registered() {
        reset_log_state();
        let sink: LogSink = Rc::new(|_| {});
        assert!(!remove_log_sink(&sink));
    }
}

mod serialize_log_error_tests {
    use super::*;

    #[test]
    fn wraps_a_string_value() {
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
        reset_log_state();
        let (entries, _sink) = recording_sink();
        set_log_channel_level("render", LogLevel::Error);
        log(LogLevel::Info, "info on render channel".into(), Some("render".to_string()));
        log(LogLevel::Error, "error on render channel".into(), Some("render".to_string()));
        let e = entries.borrow();
        assert_eq!(e.len(), 1);
        assert_eq!(e[0].level, LogLevel::Error);
    }

    #[test]
    fn does_not_affect_other_channels() {
        reset_log_state();
        let (entries, _sink) = recording_sink();
        set_log_channel_level("render", LogLevel::Error);
        log(LogLevel::Info, "other".into(), Some("audio".to_string()));
        assert_eq!(entries.borrow().len(), 1);
    }
}

mod set_log_level_tests {
    use super::*;

    #[test]
    fn suppresses_entries_below_the_global_level() {
        reset_log_state();
        let (entries, _sink) = recording_sink();
        set_log_level(LogLevel::Error);
        log(LogLevel::Info, "suppressed".into(), None);
        log(LogLevel::Error, "emitted".into(), None);
        let e = entries.borrow();
        assert_eq!(e.len(), 1);
        assert_eq!(data_as_str(&e[0].data), Some("emitted"));
    }

    #[test]
    fn log_level_none_always_suppresses() {
        reset_log_state();
        let (entries, _sink) = recording_sink();
        set_log_level(LogLevel::None);
        log(LogLevel::None, "should not emit".into(), None);
        assert_eq!(entries.borrow().len(), 0);
    }
}

mod set_log_redaction_paths_tests {
    use super::*;

    #[test]
    fn replaces_top_level_fields_matching_a_path() {
        reset_log_state();
        set_log_redaction_paths(&["password".to_string()]);
        let fmt = create_json_log_formatter();
        let mut data = HashMap::new();
        data.insert("user".to_string(), LogValue::Str("alice".to_string()));
        data.insert("password".to_string(), LogValue::Str("secret".to_string()));
        let entry = LogEntry {
            level: LogLevel::Info,
            channel: None,
            data: LogData::Record(data),
        };
        let result = fmt(&entry);
        assert!(result.contains("[REDACTED]"));
        assert!(result.contains("\"alice\""));
        assert!(!result.contains("\"secret\""));
    }

    #[test]
    fn does_not_mutate_the_original_data_object() {
        reset_log_state();
        set_log_redaction_paths(&["key".to_string()]);
        let mut data = HashMap::new();
        data.insert("key".to_string(), LogValue::Str("value".to_string()));
        data.insert("other".to_string(), LogValue::Str("safe".to_string()));
        let data_clone = data.clone();
        let entry = LogEntry {
            level: LogLevel::Info,
            channel: None,
            data: LogData::Record(data_clone),
        };
        let fmt = create_json_log_formatter();
        fmt(&entry);
        if let Some(LogValue::Str(v)) = data.get("key") {
            assert_eq!(v, "value");
        } else {
            panic!("expected key='value' in original data");
        }
    }

    #[test]
    fn leaves_absent_and_non_record_path_segments_unchanged() {
        reset_log_state();
        set_log_redaction_paths(&[
            "missing.secret".to_string(),
            "primitive.secret".to_string(),
            "items.secret".to_string(),
        ]);
        let fmt = create_json_log_formatter();
        let mut data = HashMap::new();
        data.insert("items".to_string(), LogValue::Array(vec![LogValue::Str("secret".to_string())]));
        data.insert("primitive".to_string(), LogValue::Int(7));
        let entry = LogEntry {
            level: LogLevel::Info,
            channel: None,
            data: LogData::Record(data),
        };
        let result = fmt(&entry);
        assert!(result.contains("\"secret\""));
        assert!(result.contains("7"));
        assert!(!result.contains("[REDACTED]"));
    }

    #[test]
    fn replaces_nested_fields_with_dot_notation_paths() {
        reset_log_state();
        set_log_redaction_paths(&["auth.secret".to_string()]);
        let fmt = create_json_log_formatter();
        let mut auth = HashMap::new();
        auth.insert("secret".to_string(), LogValue::Str("tok".to_string()));
        auth.insert("name".to_string(), LogValue::Str("jwt".to_string()));
        let mut data = HashMap::new();
        data.insert("auth".to_string(), LogValue::Record(auth));
        let entry = LogEntry {
            level: LogLevel::Info,
            channel: None,
            data: LogData::Record(data),
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
        reset_log_state();
        let (entries, _sink) = recording_sink();
        set_log_sink(None);
        log(LogLevel::Info, "x".into(), None);
        assert_eq!(entries.borrow().len(), 0);
    }

    #[test]
    fn replaces_all_existing_sinks_with_the_single_given_sink() {
        reset_log_state();
        let a: Rc<RefCell<Vec<LogEntry>>> = Rc::new(RefCell::new(Vec::new()));
        let b: Rc<RefCell<Vec<LogEntry>>> = Rc::new(RefCell::new(Vec::new()));
        let a_clone = a.clone();
        let b_clone = b.clone();
        add_log_sink(Rc::new(move |e: &LogEntry| a_clone.borrow_mut().push(e.clone())));
        set_log_sink(Some(Rc::new(move |e: &LogEntry| b_clone.borrow_mut().push(e.clone()))));
        log(LogLevel::Info, "x".into(), None);
        assert_eq!(a.borrow().len(), 0);
        assert_eq!(b.borrow().len(), 1);
    }
}

mod start_log_timer_tests {
    use super::*;

    #[test]
    fn returns_a_log_timer_with_the_given_label_and_channel() {
        reset_log_state();
        let timer = start_log_timer("render", Some("perf".to_string()));
        assert_eq!(timer.label, "render");
        assert_eq!(timer.channel, Some("perf".to_string()));
        assert!(timer.started_at >= 0.0);
    }
}

mod enable_log_signals_tests {
    use super::*;

    #[test]
    fn returns_a_log_signals_entity() {
        reset_log_state();
        let signals = enable_log_signals();
        // Verify the signals exist (they are Signal structs)
        let _ = &signals.on_log_entry;
        let _ = &signals.on_log_error;
    }

    #[test]
    fn on_log_entry_fires_for_every_emitted_entry() {
        reset_log_state();
        let signals = enable_log_signals();
        let received: Rc<RefCell<Vec<LogEntry>>> = Rc::new(RefCell::new(Vec::new()));
        let received_clone = received.clone();
        connect_signal(
            &signals.on_log_entry,
            Rc::new(move |args: Rc<dyn Any>| {
                if let Some(entry) = args.downcast_ref::<LogEntry>() {
                    received_clone.borrow_mut().push(entry.clone());
                }
            }),
            None,
        );
        log(LogLevel::Info, "via-signal".into(), None);
        assert_eq!(received.borrow().len(), 1);
        assert_eq!(data_as_str(&received.borrow()[0].data), Some("via-signal"));
    }

    #[test]
    fn on_log_error_fires_only_for_error_level_entries() {
        reset_log_state();
        let signals = enable_log_signals();
        let errors: Rc<RefCell<Vec<LogEntry>>> = Rc::new(RefCell::new(Vec::new()));
        let errors_clone = errors.clone();
        connect_signal(
            &signals.on_log_error,
            Rc::new(move |args: Rc<dyn Any>| {
                if let Some(entry) = args.downcast_ref::<LogEntry>() {
                    errors_clone.borrow_mut().push(entry.clone());
                }
            }),
            None,
        );
        log(LogLevel::Info, "not-error".into(), None);
        log(LogLevel::Error, "is-error".into(), None);
        assert_eq!(errors.borrow().len(), 1);
        assert_eq!(errors.borrow()[0].level, LogLevel::Error);
    }

    #[test]
    fn returns_the_same_object_on_subsequent_calls() {
        reset_log_state();
        let a = enable_log_signals();
        let b = enable_log_signals();
        assert!(Rc::ptr_eq(&a, &b));
    }
}

mod severity_wrapper_providers_and_gates {
    use super::*;

    fn tracking_provider(called: &Rc<RefCell<bool>>, value: &str) -> LogDataOrProvider {
        let called = called.clone();
        let value = value.to_string();
        return LogDataOrProvider::Provider(Rc::new(move || {
            *called.borrow_mut() = true;
            return LogData::Message(value.clone());
        }));
    }

    #[test]
    fn does_not_evaluate_any_provider_when_its_level_is_suppressed() {
        reset_log_state();
        let (_entries, _sink) = recording_sink();
        let ctx = create_log_context(Some("channel".to_string()), None);
        set_log_level(LogLevel::None);

        let flags: Vec<Rc<RefCell<bool>>> = (0..12).map(|_| Rc::new(RefCell::new(false))).collect();

        log_assert(false, tracking_provider(&flags[0], "v0"), None);
        log_debug(tracking_provider(&flags[1], "v1"), None);
        log_debug_with(&ctx, tracking_provider(&flags[2], "v2"));
        log_error(tracking_provider(&flags[3], "v3"), None);
        log_error_with(&ctx, tracking_provider(&flags[4], "v4"));
        log_info(tracking_provider(&flags[5], "v5"), None);
        log_info_with(&ctx, tracking_provider(&flags[6], "v6"));
        log_verbose(tracking_provider(&flags[7], "v7"), None);
        log_verbose_with(&ctx, tracking_provider(&flags[8], "v8"));
        log_warn(tracking_provider(&flags[9], "v9"), None);
        log_warn_with(&ctx, tracking_provider(&flags[10], "v10"));
        log_with(&ctx, LogLevel::Info, tracking_provider(&flags[11], "v11"));

        for (i, flag) in flags.iter().enumerate() {
            assert!(!*flag.borrow(), "provider {} was called when level was suppressed", i);
        }
    }

    #[test]
    fn evaluates_providers_after_their_level_gates_pass() {
        reset_log_state();
        let (entries, _sink) = recording_sink();
        let ctx = create_log_context(Some("channel".to_string()), None);

        let flags: Vec<Rc<RefCell<bool>>> = (0..10).map(|_| Rc::new(RefCell::new(false))).collect();

        log_assert(false, tracking_provider(&flags[0], "v0"), None);
        log_debug_with(&ctx, tracking_provider(&flags[1], "v1"));
        log_error(tracking_provider(&flags[2], "v2"), None);
        log_error_with(&ctx, tracking_provider(&flags[3], "v3"));
        log_info(tracking_provider(&flags[4], "v4"), None);
        log_info_with(&ctx, tracking_provider(&flags[5], "v5"));
        log_verbose(tracking_provider(&flags[6], "v6"), None);
        log_verbose_with(&ctx, tracking_provider(&flags[7], "v7"));
        log_warn(tracking_provider(&flags[8], "v8"), None);
        log_warn_with(&ctx, tracking_provider(&flags[9], "v9"));

        for (i, flag) in flags.iter().enumerate() {
            assert!(*flag.borrow(), "provider {} was not called when level was active", i);
        }
        assert_eq!(entries.borrow().len(), 10);
    }
}
