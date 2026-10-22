// flight-lint: allow-file(f64) D1: log timestamps, timer instants and throttle intervals are millisecond durations
use std::any::Any;
use std::collections::{HashMap, HashSet};
use std::fmt;
use std::io::{self, Write};
use std::sync::{Arc, Mutex};

use flight_entity::{EntityRuntimeSlot, Ref, unknown_to_js_string};
use flight_signals::{create_signal, emit_signal, Signal};

#[cfg(test)]
mod console_tests {
    use super::*;

    fn entry(level: LogLevel, channel: Option<&str>, data: &str) -> LogEntry {
        return LogEntry {
            level,
            channel: channel.map(|channel| channel.to_string()),
            data: LogData::Message(data.to_string()),
            timestamp_ms: 0.0,
        };
    }

    // The test hook (Principal 2d987bb9): the sink's console write is captured here instead of on
    // the real stdout and stderr, as the console method it routes to.
    fn written(entry: &LogEntry, formatter: &LogFormatter) -> Vec<(ConsoleMethod, String)> {
        let lines = Mutex::new(Vec::new());
        write_console_log_entry(entry, formatter, &|level, text| {
            lines
                .lock()
                .unwrap()
                .push((console_method(level), text.to_string()));
        });
        return lines.into_inner().unwrap();
    }

    // log.test.ts: "writes the formatted entry to the console method matching its level".
    #[test]
    fn writes_the_formatted_entry_to_the_console_method_matching_its_level() {
        let formatter: LogFormatter = Arc::new(|_entry: &LogEntry| "formatted warning".to_string());
        assert_eq!(
            written(
                &entry(LogLevel::Warn, Some("render"), "ignored"),
                &formatter
            ),
            vec![(ConsoleMethod::Warn, "formatted warning".to_string())]
        );
    }

    // log.test.ts: "uses a level-prefixed text formatter by default".
    #[test]
    fn uses_a_level_prefixed_text_formatter_by_default() {
        let state: LogStateRef = Arc::new(std::sync::RwLock::new(create_log_state()));
        let formatter = default_console_log_formatter(&state);
        assert_eq!(
            written(&entry(LogLevel::Error, None, "failed"), &formatter),
            vec![(ConsoleMethod::Error, "error [flight] failed".to_string())]
        );
    }

    // The source `_consoleMethods` table: None and Verbose use `log`.
    #[test]
    fn routes_every_level_to_its_source_console_method() {
        assert_eq!(console_method(LogLevel::None), ConsoleMethod::Log);
        assert_eq!(console_method(LogLevel::Error), ConsoleMethod::Error);
        assert_eq!(console_method(LogLevel::Warn), ConsoleMethod::Warn);
        assert_eq!(console_method(LogLevel::Info), ConsoleMethod::Info);
        assert_eq!(console_method(LogLevel::Debug), ConsoleMethod::Debug);
        assert_eq!(console_method(LogLevel::Verbose), ConsoleMethod::Log);
    }
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Hash)]
#[repr(u8)]
pub enum LogLevel {
    None = 0,
    Error = 1,
    Warn = 2,
    Info = 3,
    Debug = 4,
    Verbose = 5,
}

/// Structured log data: either a plain string message or a map of key-value pairs.
#[derive(Clone, Debug)]
pub enum LogData {
    Message(String),
    Record(HashMap<String, LogValue>),
}

/// Values that can appear inside a LogData::Record.
#[derive(Clone)]
pub enum LogValue {
    Null,
    Bool(bool),
    Int(i64),
    Float(f64),
    Str(String),
    Record(HashMap<String, LogValue>),
    Array(Vec<LogValue>),
    Object(flight_entity::UnknownValue),
}

/// A single log entry forwarded to sinks. The timestamp is injected by the caller (D5); formatters
/// read it instead of sampling a hidden clock.
// flight-lint: allow(f64) D1: timestamps are millisecond durations shared with the formatters
#[derive(Clone, Debug)]
pub struct LogEntry {
    pub level: LogLevel,
    pub channel: Option<String>,
    pub data: LogData,
    pub timestamp_ms: f64,
}

/// Callback type for receiving log entries (D9 stored form).
pub type LogSink = Arc<dyn Fn(&LogEntry) + Send + Sync>;

/// A bound logging context with a channel and optional base fields.
#[derive(Clone, Debug)]
pub struct LogContext {
    pub channel: Option<String>,
    pub fields: HashMap<String, LogValue>,
    runtime: EntityRuntimeSlot,
}

/// A named tracing span.
#[derive(Clone, Debug)]
pub struct LogSpan {
    pub id: u64,
    pub name: String,
    pub channel: Option<String>,
    pub fields: HashMap<String, LogValue>,
    runtime: EntityRuntimeSlot,
}

/// A timer handle returned by start_log_timer.
// flight-lint: allow(f64) D1: timer timestamps are millisecond durations
#[derive(Clone, Debug)]
pub struct LogTimer {
    pub label: String,
    pub channel: Option<String>,
    pub started_at: f64,
}


/// Options for create_buffered_log_sink.
#[derive(Clone, Debug, Default)]
pub struct BufferedLogSinkOptions {
    pub size: Option<usize>,
    pub interval_ms: Option<f64>,
}

/// Options for create_rate_limited_log_sink.
#[derive(Clone, Debug)]
pub struct RateLimitedLogSinkOptions {
    pub per_channel: bool,
    pub max_per_interval: usize,
    pub interval_ms: f64,
}

/// Options for create_text_log_formatter.
#[derive(Clone, Debug, Default)]
pub struct TextLogFormatterOptions {
    pub indent_groups: Option<bool>,
    pub level_prefix: Option<bool>,
    pub timestamp: Option<bool>,
}

/// Options for create_console_log_sink (TS `{ formatter?: LogFormatter }`).
#[derive(Clone, Default)]
pub struct ConsoleLogSinkOptions {
    pub formatter: Option<LogFormatter>,
}

// The console method an entry is written with (TS `_consoleMethods`).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum ConsoleMethod {
    Debug,
    Error,
    Info,
    Log,
    Warn,
}

/// A handle to a memory sink.
#[derive(Clone)]
pub struct MemoryLogSink {
    pub sink: LogSink,
    state: Arc<Mutex<MemoryLogSinkState>>,
    runtime: EntityRuntimeSlot,
}

/// A handle to a buffered log sink.
#[derive(Clone)]
pub struct BufferedLogSink {
    pub sink: LogSink,
    state: Arc<Mutex<BufferedLogSinkState>>,
    runtime: EntityRuntimeSlot,
}

/// A handle to a rate-limited log sink.
#[derive(Clone)]
pub struct RateLimitedLogSink {
    pub sink: LogSink,
    runtime: EntityRuntimeSlot,
}

/// Log signals entity.
#[derive(Clone)]
pub struct LogSignals {
    pub on_log_entry: Signal<LogEntry>,
    pub on_log_error: Signal<LogEntry>,
    runtime: EntityRuntimeSlot,
}

/// Log formatter: a function that takes a LogEntry and produces a String (D9 stored form).
pub type LogFormatter = Arc<dyn Fn(&LogEntry) -> String + Send + Sync>;

/// Log data provider: lazy evaluation for expensive data construction.
pub type LogDataProvider = Arc<dyn Fn() -> LogData + Send + Sync>;

/// Sink predicate.
pub type LogPredicate = Arc<dyn Fn(&LogEntry) -> bool + Send + Sync>;

/// Custom serializer for a named `__kind`.
pub type LogSerializer = Arc<dyn Fn(&HashMap<String, LogValue>) -> HashMap<String, LogValue> + Send + Sync>;

/// Either direct data or a lazy provider.
pub enum LogDataOrProvider {
    Data(LogData),
    Provider(LogDataProvider),
}

// ---------------------------------------------------------------------------
// Explicit state (D5): caller-owned, no thread_locals, no hidden clock
// ---------------------------------------------------------------------------

/// Everything the TS package keeps in module-global state, owned by the caller.
///
/// Sinks, levels, once keys, redaction paths, serializers, group depth, active spans and the log
/// signals group all live here. Pass it to every stateful function; the crate never reads a clock
/// or a singleton.
// flight-lint: allow(contract-vocabulary) D5: the span id allocator is opaque bookkeeping, never transpiled
pub struct LogState {
    pub sinks: Vec<LogSink>,
    pub level: LogLevel,
    pub console_level: LogLevel,
    pub channel_levels: HashMap<String, LogLevel>,
    pub once_keys: HashSet<String>,
    pub redaction_paths: Vec<String>,
    pub serializers: HashMap<String, LogSerializer>,
    pub group_depth: i32,
    pub spans: Vec<LogSpan>,
    pub signals: Option<LogSignals>,
    pub next_span_id: u64,
    runtime: EntityRuntimeSlot,
}

/// Shared, caller-owned log state. The caller decides where and how it is shared.
pub type LogStateRef = Ref<LogState>;

struct MemoryLogSinkState {
    buf: Vec<LogEntry>,
    head: usize,
    capacity: usize,
}

struct BufferedLogSinkState {
    buf: Vec<LogEntry>,
    target: LogSink,
    size: usize,
    // flight-lint: allow(f64) D1: intervals are millisecond durations
    interval_ms: f64,
    last_flush_ms: Option<f64>,
}

struct RateLimitedLogSinkState {
    counts: HashMap<Option<String>, usize>,
    window_start_ms: Option<f64>,
    max_per_interval: usize,
    // flight-lint: allow(f64) D1: intervals are millisecond durations
    interval_ms: f64,
    per_channel: bool,
}

// ---------------------------------------------------------------------------
// Constructors
// ---------------------------------------------------------------------------

/// Creates a sink that batches entries and forwards them to `target` in bulk.
pub fn create_buffered_log_sink(
    target: LogSink,
    options: Option<&BufferedLogSinkOptions>,
) -> BufferedLogSink {
    let mut out: BufferedLogSink = flight_entity::allocate_entity();
    initialize_buffered_log_sink(&mut out, target, options);
    return out;
}

/// Creates a child context that inherits the parent's channel and fields.
pub fn create_child_log_context(
    parent: &LogContext,
    fields: HashMap<String, LogValue>,
    channel: Option<Option<String>>,
) -> LogContext {
    let mut merged = parent.fields.clone();
    for (k, v) in fields {
        merged.insert(k, v);
    }
    let ch = match channel {
        Some(ch) => ch,
        None => parent.channel.clone(),
    };
    let mut out = create_log_context();
    out.channel = ch;
    out.fields = merged;
    return out;
}

/// Creates a sink that writes each entry, formatted, to the console method matching its level (TS
/// `createConsoleLogSink`): Error to `error`, Warn to `warn`, Info to `info`, Debug to `debug`, and
/// None and Verbose to `log`. The default formatter is the level-prefixed text formatter. The console
/// is a language-runtime built-in (Principal 2d987bb9), written through `write_console`. There is no
/// console-level threshold here; that belongs to the capture sink.
// flight-lint: allow(conform-params) D5: caller-owned LogState for the default text formatter replaces the hidden singleton
pub fn create_console_log_sink(
    state: &LogStateRef,
    options: Option<&ConsoleLogSinkOptions>,
) -> LogSink {
    let formatter = options
        .and_then(|options| options.formatter.clone())
        .unwrap_or_else(|| default_console_log_formatter(state));
    return Arc::new(move |entry: &LogEntry| {
        write_console_log_entry(entry, &formatter, &write_console);
    });
}

/// Creates a fan-out sink that forwards every entry to all supplied sinks.
pub fn create_fanout_log_sink(sinks: Vec<LogSink>) -> LogSink {
    let list = sinks;
    return Arc::new(move |entry: &LogEntry| {
        for s in list.iter() {
            s(entry);
        }
    });
}

/// Creates a sink that forwards only entries matching a predicate.
pub fn create_filter_log_sink(target: LogSink, predicate: LogPredicate) -> LogSink {
    return Arc::new(move |entry: &LogEntry| {
        if predicate(entry) {
            target(entry);
        }
    });
}

/// Creates a formatter that produces the __flight JSON envelope. Reads serializers, redaction and
/// timestamps from the caller-owned state/entry.
// flight-lint: allow(conform-params) D5: caller-owned LogState replaces the hidden singleton
pub fn create_json_log_formatter(state: &LogStateRef) -> LogFormatter {
    let log_state = state.clone();
    return Arc::new(move |entry: &LogEntry| {
        let data_record = match &entry.data {
            LogData::Message(msg) => {
                let mut m = HashMap::new();
                m.insert("msg".to_string(), LogValue::Str(msg.clone()));
                m
            }
            LogData::Record(rec) => rec.clone(),
        };
        let serialized = apply_serializers(&log_state, data_record);
        let redacted = apply_redaction(&log_state, serialized);
        let level_str = level_name(entry.level);
        let channel_str = match &entry.channel {
            Some(ch) => format!("\"{}\"", escape_json_string(ch)),
            None => "null".to_string(),
        };
        let data_json = log_value_to_json(&LogValue::Record(redacted));
        return format!(
            "{{\"__flight\":true,\"t\":{},\"level\":\"{}\",\"channel\":{},\"data\":{}}}",
            entry.timestamp_ms, level_str, channel_str, data_json
        );
    });
}

/// Creates an empty bound logging context; assign its channel and base fields after create.
// flight-lint: allow(conform-params) D23 (B) zero-field create (Principal 8d88d5a0): assign channel and fields after create
pub fn create_log_context() -> LogContext {
    let mut out: LogContext = flight_entity::allocate_entity();
    initialize_log_context(&mut out);
    return out;
}

/// Creates a tracing span with the next span id from the caller-owned state; assign its name,
/// channel and fields after create.
// flight-lint: allow(conform-params) D5 caller-owned LogState is the span id source; D23 (B) zero-field create (Principal 8d88d5a0): assign name, channel and fields after create
pub fn create_log_span(state: &LogStateRef) -> LogSpan {
    let mut out: LogSpan = flight_entity::allocate_entity();
    initialize_log_span(&mut out, state);
    return out;
}

/// Creates a sink that captures the last `capacity` entries in a ring buffer.
// flight-lint: allow(conform-extra) D12: Entity allocation hook for the caller-owned LogState
pub fn create_log_state() -> LogState {
    let mut out: LogState = flight_entity::allocate_entity();
    initialize_log_state(&mut out);
    return out;
}

pub fn create_memory_log_sink(capacity: usize) -> MemoryLogSink {
    let mut out: MemoryLogSink = flight_entity::allocate_entity();
    initialize_memory_log_sink(&mut out, capacity);
    return out;
}

/// Creates a sink that forwards at most `max_per_interval` entries per `interval_ms` window.
pub fn create_rate_limited_log_sink(
    target: LogSink,
    options: &RateLimitedLogSinkOptions,
) -> RateLimitedLogSink {
    let mut out: RateLimitedLogSink = flight_entity::allocate_entity();
    initialize_rate_limited_log_sink(&mut out, target, options);
    return out;
}

/// Creates a sink that forwards approximately 1-in-N entries.
pub fn create_sampled_log_sink(target: LogSink, rate: usize) -> LogSink {
    if rate <= 1 {
        return Arc::new(move |entry: &LogEntry| target(entry));
    }
    let counter = Arc::new(Mutex::new(0usize));
    return Arc::new(move |entry: &LogEntry| {
        let mut c = counter.lock().unwrap();
        *c = (*c + 1) % rate;
        if *c == 0 {
            target(entry);
        }
    });
}

/// Creates a formatter that produces a human-readable line.
// flight-lint: allow(conform-params) D5: caller-owned LogState replaces the hidden singleton
pub fn create_text_log_formatter(
    state: &LogStateRef,
    options: Option<&TextLogFormatterOptions>,
) -> LogFormatter {
    let indent_groups = options.and_then(|o| o.indent_groups).unwrap_or(false);
    let level_prefix = options.and_then(|o| o.level_prefix).unwrap_or(false);
    let with_timestamp = options.and_then(|o| o.timestamp).unwrap_or(false);
    let log_state = state.clone();
    return Arc::new(move |entry: &LogEntry| {
        let mut parts: Vec<String> = Vec::new();
        if with_timestamp {
            parts.push(format!("t={:.2}", entry.timestamp_ms));
        }
        if level_prefix {
            parts.push(level_name(entry.level).to_string());
        }
        match &entry.channel {
            Some(ch) => parts.push(format!("[{}]", ch)),
            None => parts.push("[flight]".to_string()),
        }
        if indent_groups {
            let depth = log_state.read().unwrap().group_depth;
            if depth > 0 {
                parts.push("  ".repeat(depth as usize));
            }
        }
        match &entry.data {
            LogData::Message(msg) => parts.push(msg.clone()),
            LogData::Record(rec) => parts.push(log_value_to_json(&LogValue::Record(rec.clone()))),
        }
        return parts.join(" ");
    });
}

/// Writes a buffered sink over `target` into `out` (the construction initializer of
/// `create_buffered_log_sink`).
// flight-lint: allow(conform-extra) D23 sweep (Principal 21f7557f): the construction initializer of the source create
pub fn initialize_buffered_log_sink(
    out: &mut BufferedLogSink,
    target: LogSink,
    options: Option<&BufferedLogSinkOptions>,
) {
    let size = options.and_then(|o| o.size).unwrap_or(100);
    let interval_ms = options.and_then(|o| o.interval_ms).unwrap_or(1000.0);
    let state = Arc::new(Mutex::new(BufferedLogSinkState {
        buf: Vec::new(),
        target: target.clone(),
        size,
        interval_ms,
        last_flush_ms: None,
    }));

    let state_for_sink = state.clone();
    let sink: LogSink = Arc::new(move |entry: &LogEntry| {
        let should_flush = {
            let mut s = state_for_sink.lock().unwrap();
            s.buf.push(entry.clone());
            s.buf.len() >= s.size
        };
        if should_flush {
            flush_buffered_state(&state_for_sink);
        }
    });

    out.sink = sink;
    out.state = state;
}

/// Resets a context to no channel and no base fields (the construction initializer of
/// `create_log_context`).
// flight-lint: allow(conform-extra) D23 sweep (Principal 21f7557f): the construction initializer of the source create
pub fn initialize_log_context(out: &mut LogContext) {
    out.channel = None;
    out.fields = HashMap::new();
}

/// Gives `out` the next span id from the caller-owned state and an empty name, channel and fields
/// (the construction initializer of `create_log_span`).
// flight-lint: allow(conform-params) D5: caller-owned LogState replaces the hidden singleton
// flight-lint: allow(conform-extra) D23 sweep (Principal 21f7557f): the construction initializer of the source create
pub fn initialize_log_span(out: &mut LogSpan, state: &LogStateRef) {
    let mut current = state.write().unwrap();
    out.id = current.next_span_id;
    current.next_span_id += 1;
    out.name = String::new();
    out.channel = None;
    out.fields = HashMap::new();
}

/// Adds a sink to the fan-out list. No-op if already present (Arc identity).
// flight-lint: allow(conform-extra) D12: Entity initializer for the caller-owned LogState
pub fn initialize_log_state(out: &mut LogState) {
    out.sinks.clear();
    out.level = LogLevel::Verbose;
    out.console_level = LogLevel::Info;
    out.channel_levels.clear();
    out.once_keys.clear();
    out.redaction_paths.clear();
    out.serializers.clear();
    out.group_depth = 0;
    out.spans.clear();
    out.signals = None;
    out.next_span_id = 1;
}

/// Writes an empty ring buffer of `capacity` entries into `out` (the construction initializer of
/// `create_memory_log_sink`).
// flight-lint: allow(conform-extra) D23 sweep (Principal 21f7557f): the construction initializer of the source create
pub fn initialize_memory_log_sink(out: &mut MemoryLogSink, capacity: usize) {
    let state = Arc::new(Mutex::new(MemoryLogSinkState {
        buf: Vec::new(),
        head: 0,
        capacity,
    }));
    let state_for_sink = state.clone();
    let sink: LogSink = Arc::new(move |entry: &LogEntry| {
        let stored = entry.clone();
        let mut s = state_for_sink.lock().unwrap();
        let capacity = s.capacity;
        if s.buf.len() < capacity {
            s.buf.push(stored);
        } else {
            let head = s.head;
            s.buf[head] = stored;
            s.head = (head + 1) % capacity;
        }
    });
    out.sink = sink;
    out.state = state;
}

/// Writes a rate-limited sink over `target` into `out` (the construction initializer of
/// `create_rate_limited_log_sink`).
// flight-lint: allow(conform-extra) D23 sweep (Principal 21f7557f): the construction initializer of the source create
pub fn initialize_rate_limited_log_sink(
    out: &mut RateLimitedLogSink,
    target: LogSink,
    options: &RateLimitedLogSinkOptions,
) {
    let max_per_interval = options.max_per_interval;
    let interval_ms = options.interval_ms;
    let per_channel = options.per_channel;
    let state = Arc::new(Mutex::new(RateLimitedLogSinkState {
        counts: HashMap::new(),
        window_start_ms: None,
        max_per_interval,
        interval_ms,
        per_channel,
    }));
    let state_for_sink = state.clone();
    let sink: LogSink = Arc::new(move |entry: &LogEntry| {
        let allowed = {
            let mut s = state_for_sink.lock().unwrap();
            let now = entry.timestamp_ms;
            match s.window_start_ms {
                Some(start) if now - start >= s.interval_ms => {
                    s.counts.clear();
                    s.window_start_ms = Some(now);
                }
                None => s.window_start_ms = Some(now),
                _ => {}
            }
            let key = if s.per_channel { entry.channel.clone() } else { None };
            let current = s.counts.get(&key).copied().unwrap_or(0);
            if current >= s.max_per_interval {
                false
            } else {
                s.counts.insert(key, current + 1);
                true
            }
        };
        if allowed {
            target(entry);
        }
    });
    let _ = state;
    out.sink = sink;
}

// flight-lint: allow(conform-params) D5: caller-owned LogState replaces the hidden singleton
pub fn add_log_sink(state: &LogStateRef, sink: LogSink) {
    let mut current = state.write().unwrap();
    for existing in current.sinks.iter() {
        if Arc::ptr_eq(existing, &sink) {
            return;
        }
    }
    current.sinks.push(sink);
}

/// Advances explicit sink time. A buffered sink flushes when its interval has elapsed (D5: no
/// hidden interval timer).
// flight-lint: allow(f64) D1: intervals are millisecond durations
// flight-lint: allow(conform-extra) D5: explicit time replaces the hidden interval timer
// flight-lint: allow(conform-params) D5: injected now_ms replaces the hidden clock
pub fn advance_log_sink(handle: &BufferedLogSink, now_ms: f64) {
    let should_flush = {
        let mut s = handle.state.lock().unwrap();
        let due = match s.last_flush_ms {
            Some(last) => now_ms - last >= s.interval_ms,
            None => {
                s.last_flush_ms = Some(now_ms);
                false
            }
        };
        if due {
            s.last_flush_ms = Some(now_ms);
        }
        due && !s.buf.is_empty()
    };
    if should_flush {
        flush_buffered_state(&handle.state);
    }
}

fn apply_redaction(state: &LogStateRef, data: HashMap<String, LogValue>) -> HashMap<String, LogValue> {
    let paths = state.read().unwrap().redaction_paths.clone();
    if paths.is_empty() {
        return data;
    }
    let mut result = data;
    for path in paths.iter() {
        let parts: Vec<&str> = path.split('.').collect();
        redact_path(&mut result, &parts, 0);
    }
    return result;
}

fn apply_serializers(state: &LogStateRef, data: HashMap<String, LogValue>) -> HashMap<String, LogValue> {
    let serializers = state.read().unwrap().serializers.clone();
    if serializers.is_empty() {
        return data;
    }
    let mut result = HashMap::new();
    for (key, value) in data {
        if let LogValue::Record(ref rec) = value {
            if let Some(LogValue::Str(kind)) = rec.get("__kind") {
                if let Some(ser_fn) = serializers.get(kind) {
                    result.insert(key, LogValue::Record(ser_fn(rec)));
                    continue;
                }
            }
        }
        result.insert(key, value);
    }
    return result;
}

/// Opens a named log group.
// flight-lint: allow(conform-params) D5: caller-owned LogState and injected now_ms replace the hidden singleton and clock
pub fn begin_log_group(state: &LogStateRef, now_ms: f64, label: &str, channel: Option<String>) {
    let depth = {
        let mut current = state.write().unwrap();
        current.group_depth += 1;
        current.group_depth
    };
    if !passes_level_gate(state, LogLevel::Debug, &channel) {
        return;
    }
    let mut data = HashMap::new();
    data.insert("msg".to_string(), LogValue::Str(label.to_string()));
    data.insert("group".to_string(), LogValue::Str("begin".to_string()));
    data.insert("depth".to_string(), LogValue::Int(depth as i64));
    emit_to_sinks(
        state,
        &LogEntry {
            level: LogLevel::Debug,
            channel,
            data: LogData::Record(data),
            timestamp_ms: now_ms,
        },
    );
}

/// Clears one per-channel level override.
// flight-lint: allow(conform-params) D5: caller-owned LogState replaces the hidden singleton
pub fn clear_log_channel_level(state: &LogStateRef, channel: &str) {
    state.write().unwrap().channel_levels.remove(channel);
}

/// Clears all per-channel level overrides.
// flight-lint: allow(conform-params) D5: caller-owned LogState replaces the hidden singleton
pub fn clear_log_channel_levels(state: &LogStateRef) {
    state.write().unwrap().channel_levels.clear();
}

/// Resets the group nesting depth to zero without emitting any entries.
// flight-lint: allow(conform-params) D5: caller-owned LogState replaces the hidden singleton
pub fn clear_log_groups(state: &LogStateRef) {
    state.write().unwrap().group_depth = 0;
}

/// Clears the set of keys that log_once has already emitted.
// flight-lint: allow(conform-params) D5: caller-owned LogState replaces the hidden singleton
pub fn clear_log_once_keys(state: &LogStateRef) {
    state.write().unwrap().once_keys.clear();
}

/// Clears all field redaction paths.
// flight-lint: allow(conform-params) D5: caller-owned LogState replaces the hidden singleton
pub fn clear_log_redaction_paths(state: &LogStateRef) {
    state.write().unwrap().redaction_paths.clear();
}

/// Clears all custom serializer registrations.
// flight-lint: allow(conform-params) D5: caller-owned LogState replaces the hidden singleton
pub fn clear_log_serializers(state: &LogStateRef) {
    state.write().unwrap().serializers.clear();
}

/// Clears all installed sinks.
// flight-lint: allow(conform-params) D5: caller-owned LogState replaces the hidden singleton
pub fn clear_log_sinks(state: &LogStateRef) {
    state.write().unwrap().sinks.clear();
}

/// Clears all captured entries from a memory sink.
pub fn clear_memory_log_sink(handle: &MemoryLogSink) {
    let mut s = handle.state.lock().unwrap();
    s.buf.clear();
    s.head = 0;
}

// The source `_consoleMethods` table: the console method an entry of `level` is written with.
fn console_method(level: LogLevel) -> ConsoleMethod {
    return match level {
        LogLevel::None => ConsoleMethod::Log,
        LogLevel::Error => ConsoleMethod::Error,
        LogLevel::Warn => ConsoleMethod::Warn,
        LogLevel::Info => ConsoleMethod::Info,
        LogLevel::Debug => ConsoleMethod::Debug,
        LogLevel::Verbose => ConsoleMethod::Log,
    };
}

pub(crate) fn context_entity_runtime(context: &LogContext) -> &EntityRuntimeSlot {
    return &context.runtime;
}

pub(crate) fn context_entity_runtime_mut(context: &mut LogContext) -> &mut EntityRuntimeSlot {
    return &mut context.runtime;
}

// The console sink's default formatter (TS `createTextLogFormatter({ levelPrefix: true })`).
fn default_console_log_formatter(state: &LogStateRef) -> LogFormatter {
    return create_text_log_formatter(
        state,
        Some(&TextLogFormatterOptions {
            indent_groups: None,
            level_prefix: Some(true),
            timestamp: None,
        }),
    );
}

/// Disposes a buffered sink: flushes remaining entries.
pub fn dispose_log_sink(handle: &BufferedLogSink) {
    flush_buffered_state(&handle.state);
}

fn emit_level(
    state: &LogStateRef,
    now_ms: f64,
    level: LogLevel,
    context: Option<&LogContext>,
    data: LogDataOrProvider,
) {
    let channel = match context {
        Some(context) => context.channel.clone(),
        None => None,
    };
    if !passes_level_gate(state, level, &channel) {
        return;
    }
    let resolved = resolve_data(data);
    let merged = merge_span_fields(state, resolved);
    let merged = match context {
        Some(context) => merge_context_fields(context, merged),
        None => merged,
    };
    emit_to_sinks(
        state,
        &LogEntry {
            level,
            channel,
            data: merged,
            timestamp_ms: now_ms,
        },
    );
}

fn emit_to_sinks(state: &LogStateRef, entry: &LogEntry) {
    let (sinks, signals) = {
        let current = state.read().unwrap();
        (current.sinks.clone(), current.signals.clone())
    };
    for sink in sinks.iter() {
        sink(entry);
    }
    if let Some(signals) = signals {
        emit_signal(&signals.on_log_entry, entry);
        if entry.level == LogLevel::Error {
            emit_signal(&signals.on_log_error, entry);
        }
    }
}

/// Enables the log signals group. Returns the LogSignals stored in the caller-owned state.
// flight-lint: allow(conform-params) D5: caller-owned LogState replaces the hidden singleton
pub fn enable_log_signals(state: &LogStateRef) -> LogSignals {
    let mut current = state.write().unwrap();
    if let Some(ref signals) = current.signals {
        return signals.clone();
    }
    let signals = LogSignals {
        on_log_entry: create_signal(),
        on_log_error: create_signal(),
        runtime: EntityRuntimeSlot::default(),
    };
    current.signals = Some(signals.clone());
    return signals;
}

/// Closes the innermost open log group.
// flight-lint: allow(conform-params) D5: caller-owned LogState and injected now_ms replace the hidden singleton and clock
pub fn end_log_group(state: &LogStateRef, now_ms: f64, channel: Option<String>) {
    let depth = {
        let mut current = state.write().unwrap();
        if current.group_depth <= 0 {
            return;
        }
        current.group_depth -= 1;
        current.group_depth + 1
    };
    if !passes_level_gate(state, LogLevel::Debug, &channel) {
        return;
    }
    let mut data = HashMap::new();
    data.insert("group".to_string(), LogValue::Str("end".to_string()));
    data.insert("depth".to_string(), LogValue::Int(depth as i64));
    emit_to_sinks(
        state,
        &LogEntry {
            level: LogLevel::Debug,
            channel,
            data: LogData::Record(data),
            timestamp_ms: now_ms,
        },
    );
}

/// Ends a timer, emits a structured Debug entry with the elapsed milliseconds.
// flight-lint: allow(conform-params) D5: caller-owned LogState and injected now_ms replace the hidden singleton and clock
pub fn end_log_timer(state: &LogStateRef, now_ms: f64, timer: &LogTimer) -> f64 {
    let elapsed = now_ms - timer.started_at;
    let mut data = HashMap::new();
    data.insert("label".to_string(), LogValue::Str(timer.label.clone()));
    data.insert("elapsedMs".to_string(), LogValue::Float(elapsed));
    log_debug(state, now_ms, LogData::Record(data).into(), timer.channel.clone());
    return elapsed;
}

/// Activates a log span, pushing it onto the active-span stack.
// flight-lint: allow(conform-params) D5: caller-owned LogState replaces the hidden singleton
pub fn enter_log_span(state: &LogStateRef, span: &LogSpan) {
    state.write().unwrap().spans.push(span.clone());
}

fn escape_json_string(s: &str) -> String {
    let mut result = String::with_capacity(s.len());
    for c in s.chars() {
        match c {
            '"' => result.push_str("\\\""),
            '\\' => result.push_str("\\\\"),
            '\n' => result.push_str("\\n"),
            '\r' => result.push_str("\\r"),
            '\t' => result.push_str("\\t"),
            c if (c as u32) < 0x20 => {
                result.push_str(&format!("\\u{:04x}", c as u32));
            }
            c => result.push(c),
        }
    }
    return result;
}

/// Deactivates a log span by removing it from the active-span stack.
// flight-lint: allow(conform-params) D5: caller-owned LogState replaces the hidden singleton
pub fn exit_log_span(state: &LogStateRef, span: &LogSpan) {
    let mut current = state.write().unwrap();
    if let Some(idx) = current.spans.iter().position(|s| s.id == span.id) {
        current.spans.remove(idx);
    }
}

fn flush_buffered_state(state: &Arc<Mutex<BufferedLogSinkState>>) {
    let (batch, target) = {
        let mut s = state.lock().unwrap();
        if s.buf.is_empty() {
            return;
        }
        (s.buf.drain(..).collect::<Vec<LogEntry>>(), s.target.clone())
    };
    for e in batch.iter() {
        target(e);
    }
}

/// Flushes a buffered sink immediately.
pub fn flush_log_sink(handle: &BufferedLogSink) {
    flush_buffered_state(&handle.state);
}

/// Returns the per-channel level override, or None if not set.
// flight-lint: allow(conform-params) D5: caller-owned LogState replaces the hidden singleton
pub fn get_log_channel_level(state: &LogStateRef, channel: &str) -> Option<LogLevel> {
    return state.read().unwrap().channel_levels.get(channel).copied();
}

/// Returns the current console threshold level.
// flight-lint: allow(conform-params) D5: caller-owned LogState replaces the hidden singleton
pub fn get_log_console_level(state: &LogStateRef) -> LogLevel {
    return state.read().unwrap().console_level;
}

/// Returns the current global minimum emit level.
// flight-lint: allow(conform-params) D5: caller-owned LogState replaces the hidden singleton
pub fn get_log_level(state: &LogStateRef) -> LogLevel {
    return state.read().unwrap().level;
}

/// Returns the canonical lowercase name for a LogLevel value.
pub fn get_log_level_name(level: LogLevel) -> &'static str {
    return level_name(level);
}

/// Writes the captured log entries from a memory sink into `out` (cleared first) in insertion
/// order (oldest-first).
// flight-lint: allow(conform-params) D24 (Principal 21f7557f): the entries fill a caller-owned out, cleared first
pub fn get_memory_log_sink_entries(out: &mut Vec<LogEntry>, handle: &MemoryLogSink) {
    out.clear();
    let s = handle.state.lock().unwrap();
    let head = s.head;
    out.extend_from_slice(&s.buf[head..]);
    out.extend_from_slice(&s.buf[..head]);
}

// D12 allocation bootstrap: each sink and context initializer replaces every field. The inert sink
// placeholder is never observable through the public API.
fn inert_log_sink() -> LogSink {
    return Arc::new(|_: &LogEntry| {});
}

fn level_by_name(name: &str) -> Option<LogLevel> {
    return match name {
        "none" => Some(LogLevel::None),
        "error" => Some(LogLevel::Error),
        "warn" => Some(LogLevel::Warn),
        "info" => Some(LogLevel::Info),
        "debug" => Some(LogLevel::Debug),
        "verbose" => Some(LogLevel::Verbose),
        _ => None,
    };
}

fn level_name(level: LogLevel) -> &'static str {
    return match level {
        LogLevel::None => "none",
        LogLevel::Error => "error",
        LogLevel::Warn => "warn",
        LogLevel::Info => "info",
        LogLevel::Debug => "debug",
        LogLevel::Verbose => "verbose",
    };
}

/// Emits a log entry at an explicit level.
// flight-lint: allow(conform-params) D5: caller-owned LogState and injected now_ms replace the hidden singleton and clock
pub fn log(state: &LogStateRef, now_ms: f64, level: LogLevel, data: LogDataOrProvider, channel: Option<String>) {
    if !passes_level_gate(state, level, &channel) {
        return;
    }
    let resolved = resolve_data(data);
    let merged = merge_span_fields(state, resolved);
    emit_to_sinks(
        state,
        &LogEntry {
            level,
            channel,
            data: merged,
            timestamp_ms: now_ms,
        },
    );
}

/// Emits an Error-level entry only when condition is false.
// flight-lint: allow(conform-params) D5: caller-owned LogState and injected now_ms replace the hidden singleton and clock
pub fn log_assert(state: &LogStateRef, now_ms: f64, condition: bool, data: LogDataOrProvider, channel: Option<String>) {
    if condition {
        return;
    }
    if !passes_level_gate(state, LogLevel::Error, &channel) {
        return;
    }
    let resolved = resolve_data(data);
    let merged = merge_span_fields(state, resolved);
    emit_to_sinks(
        state,
        &LogEntry {
            level: LogLevel::Error,
            channel,
            data: merged,
            timestamp_ms: now_ms,
        },
    );
}

/// Emits at Debug level.
// flight-lint: allow(conform-params) D5: caller-owned LogState and injected now_ms replace the hidden singleton and clock
pub fn log_debug(state: &LogStateRef, now_ms: f64, data: LogDataOrProvider, channel: Option<String>) {
    log(state, now_ms, LogLevel::Debug, data, channel);
}

/// Emits at Debug level with merged context fields.
// flight-lint: allow(conform-params) D5: caller-owned LogState and injected now_ms replace the hidden singleton and clock
pub fn log_debug_with(state: &LogStateRef, now_ms: f64, context: &LogContext, data: LogDataOrProvider) {
    emit_level(state, now_ms, LogLevel::Debug, Some(context), data);
}

/// Emits at Error level.
// flight-lint: allow(conform-params) D5: caller-owned LogState and injected now_ms replace the hidden singleton and clock
pub fn log_error(state: &LogStateRef, now_ms: f64, data: LogDataOrProvider, channel: Option<String>) {
    log(state, now_ms, LogLevel::Error, data, channel);
}

/// Emits at Error level with merged context fields.
// flight-lint: allow(conform-params) D5: caller-owned LogState and injected now_ms replace the hidden singleton and clock
pub fn log_error_with(state: &LogStateRef, now_ms: f64, context: &LogContext, data: LogDataOrProvider) {
    emit_level(state, now_ms, LogLevel::Error, Some(context), data);
}

/// Emits at Info level.
// flight-lint: allow(conform-params) D5: caller-owned LogState and injected now_ms replace the hidden singleton and clock
pub fn log_info(state: &LogStateRef, now_ms: f64, data: LogDataOrProvider, channel: Option<String>) {
    log(state, now_ms, LogLevel::Info, data, channel);
}

/// Emits at Info level with merged context fields.
// flight-lint: allow(conform-params) D5: caller-owned LogState and injected now_ms replace the hidden singleton and clock
pub fn log_info_with(state: &LogStateRef, now_ms: f64, context: &LogContext, data: LogDataOrProvider) {
    emit_level(state, now_ms, LogLevel::Info, Some(context), data);
}

/// Emits a given key at most once per state lifetime.
// flight-lint: allow(conform-params) D5: caller-owned LogState and injected now_ms replace the hidden singleton and clock
pub fn log_once(
    state: &LogStateRef,
    now_ms: f64,
    key: &str,
    level: LogLevel,
    data: LogDataOrProvider,
    channel: Option<String>,
) -> bool {
    let already = {
        let mut current = state.write().unwrap();
        if current.once_keys.contains(key) {
            true
        } else {
            current.once_keys.insert(key.to_string());
            false
        }
    };
    if already {
        return false;
    }
    log(state, now_ms, level, data, channel);
    return true;
}

fn log_value_to_json(value: &LogValue) -> String {
    return match value {
        LogValue::Null => "null".to_string(),
        LogValue::Bool(b) => {
            if *b {
                "true".to_string()
            } else {
                "false".to_string()
            }
        }
        LogValue::Int(n) => n.to_string(),
        LogValue::Float(f) => {
            if f.fract() == 0.0 && f.is_finite() {
                format!("{:.1}", f)
            } else {
                f.to_string()
            }
        }
        LogValue::Str(s) => format!("\"{}\"", escape_json_string(s)),
        LogValue::Record(map) => {
            let mut entries: Vec<String> = Vec::new();
            let mut keys: Vec<&String> = map.keys().collect();
            keys.sort();
            for k in keys {
                entries.push(format!("\"{}\":{}", escape_json_string(k), log_value_to_json(&map[k])));
            }
            format!("{{{}}}", entries.join(","))
        }
        LogValue::Array(arr) => {
            let items: Vec<String> = arr.iter().map(|v| log_value_to_json(v)).collect();
            format!("[{}]", items.join(","))
        }
        LogValue::Object(value) => format!(
            "\"{}\"",
            escape_json_string(&unknown_to_js_string(&Some(value.clone())))
        ),
    };
}

/// Emits at Verbose level.
// flight-lint: allow(conform-params) D5: caller-owned LogState and injected now_ms replace the hidden singleton and clock
pub fn log_verbose(state: &LogStateRef, now_ms: f64, data: LogDataOrProvider, channel: Option<String>) {
    log(state, now_ms, LogLevel::Verbose, data, channel);
}

/// Emits at Verbose level with merged context fields.
// flight-lint: allow(conform-params) D5: caller-owned LogState and injected now_ms replace the hidden singleton and clock
pub fn log_verbose_with(state: &LogStateRef, now_ms: f64, context: &LogContext, data: LogDataOrProvider) {
    emit_level(state, now_ms, LogLevel::Verbose, Some(context), data);
}

/// Emits at Warn level.
// flight-lint: allow(conform-params) D5: caller-owned LogState and injected now_ms replace the hidden singleton and clock
pub fn log_warn(state: &LogStateRef, now_ms: f64, data: LogDataOrProvider, channel: Option<String>) {
    log(state, now_ms, LogLevel::Warn, data, channel);
}

/// Emits at Warn level with merged context fields.
// flight-lint: allow(conform-params) D5: caller-owned LogState and injected now_ms replace the hidden singleton and clock
pub fn log_warn_with(state: &LogStateRef, now_ms: f64, context: &LogContext, data: LogDataOrProvider) {
    emit_level(state, now_ms, LogLevel::Warn, Some(context), data);
}

/// Emits a log entry using the bound channel and merged fields from a LogContext.
// flight-lint: allow(conform-params) D5: caller-owned LogState and injected now_ms replace the hidden singleton and clock
pub fn log_with(state: &LogStateRef, now_ms: f64, context: &LogContext, level: LogLevel, data: LogDataOrProvider) {
    emit_level(state, now_ms, level, Some(context), data);
}

fn merge_context_fields(context: &LogContext, data: LogData) -> LogData {
    if context.fields.is_empty() {
        return data;
    }
    return match data {
        LogData::Message(msg) => {
            let mut fields = context.fields.clone();
            fields.insert("msg".to_string(), LogValue::Str(msg));
            LogData::Record(fields)
        }
        LogData::Record(mut rec) => {
            for (k, v) in context.fields.iter() {
                if !rec.contains_key(k) {
                    rec.insert(k.clone(), v.clone());
                }
            }
            LogData::Record(rec)
        }
    };
}

fn merge_span_fields(state: &LogStateRef, data: LogData) -> LogData {
    let spans = state.read().unwrap().spans.clone();
    if spans.is_empty() {
        return data;
    }
    let mut span_fields: HashMap<String, LogValue> = HashMap::new();
    for span in spans.iter() {
        for (k, v) in span.fields.iter() {
            span_fields.insert(k.clone(), v.clone());
        }
    }
    if span_fields.is_empty() {
        return data;
    }
    return match data {
        LogData::Message(msg) => {
            span_fields.insert("msg".to_string(), LogValue::Str(msg));
            LogData::Record(span_fields)
        }
        LogData::Record(mut rec) => {
            for (k, v) in span_fields {
                if !rec.contains_key(&k) {
                    rec.insert(k, v);
                }
            }
            LogData::Record(rec)
        }
    };
}

/// Parses a level name (case-insensitive) back to a LogLevel.
pub fn parse_log_level(name: &str) -> Option<LogLevel> {
    return level_by_name(&name.to_lowercase());
}

fn passes_level_gate(state: &LogStateRef, level: LogLevel, channel: &Option<String>) -> bool {
    let current = state.read().unwrap();
    if current.sinks.is_empty() && current.signals.is_none() {
        return false;
    }
    let gate = match channel {
        Some(ch) => current
            .channel_levels
            .get(ch)
            .copied()
            .unwrap_or(current.level),
        None => current.level,
    };
    return level <= gate && level != LogLevel::None;
}

fn redact_path(obj: &mut HashMap<String, LogValue>, parts: &[&str], idx: usize) {
    let key = parts[idx];
    if !obj.contains_key(key) {
        return;
    }
    if idx == parts.len() - 1 {
        obj.insert(key.to_string(), LogValue::Str("[REDACTED]".to_string()));
        return;
    }
    let should_recurse = matches!(obj.get(key), Some(LogValue::Record(_)));
    if should_recurse {
        if let Some(LogValue::Record(inner)) = obj.remove(key) {
            let mut inner_copy = inner;
            redact_path(&mut inner_copy, parts, idx + 1);
            obj.insert(key.to_string(), LogValue::Record(inner_copy));
        }
    }
}

/// Registers a custom serializer for a named kind.
// flight-lint: allow(conform-params) D5: caller-owned LogState replaces the hidden singleton
// flight-lint: allow(conform-params) D5: caller-owned LogState replaces the hidden singleton
pub fn register_log_serializer(state: &LogStateRef, kind: &str, func: LogSerializer) {
    state.write().unwrap().serializers.insert(kind.to_string(), func);
}

/// Removes a sink from the fan-out list. Returns false if not present.
// flight-lint: allow(conform-params) D5: caller-owned LogState replaces the hidden singleton
pub fn remove_log_sink(state: &LogStateRef, sink: &LogSink) -> bool {
    let mut current = state.write().unwrap();
    if let Some(idx) = current.sinks.iter().position(|existing| Arc::ptr_eq(existing, sink)) {
        current.sinks.remove(idx);
        return true;
    }
    return false;
}

fn resolve_data(data: LogDataOrProvider) -> LogData {
    return match data {
        LogDataOrProvider::Data(d) => d,
        LogDataOrProvider::Provider(p) => p(),
    };
}

/// Extracts name/message from an error string into a record.
pub fn serialize_log_error(value: &str) -> HashMap<String, LogValue> {
    let mut result = HashMap::new();
    result.insert("value".to_string(), LogValue::Str(value.to_string()));
    return result;
}

/// Sets a per-channel minimum emit level.
// flight-lint: allow(conform-params) D5: caller-owned LogState replaces the hidden singleton
pub fn set_log_channel_level(state: &LogStateRef, channel: &str, level: LogLevel) {
    state.write().unwrap().channel_levels.insert(channel.to_string(), level);
}

/// Sets the console threshold level.
// flight-lint: allow(conform-params) D5: caller-owned LogState replaces the hidden singleton
pub fn set_log_console_level(state: &LogStateRef, level: LogLevel) {
    state.write().unwrap().console_level = level;
}

/// Sets the global minimum emit level.
// flight-lint: allow(conform-params) D5: caller-owned LogState replaces the hidden singleton
pub fn set_log_level(state: &LogStateRef, level: LogLevel) {
    state.write().unwrap().level = level;
}

/// Sets the redaction paths applied by the JSON formatter.
// flight-lint: allow(conform-params) D5: caller-owned LogState replaces the hidden singleton
pub fn set_log_redaction_paths(state: &LogStateRef, paths: &[String]) {
    let mut current = state.write().unwrap();
    current.redaction_paths.clear();
    for path in paths {
        current.redaction_paths.push(path.clone());
    }
}

/// Installs (or clears, with None) the single sink.
// flight-lint: allow(conform-params) D5: caller-owned LogState replaces the hidden singleton
pub fn set_log_sink(state: &LogStateRef, sink: Option<LogSink>) {
    let mut current = state.write().unwrap();
    current.sinks.clear();
    if let Some(sink) = sink {
        current.sinks.push(sink);
    }
}

pub(crate) fn signals_entity_runtime(signals: &LogSignals) -> &EntityRuntimeSlot {
    return &signals.runtime;
}

pub(crate) fn signals_entity_runtime_mut(signals: &mut LogSignals) -> &mut EntityRuntimeSlot {
    return &mut signals.runtime;
}

pub(crate) fn span_entity_runtime(span: &LogSpan) -> &EntityRuntimeSlot {
    return &span.runtime;
}

pub(crate) fn span_entity_runtime_mut(span: &mut LogSpan) -> &mut EntityRuntimeSlot {
    return &mut span.runtime;
}

/// Starts a named timer.
// flight-lint: allow(conform-params) D5: injected now_ms replaces the hidden clock
pub fn start_log_timer(label: &str, channel: Option<String>, now_ms: f64) -> LogTimer {
    return LogTimer {
        label: label.to_string(),
        channel,
        started_at: now_ms,
    };
}

// The console vocabulary operation `write_console(level, text)` (ir-vocabulary; Principal 2d987bb9):
// the console is a language-runtime built-in, and this is the SDK's single sanctioned print site.
// Natively the `log`, `info` and `debug` methods write stdout and `warn` and `error` write stderr; TS
// lowers it to `console[method](text)`. An I/O error on the stream is ignored, as any native console
// write's would be.
fn write_console(level: LogLevel, text: &str) {
    let _ = match console_method(level) {
        ConsoleMethod::Error | ConsoleMethod::Warn => writeln!(io::stderr().lock(), "{}", text),
        ConsoleMethod::Debug | ConsoleMethod::Info | ConsoleMethod::Log => {
            writeln!(io::stdout().lock(), "{}", text)
        }
    };
}

// The source `_writeConsoleLogEntry`: formats the entry, then writes it at its level. `write` is
// `write_console`, or the test hook. No lock is held while the formatter or the write runs.
fn write_console_log_entry(
    entry: &LogEntry,
    formatter: &LogFormatter,
    write: &dyn Fn(LogLevel, &str),
) {
    let line = formatter(entry);
    write(entry.level, &line);
}

impl fmt::Debug for LogValue {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        return match self {
            LogValue::Null => formatter.write_str("Null"),
            LogValue::Bool(value) => formatter.debug_tuple("Bool").field(value).finish(),
            LogValue::Int(value) => formatter.debug_tuple("Int").field(value).finish(),
            LogValue::Float(value) => formatter.debug_tuple("Float").field(value).finish(),
            LogValue::Str(value) => formatter.debug_tuple("Str").field(value).finish(),
            LogValue::Record(value) => formatter.debug_tuple("Record").field(value).finish(),
            LogValue::Array(value) => formatter.debug_tuple("Array").field(value).finish(),
            LogValue::Object(value) => formatter
                .debug_tuple("Object")
                .field(&unknown_to_js_string(&Some(value.clone())))
                .finish(),
        };
    }
}

impl Default for LogLevel {
    fn default() -> Self {
        return LogLevel::None;
    }
}

impl Default for LogState {
    fn default() -> Self {
        return LogState {
            sinks: Vec::new(),
            level: LogLevel::Verbose,
            console_level: LogLevel::Info,
            channel_levels: HashMap::new(),
            once_keys: HashSet::new(),
            redaction_paths: Vec::new(),
            serializers: HashMap::new(),
            group_depth: 0,
            spans: Vec::new(),
            signals: None,
            next_span_id: 1,
            runtime: EntityRuntimeSlot::default(),
        };
    }
}

impl Default for BufferedLogSink {
    fn default() -> Self {
        return BufferedLogSink {
            sink: inert_log_sink(),
            state: Arc::new(Mutex::new(BufferedLogSinkState {
                buf: Vec::new(),
                target: inert_log_sink(),
                size: 0,
                interval_ms: 0.0,
                last_flush_ms: None,
            })),
            runtime: EntityRuntimeSlot::default(),
        };
    }
}

impl Default for LogContext {
    fn default() -> Self {
        return LogContext {
            channel: None,
            fields: HashMap::new(),
            runtime: EntityRuntimeSlot::default(),
        };
    }
}

impl Default for LogSpan {
    fn default() -> Self {
        return LogSpan {
            id: 0,
            name: String::new(),
            channel: None,
            fields: HashMap::new(),
            runtime: EntityRuntimeSlot::default(),
        };
    }
}

impl Default for MemoryLogSink {
    fn default() -> Self {
        return MemoryLogSink {
            sink: inert_log_sink(),
            state: Arc::new(Mutex::new(MemoryLogSinkState {
                buf: Vec::new(),
                head: 0,
                capacity: 0,
            })),
            runtime: EntityRuntimeSlot::default(),
        };
    }
}

impl Default for RateLimitedLogSink {
    fn default() -> Self {
        return RateLimitedLogSink {
            sink: inert_log_sink(),
            runtime: EntityRuntimeSlot::default(),
        };
    }
}

impl From<LogData> for LogDataOrProvider {
    fn from(data: LogData) -> Self {
        return LogDataOrProvider::Data(data);
    }
}

impl From<&str> for LogDataOrProvider {
    fn from(s: &str) -> Self {
        return LogDataOrProvider::Data(LogData::Message(s.to_string()));
    }
}

impl From<String> for LogDataOrProvider {
    fn from(s: String) -> Self {
        return LogDataOrProvider::Data(LogData::Message(s));
    }
}

impl flight_entity::Entity for LogContext {
    fn entity_runtime(&self) -> &EntityRuntimeSlot {
        return context_entity_runtime(self);
    }
    fn entity_runtime_mut(&mut self) -> &mut EntityRuntimeSlot {
        return context_entity_runtime_mut(self);
    }
}

impl flight_entity::Entity for LogSpan {
    fn entity_runtime(&self) -> &EntityRuntimeSlot {
        return span_entity_runtime(self);
    }
    fn entity_runtime_mut(&mut self) -> &mut EntityRuntimeSlot {
        return span_entity_runtime_mut(self);
    }
}

impl flight_entity::Entity for LogSignals {
    fn entity_runtime(&self) -> &EntityRuntimeSlot {
        return signals_entity_runtime(self);
    }
    fn entity_runtime_mut(&mut self) -> &mut EntityRuntimeSlot {
        return signals_entity_runtime_mut(self);
    }
}

flight_entity::impl_entity!(LogState);
flight_entity::impl_entity!(MemoryLogSink);
flight_entity::impl_entity!(BufferedLogSink);
flight_entity::impl_entity!(RateLimitedLogSink);
