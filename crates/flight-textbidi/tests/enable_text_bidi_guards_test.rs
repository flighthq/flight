use std::sync::atomic::{AtomicU64, AtomicUsize, Ordering};
use std::sync::{Arc, RwLock};

use flight_entity::allocate_entity;
use flight_log::{
    LogData, LogLevel, LogStateRef, LogValue, add_log_sink, create_log_state,
    create_memory_log_sink, get_memory_log_sink_entries,
};
use flight_textbidi::*;

use crate::lock_text_bidi_guard_test;

fn log_state() -> LogStateRef {
    return Arc::new(RwLock::new(create_log_state()));
}

mod disable_text_bidi_guards {
    use super::*;

    #[test]
    fn restores_silent_compact_fallback() {
        let _lock = lock_text_bidi_guard_test();
        let state = log_state();
        let memory = create_memory_log_sink(8);
        add_log_sink(&state, memory.sink.clone());
        enable_text_bidi_guards(&state, Arc::new(|| 1.0));
        disable_text_bidi_guards();
        let mut levels = Vec::new();
        resolve_bidi_levels(
            &mut levels,
            &COMPACT_BIDI_CLASS_KERNEL,
            "\u{4E2D}",
            BidiDirection::Ltr,
        );
        assert!(
            {
                let mut collected = Vec::new();
                get_memory_log_sink_entries(&mut collected, &memory);
                collected
            }
            .is_empty()
        );
    }
}

mod enable_text_bidi_guards {
    use super::*;

    #[test]
    fn warns_once_with_the_exact_source_payload_and_live_operation_time() {
        let _lock = lock_text_bidi_guard_test();
        let state = log_state();
        let memory = create_memory_log_sink(8);
        add_log_sink(&state, memory.sink.clone());

        let now_bits = Arc::new(AtomicU64::new(7.0f64.to_bits()));
        let samples = Arc::new(AtomicUsize::new(0));
        let now_bits_for_clock = now_bits.clone();
        let samples_for_clock = samples.clone();
        enable_text_bidi_guards(
            &state,
            Arc::new(move || {
                samples_for_clock.fetch_add(1, Ordering::SeqCst);
                return f64::from_bits(now_bits_for_clock.load(Ordering::SeqCst));
            }),
        );

        now_bits.store(123.5f64.to_bits(), Ordering::SeqCst);
        report_text_bidi_compact_table_miss(0x4E2D);
        now_bits.store(456.0f64.to_bits(), Ordering::SeqCst);
        report_text_bidi_compact_table_miss(0x6587);
        disable_text_bidi_guards();

        let entries = {
            let mut collected = Vec::new();
            get_memory_log_sink_entries(&mut collected, &memory);
            collected
        };
        assert_eq!(samples.load(Ordering::SeqCst), 2);
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].level, LogLevel::Warn);
        assert_eq!(entries[0].channel, Some("textbidi".to_string()));
        assert_eq!(entries[0].timestamp_ms, 123.5);
        match &entries[0].data {
            LogData::Record(record) => {
                assert_eq!(record.len(), 1);
                match record.get("message") {
                    Some(LogValue::Str(message)) => assert_eq!(
                        message,
                        "resolveBidiLevels: U+4E2D is outside the compact bidi-class table and defaulted to L. Pass a full-coverage BidiClassKernel to resolveBidiLevels or getBidiRuns."
                    ),
                    _ => panic!("expected the exact source warning message"),
                }
            }
            _ => panic!("expected structured warning data"),
        }
        assert!(
            state
                .read()
                .unwrap()
                .once_keys
                .contains("textbidi:compact-table-miss")
        );
    }

    #[test]
    fn observes_process_global_compact_misses_from_another_thread() {
        let _lock = lock_text_bidi_guard_test();
        let state = log_state();
        let memory = create_memory_log_sink(8);
        add_log_sink(&state, memory.sink.clone());
        enable_text_bidi_guards(&state, Arc::new(|| 1.0));

        std::thread::spawn(|| {
            let kernel = create_compact_bidi_class_kernel();
            assert_eq!((kernel.get_bidi_class)(0x4E2D), BidiClass::L);
        })
        .join()
        .unwrap();

        disable_text_bidi_guards();
        assert_eq!(
            {
                let mut collected = Vec::new();
                get_memory_log_sink_entries(&mut collected, &memory);
                collected
            }
            .len(),
            1
        );
    }

    #[test]
    fn stays_silent_for_compact_table_coverage() {
        let _lock = lock_text_bidi_guard_test();
        let state = log_state();
        let memory = create_memory_log_sink(8);
        add_log_sink(&state, memory.sink.clone());
        enable_text_bidi_guards(&state, Arc::new(|| 1.0));
        let mut levels = Vec::new();
        resolve_bidi_levels(
            &mut levels,
            &COMPACT_BIDI_CLASS_KERNEL,
            "abc \u{05E9}\u{05DC}\u{05D5}\u{05DD} \u{0627}\u{0628}\u{062A}",
            BidiDirection::Auto,
        );
        disable_text_bidi_guards();
        assert!(
            {
                let mut collected = Vec::new();
                get_memory_log_sink_entries(&mut collected, &memory);
                collected
            }
            .is_empty()
        );
    }

    #[test]
    fn stays_silent_for_an_explicit_non_compact_kernel() {
        let _lock = lock_text_bidi_guard_test();
        let state = log_state();
        let memory = create_memory_log_sink(8);
        add_log_sink(&state, memory.sink.clone());
        enable_text_bidi_guards(&state, Arc::new(|| 1.0));
        let mut custom: BidiClassKernel = allocate_entity();
        custom.get_bidi_class = |_| BidiClass::L;
        let mut levels = Vec::new();
        resolve_bidi_levels(&mut levels, &custom, "\u{4E2D}", BidiDirection::Ltr);
        disable_text_bidi_guards();
        assert!(
            {
                let mut collected = Vec::new();
                get_memory_log_sink_entries(&mut collected, &memory);
                collected
            }
            .is_empty()
        );
    }
}
