//! flighthq-log
//!
//! Leveled, capture-aware logging: structured entries to a sink, plus gated console output.
//!
//! Logging is split into two faces of one contract so each consumer tree-shakes its half:
//!
//! **Emit side** — `log`, `log_debug`, `log_info`, `log_warn`, `log_error`, `log_verbose`.
//! Featherweight: each forwards an entry to the installed sink and nothing else. A build that never
//! installs a sink carries only the forwarder and `LogLevel`; everything else drops away.
//!
//! **Listener side** — `create_console_capture_sink`, threshold getters/setters. Imported by tools
//! (examples, capture harness). The sink records EVERY level (the machine record is complete) and
//! additionally prints a human-readable line for levels at or above the configured threshold.

use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::{SystemTime, UNIX_EPOCH};

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/// Severity level. Doubles as a verbosity threshold. Console output shows an entry when the
/// configured console level is at or above the entry's level (so `Error` surfaces first,
/// `Verbose` only at the top). `None` disables console output. The capture sink receives every
/// level regardless of the console threshold — the machine record is always complete.
#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord)]
pub enum LogLevel {
    None = 0,
    Error = 1,
    Warn = 2,
    Info = 3,
    Debug = 4,
    Verbose = 5,
}

impl LogLevel {
    /// Returns the lowercase name used in structured capture output.
    pub fn as_str(self) -> &'static str {
        match self {
            LogLevel::None => "none",
            LogLevel::Error => "error",
            LogLevel::Warn => "warn",
            LogLevel::Info => "info",
            LogLevel::Debug => "debug",
            LogLevel::Verbose => "verbose",
        }
    }
}

/// A log payload: a plain message string or a structured key/value record.
#[derive(Clone, Debug)]
pub enum LogData {
    /// Plain text message.
    Message(String),
    /// Structured key/value map for machine-readable capture.
    Record(HashMap<String, String>),
}

impl From<&str> for LogData {
    fn from(s: &str) -> Self {
        LogData::Message(s.to_owned())
    }
}

impl From<String> for LogData {
    fn from(s: String) -> Self {
        LogData::Message(s)
    }
}

impl From<HashMap<String, String>> for LogData {
    fn from(map: HashMap<String, String>) -> Self {
        LogData::Record(map)
    }
}

/// One emitted log entry. `channel` is a free categorization tag (for example `"batch"`,
/// `"shader"`, `"user"`) used to filter captured output; `None` when uncategorized.
#[derive(Clone, Debug)]
pub struct LogEntry {
    pub level: LogLevel,
    pub channel: Option<String>,
    pub data: LogData,
}

/// Receives every emitted entry regardless of the console verbosity threshold. The capture
/// harness installs one to record structured output; tests install one to assert.
pub trait LogSink: Send + Sync {
    fn write(&self, entry: &LogEntry);
}

// ---------------------------------------------------------------------------
// Log handle
// ---------------------------------------------------------------------------

/// A log handle holding a shared sink reference and a console threshold. Obtain one via
/// [`create_log`]. All emit functions take `&Log` explicitly — no hidden global state.
pub struct Log {
    sink: Mutex<Option<Arc<dyn LogSink>>>,
    console_level: Mutex<LogLevel>,
}

/// Allocates a new `Log` with the given initial console threshold and no sink installed.
pub fn create_log(level: LogLevel) -> Log {
    Log {
        sink: Mutex::new(None),
        console_level: Mutex::new(level),
    }
}

// ---------------------------------------------------------------------------
// Sink management
// ---------------------------------------------------------------------------

/// Returns the current console threshold for `log`. Default is `LogLevel::Info`.
pub fn get_log_console_level(log: &Log) -> LogLevel {
    *log.console_level.lock().unwrap()
}

/// Sets the highest level printed as a human-readable console line. `LogLevel::None` silences
/// those lines; the capture record still receives every level.
pub fn set_log_console_level(log: &Log, level: LogLevel) {
    *log.console_level.lock().unwrap() = level;
}

/// Installs (or clears, with `None`) the sink every emit forwards to.
pub fn set_log_sink(log: &Log, sink: Option<Arc<dyn LogSink>>) {
    *log.sink.lock().unwrap() = sink;
}

// ---------------------------------------------------------------------------
// Emit side
// ---------------------------------------------------------------------------

/// Emits a log entry at an explicit level. `channel` is a free categorization tag. No-ops until
/// a sink is installed.
pub fn log(log: &Log, level: LogLevel, data: impl Into<LogData>, channel: Option<&str>) {
    let guard = log.sink.lock().unwrap();
    if let Some(sink) = guard.as_ref() {
        sink.write(&LogEntry {
            level,
            channel: channel.map(|s| s.to_owned()),
            data: data.into(),
        });
    }
}

/// Emits at [`LogLevel::Debug`]. Convenience wrapper over [`log`].
pub fn log_debug(log: &Log, data: impl Into<LogData>, channel: Option<&str>) {
    self::log(log, LogLevel::Debug, data, channel);
}

/// Emits at [`LogLevel::Error`]. Convenience wrapper over [`log`].
pub fn log_error(log: &Log, data: impl Into<LogData>, channel: Option<&str>) {
    self::log(log, LogLevel::Error, data, channel);
}

/// Emits at [`LogLevel::Info`]. Convenience wrapper over [`log`].
pub fn log_info(log: &Log, data: impl Into<LogData>, channel: Option<&str>) {
    self::log(log, LogLevel::Info, data, channel);
}

/// Emits at [`LogLevel::Verbose`]. Convenience wrapper over [`log`].
pub fn log_verbose(log: &Log, data: impl Into<LogData>, channel: Option<&str>) {
    self::log(log, LogLevel::Verbose, data, channel);
}

/// Emits at [`LogLevel::Warn`]. Convenience wrapper over [`log`].
pub fn log_warn(log: &Log, data: impl Into<LogData>, channel: Option<&str>) {
    self::log(log, LogLevel::Warn, data, channel);
}

// ---------------------------------------------------------------------------
// Console capture sink (listener side)
// ---------------------------------------------------------------------------

/// A sink that records every entry and — for levels at or above the console threshold — also
/// prints a human-readable line to stderr. Used by capture harnesses and dev tooling.
///
/// The structured record is emitted as a JSON-like string; the human line uses the channel as a
/// prefix. Install with [`set_log_sink`].
pub struct ConsoleCaptureState {
    console_level: LogLevel,
}

/// Listener-side sink that mirrors the TS `createConsoleCaptureSink`. It emits every entry to
/// stderr as a tagged JSON envelope (low visual noise, always captured) and additionally prints a
/// human-readable line for levels at or above the console threshold.
pub struct ConsoleCapturesSink {
    state: Mutex<ConsoleCaptureState>,
}

impl ConsoleCapturesSink {
    /// Returns the current console threshold for this sink.
    pub fn get_console_level(&self) -> LogLevel {
        self.state.lock().unwrap().console_level
    }

    /// Sets the console threshold for this sink.
    pub fn set_console_level(&self, level: LogLevel) {
        self.state.lock().unwrap().console_level = level;
    }
}

impl LogSink for ConsoleCapturesSink {
    fn write(&self, entry: &LogEntry) {
        let t = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_secs_f64() * 1000.0)
            .unwrap_or(0.0);

        let level_str = entry.level.as_str();
        let channel_json = match &entry.channel {
            Some(c) => format!("\"{}\"", c),
            None => "null".to_owned(),
        };
        let data_json = match &entry.data {
            LogData::Message(msg) => format!("{{\"msg\":{:?}}}", msg),
            LogData::Record(map) => {
                let pairs: Vec<String> = map
                    .iter()
                    .map(|(k, v)| format!("{:?}:{:?}", k, v))
                    .collect();
                format!("{{{}}}", pairs.join(","))
            }
        };

        // Structured capture line — always emitted regardless of threshold.
        eprintln!(
            "{{\"__flight\":true,\"t\":{:.3},\"level\":\"{}\",\"channel\":{},\"data\":{}}}",
            t, level_str, channel_json, data_json,
        );

        // Human-readable line — only for levels at or above the console threshold.
        let console_level = self.state.lock().unwrap().console_level;
        if entry.level != LogLevel::None && console_level >= entry.level {
            let prefix = match &entry.channel {
                Some(c) => format!("[{}]", c),
                None => "[flight]".to_owned(),
            };
            match &entry.data {
                LogData::Message(msg) => eprintln!("{} {}", prefix, msg),
                LogData::Record(map) => eprintln!("{} {:?}", prefix, map),
            }
        }
    }
}

/// Allocates a new [`ConsoleCapturesSink`] with the default console threshold (`LogLevel::Info`).
/// Wrap in [`Arc`] before passing to [`set_log_sink`].
pub fn create_console_capture_sink() -> ConsoleCapturesSink {
    ConsoleCapturesSink {
        state: Mutex::new(ConsoleCaptureState {
            console_level: LogLevel::Info,
        }),
    }
}

// ---------------------------------------------------------------------------
// Capture sink (for testing)
// ---------------------------------------------------------------------------

/// An in-memory sink that records every entry. Used in tests to assert log output.
pub struct CaptureSink {
    entries: Mutex<Vec<LogEntry>>,
}

/// Allocates a new [`CaptureSink`] with an empty buffer.
pub fn create_capture_sink() -> CaptureSink {
    CaptureSink {
        entries: Mutex::new(Vec::new()),
    }
}

impl CaptureSink {
    /// Returns a snapshot of all recorded entries.
    pub fn entries(&self) -> Vec<LogEntry> {
        self.entries.lock().unwrap().clone()
    }

    /// Clears all recorded entries.
    pub fn clear(&self) {
        self.entries.lock().unwrap().clear();
    }

    /// Returns the number of recorded entries.
    pub fn len(&self) -> usize {
        self.entries.lock().unwrap().len()
    }

    /// Returns `true` if no entries have been recorded.
    pub fn is_empty(&self) -> bool {
        self.entries.lock().unwrap().is_empty()
    }
}

impl LogSink for CaptureSink {
    fn write(&self, entry: &LogEntry) {
        self.entries.lock().unwrap().push(entry.clone());
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    // --- CaptureSink ---

    #[test]
    fn capture_sink_create_capture_sink_starts_empty() {
        let sink = create_capture_sink();
        assert!(sink.is_empty());
        assert_eq!(sink.len(), 0);
    }

    #[test]
    fn capture_sink_write_records_entry() {
        let sink = create_capture_sink();
        sink.write(&LogEntry {
            level: LogLevel::Info,
            channel: None,
            data: LogData::Message("hello".to_owned()),
        });
        assert_eq!(sink.len(), 1);
        let entries = sink.entries();
        assert_eq!(entries[0].level, LogLevel::Info);
        match &entries[0].data {
            LogData::Message(m) => assert_eq!(m, "hello"),
            _ => panic!("expected Message"),
        }
    }

    #[test]
    fn capture_sink_clear_empties_buffer() {
        let sink = create_capture_sink();
        sink.write(&LogEntry {
            level: LogLevel::Debug,
            channel: Some("test".to_owned()),
            data: LogData::Message("x".to_owned()),
        });
        assert_eq!(sink.len(), 1);
        sink.clear();
        assert!(sink.is_empty());
    }

    #[test]
    fn capture_sink_entries_returns_snapshot() {
        let sink = create_capture_sink();
        sink.write(&LogEntry {
            level: LogLevel::Warn,
            channel: None,
            data: LogData::Message("w".to_owned()),
        });
        let a = sink.entries();
        sink.write(&LogEntry {
            level: LogLevel::Error,
            channel: None,
            data: LogData::Message("e".to_owned()),
        });
        // snapshot taken before second write should have only one entry
        assert_eq!(a.len(), 1);
        assert_eq!(sink.len(), 2);
    }

    // --- ConsoleCapturesSink ---

    #[test]
    fn console_capture_sink_create_console_capture_sink_default_level_is_info() {
        let sink = create_console_capture_sink();
        assert_eq!(sink.get_console_level(), LogLevel::Info);
    }

    #[test]
    fn console_capture_sink_set_console_level_updates_threshold() {
        let sink = create_console_capture_sink();
        sink.set_console_level(LogLevel::Warn);
        assert_eq!(sink.get_console_level(), LogLevel::Warn);
    }

    // --- create_log ---

    #[test]
    fn create_log_sets_initial_console_level() {
        let logger = create_log(LogLevel::Debug);
        assert_eq!(get_log_console_level(&logger), LogLevel::Debug);
    }

    // --- get_log_console_level / set_log_console_level ---

    #[test]
    fn get_log_console_level_returns_current_level() {
        let logger = create_log(LogLevel::Info);
        assert_eq!(get_log_console_level(&logger), LogLevel::Info);
    }

    #[test]
    fn set_log_console_level_updates_level() {
        let logger = create_log(LogLevel::Info);
        set_log_console_level(&logger, LogLevel::Verbose);
        assert_eq!(get_log_console_level(&logger), LogLevel::Verbose);
    }

    // --- log (no sink) ---

    #[test]
    fn log_no_ops_without_sink() {
        let logger = create_log(LogLevel::Info);
        // Should not panic; nothing to assert beyond no crash.
        log(&logger, LogLevel::Info, "msg", None);
    }

    // --- log (with capture sink) ---

    fn make_logger_with_capture() -> (Log, Arc<CaptureSink>) {
        let sink = Arc::new(create_capture_sink());
        let logger = create_log(LogLevel::Info);
        set_log_sink(&logger, Some(sink.clone()));
        (logger, sink)
    }

    #[test]
    fn log_forwards_entry_to_sink() {
        let (logger, sink) = make_logger_with_capture();
        log(&logger, LogLevel::Info, "hello", None);
        assert_eq!(sink.len(), 1);
        let entry = &sink.entries()[0];
        assert_eq!(entry.level, LogLevel::Info);
        assert!(entry.channel.is_none());
        match &entry.data {
            LogData::Message(m) => assert_eq!(m, "hello"),
            _ => panic!("expected Message"),
        }
    }

    #[test]
    fn log_records_channel() {
        let (logger, sink) = make_logger_with_capture();
        log(&logger, LogLevel::Warn, "msg", Some("batch"));
        let entry = &sink.entries()[0];
        assert_eq!(entry.channel.as_deref(), Some("batch"));
    }

    // --- log_debug ---

    #[test]
    fn log_debug_emits_at_debug_level() {
        let (logger, sink) = make_logger_with_capture();
        log_debug(&logger, "dbg", None);
        assert_eq!(sink.entries()[0].level, LogLevel::Debug);
    }

    // --- log_error ---

    #[test]
    fn log_error_emits_at_error_level() {
        let (logger, sink) = make_logger_with_capture();
        log_error(&logger, "err", None);
        assert_eq!(sink.entries()[0].level, LogLevel::Error);
    }

    // --- log_info ---

    #[test]
    fn log_info_emits_at_info_level() {
        let (logger, sink) = make_logger_with_capture();
        log_info(&logger, "inf", None);
        assert_eq!(sink.entries()[0].level, LogLevel::Info);
    }

    // --- log_verbose ---

    #[test]
    fn log_verbose_emits_at_verbose_level() {
        let (logger, sink) = make_logger_with_capture();
        log_verbose(&logger, "vrb", None);
        assert_eq!(sink.entries()[0].level, LogLevel::Verbose);
    }

    // --- log_warn ---

    #[test]
    fn log_warn_emits_at_warn_level() {
        let (logger, sink) = make_logger_with_capture();
        log_warn(&logger, "wrn", None);
        assert_eq!(sink.entries()[0].level, LogLevel::Warn);
    }

    // --- set_log_sink: clearing ---

    #[test]
    fn set_log_sink_none_stops_forwarding() {
        let (logger, sink) = make_logger_with_capture();
        log_info(&logger, "before", None);
        set_log_sink(&logger, None);
        log_info(&logger, "after", None);
        // Only the first entry should have been recorded.
        assert_eq!(sink.len(), 1);
    }

    // --- LogLevel ordering ---

    #[test]
    fn log_level_ordering_is_correct() {
        assert!(LogLevel::None < LogLevel::Error);
        assert!(LogLevel::Error < LogLevel::Warn);
        assert!(LogLevel::Warn < LogLevel::Info);
        assert!(LogLevel::Info < LogLevel::Debug);
        assert!(LogLevel::Debug < LogLevel::Verbose);
    }

    // --- LogLevel::as_str ---

    #[test]
    fn log_level_as_str_returns_lowercase_name() {
        assert_eq!(LogLevel::None.as_str(), "none");
        assert_eq!(LogLevel::Error.as_str(), "error");
        assert_eq!(LogLevel::Warn.as_str(), "warn");
        assert_eq!(LogLevel::Info.as_str(), "info");
        assert_eq!(LogLevel::Debug.as_str(), "debug");
        assert_eq!(LogLevel::Verbose.as_str(), "verbose");
    }

    // --- LogData conversions ---

    #[test]
    fn log_data_from_str_produces_message_variant() {
        let data: LogData = "test".into();
        match data {
            LogData::Message(m) => assert_eq!(m, "test"),
            _ => panic!("expected Message"),
        }
    }

    #[test]
    fn log_data_from_string_produces_message_variant() {
        let data: LogData = String::from("owned").into();
        match data {
            LogData::Message(m) => assert_eq!(m, "owned"),
            _ => panic!("expected Message"),
        }
    }

    #[test]
    fn log_data_from_hashmap_produces_record_variant() {
        let mut map = HashMap::new();
        map.insert("k".to_owned(), "v".to_owned());
        let data: LogData = map.into();
        match data {
            LogData::Record(m) => assert_eq!(m["k"], "v"),
            _ => panic!("expected Record"),
        }
    }

    // --- multiple entries ordering ---

    #[test]
    fn log_entries_are_ordered_by_emission() {
        let (logger, sink) = make_logger_with_capture();
        log_debug(&logger, "first", None);
        log_info(&logger, "second", None);
        log_warn(&logger, "third", None);
        let entries = sink.entries();
        assert_eq!(entries.len(), 3);
        assert_eq!(entries[0].level, LogLevel::Debug);
        assert_eq!(entries[1].level, LogLevel::Info);
        assert_eq!(entries[2].level, LogLevel::Warn);
    }
}
