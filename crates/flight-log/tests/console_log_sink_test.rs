use std::sync::{Arc, Mutex, RwLock};

use flight_log::contract::*;

/// Helper: a fresh caller-owned log state per test.
fn test_state() -> LogStateRef {
    return Arc::new(RwLock::new(create_log_state()));
}

mod create_console_log_sink {
    use super::*;

    // log.test.ts: "writes the formatted entry to the console method matching its level" — the
    // formatter sees each entry once; the level-to-method routing is covered beside the writer.
    #[test]
    fn writes_each_entry_through_the_supplied_formatter() {
        let state = test_state();
        let seen: Arc<Mutex<Vec<(LogLevel, Option<String>)>>> = Arc::new(Mutex::new(Vec::new()));
        let recorded = seen.clone();
        let formatter: LogFormatter = Arc::new(move |entry: &LogEntry| {
            recorded
                .lock()
                .unwrap()
                .push((entry.level, entry.channel.clone()));
            return "formatted warning".to_string();
        });
        let sink = create_console_log_sink(
            &state,
            Some(&ConsoleLogSinkOptions {
                formatter: Some(formatter),
            }),
        );
        sink(&LogEntry {
            level: LogLevel::Warn,
            channel: Some("render".to_string()),
            data: LogData::Message("ignored".to_string()),
            timestamp_ms: 0.0,
        });
        assert_eq!(
            *seen.lock().unwrap(),
            vec![(LogLevel::Warn, Some("render".to_string()))]
        );
    }

    // log.test.ts: "uses a level-prefixed text formatter by default", installed: the default sink
    // writes every level through the console (the unavailable-console case is TS-only).
    #[test]
    fn writes_every_level_through_an_installed_default_sink_without_throwing() {
        let state = test_state();
        set_log_level(&state, LogLevel::Verbose);
        add_log_sink(&state, create_console_log_sink(&state, None));
        for level in [
            LogLevel::Error,
            LogLevel::Warn,
            LogLevel::Info,
            LogLevel::Debug,
            LogLevel::Verbose,
        ] {
            log(&state, 0.0, level, "failed".into(), None);
        }
        assert_eq!(state.read().unwrap().sinks.len(), 1);
    }
}
