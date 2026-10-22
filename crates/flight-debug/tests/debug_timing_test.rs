use std::panic::{AssertUnwindSafe, catch_unwind};
use std::sync::Arc;
use std::sync::atomic::{AtomicU32, Ordering};

use flight_debug::contract::*;
use flight_log::{
    LogData, LogEntry, LogValue, MemoryLogSink, add_log_sink, create_memory_log_sink,
};

use crate::support::*;

fn entry_data(sink: &MemoryLogSink) -> Vec<LogData> {
    return entries(sink)
        .into_iter()
        .map(|entry: LogEntry| entry.data)
        .collect();
}

fn field(data: &LogData, key: &str) -> LogValue {
    let LogData::Record(record) = data else {
        panic!("a structured entry");
    };
    return record.get(key).expect("a field").clone();
}

// A clock that advances 2.5 ms per read, so a measured span's elapsed time is exact.
fn stepping_clock() -> Arc<dyn Fn() -> f64 + Send + Sync> {
    let reads = Arc::new(AtomicU32::new(0));
    return Arc::new(move || f64::from(reads.fetch_add(1, Ordering::SeqCst)) * 2.5);
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
        enable_debug(
            &state,
            &log_state,
            Some(&options(&create_memory_log_sink(1).sink)),
        );
        let timer = begin_debug_span(&state, 0.0, "draw", None);
        assert_eq!(timer.expect("a timer").label, "draw");
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
        enable_debug(&state, &log_state, Some(&options(&memory.sink)));
        let timer = begin_debug_span(&state, 5.0, "draw", None);
        let elapsed = end_debug_span(&log_state, 7.5, timer.as_ref());
        assert_eq!(elapsed, 2.5);
        let data = entry_data(&memory);
        assert_eq!(data.len(), 1);
        assert!(matches!(field(&data[0], "label"), LogValue::Str(label) if label == "draw"));
        assert!(matches!(field(&data[0], "elapsedMs"), LogValue::Float(ms) if ms == 2.5));
    }
}

mod mark_debug_frame {
    use super::*;

    #[test]
    fn is_a_no_op_when_debug_is_disabled() {
        let (state, log_state) = states();
        let memory = create_memory_log_sink(4);
        add_log_sink(&log_state, memory.sink.clone());
        mark_debug_frame(&state, &log_state, 0.0, None, None);
        assert!(entries(&memory).is_empty());
    }

    #[test]
    fn emits_a_labeled_frame_marker_when_debug_is_enabled() {
        let (state, log_state) = states();
        let memory = create_memory_log_sink(16);
        enable_debug(&state, &log_state, Some(&options(&memory.sink)));
        mark_debug_frame(&state, &log_state, 0.0, Some("level-load"), None);
        assert!(
            matches!(field(&entry_data(&memory)[0], "frame"), LogValue::Str(frame) if frame == "level-load")
        );
    }

    #[test]
    fn tags_an_unlabeled_marker_with_an_ascending_counter() {
        let (state, log_state) = states();
        let memory = create_memory_log_sink(16);
        enable_debug(&state, &log_state, Some(&options(&memory.sink)));
        mark_debug_frame(&state, &log_state, 0.0, None, None);
        mark_debug_frame(&state, &log_state, 0.0, None, None);
        let data = entry_data(&memory);
        let (LogValue::Int(a), LogValue::Int(b)) =
            (field(&data[0], "frame"), field(&data[1], "frame"))
        else {
            panic!("numeric frame markers");
        };
        assert!(b > a);
    }
}

mod measure_debug_span {
    use super::*;

    #[test]
    fn returns_the_wrapped_function_result() {
        let (state, log_state) = states();
        assert_eq!(
            measure_debug_span(
                &state,
                &log_state,
                &stepping_clock(),
                "compute",
                || 42,
                None
            ),
            42
        );
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
        assert!(entries(&memory).is_empty());
    }

    #[test]
    fn emits_one_timing_entry_named_for_the_span_when_debug_is_enabled() {
        let (state, log_state) = states();
        let memory = create_memory_log_sink(16);
        enable_debug(&state, &log_state, Some(&options(&memory.sink)));
        measure_debug_span(&state, &log_state, &stepping_clock(), "compute", || 1, None);
        let data = entry_data(&memory);
        assert_eq!(data.len(), 1);
        assert!(matches!(field(&data[0], "label"), LogValue::Str(label) if label == "compute"));
        assert!(matches!(field(&data[0], "elapsedMs"), LogValue::Float(ms) if ms == 2.5));
    }

    #[test]
    fn closes_the_span_even_when_the_function_throws() {
        let (state, log_state) = states();
        let memory = create_memory_log_sink(16);
        enable_debug(&state, &log_state, Some(&options(&memory.sink)));
        let thrown = catch_unwind(AssertUnwindSafe(|| {
            measure_debug_span(
                &state,
                &log_state,
                &stepping_clock(),
                "boom",
                || -> i32 { panic!("nope") },
                None,
            )
        }))
        .unwrap_err();
        assert_eq!(thrown.downcast_ref::<&str>(), Some(&"nope"));
        assert_eq!(entry_data(&memory).len(), 1);
    }
}
