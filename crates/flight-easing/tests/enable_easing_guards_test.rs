use std::sync::Arc;
use std::sync::atomic::{AtomicUsize, Ordering};

use flight_easing::*;
use flight_log::LogData;
use flight_log::LogLevel;
use flight_log::add_log_sink;
use flight_log::clear_log_once_keys;
use flight_log::create_memory_log_sink;
use flight_log::get_memory_log_sink_entries;
use flight_log::remove_log_sink;

use crate::GUARD_TEST_LOCK;

fn counting_clock(calls: &Arc<AtomicUsize>) -> Arc<dyn Fn() -> f64 + Send + Sync> {
    let calls = calls.clone();
    return Arc::new(move || return 1000.0 + calls.fetch_add(1, Ordering::SeqCst) as f64);
}

mod disable_easing_guards {
    use super::*;

    #[test]
    fn uninstalls_the_guard_returning_the_degenerate_call_to_silence() {
        let log_state = crate::create_test_log_state();
        let _lock = GUARD_TEST_LOCK
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        clear_log_once_keys(&log_state);
        let handle = create_memory_log_sink(8);
        add_log_sink(&log_state, handle.sink.clone());
        let clock_calls = Arc::new(AtomicUsize::new(0));
        enable_easing_guards(&log_state, counting_clock(&clock_calls));
        disable_easing_guards();
        let value = ease_steps(1, Some(StepPosition::JumpNone))(0.5);
        remove_log_sink(&log_state, &handle.sink);
        assert!(value.is_nan());
        assert_eq!(get_memory_log_sink_entries(&handle).len(), 0);
        assert_eq!(clock_calls.load(Ordering::SeqCst), 0);
    }
}

mod enable_easing_guards {
    use super::*;

    #[test]
    fn warns_on_the_degenerate_jump_none_step_count_that_silently_returns_nan() {
        let log_state = crate::create_test_log_state();
        let _lock = GUARD_TEST_LOCK
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        clear_log_once_keys(&log_state);
        let handle = create_memory_log_sink(8);
        add_log_sink(&log_state, handle.sink.clone());
        let clock_calls = Arc::new(AtomicUsize::new(0));
        enable_easing_guards(&log_state, counting_clock(&clock_calls));
        let value = ease_steps(1, Some(StepPosition::JumpNone))(0.5);
        let second_value = ease_steps(1, Some(StepPosition::JumpNone))(0.5);
        disable_easing_guards();
        remove_log_sink(&log_state, &handle.sink);
        let entries = get_memory_log_sink_entries(&handle);
        assert!(value.is_nan());
        assert!(second_value.is_nan());
        assert_eq!(clock_calls.load(Ordering::SeqCst), 2);
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].level, LogLevel::Warn);
        assert_eq!(entries[0].channel, Some("easing".to_string()));
        assert_eq!(entries[0].timestamp_ms, 1000.0);
        match &entries[0].data {
            LogData::Message(message) => {
                assert!(message.contains("count >= 2"));
                assert!(message.contains("easeSteps(1, 'jumpNone')"));
            }
            _ => panic!("expected a message log entry"),
        }
    }

    #[test]
    fn stays_silent_for_well_defined_calls_and_without_the_guard_at_all() {
        let log_state = crate::create_test_log_state();
        let _lock = GUARD_TEST_LOCK
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        clear_log_once_keys(&log_state);
        let handle = create_memory_log_sink(8);
        add_log_sink(&log_state, handle.sink.clone());
        let clock_calls = Arc::new(AtomicUsize::new(0));
        enable_easing_guards(&log_state, counting_clock(&clock_calls));
        ease_steps(2, Some(StepPosition::JumpNone))(0.5);
        ease_steps(1, Some(StepPosition::JumpEnd))(0.5);
        ease_steps(1, Some(StepPosition::JumpStart))(0.5);
        ease_steps(1, Some(StepPosition::JumpBoth))(0.5);
        disable_easing_guards();
        assert_eq!(get_memory_log_sink_entries(&handle).len(), 0);
        assert_eq!(clock_calls.load(Ordering::SeqCst), 0);

        let value = ease_steps(1, Some(StepPosition::JumpNone))(0.5);
        remove_log_sink(&log_state, &handle.sink);
        assert!(value.is_nan());
        assert_eq!(get_memory_log_sink_entries(&handle).len(), 0);
    }
}
