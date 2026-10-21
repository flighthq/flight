use std::sync::{Arc, RwLock};

use flight_log::{
    LogData, LogEntry, LogStateRef, LogValue, add_log_sink, create_log_state,
    create_memory_log_sink, get_memory_log_sink_entries,
};
use flight_textshaper::contract::*;

fn pool() -> ShapedRunPool {
    let make: fn() -> ShapedRunPool = ShapedRunPool::default;
    return make();
}

fn capture(body: impl FnOnce(&LogStateRef)) -> Vec<LogEntry> {
    let log_state: LogStateRef = Arc::new(RwLock::new(create_log_state()));
    let sink = create_memory_log_sink(8);
    add_log_sink(&log_state, sink.sink.clone());
    body(&log_state);
    return {
        let mut collected = Vec::new();
        get_memory_log_sink_entries(&mut collected, &sink);
        collected
    };
}

mod disable_text_shaper_guards {
    use super::*;

    #[test]
    fn stops_repeated_releases_from_reporting() {
        let entries = capture(|logs| {
            let mut pool = pool();
            enable_text_shaper_guards(&mut pool, logs, Arc::new(|| 0.0));
            disable_text_shaper_guards(&mut pool);
            let run = acquire_shaped_run(&mut pool);
            release_shaped_run(&mut pool, &run);
            release_shaped_run(&mut pool, &run);
        });
        assert!(entries.is_empty());
    }
}

mod enable_text_shaper_guards {
    use super::*;

    #[test]
    fn warns_once_when_one_acquired_run_is_released_twice() {
        let entries = capture(|logs| {
            let mut pool = pool();
            enable_text_shaper_guards(&mut pool, logs, Arc::new(|| 7.0));
            let run = acquire_shaped_run(&mut pool);
            release_shaped_run(&mut pool, &run);
            release_shaped_run(&mut pool, &run);
            release_shaped_run(&mut pool, &run);
        });
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].channel.as_deref(), Some("textshaper"));
        assert_eq!(entries[0].timestamp_ms, 7.0);
        let LogData::Record(record) = &entries[0].data else {
            panic!("a record");
        };
        let Some(LogValue::Str(message)) = record.get("message") else {
            panic!("a message");
        };
        assert!(message.contains("released twice"));
    }

    #[test]
    fn stays_silent_for_correctly_paired_acquire_and_release_calls() {
        let entries = capture(|logs| {
            let mut pool = pool();
            enable_text_shaper_guards(&mut pool, logs, Arc::new(|| 0.0));
            let run = acquire_shaped_run(&mut pool);
            release_shaped_run(&mut pool, &run);
            let next = acquire_shaped_run(&mut pool);
            release_shaped_run(&mut pool, &next);
        });
        assert!(entries.is_empty());
    }
}
