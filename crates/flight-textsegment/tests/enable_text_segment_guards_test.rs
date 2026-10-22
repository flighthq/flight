use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Arc, Mutex, RwLock};

use flight_log::{
    LogData, LogEntry, LogLevel, LogStateRef, LogValue, add_log_sink, create_log_state,
};
use flight_textsegment::contract::report_text_segmenter_unavailable;
use flight_textsegment::*;

const WARNING_MESSAGE: &str = "segmentGraphemes: Intl.Segmenter is unavailable and no replacement capability was supplied, so segmentation returned no results. Pass a HostTextSegmenterCapability with full Unicode coverage to the operation.";

fn create_log_capture() -> (LogStateRef, Arc<Mutex<Vec<LogEntry>>>) {
    let log_state = Arc::new(RwLock::new(create_log_state()));
    let entries = Arc::new(Mutex::new(Vec::new()));
    let sink_entries = entries.clone();
    add_log_sink(
        &log_state,
        Arc::new(move |entry| sink_entries.lock().unwrap().push(entry.clone())),
    );
    return (log_state, entries);
}

fn counting_clock(calls: &Arc<AtomicUsize>) -> Arc<dyn Fn() -> f64 + Send + Sync> {
    let calls = calls.clone();
    return Arc::new(move || return 1000.0 + calls.fetch_add(1, Ordering::SeqCst) as f64);
}

mod disable_text_segment_guards {
    use super::*;

    #[test]
    fn restores_silent_missing_engine_recovery() {
        let (log_state, entries) = create_log_capture();
        let clock_calls = Arc::new(AtomicUsize::new(0));
        enable_text_segment_guards(&log_state, counting_clock(&clock_calls));
        disable_text_segment_guards();
        report_text_segmenter_unavailable();
        assert!(entries.lock().unwrap().is_empty());
        assert_eq!(clock_calls.load(Ordering::SeqCst), 0);
    }
}

mod enable_text_segment_guards {
    use super::*;

    #[test]
    fn warns_once_with_exact_payload_and_samples_the_clock_per_operation() {
        let (log_state, entries) = create_log_capture();
        let clock_calls = Arc::new(AtomicUsize::new(0));
        enable_text_segment_guards(&log_state, counting_clock(&clock_calls));
        report_text_segmenter_unavailable();
        report_text_segmenter_unavailable();

        let entries = entries.lock().unwrap();
        assert_eq!(clock_calls.load(Ordering::SeqCst), 2);
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].level, LogLevel::Warn);
        assert_eq!(entries[0].channel, Some("textsegment".to_string()));
        assert_eq!(entries[0].timestamp_ms, 1000.0);
        let LogData::Record(data) = &entries[0].data else {
            panic!("expected record log data");
        };
        match data.get("message") {
            Some(LogValue::Str(message)) => assert_eq!(message, WARNING_MESSAGE),
            _ => panic!("expected exact warning message"),
        }
        assert!(
            log_state
                .read()
                .unwrap()
                .once_keys
                .contains("textsegment:intl-segmenter-unavailable")
        );
        disable_text_segment_guards();
    }

    #[test]
    fn stays_silent_when_the_bundled_intl_provider_is_available() {
        let (log_state, entries) = create_log_capture();
        let clock_calls = Arc::new(AtomicUsize::new(0));
        enable_text_segment_guards(&log_state, counting_clock(&clock_calls));
        let mut result = Vec::new();
        segment_graphemes(&mut result, &WEB_TEXT_SEGMENTER_BACKEND, "text", None);
        assert!(!result.is_empty());
        assert!(entries.lock().unwrap().is_empty());
        assert_eq!(clock_calls.load(Ordering::SeqCst), 0);
        disable_text_segment_guards();
    }
}
