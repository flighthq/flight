use std::panic::{AssertUnwindSafe, catch_unwind};
use std::sync::Arc;
use std::sync::atomic::{AtomicU32, Ordering};

use flight_debug::contract::*;
use flight_log::{
    LogEntry, add_log_sink, create_json_log_formatter, create_memory_log_sink,
    get_memory_log_sink_entries,
};

use crate::support::*;

fn stepping_clock() -> Arc<dyn Fn() -> f64 + Send + Sync> {
    let reads = Arc::new(AtomicU32::new(0));
    let clock_reads = reads.clone();
    return Arc::new(move || f64::from(clock_reads.fetch_add(1, Ordering::SeqCst)) * 2.5);
}

fn panic_message(payload: Box<dyn std::any::Any + Send>) -> String {
    if let Some(message) = payload.downcast_ref::<String>() {
        return message.clone();
    }
    return payload
        .downcast_ref::<&str>()
        .map(|message| message.to_string())
        .unwrap_or_default();
}

mod begin_debug_span {
    use super::*;

    #[test]
    fn returns_null_when_debug_is_disabled() {
        let (state, _) = states();
        assert!(begin_debug_span(&state, 0.0, "draw", None).is_none());
    }

    #[test]
    fn returns_a_running_timer_when_debug_is_enabled() {
        let (state, log_state) = states();
        let memory = create_memory_log_sink(1);
        enable_debug(
            &state,
            &log_state,
            Some(&DebugOptions {
                channels: None,
                level: None,
                sink: Some(memory.sink),
                subsystems: None,
            }),
        );
        let timer = begin_debug_span(&state, 0.0, "draw", None);
        if let Some(timer) = timer {
            assert_eq!(timer.label, "draw");
        } else {
            assert!(false, "a timer");
        }
    }
}

mod end_debug_span {
    use super::*;

    #[test]
    fn is_a_no_op_returning_minus_one_for_a_null_timer() {
        let (_, log_state) = states();
        assert_eq!(end_debug_span(&log_state, 0.0, None), -1.0);
    }

    #[test]
    fn emits_an_elapsed_time_entry_and_returns_the_elapsed_milliseconds() {
        let (state, log_state) = states();
        let memory = create_memory_log_sink(16);
        enable_debug(
            &state,
            &log_state,
            Some(&DebugOptions {
                channels: None,
                level: None,
                sink: Some(memory.sink.clone()),
                subsystems: None,
            }),
        );
        let timer = begin_debug_span(&state, 5.0, "draw", None);
        let elapsed = end_debug_span(&log_state, 7.5, timer.as_ref());
        assert_eq!(elapsed, 2.5);
        let mut logged: Vec<LogEntry> = Vec::new();
        get_memory_log_sink_entries(&mut logged, &memory);
        assert_eq!(logged.len(), 1);
        let formatted = create_json_log_formatter(&log_state)(&logged[0]);
        assert!(formatted.contains("\"label\":\"draw\""));
        assert!(formatted.contains("\"elapsedMs\":2.5"));
    }
}

mod mark_debug_frame {
    use super::*;

    #[test]
    fn is_a_no_op_when_debug_is_disabled() {
        let (mut state, log_state) = states();
        let memory = create_memory_log_sink(4);
        add_log_sink(&log_state, memory.sink.clone());
        mark_debug_frame(&mut state, &log_state, 0.0, None, None);
        let mut logged: Vec<LogEntry> = Vec::new();
        get_memory_log_sink_entries(&mut logged, &memory);
        assert!(logged.is_empty());
    }

    #[test]
    fn emits_a_labeled_frame_marker_when_debug_is_enabled() {
        let (mut state, log_state) = states();
        let memory = create_memory_log_sink(16);
        enable_debug(
            &state,
            &log_state,
            Some(&DebugOptions {
                channels: None,
                level: None,
                sink: Some(memory.sink.clone()),
                subsystems: None,
            }),
        );
        mark_debug_frame(&mut state, &log_state, 0.0, Some("level-load"), None);
        let mut logged: Vec<LogEntry> = Vec::new();
        get_memory_log_sink_entries(&mut logged, &memory);
        let formatted = create_json_log_formatter(&log_state)(&logged[0]);
        assert!(formatted.contains("\"frame\":\"level-load\""));
    }

    #[test]
    fn tags_an_unlabeled_marker_with_an_ascending_counter() {
        let (mut state, log_state) = states();
        let memory = create_memory_log_sink(16);
        enable_debug(
            &state,
            &log_state,
            Some(&DebugOptions {
                channels: None,
                level: None,
                sink: Some(memory.sink.clone()),
                subsystems: None,
            }),
        );
        mark_debug_frame(&mut state, &log_state, 0.0, None, None);
        mark_debug_frame(&mut state, &log_state, 0.0, None, None);
        let mut logged: Vec<LogEntry> = Vec::new();
        get_memory_log_sink_entries(&mut logged, &memory);
        let format = create_json_log_formatter(&log_state);
        assert!(format(&logged[0]).contains("\"frame\":1"));
        assert!(format(&logged[1]).contains("\"frame\":2"));
    }
}

mod measure_debug_span {
    use super::*;

    #[test]
    fn returns_the_wrapped_function_result() {
        let (state, log_state) = states();
        let reads = Arc::new(AtomicU32::new(0));
        let clock_reads = reads.clone();
        let clock: Arc<dyn Fn() -> f64 + Send + Sync> =
            Arc::new(move || f64::from(clock_reads.fetch_add(1, Ordering::SeqCst)) * 2.5);
        let mut calls = 0;
        assert_eq!(
            measure_debug_span(
                &state,
                &log_state,
                &clock,
                "compute",
                || {
                    calls += 1;
                    42
                },
                None
            ),
            42
        );
        assert_eq!(calls, 1);
        assert_eq!(reads.fetch_add(0, Ordering::SeqCst), 1);
    }

    #[test]
    fn runs_the_function_but_emits_nothing_when_debug_is_disabled() {
        let (state, log_state) = states();
        let memory = create_memory_log_sink(4);
        add_log_sink(&log_state, memory.sink.clone());
        let mut ran = false;
        measure_debug_span(
            &state,
            &log_state,
            &stepping_clock(),
            "compute",
            || ran = true,
            None,
        );
        assert!(ran);
        let mut logged: Vec<LogEntry> = Vec::new();
        get_memory_log_sink_entries(&mut logged, &memory);
        assert!(logged.is_empty());
    }

    #[test]
    fn emits_one_timing_entry_named_for_the_span_when_debug_is_enabled() {
        let (state, log_state) = states();
        let memory = create_memory_log_sink(16);
        enable_debug(
            &state,
            &log_state,
            Some(&DebugOptions {
                channels: None,
                level: None,
                sink: Some(memory.sink.clone()),
                subsystems: None,
            }),
        );
        let reads = Arc::new(AtomicU32::new(0));
        let clock_reads = reads.clone();
        let clock: Arc<dyn Fn() -> f64 + Send + Sync> =
            Arc::new(move || f64::from(clock_reads.fetch_add(1, Ordering::SeqCst)) * 2.5);
        let mut calls = 0;
        measure_debug_span(
            &state,
            &log_state,
            &clock,
            "compute",
            || {
                calls += 1;
                1
            },
            None,
        );
        let mut logged: Vec<LogEntry> = Vec::new();
        get_memory_log_sink_entries(&mut logged, &memory);
        assert_eq!(calls, 1);
        assert_eq!(reads.fetch_add(0, Ordering::SeqCst), 2);
        assert_eq!(logged.len(), 1);
        let formatted = create_json_log_formatter(&log_state)(&logged[0]);
        assert!(formatted.contains("\"label\":\"compute\""));
        assert!(formatted.contains("\"elapsedMs\":2.5"));
    }

    #[test]
    fn passes_an_explicit_channel() {
        let (state, log_state) = states();
        let memory = create_memory_log_sink(16);
        enable_debug(
            &state,
            &log_state,
            Some(&DebugOptions {
                channels: None,
                level: None,
                sink: Some(memory.sink.clone()),
                subsystems: None,
            }),
        );
        let clock = stepping_clock();
        measure_debug_span(
            &state,
            &log_state,
            &clock,
            "named-channel",
            || 0,
            Some("profile".to_string()),
        );
        let mut logged: Vec<LogEntry> = Vec::new();
        get_memory_log_sink_entries(&mut logged, &memory);
        assert_eq!(logged[0].channel.as_deref(), Some("profile"));
    }

    #[test]
    fn closes_the_span_even_when_the_function_throws() {
        let (state, log_state) = states();
        let memory = create_memory_log_sink(16);
        enable_debug(
            &state,
            &log_state,
            Some(&DebugOptions {
                channels: None,
                level: None,
                sink: Some(memory.sink.clone()),
                subsystems: None,
            }),
        );
        let reads = Arc::new(AtomicU32::new(0));
        let clock_reads = reads.clone();
        let clock: Arc<dyn Fn() -> f64 + Send + Sync> =
            Arc::new(move || f64::from(clock_reads.fetch_add(1, Ordering::SeqCst)) * 2.5);
        let mut calls = 0;
        let thrown = catch_unwind(AssertUnwindSafe(|| {
            measure_debug_span(
                &state,
                &log_state,
                &clock,
                "boom",
                || -> i32 {
                    calls += 1;
                    panic!("nope")
                },
                None,
            )
        }))
        .unwrap_err();
        assert_eq!(panic_message(thrown), "nope");
        assert_eq!(calls, 1);
        assert_eq!(reads.fetch_add(0, Ordering::SeqCst), 2);
        let mut logged: Vec<LogEntry> = Vec::new();
        get_memory_log_sink_entries(&mut logged, &memory);
        assert_eq!(logged.len(), 1);
        assert!(is_debug_enabled(&state));

        assert_eq!(
            measure_debug_span(&state, &log_state, &clock, "after", || 7, None),
            7
        );
        assert_eq!(reads.fetch_add(0, Ordering::SeqCst), 4);
        get_memory_log_sink_entries(&mut logged, &memory);
        assert_eq!(logged.len(), 2);
        assert!(is_debug_enabled(&state));
    }
}
