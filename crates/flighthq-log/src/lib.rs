//! flighthq-log
//!
//! Leveled, capture-aware logging: structured entries fanned out to multiple sinks, level gating,
//! contexts/spans/groups/timers, sink combinators, formatters, redaction, serializers, and a
//! transport-backend seam.
//!
//! Logging is split into two faces of one contract so each consumer tree-shakes its half:
//!
//! **Emit side** — `log` and the `log_*` wrappers. Featherweight: each checks the level gate and
//! forwards an entry to the installed sinks. A build that never installs a sink carries only the
//! forwarder and `LogLevel`; the listener-side code drops away.
//!
//! **Listener side** — `create_console_capture_sink`, sink management (`add_log_sink` /
//! `remove_log_sink`), formatters, and sink combinators. Imported by tools (the examples, the
//! capture harness). This is where levels gate output.
//!
//! Port note: the TS package uses module-global state (a single process-wide sink list, level,
//! group depth, span stack, etc.). The Rust port mirrors that exactly with a single global
//! [`Mutex`]-guarded state, so the free functions match the TS signatures 1:1 (no `&Log` handle).

use std::collections::HashMap;
use std::sync::{Arc, LazyLock, Mutex};
use std::time::{SystemTime, UNIX_EPOCH};

use flighthq_signals::{Signal, create_signal, emit_signal};

// ---------------------------------------------------------------------------
// Public value types
// ---------------------------------------------------------------------------

/// Severity level. Doubles as a verbosity threshold. Console output shows an entry when the
/// configured console level is at or above the entry's level (so `Error` surfaces first, `Verbose`
/// only at the top). `None` disables console output. The capture sink receives every level
/// regardless of the console threshold — the machine record is always complete.
#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub enum LogLevel {
    None = 0,
    Error = 1,
    Warn = 2,
    Info = 3,
    Debug = 4,
    Verbose = 5,
}

/// A JSON-like value used inside structured [`LogData`] records. Supports nested objects so the
/// JSON formatter can apply dot-notation redaction and `__kind` serializers to nested fields.
#[derive(Clone, Debug, PartialEq)]
pub enum LogValue {
    Null,
    Bool(bool),
    Number(f64),
    String(String),
    Array(Vec<LogValue>),
    Object(LogRecord),
}

/// An insertion-ordered string-keyed record. Ordering is preserved so JSON output mirrors the TS
/// `Object.entries` / spread order.
#[derive(Clone, Debug, Default, PartialEq)]
pub struct LogRecord {
    entries: Vec<(String, LogValue)>,
}

/// A log payload: a plain message string or a structured key/value record.
#[derive(Clone, Debug, PartialEq)]
pub enum LogData {
    Message(String),
    Record(LogRecord),
}

/// One emitted log entry. `channel` is a free categorization tag (for example `"batch"`,
/// `"shader"`, `"user"`) used to filter captured output; `None` when uncategorized.
#[derive(Clone, Debug, PartialEq)]
pub struct LogEntry {
    pub level: LogLevel,
    pub channel: Option<String>,
    pub data: LogData,
}

/// Receives every emitted entry. The capture harness installs one to record structured output;
/// tests install one to assert.
pub type LogSink = Arc<dyn Fn(&LogEntry) + Send + Sync>;

/// Turns an entry into a single line of text (one JSON line, one human line, etc.).
pub type LogFormatter = Arc<dyn Fn(&LogEntry) -> String + Send + Sync>;

/// A lazily-resolved data provider. Not called unless the entry passes the level gate, so a
/// suppressed verbose call is allocation-free.
pub type LogDataProvider = Box<dyn FnOnce() -> LogData>;

/// A bound logging context: a channel plus base fields merged into every entry emitted with it.
#[derive(Clone, Debug, Default, PartialEq)]
pub struct LogContext {
    pub channel: Option<String>,
    pub fields: LogRecord,
}

/// A named tracing span. A plain value — not active until [`enter_log_span`] is called. While
/// active, its fields are merged into every emitted entry.
#[derive(Clone, Debug, PartialEq)]
pub struct LogSpan {
    pub name: String,
    pub fields: LogRecord,
    pub channel: Option<String>,
}

/// A running timer. Pass to [`end_log_timer`] to record elapsed time.
#[derive(Clone, Debug, PartialEq)]
pub struct LogTimer {
    pub label: String,
    pub channel: Option<String>,
    pub started_at: f64,
}

/// The signals group enabled by [`enable_log_signals`].
#[derive(Clone)]
pub struct LogSignals {
    pub on_log_entry: Signal<LogEntry>,
    pub on_log_error: Signal<LogEntry>,
}

/// A transport backend used by [`create_file_log_sink`] to write formatted lines. Native/Node hosts
/// register a real fs-backed implementation; the web default is a no-op.
pub trait LogTransportBackend: Send + Sync {
    fn write(&self, line: &str);
    /// Flushes any buffered output. Default: no-op.
    fn flush(&self) {}
    /// Releases the backend resource. Default: no-op.
    fn dispose(&self) {}
}

/// Opaque handle returned by [`create_buffered_log_sink`]. Carry it to flush/dispose the sink.
#[derive(Clone)]
pub struct BufferedLogSink {
    pub sink: LogSink,
    id: u64,
}

/// Opaque handle returned by [`create_file_log_sink`]. The `sink` field is installed via
/// [`add_log_sink`] / [`set_log_sink`]; call [`dispose_file_log_sink`] to flush and release.
#[derive(Clone)]
pub struct FileLogSink {
    pub sink: LogSink,
}

/// Opaque handle returned by [`create_memory_log_sink`]. Carry it to read or clear captured
/// entries.
#[derive(Clone)]
pub struct MemoryLogSink {
    pub sink: LogSink,
    id: u64,
}

/// Opaque handle returned by [`create_rate_limited_log_sink`].
#[derive(Clone)]
pub struct RateLimitedLogSink {
    pub sink: LogSink,
}

impl LogRecord {
    /// Creates an empty record.
    pub fn new() -> Self {
        LogRecord {
            entries: Vec::new(),
        }
    }

    /// Inserts or replaces `key`. A replaced key keeps its original position (matching JS object
    /// semantics where re-assigning a key does not move it).
    pub fn insert(&mut self, key: impl Into<String>, value: LogValue) {
        let key = key.into();
        if let Some(slot) = self.entries.iter_mut().find(|(k, _)| *k == key) {
            slot.1 = value;
        } else {
            self.entries.push((key, value));
        }
    }

    /// Returns the value for `key`, or `None`.
    pub fn get(&self, key: &str) -> Option<&LogValue> {
        self.entries.iter().find(|(k, _)| k == key).map(|(_, v)| v)
    }

    /// Returns `true` if `key` is present.
    pub fn contains_key(&self, key: &str) -> bool {
        self.entries.iter().any(|(k, _)| k == key)
    }

    /// Returns the number of entries.
    pub fn len(&self) -> usize {
        self.entries.len()
    }

    /// Returns `true` if the record has no entries.
    pub fn is_empty(&self) -> bool {
        self.entries.is_empty()
    }

    /// Iterates entries in insertion order.
    pub fn iter(&self) -> impl Iterator<Item = (&String, &LogValue)> {
        self.entries.iter().map(|(k, v)| (k, v))
    }
}

impl FromIterator<(String, LogValue)> for LogRecord {
    fn from_iter<I: IntoIterator<Item = (String, LogValue)>>(iter: I) -> Self {
        let mut record = LogRecord::new();
        for (k, v) in iter {
            record.insert(k, v);
        }
        record
    }
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

impl From<LogRecord> for LogData {
    fn from(record: LogRecord) -> Self {
        LogData::Record(record)
    }
}

// ---------------------------------------------------------------------------
// Exported functions (alphabetized to mirror TS)
// ---------------------------------------------------------------------------

/// Listener side. Adds a sink to the fan-out list. No-op if already present (by `Arc` identity).
pub fn add_log_sink(sink: LogSink) {
    let mut state = state();
    if state.sinks.iter().any(|s| Arc::ptr_eq(s, &sink)) {
        return;
    }
    state.sinks.push(sink);
}

/// Opens a named log group. All entries emitted while open carry a `depth` field; the text
/// formatter indents them. Groups nest. Pair with [`end_log_group`].
pub fn begin_log_group(label: &str, channel: Option<&str>) {
    let (entry, snapshot) = {
        let mut state = state();
        state.group_depth += 1;
        let depth = state.group_depth;
        if !state.passes_level_gate(LogLevel::Debug, channel) {
            return;
        }
        let mut record = LogRecord::new();
        record.insert("msg", LogValue::String(label.to_owned()));
        record.insert("group", LogValue::String("begin".to_owned()));
        record.insert("depth", LogValue::Number(depth as f64));
        let entry = LogEntry {
            level: LogLevel::Debug,
            channel: channel.map(str::to_owned),
            data: LogData::Record(record),
        };
        let snapshot = state.dispatch_snapshot();
        (entry, snapshot)
    };
    dispatch_entry(&entry, snapshot);
}

/// Listener side. Clears all per-channel level overrides.
pub fn clear_log_channel_levels() {
    state().channel_levels.clear();
}

/// Resets the group nesting depth to zero without emitting. Useful for test teardown or error
/// recovery when `begin_log_group` / `end_log_group` pairing breaks down.
pub fn clear_log_groups() {
    state().group_depth = 0;
}

/// Clears all redaction paths set by [`set_log_redaction_paths`].
pub fn clear_log_redaction_paths() {
    state().redaction_paths.clear();
}

/// Clears all custom serializers set by [`register_log_serializer`].
pub fn clear_log_serializers() {
    state().serializers.clear();
}

/// Listener side. Clears all installed sinks.
pub fn clear_log_sinks() {
    state().sinks.clear();
}

/// Clears all captured entries from a memory sink.
pub fn clear_memory_log_sink(handle: &MemoryLogSink) {
    if let Some(s) = memory_sink_states().get(&handle.id) {
        let mut s = s.lock().unwrap();
        s.buf.clear();
        s.head = 0;
    }
}

/// Creates a sink that batches entries and forwards them to `target` in bulk. The buffer flushes
/// when it reaches `size` entries (default 100). The interval timer of the TS version has no
/// native analogue here — flush manually with [`flush_log_sink`] or via the size threshold.
pub fn create_buffered_log_sink(
    target: LogSink,
    size: Option<usize>,
    _interval_ms: Option<u64>,
) -> BufferedLogSink {
    let size = size.unwrap_or(100);
    let id = next_handle_id();
    buffered_sink_states().insert(id, Mutex::new(BufferedLogSinkState::new(target, size)));

    let sink: LogSink = Arc::new(move |entry: &LogEntry| {
        let to_flush = {
            let states = buffered_sink_states();
            let Some(state) = states.get(&id) else {
                return;
            };
            let mut state = state.lock().unwrap();
            state.buf.push(entry.clone());
            if state.buf.len() >= state.size {
                Some(std::mem::take(&mut state.buf))
            } else {
                None
            }
        };
        if let Some(batch) = to_flush {
            let target = buffered_target(id);
            if let Some(target) = target {
                for e in &batch {
                    target(e);
                }
            }
        }
    });
    BufferedLogSink { sink, id }
}

/// Creates a child context that inherits the parent's channel and fields. The child wins on key
/// collision. An explicit `channel` (`Some`) overrides the parent's channel; `None` inherits.
pub fn create_child_log_context(
    parent: &LogContext,
    fields: &LogRecord,
    channel: Option<Option<&str>>,
) -> LogContext {
    let mut merged = parent.fields.clone();
    for (k, v) in fields.iter() {
        merged.insert(k.clone(), v.clone());
    }
    let channel = match channel {
        Some(c) => c.map(str::to_owned),
        None => parent.channel.clone(),
    };
    LogContext {
        channel,
        fields: merged,
    }
}

/// Creates a sink that records every entry as a tagged JSON envelope, then — for levels at or above
/// the console threshold — prints a human-readable line. The envelope formatter defaults to the
/// built-in JSON envelope.
pub fn create_console_capture_sink(formatter: Option<LogFormatter>) -> LogSink {
    let formatter = formatter.unwrap_or_else(default_json_formatter);
    Arc::new(move |entry: &LogEntry| write_console_capture_entry(entry, &formatter))
}

/// Creates a fan-out sink that forwards every entry to all supplied sinks.
pub fn create_fanout_log_sink(sinks: Vec<LogSink>) -> LogSink {
    Arc::new(move |entry: &LogEntry| {
        for s in &sinks {
            s(entry);
        }
    })
}

/// Creates a sink that writes formatted entries to the installed [`LogTransportBackend`]. The
/// backend is resolved at emit time. The formatter defaults to [`create_json_log_formatter`].
pub fn create_file_log_sink(formatter: Option<LogFormatter>) -> FileLogSink {
    let formatter = formatter.unwrap_or_else(create_json_log_formatter);
    let sink: LogSink = Arc::new(move |entry: &LogEntry| {
        let backend = state().transport_backend.clone();
        if let Some(backend) = backend {
            backend.write(&(formatter(entry) + "\n"));
        }
    });
    FileLogSink { sink }
}

/// Creates a sink that forwards only entries matching `predicate`.
pub fn create_filter_log_sink(
    target: LogSink,
    predicate: Arc<dyn Fn(&LogEntry) -> bool + Send + Sync>,
) -> LogSink {
    Arc::new(move |entry: &LogEntry| {
        if predicate(entry) {
            target(entry);
        }
    })
}

/// Creates a formatter that produces the `__flight` JSON envelope used by the capture harness.
/// Field redaction and custom serializers are applied during formatting.
pub fn create_json_log_formatter() -> LogFormatter {
    Arc::new(|entry: &LogEntry| {
        let serialized = {
            let st = state();
            let record = data_to_record(&entry.data);
            let serialized = st.apply_serializers(&record);
            if st.redaction_paths.is_empty() {
                serialized
            } else {
                st.apply_redaction(&serialized)
            }
        };
        let data = LogValue::Object(serialized);
        format!(
            "{{\"__flight\":true,\"t\":{},\"level\":{},\"channel\":{},\"data\":{}}}",
            json_number(timestamp()),
            json_string(entry.level.as_str()),
            channel_json(&entry.channel),
            value_to_json(&data),
        )
    })
}

/// Creates a bound logging context with a channel and optional base fields.
pub fn create_log_context(channel: Option<&str>, fields: LogRecord) -> LogContext {
    LogContext {
        channel: channel.map(str::to_owned),
        fields,
    }
}

/// Creates a named tracing span. The returned [`LogSpan`] is a plain value — not active until
/// [`enter_log_span`] is called.
pub fn create_log_span(name: &str, fields: LogRecord, channel: Option<&str>) -> LogSpan {
    LogSpan {
        name: name.to_owned(),
        fields,
        channel: channel.map(str::to_owned),
    }
}

/// Creates a sink that captures the last `capacity` entries in a ring buffer. Read with
/// [`get_memory_log_sink_entries`] and reset with [`clear_memory_log_sink`].
pub fn create_memory_log_sink(capacity: usize) -> MemoryLogSink {
    let id = next_handle_id();
    memory_sink_states().insert(id, Mutex::new(MemoryLogSinkState::new(capacity)));
    let sink: LogSink = Arc::new(move |entry: &LogEntry| {
        if let Some(state) = memory_sink_states().get(&id) {
            let mut state = state.lock().unwrap();
            let capacity = state.capacity;
            if capacity == 0 {
                return;
            }
            if state.buf.len() < capacity {
                state.buf.push(entry.clone());
            } else {
                let head = state.head;
                state.buf[head] = entry.clone();
                state.head = (head + 1) % capacity;
            }
        }
    });
    MemoryLogSink { sink, id }
}

/// Creates a sink that forwards at most `max_per_interval` entries per `interval_ms` window. When
/// `per_channel` is `true`, the budget is tracked per channel independently.
pub fn create_rate_limited_log_sink(
    target: LogSink,
    per_channel: bool,
    max_per_interval: u64,
    interval_ms: f64,
) -> RateLimitedLogSink {
    let inner = Mutex::new(RateLimitState {
        counts: HashMap::new(),
        window_start: timestamp(),
    });
    let sink: LogSink = Arc::new(move |entry: &LogEntry| {
        let now = timestamp();
        let mut s = inner.lock().unwrap();
        if now - s.window_start >= interval_ms {
            s.counts.clear();
            s.window_start = now;
        }
        let key = if per_channel {
            entry.channel.clone()
        } else {
            None
        };
        let current = *s.counts.get(&key).unwrap_or(&0);
        if current >= max_per_interval {
            return;
        }
        s.counts.insert(key, current + 1);
        target(entry);
    });
    RateLimitedLogSink { sink }
}

/// Creates a sink that forwards approximately 1-in-`rate` entries. When `rate <= 1`, returns
/// `target` unchanged.
pub fn create_sampled_log_sink(target: LogSink, rate: u64) -> LogSink {
    if rate <= 1 {
        return target;
    }
    let counter = Mutex::new(0u64);
    Arc::new(move |entry: &LogEntry| {
        let mut c = counter.lock().unwrap();
        *c = (*c + 1) % rate;
        if *c == 0 {
            target(entry);
        }
    })
}

/// Creates a formatter that produces a human-readable `[channel] message` line. When
/// `indent_groups` is `true`, indents by the current group depth.
pub fn create_text_log_formatter(
    indent_groups: bool,
    level_prefix: bool,
    timestamp_prefix: bool,
) -> LogFormatter {
    Arc::new(move |entry: &LogEntry| {
        let mut parts: Vec<String> = Vec::new();
        if timestamp_prefix {
            parts.push(format!("t={:.2}", timestamp()));
        }
        if level_prefix {
            parts.push(entry.level.as_str().to_owned());
        }
        parts.push(match &entry.channel {
            Some(c) => format!("[{}]", c),
            None => "[flight]".to_owned(),
        });
        let depth = state().group_depth;
        if indent_groups && depth > 0 {
            parts.push("  ".repeat(depth));
        }
        match &entry.data {
            LogData::Message(msg) => parts.push(msg.clone()),
            LogData::Record(record) => parts.push(value_to_json(&LogValue::Object(record.clone()))),
        }
        parts.join(" ")
    })
}

/// Creates a no-op web transport backend. Native/Node hosts register a real fs-backed one via
/// [`set_log_transport_backend`].
pub fn create_web_log_transport_backend() -> Arc<dyn LogTransportBackend> {
    Arc::new(NoopTransportBackend)
}

/// Flushes the installed transport backend immediately, then disposes it.
pub fn dispose_file_log_sink(_handle: &FileLogSink) {
    let backend = state().transport_backend.clone();
    if let Some(backend) = backend {
        backend.flush();
        backend.dispose();
    }
}

/// Disposes a buffered sink: flushes remaining entries. The sink remains callable.
pub fn dispose_log_sink(handle: &BufferedLogSink) {
    let (batch, target) = {
        let states = buffered_sink_states();
        let Some(state) = states.get(&handle.id) else {
            return;
        };
        let mut state = state.lock().unwrap();
        (std::mem::take(&mut state.buf), state.target.clone())
    };
    for e in &batch {
        target(e);
    }
}

/// Enables the log signals group. Returns the process-global [`LogSignals`]; subsequent calls
/// return the same signals.
pub fn enable_log_signals() -> LogSignals {
    let mut state = state();
    if let Some(signals) = &state.signals {
        return signals.clone();
    }
    let signals = LogSignals {
        on_log_entry: create_signal(),
        on_log_error: create_signal(),
    };
    state.signals = Some(signals.clone());
    signals
}

/// Closes the innermost open log group, emitting a Debug group-end entry. No-op if none is open.
pub fn end_log_group(channel: Option<&str>) {
    let (entry, snapshot) = {
        let mut state = state();
        if state.group_depth == 0 {
            return;
        }
        state.group_depth -= 1;
        let depth = state.group_depth;
        if !state.passes_level_gate(LogLevel::Debug, channel) {
            return;
        }
        let mut record = LogRecord::new();
        record.insert("group", LogValue::String("end".to_owned()));
        record.insert("depth", LogValue::Number((depth + 1) as f64));
        let entry = LogEntry {
            level: LogLevel::Debug,
            channel: channel.map(str::to_owned),
            data: LogData::Record(record),
        };
        let snapshot = state.dispatch_snapshot();
        (entry, snapshot)
    };
    dispatch_entry(&entry, snapshot);
}

/// Ends a timer, emits a structured Debug entry with the elapsed milliseconds, and returns the
/// elapsed time in milliseconds.
pub fn end_log_timer(timer: &LogTimer) -> f64 {
    let elapsed = timestamp() - timer.started_at;
    let mut record = LogRecord::new();
    record.insert("label", LogValue::String(timer.label.clone()));
    record.insert("elapsedMs", LogValue::Number(elapsed));
    log_debug(LogData::Record(record), timer.channel.as_deref());
    elapsed
}

/// Activates a log span, pushing it onto the active-span stack. Pair with [`exit_log_span`].
pub fn enter_log_span(span: &LogSpan) {
    state().span_stack.push(span.clone());
}

/// Deactivates a log span, removing it from the stack by identity (name + fields + channel).
/// Supports out-of-order unwinding. No-op if not present.
pub fn exit_log_span(span: &LogSpan) {
    let mut state = state();
    if let Some(idx) = state.span_stack.iter().position(|s| s == span) {
        state.span_stack.remove(idx);
    }
}

/// Flushes a buffered sink immediately, forwarding all queued entries to its target.
pub fn flush_log_sink(handle: &BufferedLogSink) {
    let (batch, target) = {
        let states = buffered_sink_states();
        let Some(state) = states.get(&handle.id) else {
            return;
        };
        let mut state = state.lock().unwrap();
        (std::mem::take(&mut state.buf), state.target.clone())
    };
    for e in &batch {
        target(e);
    }
}

/// Listener side. Per-channel level override, or `None` when the channel inherits the global level.
pub fn get_log_channel_level(channel: &str) -> Option<LogLevel> {
    state().channel_levels.get(channel).copied()
}

/// Listener side. Reads the human-readable console threshold (default `LogLevel::Info`).
pub fn get_log_console_level() -> LogLevel {
    state().console_level
}

/// Listener side. Reads the global minimum emit level (default `LogLevel::Verbose`).
pub fn get_log_level() -> LogLevel {
    state().level
}

/// Listener side. Returns the canonical lowercase name for a [`LogLevel`].
pub fn get_log_level_name(level: LogLevel) -> String {
    level.as_str().to_owned()
}

/// Returns the installed transport backend, or `None`.
pub fn get_log_transport_backend() -> Option<Arc<dyn LogTransportBackend>> {
    state().transport_backend.clone()
}

/// Returns the captured entries from a memory sink in insertion order (oldest-first).
pub fn get_memory_log_sink_entries(handle: &MemoryLogSink) -> Vec<LogEntry> {
    let states = memory_sink_states();
    let Some(state) = states.get(&handle.id) else {
        return Vec::new();
    };
    let state = state.lock().unwrap();
    if state.head == 0 {
        return state.buf.clone();
    }
    let mut out = Vec::with_capacity(state.buf.len());
    out.extend_from_slice(&state.buf[state.head..]);
    out.extend_from_slice(&state.buf[..state.head]);
    out
}

/// Emit side. Emits a log entry at an explicit level. Accepts plain data or a lazy provider — the
/// provider is not called unless the entry passes the level gate. No-ops when no sinks are
/// installed (and no signals) or when the level gate suppresses the entry.
pub fn log(level: LogLevel, data: impl Into<LogData>, channel: Option<&str>) {
    emit_resolved(level, data.into(), channel);
}

/// Emit side. Lazy-provider variant of [`log`]. The thunk runs only if the entry passes the gate.
pub fn log_lazy(level: LogLevel, provider: LogDataProvider, channel: Option<&str>) {
    let (entry, snapshot) = {
        let state = state();
        if !state.passes_level_gate(level, channel) {
            return;
        }
        let resolved = state.merge_span_fields(provider());
        let entry = LogEntry {
            level,
            channel: channel.map(str::to_owned),
            data: resolved,
        };
        let snapshot = state.dispatch_snapshot();
        (entry, snapshot)
    };
    dispatch_entry(&entry, snapshot);
}

/// Emit side. Emits an Error-level entry only when `condition` is false. Never panics.
pub fn log_assert(condition: bool, data: impl Into<LogData>, channel: Option<&str>) {
    if condition {
        return;
    }
    let (entry, snapshot) = {
        let state = state();
        if !state.passes_level_gate(LogLevel::Error, channel) {
            return;
        }
        let resolved = state.merge_span_fields(data.into());
        let entry = LogEntry {
            level: LogLevel::Error,
            channel: channel.map(str::to_owned),
            data: resolved,
        };
        let snapshot = state.dispatch_snapshot();
        (entry, snapshot)
    };
    dispatch_entry(&entry, snapshot);
}

/// Emit side. Emits at [`LogLevel::Debug`].
pub fn log_debug(data: impl Into<LogData>, channel: Option<&str>) {
    emit_resolved(LogLevel::Debug, data.into(), channel);
}

/// Emit side. Emits at [`LogLevel::Debug`] with merged context fields.
pub fn log_debug_with(context: &LogContext, data: impl Into<LogData>) {
    emit_with(context, LogLevel::Debug, data.into());
}

/// Emit side. Emits at [`LogLevel::Error`].
pub fn log_error(data: impl Into<LogData>, channel: Option<&str>) {
    emit_resolved(LogLevel::Error, data.into(), channel);
}

/// Emit side. Emits at [`LogLevel::Error`] with merged context fields.
pub fn log_error_with(context: &LogContext, data: impl Into<LogData>) {
    emit_with(context, LogLevel::Error, data.into());
}

/// Emit side. Emits at [`LogLevel::Info`].
pub fn log_info(data: impl Into<LogData>, channel: Option<&str>) {
    emit_resolved(LogLevel::Info, data.into(), channel);
}

/// Emit side. Emits at [`LogLevel::Info`] with merged context fields.
pub fn log_info_with(context: &LogContext, data: impl Into<LogData>) {
    emit_with(context, LogLevel::Info, data.into());
}

/// Emit side. Emits a given key at most once per process lifetime. Returns `true` if emitted,
/// `false` if suppressed.
pub fn log_once(
    key: &str,
    level: LogLevel,
    data: impl Into<LogData>,
    channel: Option<&str>,
) -> bool {
    {
        let mut state = state();
        if state.once_keys.contains(key) {
            return false;
        }
        state.once_keys.insert(key.to_owned());
    }
    log(level, data, channel);
    true
}

/// Emit side. Emits at [`LogLevel::Verbose`].
pub fn log_verbose(data: impl Into<LogData>, channel: Option<&str>) {
    emit_resolved(LogLevel::Verbose, data.into(), channel);
}

/// Emit side. Emits at [`LogLevel::Verbose`] with merged context fields.
pub fn log_verbose_with(context: &LogContext, data: impl Into<LogData>) {
    emit_with(context, LogLevel::Verbose, data.into());
}

/// Emit side. Emits at [`LogLevel::Warn`].
pub fn log_warn(data: impl Into<LogData>, channel: Option<&str>) {
    emit_resolved(LogLevel::Warn, data.into(), channel);
}

/// Emit side. Emits at [`LogLevel::Warn`] with merged context fields.
pub fn log_warn_with(context: &LogContext, data: impl Into<LogData>) {
    emit_with(context, LogLevel::Warn, data.into());
}

/// Emit side. Emits using the bound channel and merged fields of a [`LogContext`].
pub fn log_with(context: &LogContext, level: LogLevel, data: impl Into<LogData>) {
    emit_with(context, level, data.into());
}

/// Listener side. Parses a level name (case-insensitive) back to a [`LogLevel`]. Returns `None`
/// for unknown names.
pub fn parse_log_level(name: &str) -> Option<LogLevel> {
    match name.to_lowercase().as_str() {
        "none" => Some(LogLevel::None),
        "error" => Some(LogLevel::Error),
        "warn" => Some(LogLevel::Warn),
        "info" => Some(LogLevel::Info),
        "debug" => Some(LogLevel::Debug),
        "verbose" => Some(LogLevel::Verbose),
        _ => None,
    }
}

/// Registers a custom serializer for a named `kind`. When the JSON formatter encounters a field
/// value whose `__kind` matches, it calls `f` to convert the value to a plain record.
/// Last-write-wins.
pub fn register_log_serializer(kind: &str, f: Arc<dyn Fn(&LogValue) -> LogRecord + Send + Sync>) {
    state().serializers.insert(kind.to_owned(), f);
}

/// Listener side. Removes a sink from the fan-out list. Returns `false` if not present.
pub fn remove_log_sink(sink: &LogSink) -> bool {
    let mut state = state();
    if let Some(idx) = state.sinks.iter().position(|s| Arc::ptr_eq(s, sink)) {
        state.sinks.remove(idx);
        true
    } else {
        false
    }
}

/// Extracts name/message/stack/cause-style fields from a structured error value (recursively) into
/// a plain record. The TS form operates on `Error`; the Rust form treats a `LogValue::Object` with
/// `name`/`message`/`stack`/`cause` fields as the error shape, and wraps anything else as
/// `{ value }`.
pub fn serialize_log_error(value: &LogValue) -> LogRecord {
    if let LogValue::Object(obj) = value
        && (obj.contains_key("name") || obj.contains_key("message"))
    {
        let mut result = LogRecord::new();
        if let Some(name) = obj.get("name") {
            result.insert("name", name.clone());
        }
        if let Some(message) = obj.get("message") {
            result.insert("message", message.clone());
        }
        if let Some(stack) = obj.get("stack") {
            result.insert("stack", stack.clone());
        }
        if let Some(cause) = obj.get("cause") {
            result.insert("cause", LogValue::Object(serialize_log_error(cause)));
        }
        return result;
    }
    let mut result = LogRecord::new();
    result.insert("value", LogValue::String(value_to_display(value)));
    result
}

/// Listener side. Sets a per-channel minimum emit level. Channel level wins over global.
pub fn set_log_channel_level(channel: &str, level: LogLevel) {
    state().channel_levels.insert(channel.to_owned(), level);
}

/// Listener side. Sets the highest level printed as a human-readable console line.
pub fn set_log_console_level(level: LogLevel) {
    state().console_level = level;
}

/// Listener side. Sets the global minimum emit level. Entries below are suppressed before any sink
/// work.
pub fn set_log_level(level: LogLevel) {
    state().level = level;
}

/// Sets the redaction paths applied by the JSON formatter. Paths use dot notation for nested
/// fields. An empty slice disables redaction.
pub fn set_log_redaction_paths(paths: &[&str]) {
    let mut state = state();
    state.redaction_paths.clear();
    for p in paths {
        state.redaction_paths.push((*p).to_owned());
    }
}

/// Installs (or clears, with `None`) the single sink — clears the list then adds the new sink if
/// `Some`.
pub fn set_log_sink(sink: Option<LogSink>) {
    let mut state = state();
    state.sinks.clear();
    if let Some(sink) = sink {
        state.sinks.push(sink);
    }
}

/// Sets the transport backend used by [`create_file_log_sink`]. `None` detaches it.
pub fn set_log_transport_backend(backend: Option<Arc<dyn LogTransportBackend>>) {
    state().transport_backend = backend;
}

/// Starts a named timer. Pass the returned [`LogTimer`] to [`end_log_timer`].
pub fn start_log_timer(label: &str, channel: Option<&str>) -> LogTimer {
    LogTimer {
        label: label.to_owned(),
        channel: channel.map(str::to_owned),
        started_at: timestamp(),
    }
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

struct LogState {
    sinks: Vec<LogSink>,
    channel_levels: HashMap<String, LogLevel>,
    once_keys: std::collections::HashSet<String>,
    redaction_paths: Vec<String>,
    serializers: HashMap<String, Arc<dyn Fn(&LogValue) -> LogRecord + Send + Sync>>,
    span_stack: Vec<LogSpan>,
    console_level: LogLevel,
    group_depth: usize,
    level: LogLevel,
    signals: Option<LogSignals>,
    transport_backend: Option<Arc<dyn LogTransportBackend>>,
}

impl LogState {
    fn passes_level_gate(&self, level: LogLevel, channel: Option<&str>) -> bool {
        if self.sinks.is_empty() && self.signals.is_none() {
            return false;
        }
        let gate = match channel {
            Some(c) => self.channel_levels.get(c).copied().unwrap_or(self.level),
            None => self.level,
        };
        level <= gate && level != LogLevel::None
    }

    fn merge_span_fields(&self, data: LogData) -> LogData {
        if self.span_stack.is_empty() {
            return data;
        }
        let mut span_fields = LogRecord::new();
        for span in &self.span_stack {
            for (k, v) in span.fields.iter() {
                span_fields.insert(k.clone(), v.clone());
            }
        }
        if span_fields.is_empty() {
            return data;
        }
        merge_fields_under(span_fields, data)
    }

    /// Snapshots the current sinks and signals so the caller can drop the `STATE` lock before
    /// firing them. Sinks (e.g. the file/console sinks) re-enter `state()`, so they must NOT run
    /// while the `STATE` guard is held — that would self-deadlock.
    fn dispatch_snapshot(&self) -> (Vec<LogSink>, Option<LogSignals>) {
        (self.sinks.clone(), self.signals.clone())
    }

    fn apply_serializers(&self, data: &LogRecord) -> LogRecord {
        if self.serializers.is_empty() {
            return data.clone();
        }
        let mut result = LogRecord::new();
        for (key, value) in data.iter() {
            if let LogValue::Object(obj) = value
                && let Some(LogValue::String(kind)) = obj.get("__kind")
                && let Some(f) = self.serializers.get(kind)
            {
                result.insert(key.clone(), LogValue::Object(f(value)));
                continue;
            }
            result.insert(key.clone(), value.clone());
        }
        result
    }

    fn apply_redaction(&self, data: &LogRecord) -> LogRecord {
        if self.redaction_paths.is_empty() {
            return data.clone();
        }
        let mut result = data.clone();
        for path in &self.redaction_paths {
            let parts: Vec<&str> = path.split('.').collect();
            redact_path(&mut result, &parts, 0);
        }
        result
    }
}

fn merge_fields_under(under: LogRecord, data: LogData) -> LogData {
    // `data` fields win over `under` fields on key collision.
    let mut result = under;
    match data {
        LogData::Message(msg) => {
            // String data becomes { msg, ...under } in TS: msg key first, then under fields, but
            // under is already the base and msg wins. TS: `{ msg: data, ...fields }` → msg first.
            let mut merged = LogRecord::new();
            merged.insert("msg", LogValue::String(msg));
            for (k, v) in result.iter() {
                merged.insert(k.clone(), v.clone());
            }
            LogData::Record(merged)
        }
        LogData::Record(record) => {
            for (k, v) in record.iter() {
                result.insert(k.clone(), v.clone());
            }
            LogData::Record(result)
        }
    }
}

fn redact_path(obj: &mut LogRecord, parts: &[&str], idx: usize) {
    if idx >= parts.len() {
        return;
    }
    let key = parts[idx];
    if !obj.contains_key(key) {
        return;
    }
    if idx == parts.len() - 1 {
        obj.insert(key, LogValue::String("[REDACTED]".to_owned()));
        return;
    }
    if let Some(LogValue::Object(next)) = obj.get(key) {
        let mut next = next.clone();
        redact_path(&mut next, parts, idx + 1);
        obj.insert(key, LogValue::Object(next));
    }
}

fn data_to_record(data: &LogData) -> LogRecord {
    match data {
        LogData::Message(msg) => {
            let mut record = LogRecord::new();
            record.insert("msg", LogValue::String(msg.clone()));
            record
        }
        LogData::Record(record) => record.clone(),
    }
}

fn merge_context_fields(context: &LogContext, data: LogData) -> LogData {
    if context.fields.is_empty() {
        return data;
    }
    // TS: string → { msg, ...fields }; record → { ...fields, ...data } (data wins).
    match data {
        LogData::Message(msg) => {
            let mut merged = LogRecord::new();
            merged.insert("msg", LogValue::String(msg));
            for (k, v) in context.fields.iter() {
                merged.insert(k.clone(), v.clone());
            }
            LogData::Record(merged)
        }
        LogData::Record(record) => {
            let mut merged = context.fields.clone();
            for (k, v) in record.iter() {
                merged.insert(k.clone(), v.clone());
            }
            LogData::Record(merged)
        }
    }
}

// Fires `entry` to a snapshot of sinks/signals taken under the `STATE` lock, AFTER the lock has
// been dropped — sinks may re-enter `state()`.
fn dispatch_entry(entry: &LogEntry, snapshot: (Vec<LogSink>, Option<LogSignals>)) {
    let (sinks, signals) = snapshot;
    for sink in &sinks {
        sink(entry);
    }
    if let Some(signals) = signals {
        emit_signal(&signals.on_log_entry, entry);
        if entry.level == LogLevel::Error {
            emit_signal(&signals.on_log_error, entry);
        }
    }
}

fn emit_resolved(level: LogLevel, data: LogData, channel: Option<&str>) {
    let (entry, snapshot) = {
        let state = state();
        if !state.passes_level_gate(level, channel) {
            return;
        }
        let resolved = state.merge_span_fields(data);
        let entry = LogEntry {
            level,
            channel: channel.map(str::to_owned),
            data: resolved,
        };
        let snapshot = state.dispatch_snapshot();
        (entry, snapshot)
    };
    dispatch_entry(&entry, snapshot);
}

fn emit_with(context: &LogContext, level: LogLevel, data: LogData) {
    let (entry, snapshot) = {
        let state = state();
        let channel = context.channel.as_deref();
        if !state.passes_level_gate(level, channel) {
            return;
        }
        let with_span = state.merge_span_fields(data);
        let merged = merge_context_fields(context, with_span);
        let entry = LogEntry {
            level,
            channel: context.channel.clone(),
            data: merged,
        };
        let snapshot = state.dispatch_snapshot();
        (entry, snapshot)
    };
    dispatch_entry(&entry, snapshot);
}

fn default_json_formatter() -> LogFormatter {
    Arc::new(|entry: &LogEntry| {
        let data = LogValue::Object(data_to_record(&entry.data));
        format!(
            "{{\"__flight\":true,\"t\":{},\"level\":{},\"channel\":{},\"data\":{}}}",
            json_number(timestamp()),
            json_string(entry.level.as_str()),
            channel_json(&entry.channel),
            value_to_json(&data),
        )
    })
}

fn write_console_capture_entry(entry: &LogEntry, envelope_formatter: &LogFormatter) {
    // The capture record: every level, as a tagged JSON line (low visual noise, always captured).
    eprintln!("{}", envelope_formatter(entry));
    // The human-readable subset.
    let console_level = state().console_level;
    if entry.level != LogLevel::None && console_level >= entry.level {
        let prefix = match &entry.channel {
            Some(c) => format!("[{}]", c),
            None => "[flight]".to_owned(),
        };
        match &entry.data {
            LogData::Message(msg) => eprintln!("{} {}", prefix, msg),
            LogData::Record(record) => {
                eprintln!(
                    "{} {}",
                    prefix,
                    value_to_json(&LogValue::Object(record.clone()))
                )
            }
        }
    }
}

fn timestamp() -> f64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs_f64() * 1000.0)
        .unwrap_or(0.0)
}

fn channel_json(channel: &Option<String>) -> String {
    match channel {
        Some(c) => json_string(c),
        None => "null".to_owned(),
    }
}

fn json_string(s: &str) -> String {
    let mut out = String::with_capacity(s.len() + 2);
    out.push('"');
    for c in s.chars() {
        match c {
            '"' => out.push_str("\\\""),
            '\\' => out.push_str("\\\\"),
            '\n' => out.push_str("\\n"),
            '\r' => out.push_str("\\r"),
            '\t' => out.push_str("\\t"),
            c if (c as u32) < 0x20 => out.push_str(&format!("\\u{:04x}", c as u32)),
            c => out.push(c),
        }
    }
    out.push('"');
    out
}

fn json_number(n: f64) -> String {
    if n.fract() == 0.0 && n.is_finite() {
        format!("{}", n as i64)
    } else {
        format!("{}", n)
    }
}

fn value_to_json(value: &LogValue) -> String {
    match value {
        LogValue::Null => "null".to_owned(),
        LogValue::Bool(b) => b.to_string(),
        LogValue::Number(n) => json_number(*n),
        LogValue::String(s) => json_string(s),
        LogValue::Array(items) => {
            let parts: Vec<String> = items.iter().map(value_to_json).collect();
            format!("[{}]", parts.join(","))
        }
        LogValue::Object(record) => {
            let parts: Vec<String> = record
                .iter()
                .map(|(k, v)| format!("{}:{}", json_string(k), value_to_json(v)))
                .collect();
            format!("{{{}}}", parts.join(","))
        }
    }
}

fn value_to_display(value: &LogValue) -> String {
    match value {
        LogValue::String(s) => s.clone(),
        LogValue::Number(n) => json_number(*n),
        LogValue::Bool(b) => b.to_string(),
        LogValue::Null => "null".to_owned(),
        other => value_to_json(other),
    }
}

struct BufferedLogSinkState {
    buf: Vec<LogEntry>,
    target: LogSink,
    size: usize,
}

impl BufferedLogSinkState {
    fn new(target: LogSink, size: usize) -> Self {
        BufferedLogSinkState {
            buf: Vec::new(),
            target,
            size,
        }
    }
}

struct MemoryLogSinkState {
    buf: Vec<LogEntry>,
    head: usize,
    capacity: usize,
}

impl MemoryLogSinkState {
    fn new(capacity: usize) -> Self {
        MemoryLogSinkState {
            buf: Vec::new(),
            head: 0,
            capacity,
        }
    }
}

struct RateLimitState {
    counts: HashMap<Option<String>, u64>,
    window_start: f64,
}

struct NoopTransportBackend;

impl LogTransportBackend for NoopTransportBackend {
    fn write(&self, _line: &str) {
        // no-op on web — caller must register a real backend via set_log_transport_backend
    }
}

fn buffered_target(id: u64) -> Option<LogSink> {
    buffered_sink_states()
        .get(&id)
        .map(|s| s.lock().unwrap().target.clone())
}

static STATE: LazyLock<Mutex<LogState>> = LazyLock::new(|| {
    Mutex::new(LogState {
        sinks: Vec::new(),
        channel_levels: HashMap::new(),
        once_keys: std::collections::HashSet::new(),
        redaction_paths: Vec::new(),
        serializers: HashMap::new(),
        span_stack: Vec::new(),
        console_level: LogLevel::Info,
        group_depth: 0,
        level: LogLevel::Verbose,
        signals: None,
        transport_backend: None,
    })
});

static BUFFERED_SINK_STATES: LazyLock<Mutex<HashMap<u64, Mutex<BufferedLogSinkState>>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));
static MEMORY_SINK_STATES: LazyLock<Mutex<HashMap<u64, Mutex<MemoryLogSinkState>>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));
static NEXT_HANDLE_ID: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(1);

fn state() -> std::sync::MutexGuard<'static, LogState> {
    STATE.lock().unwrap()
}

fn next_handle_id() -> u64 {
    NEXT_HANDLE_ID.fetch_add(1, std::sync::atomic::Ordering::Relaxed)
}

// These wrap the per-handle state maps; the inner per-handle Mutex is what serializes access, and
// the outer map is only read (entries are inserted at creation and never removed), so a short-lived
// guard around `get` is enough.
fn buffered_sink_states()
-> std::sync::MutexGuard<'static, HashMap<u64, Mutex<BufferedLogSinkState>>> {
    BUFFERED_SINK_STATES.lock().unwrap()
}

fn memory_sink_states() -> std::sync::MutexGuard<'static, HashMap<u64, Mutex<MemoryLogSinkState>>> {
    MEMORY_SINK_STATES.lock().unwrap()
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use flighthq_signals::connect_signal;
    use serial_test::serial;
    use std::sync::{Arc, Mutex};

    fn reset() {
        clear_log_groups();
        clear_log_redaction_paths();
        clear_log_serializers();
        clear_log_sinks();
        clear_log_channel_levels();
        set_log_console_level(LogLevel::Info);
        set_log_level(LogLevel::Verbose);
        set_log_transport_backend(None);
    }

    fn recording_sink() -> (Arc<Mutex<Vec<LogEntry>>>, LogSink) {
        let entries: Arc<Mutex<Vec<LogEntry>>> = Arc::new(Mutex::new(Vec::new()));
        let captured = entries.clone();
        let sink: LogSink = Arc::new(move |e: &LogEntry| captured.lock().unwrap().push(e.clone()));
        add_log_sink(sink.clone());
        (entries, sink)
    }

    fn rec(pairs: &[(&str, LogValue)]) -> LogRecord {
        let mut r = LogRecord::new();
        for (k, v) in pairs {
            r.insert(*k, v.clone());
        }
        r
    }

    #[test]
    #[serial]
    fn add_log_sink_receives_emitted_entries() {
        reset();
        let (entries, _s) = recording_sink();
        log(LogLevel::Info, "hello", None);
        assert_eq!(entries.lock().unwrap().len(), 1);
    }

    #[test]
    #[serial]
    fn add_log_sink_does_not_add_same_sink_twice() {
        reset();
        let entries: Arc<Mutex<Vec<LogEntry>>> = Arc::new(Mutex::new(Vec::new()));
        let captured = entries.clone();
        let sink: LogSink = Arc::new(move |e: &LogEntry| captured.lock().unwrap().push(e.clone()));
        add_log_sink(sink.clone());
        add_log_sink(sink.clone());
        log(LogLevel::Info, "x", None);
        assert_eq!(entries.lock().unwrap().len(), 1);
    }

    #[test]
    #[serial]
    fn begin_log_group_emits_debug_and_increments_depth() {
        reset();
        let (entries, _s) = recording_sink();
        begin_log_group("setup", None);
        let entries = entries.lock().unwrap();
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].level, LogLevel::Debug);
        if let LogData::Record(r) = &entries[0].data {
            assert_eq!(r.get("group"), Some(&LogValue::String("begin".to_owned())));
            assert_eq!(r.get("depth"), Some(&LogValue::Number(1.0)));
        } else {
            panic!("expected record");
        }
    }

    #[test]
    #[serial]
    fn begin_log_group_nests_to_depth_2() {
        reset();
        let (entries, _s) = recording_sink();
        begin_log_group("outer", None);
        begin_log_group("inner", None);
        let entries = entries.lock().unwrap();
        if let LogData::Record(r) = &entries[1].data {
            assert_eq!(r.get("depth"), Some(&LogValue::Number(2.0)));
        } else {
            panic!("expected record");
        }
    }

    #[test]
    #[serial]
    fn clear_log_channel_levels_removes_overrides() {
        reset();
        set_log_channel_level("render", LogLevel::Error);
        clear_log_channel_levels();
        assert_eq!(get_log_channel_level("render"), None);
    }

    #[test]
    #[serial]
    fn clear_log_groups_resets_depth_without_emitting() {
        reset();
        let (entries, _s) = recording_sink();
        begin_log_group("a", None);
        begin_log_group("b", None);
        entries.lock().unwrap().clear();
        clear_log_groups();
        end_log_group(None);
        assert_eq!(entries.lock().unwrap().len(), 0);
    }

    #[test]
    #[serial]
    fn clear_log_redaction_paths_stops_redaction() {
        reset();
        set_log_redaction_paths(&["token"]);
        clear_log_redaction_paths();
        let fmt = create_json_log_formatter();
        let entry = LogEntry {
            level: LogLevel::Info,
            channel: None,
            data: LogData::Record(rec(&[("token", LogValue::String("secret".to_owned()))])),
        };
        let result = fmt(&entry);
        assert!(result.contains("\"token\":\"secret\""));
    }

    #[test]
    #[serial]
    fn clear_log_serializers_removes_registrations() {
        reset();
        register_log_serializer(
            "acme.Foo",
            Arc::new(|_| rec(&[("serialized", LogValue::Bool(true))])),
        );
        clear_log_serializers();
        let fmt = create_json_log_formatter();
        let entry = LogEntry {
            level: LogLevel::Info,
            channel: None,
            data: LogData::Record(rec(&[(
                "obj",
                LogValue::Object(rec(&[("__kind", LogValue::String("acme.Foo".to_owned()))])),
            )])),
        };
        let result = fmt(&entry);
        assert!(result.contains("acme.Foo"));
    }

    #[test]
    #[serial]
    fn clear_log_sinks_makes_emit_no_op() {
        reset();
        let (entries, _s) = recording_sink();
        clear_log_sinks();
        log(LogLevel::Info, "x", None);
        assert_eq!(entries.lock().unwrap().len(), 0);
    }

    #[test]
    #[serial]
    fn clear_memory_log_sink_empties_captured() {
        reset();
        let handle = create_memory_log_sink(10);
        add_log_sink(handle.sink.clone());
        log(LogLevel::Info, "a", None);
        clear_memory_log_sink(&handle);
        assert_eq!(get_memory_log_sink_entries(&handle).len(), 0);
    }

    #[test]
    #[serial]
    fn create_buffered_log_sink_does_not_forward_until_flushed() {
        reset();
        let forwarded: Arc<Mutex<Vec<LogEntry>>> = Arc::new(Mutex::new(Vec::new()));
        let f = forwarded.clone();
        let target: LogSink = Arc::new(move |e: &LogEntry| f.lock().unwrap().push(e.clone()));
        let handle = create_buffered_log_sink(target, Some(100), Some(0));
        add_log_sink(handle.sink.clone());
        log(LogLevel::Info, "queued", None);
        assert_eq!(forwarded.lock().unwrap().len(), 0);
        flush_log_sink(&handle);
        assert_eq!(forwarded.lock().unwrap().len(), 1);
    }

    #[test]
    #[serial]
    fn create_buffered_log_sink_auto_flushes_at_size() {
        reset();
        let forwarded: Arc<Mutex<Vec<LogEntry>>> = Arc::new(Mutex::new(Vec::new()));
        let f = forwarded.clone();
        let target: LogSink = Arc::new(move |e: &LogEntry| f.lock().unwrap().push(e.clone()));
        let handle = create_buffered_log_sink(target, Some(2), Some(0));
        add_log_sink(handle.sink.clone());
        log(LogLevel::Info, "a", None);
        log(LogLevel::Info, "b", None);
        assert_eq!(forwarded.lock().unwrap().len(), 2);
    }

    #[test]
    #[serial]
    fn dispose_log_sink_flushes_remaining() {
        reset();
        let forwarded: Arc<Mutex<Vec<LogEntry>>> = Arc::new(Mutex::new(Vec::new()));
        let f = forwarded.clone();
        let target: LogSink = Arc::new(move |e: &LogEntry| f.lock().unwrap().push(e.clone()));
        let handle = create_buffered_log_sink(target, Some(100), Some(0));
        add_log_sink(handle.sink.clone());
        log(LogLevel::Info, "pending", None);
        dispose_log_sink(&handle);
        assert_eq!(forwarded.lock().unwrap().len(), 1);
    }

    #[test]
    #[serial]
    fn create_child_log_context_merges_child_wins() {
        reset();
        let parent = create_log_context(
            Some("chan"),
            rec(&[("a", LogValue::Number(1.0)), ("b", LogValue::Number(2.0))]),
        );
        let child = create_child_log_context(
            &parent,
            &rec(&[("b", LogValue::Number(99.0)), ("c", LogValue::Number(3.0))]),
            None,
        );
        assert_eq!(child.fields.get("a"), Some(&LogValue::Number(1.0)));
        assert_eq!(child.fields.get("b"), Some(&LogValue::Number(99.0)));
        assert_eq!(child.fields.get("c"), Some(&LogValue::Number(3.0)));
    }

    #[test]
    #[serial]
    fn create_child_log_context_inherits_channel() {
        reset();
        let parent = create_log_context(Some("parent"), LogRecord::new());
        let child = create_child_log_context(&parent, &LogRecord::new(), None);
        assert_eq!(child.channel.as_deref(), Some("parent"));
    }

    #[test]
    #[serial]
    fn create_child_log_context_overrides_channel() {
        reset();
        let parent = create_log_context(Some("parent"), LogRecord::new());
        let child = create_child_log_context(&parent, &LogRecord::new(), Some(Some("child")));
        assert_eq!(child.channel.as_deref(), Some("child"));
    }

    #[test]
    #[serial]
    fn create_fanout_log_sink_forwards_to_all() {
        reset();
        let a: Arc<Mutex<Vec<LogEntry>>> = Arc::new(Mutex::new(Vec::new()));
        let b: Arc<Mutex<Vec<LogEntry>>> = Arc::new(Mutex::new(Vec::new()));
        let (aa, bb) = (a.clone(), b.clone());
        let fanout = create_fanout_log_sink(vec![
            Arc::new(move |e: &LogEntry| aa.lock().unwrap().push(e.clone())),
            Arc::new(move |e: &LogEntry| bb.lock().unwrap().push(e.clone())),
        ]);
        add_log_sink(fanout);
        log(LogLevel::Info, "hello", None);
        assert_eq!(a.lock().unwrap().len(), 1);
        assert_eq!(b.lock().unwrap().len(), 1);
    }

    #[test]
    #[serial]
    fn create_file_log_sink_writes_formatted_lines() {
        reset();
        let lines: Arc<Mutex<Vec<String>>> = Arc::new(Mutex::new(Vec::new()));
        set_log_transport_backend(Some(Arc::new(VecBackend {
            lines: lines.clone(),
        })));
        let handle = create_file_log_sink(None);
        add_log_sink(handle.sink.clone());
        log(LogLevel::Info, "file-entry", None);
        let lines = lines.lock().unwrap();
        assert_eq!(lines.len(), 1);
        assert!(lines[0].contains("\"level\":\"info\""));
        assert!(lines[0].contains("\"msg\":\"file-entry\""));
    }

    #[test]
    #[serial]
    fn create_file_log_sink_no_op_without_backend() {
        reset();
        let handle = create_file_log_sink(None);
        add_log_sink(handle.sink.clone());
        log(LogLevel::Info, "no-backend", None); // must not panic
    }

    #[test]
    #[serial]
    fn create_file_log_sink_accepts_custom_formatter() {
        reset();
        let lines: Arc<Mutex<Vec<String>>> = Arc::new(Mutex::new(Vec::new()));
        set_log_transport_backend(Some(Arc::new(VecBackend {
            lines: lines.clone(),
        })));
        let fmt: LogFormatter = Arc::new(|_| "custom".to_owned());
        let handle = create_file_log_sink(Some(fmt));
        add_log_sink(handle.sink.clone());
        log(LogLevel::Info, "x", None);
        assert_eq!(lines.lock().unwrap()[0], "custom\n");
    }

    #[test]
    #[serial]
    fn create_filter_log_sink_only_matching() {
        reset();
        let entries: Arc<Mutex<Vec<LogEntry>>> = Arc::new(Mutex::new(Vec::new()));
        let e = entries.clone();
        let filtered = create_filter_log_sink(
            Arc::new(move |entry: &LogEntry| e.lock().unwrap().push(entry.clone())),
            Arc::new(|entry: &LogEntry| entry.level == LogLevel::Error),
        );
        add_log_sink(filtered);
        log(LogLevel::Info, "skip", None);
        log(LogLevel::Error, "keep", None);
        let entries = entries.lock().unwrap();
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].level, LogLevel::Error);
    }

    #[test]
    #[serial]
    fn create_json_log_formatter_envelope() {
        reset();
        let fmt = create_json_log_formatter();
        let entry = LogEntry {
            level: LogLevel::Info,
            channel: Some("test".to_owned()),
            data: LogData::Message("msg".to_owned()),
        };
        let result = fmt(&entry);
        assert!(result.contains("\"__flight\":true"));
        assert!(result.contains("\"level\":\"info\""));
        assert!(result.contains("\"channel\":\"test\""));
        assert!(result.contains("\"data\":{\"msg\":\"msg\"}"));
    }

    #[test]
    #[serial]
    fn create_json_log_formatter_applies_serializers() {
        reset();
        register_log_serializer(
            "acme.Widget",
            Arc::new(|v| {
                let id = if let LogValue::Object(o) = v {
                    o.get("id").cloned().unwrap_or(LogValue::Null)
                } else {
                    LogValue::Null
                };
                rec(&[("serialized", LogValue::Bool(true)), ("id", id)])
            }),
        );
        let fmt = create_json_log_formatter();
        let entry = LogEntry {
            level: LogLevel::Info,
            channel: None,
            data: LogData::Record(rec(&[(
                "widget",
                LogValue::Object(rec(&[
                    ("__kind", LogValue::String("acme.Widget".to_owned())),
                    ("id", LogValue::Number(42.0)),
                ])),
            )])),
        };
        let result = fmt(&entry);
        assert!(result.contains("\"serialized\":true"));
        assert!(result.contains("\"id\":42"));
    }

    #[test]
    #[serial]
    fn create_json_log_formatter_applies_redaction() {
        reset();
        set_log_redaction_paths(&["credentials.token", "password"]);
        let fmt = create_json_log_formatter();
        let entry = LogEntry {
            level: LogLevel::Info,
            channel: None,
            data: LogData::Record(rec(&[
                (
                    "credentials",
                    LogValue::Object(rec(&[
                        ("token", LogValue::String("secret".to_owned())),
                        ("user", LogValue::String("alice".to_owned())),
                    ])),
                ),
                ("password", LogValue::String("pw".to_owned())),
            ])),
        };
        let result = fmt(&entry);
        assert!(result.contains("\"token\":\"[REDACTED]\""));
        assert!(result.contains("\"user\":\"alice\""));
        assert!(result.contains("\"password\":\"[REDACTED]\""));
    }

    #[test]
    #[serial]
    fn create_log_context_holds_channel_and_fields() {
        reset();
        let ctx = create_log_context(Some("render"), rec(&[("version", LogValue::Number(1.0))]));
        assert_eq!(ctx.channel.as_deref(), Some("render"));
        assert_eq!(ctx.fields.get("version"), Some(&LogValue::Number(1.0)));
    }

    #[test]
    #[serial]
    fn create_log_context_defaults_empty_fields() {
        reset();
        let ctx = create_log_context(Some("ch"), LogRecord::new());
        assert!(ctx.fields.is_empty());
    }

    #[test]
    #[serial]
    fn create_log_span_holds_name_fields_channel() {
        reset();
        let span = create_log_span(
            "render-frame",
            rec(&[("frame", LogValue::Number(1.0))]),
            Some("perf"),
        );
        assert_eq!(span.name, "render-frame");
        assert_eq!(span.fields.get("frame"), Some(&LogValue::Number(1.0)));
        assert_eq!(span.channel.as_deref(), Some("perf"));
    }

    #[test]
    #[serial]
    fn create_log_span_defaults() {
        reset();
        let span = create_log_span("op", LogRecord::new(), None);
        assert!(span.fields.is_empty());
        assert_eq!(span.channel, None);
    }

    #[test]
    #[serial]
    fn create_memory_log_sink_captures_to_capacity() {
        reset();
        let handle = create_memory_log_sink(3);
        add_log_sink(handle.sink.clone());
        log(LogLevel::Info, "a", None);
        log(LogLevel::Info, "b", None);
        log(LogLevel::Info, "c", None);
        assert_eq!(get_memory_log_sink_entries(&handle).len(), 3);
    }

    #[test]
    #[serial]
    fn create_memory_log_sink_ring_overwrites_oldest() {
        reset();
        let handle = create_memory_log_sink(2);
        add_log_sink(handle.sink.clone());
        log(LogLevel::Info, "first", None);
        log(LogLevel::Info, "second", None);
        log(LogLevel::Info, "third", None);
        let entries = get_memory_log_sink_entries(&handle);
        assert_eq!(entries.len(), 2);
        assert_eq!(entries[0].data, LogData::Message("second".to_owned()));
        assert_eq!(entries[1].data, LogData::Message("third".to_owned()));
    }

    #[test]
    #[serial]
    fn create_memory_log_sink_oldest_first_after_wrap() {
        reset();
        let handle = create_memory_log_sink(3);
        add_log_sink(handle.sink.clone());
        for i in 0..5 {
            log(LogLevel::Info, format!("msg{}", i), None);
        }
        let entries = get_memory_log_sink_entries(&handle);
        let msgs: Vec<String> = entries
            .iter()
            .map(|e| match &e.data {
                LogData::Message(m) => m.clone(),
                _ => String::new(),
            })
            .collect();
        assert_eq!(msgs, vec!["msg2", "msg3", "msg4"]);
    }

    #[test]
    #[serial]
    fn create_rate_limited_log_sink_limits_per_interval() {
        reset();
        let forwarded: Arc<Mutex<Vec<LogEntry>>> = Arc::new(Mutex::new(Vec::new()));
        let f = forwarded.clone();
        let target: LogSink = Arc::new(move |e: &LogEntry| f.lock().unwrap().push(e.clone()));
        let handle = create_rate_limited_log_sink(target, false, 2, 10000.0);
        add_log_sink(handle.sink.clone());
        log(LogLevel::Info, "a", None);
        log(LogLevel::Info, "b", None);
        log(LogLevel::Info, "c", None);
        assert_eq!(forwarded.lock().unwrap().len(), 2);
    }

    #[test]
    #[serial]
    fn create_rate_limited_log_sink_per_channel() {
        reset();
        let forwarded: Arc<Mutex<Vec<LogEntry>>> = Arc::new(Mutex::new(Vec::new()));
        let f = forwarded.clone();
        let target: LogSink = Arc::new(move |e: &LogEntry| f.lock().unwrap().push(e.clone()));
        let handle = create_rate_limited_log_sink(target, true, 1, 10000.0);
        add_log_sink(handle.sink.clone());
        log(LogLevel::Info, "a", Some("ch1"));
        log(LogLevel::Info, "b", Some("ch1"));
        log(LogLevel::Info, "c", Some("ch2"));
        let forwarded = forwarded.lock().unwrap();
        assert_eq!(forwarded.len(), 2);
        assert_eq!(forwarded[0].channel.as_deref(), Some("ch1"));
        assert_eq!(forwarded[1].channel.as_deref(), Some("ch2"));
    }

    #[test]
    #[serial]
    fn create_sampled_log_sink_forwards_one_in_n() {
        reset();
        let forwarded: Arc<Mutex<Vec<LogEntry>>> = Arc::new(Mutex::new(Vec::new()));
        let f = forwarded.clone();
        let sampled = create_sampled_log_sink(
            Arc::new(move |e: &LogEntry| f.lock().unwrap().push(e.clone())),
            3,
        );
        add_log_sink(sampled);
        for i in 0..9 {
            log(LogLevel::Info, format!("msg{}", i), None);
        }
        assert_eq!(forwarded.lock().unwrap().len(), 3);
    }

    #[test]
    #[serial]
    fn create_sampled_log_sink_passthrough_when_rate_1() {
        reset();
        let forwarded: Arc<Mutex<Vec<LogEntry>>> = Arc::new(Mutex::new(Vec::new()));
        let f = forwarded.clone();
        let sampled = create_sampled_log_sink(
            Arc::new(move |e: &LogEntry| f.lock().unwrap().push(e.clone())),
            1,
        );
        add_log_sink(sampled);
        log(LogLevel::Info, "a", None);
        log(LogLevel::Info, "b", None);
        assert_eq!(forwarded.lock().unwrap().len(), 2);
    }

    #[test]
    #[serial]
    fn create_text_log_formatter_readable_line() {
        reset();
        let fmt = create_text_log_formatter(false, false, false);
        let entry = LogEntry {
            level: LogLevel::Warn,
            channel: Some("batch".to_owned()),
            data: LogData::Message("test".to_owned()),
        };
        assert_eq!(fmt(&entry), "[batch] test");
    }

    #[test]
    #[serial]
    fn create_text_log_formatter_level_prefix() {
        reset();
        let fmt = create_text_log_formatter(false, true, false);
        let entry = LogEntry {
            level: LogLevel::Error,
            channel: Some("ch".to_owned()),
            data: LogData::Message("boom".to_owned()),
        };
        assert_eq!(fmt(&entry), "error [ch] boom");
    }

    #[test]
    #[serial]
    fn create_web_log_transport_backend_is_noop() {
        reset();
        let backend = create_web_log_transport_backend();
        backend.write("test line"); // must not panic
    }

    #[test]
    #[serial]
    fn dispose_file_log_sink_calls_flush_and_dispose() {
        reset();
        let flushed = Arc::new(Mutex::new(0u32));
        let disposed = Arc::new(Mutex::new(0u32));
        set_log_transport_backend(Some(Arc::new(CountingBackend {
            flushed: flushed.clone(),
            disposed: disposed.clone(),
        })));
        let handle = create_file_log_sink(None);
        dispose_file_log_sink(&handle);
        assert_eq!(*flushed.lock().unwrap(), 1);
        assert_eq!(*disposed.lock().unwrap(), 1);
    }

    #[test]
    #[serial]
    fn dispose_file_log_sink_no_op_without_backend() {
        reset();
        let handle = create_file_log_sink(None);
        dispose_file_log_sink(&handle); // must not panic
    }

    #[test]
    #[serial]
    fn enable_log_signals_returns_entity() {
        reset();
        let signals = enable_log_signals();
        let _ = &signals.on_log_entry;
        let _ = &signals.on_log_error;
        state().signals = None;
    }

    #[test]
    #[serial]
    fn enable_log_signals_returns_same_object() {
        reset();
        state().signals = None;
        let a = enable_log_signals();
        // A listener connected to the first-returned signal still fires after a second call,
        // proving the second call returned the same shared signal rather than a fresh one.
        let received: Arc<Mutex<u32>> = Arc::new(Mutex::new(0));
        let r = received.clone();
        let _guard = connect_signal(
            &a.on_log_entry,
            Arc::new(move |_: &LogEntry| *r.lock().unwrap() += 1),
            Default::default(),
        );
        let _b = enable_log_signals();
        log(LogLevel::Info, "x", None);
        assert_eq!(*received.lock().unwrap(), 1);
        state().signals = None;
    }

    #[test]
    #[serial]
    fn enable_log_signals_on_log_entry_fires() {
        reset();
        state().signals = None;
        let signals = enable_log_signals();
        let received: Arc<Mutex<Vec<LogEntry>>> = Arc::new(Mutex::new(Vec::new()));
        let r = received.clone();
        let _guard = connect_signal(
            &signals.on_log_entry,
            Arc::new(move |e: &LogEntry| r.lock().unwrap().push(e.clone())),
            Default::default(),
        );
        log(LogLevel::Info, "via-signal", None);
        let received = received.lock().unwrap();
        assert_eq!(received.len(), 1);
        assert_eq!(received[0].data, LogData::Message("via-signal".to_owned()));
        drop(received);
        state().signals = None;
    }

    #[test]
    #[serial]
    fn enable_log_signals_on_log_error_fires_only_for_errors() {
        reset();
        state().signals = None;
        let signals = enable_log_signals();
        let errors: Arc<Mutex<Vec<LogEntry>>> = Arc::new(Mutex::new(Vec::new()));
        let e = errors.clone();
        let _guard = connect_signal(
            &signals.on_log_error,
            Arc::new(move |entry: &LogEntry| e.lock().unwrap().push(entry.clone())),
            Default::default(),
        );
        log(LogLevel::Info, "not-error", None);
        log(LogLevel::Error, "is-error", None);
        let errors = errors.lock().unwrap();
        assert_eq!(errors.len(), 1);
        assert_eq!(errors[0].level, LogLevel::Error);
        drop(errors);
        state().signals = None;
    }

    #[test]
    #[serial]
    fn end_log_group_emits_group_end() {
        reset();
        let (entries, _s) = recording_sink();
        begin_log_group("setup", None);
        entries.lock().unwrap().clear();
        end_log_group(None);
        let entries = entries.lock().unwrap();
        assert_eq!(entries.len(), 1);
        if let LogData::Record(r) = &entries[0].data {
            assert_eq!(r.get("group"), Some(&LogValue::String("end".to_owned())));
        } else {
            panic!("expected record");
        }
    }

    #[test]
    #[serial]
    fn end_log_group_no_op_when_none_open() {
        reset();
        let (entries, _s) = recording_sink();
        end_log_group(None);
        assert_eq!(entries.lock().unwrap().len(), 0);
    }

    #[test]
    #[serial]
    fn end_log_timer_emits_and_returns_elapsed() {
        reset();
        let (entries, _s) = recording_sink();
        let timer = start_log_timer("op", Some("perf"));
        let elapsed = end_log_timer(&timer);
        assert!(elapsed >= 0.0);
        let entries = entries.lock().unwrap();
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].level, LogLevel::Debug);
        assert_eq!(entries[0].channel.as_deref(), Some("perf"));
        if let LogData::Record(r) = &entries[0].data {
            assert_eq!(r.get("label"), Some(&LogValue::String("op".to_owned())));
        } else {
            panic!("expected record");
        }
    }

    #[test]
    #[serial]
    fn enter_log_span_merges_fields() {
        reset();
        let (entries, _s) = recording_sink();
        let span = create_log_span(
            "request",
            rec(&[("reqId", LogValue::String("abc".to_owned()))]),
            None,
        );
        enter_log_span(&span);
        log(LogLevel::Info, "inside span", None);
        exit_log_span(&span);
        let entries = entries.lock().unwrap();
        if let LogData::Record(r) = &entries[0].data {
            assert_eq!(r.get("reqId"), Some(&LogValue::String("abc".to_owned())));
        } else {
            panic!("expected record");
        }
    }

    #[test]
    #[serial]
    fn exit_log_span_stops_merging() {
        reset();
        let (entries, _s) = recording_sink();
        let span = create_log_span(
            "request",
            rec(&[("reqId", LogValue::String("def".to_owned()))]),
            None,
        );
        enter_log_span(&span);
        exit_log_span(&span);
        log(LogLevel::Info, "outside span", None);
        let entries = entries.lock().unwrap();
        assert_eq!(entries[0].data, LogData::Message("outside span".to_owned()));
    }

    #[test]
    #[serial]
    fn enter_log_span_newer_wins_on_collision() {
        reset();
        let (entries, _s) = recording_sink();
        let span1 = create_log_span(
            "outer",
            rec(&[("x", LogValue::Number(1.0)), ("y", LogValue::Number(10.0))]),
            None,
        );
        let span2 = create_log_span("inner", rec(&[("x", LogValue::Number(2.0))]), None);
        enter_log_span(&span1);
        enter_log_span(&span2);
        log(LogLevel::Info, "nested", None);
        exit_log_span(&span2);
        exit_log_span(&span1);
        let entries = entries.lock().unwrap();
        if let LogData::Record(r) = &entries[0].data {
            assert_eq!(r.get("x"), Some(&LogValue::Number(2.0)));
            assert_eq!(r.get("y"), Some(&LogValue::Number(10.0)));
        } else {
            panic!("expected record");
        }
    }

    #[test]
    #[serial]
    fn exit_log_span_no_op_when_absent() {
        reset();
        let (entries, _s) = recording_sink();
        let span = create_log_span("phantom", rec(&[("z", LogValue::Number(1.0))]), None);
        exit_log_span(&span);
        log(LogLevel::Info, "clean", None);
        let entries = entries.lock().unwrap();
        assert_eq!(entries[0].data, LogData::Message("clean".to_owned()));
    }

    #[test]
    #[serial]
    fn exit_log_span_out_of_order() {
        reset();
        let (entries, _s) = recording_sink();
        let span1 = create_log_span("a", rec(&[("a", LogValue::Number(1.0))]), None);
        let span2 = create_log_span("b", rec(&[("b", LogValue::Number(2.0))]), None);
        enter_log_span(&span1);
        enter_log_span(&span2);
        exit_log_span(&span1);
        log(LogLevel::Info, "after-a-exit", None);
        exit_log_span(&span2);
        let entries = entries.lock().unwrap();
        if let LogData::Record(r) = &entries[0].data {
            assert_eq!(r.get("b"), Some(&LogValue::Number(2.0)));
            assert_eq!(r.get("a"), None);
        } else {
            panic!("expected record");
        }
    }

    #[test]
    #[serial]
    fn get_log_channel_level_none_when_unset() {
        reset();
        assert_eq!(get_log_channel_level("unknown"), None);
    }

    #[test]
    #[serial]
    fn get_log_channel_level_returns_set() {
        reset();
        set_log_channel_level("render", LogLevel::Error);
        assert_eq!(get_log_channel_level("render"), Some(LogLevel::Error));
    }

    #[test]
    #[serial]
    fn get_log_console_level_returns_current() {
        reset();
        set_log_console_level(LogLevel::Verbose);
        assert_eq!(get_log_console_level(), LogLevel::Verbose);
    }

    #[test]
    #[serial]
    fn get_log_level_returns_current() {
        reset();
        set_log_level(LogLevel::Error);
        assert_eq!(get_log_level(), LogLevel::Error);
    }

    #[test]
    #[serial]
    fn get_log_level_name_canonical() {
        assert_eq!(get_log_level_name(LogLevel::None), "none");
        assert_eq!(get_log_level_name(LogLevel::Error), "error");
        assert_eq!(get_log_level_name(LogLevel::Warn), "warn");
        assert_eq!(get_log_level_name(LogLevel::Info), "info");
        assert_eq!(get_log_level_name(LogLevel::Debug), "debug");
        assert_eq!(get_log_level_name(LogLevel::Verbose), "verbose");
    }

    #[test]
    #[serial]
    fn get_log_transport_backend_none_then_some() {
        reset();
        assert!(get_log_transport_backend().is_none());
        set_log_transport_backend(Some(create_web_log_transport_backend()));
        assert!(get_log_transport_backend().is_some());
    }

    #[test]
    #[serial]
    fn get_memory_log_sink_entries_empty_initially() {
        reset();
        let handle = create_memory_log_sink(5);
        assert_eq!(get_memory_log_sink_entries(&handle).len(), 0);
    }

    #[test]
    #[serial]
    fn log_forwards_level_channel_data() {
        reset();
        let (entries, _s) = recording_sink();
        log(
            LogLevel::Warn,
            rec(&[("k", LogValue::Number(1.0))]),
            Some("shader"),
        );
        let entries = entries.lock().unwrap();
        assert_eq!(entries[0].level, LogLevel::Warn);
        assert_eq!(entries[0].channel.as_deref(), Some("shader"));
        assert_eq!(
            entries[0].data,
            LogData::Record(rec(&[("k", LogValue::Number(1.0))]))
        );
    }

    #[test]
    #[serial]
    fn log_defaults_channel_to_none() {
        reset();
        let (entries, _s) = recording_sink();
        log(LogLevel::Info, "x", None);
        assert!(entries.lock().unwrap()[0].channel.is_none());
    }

    #[test]
    #[serial]
    fn log_no_op_without_sink() {
        reset();
        log(LogLevel::Info, "x", None); // must not panic
    }

    #[test]
    #[serial]
    fn log_lazy_calls_provider() {
        reset();
        let (entries, _s) = recording_sink();
        let called = Arc::new(Mutex::new(0u32));
        let c = called.clone();
        log_lazy(
            LogLevel::Info,
            Box::new(move || {
                *c.lock().unwrap() += 1;
                LogData::Message("lazy-value".to_owned())
            }),
            None,
        );
        assert_eq!(*called.lock().unwrap(), 1);
        assert_eq!(
            entries.lock().unwrap()[0].data,
            LogData::Message("lazy-value".to_owned())
        );
    }

    #[test]
    #[serial]
    fn log_lazy_skips_provider_when_suppressed() {
        reset();
        recording_sink();
        set_log_level(LogLevel::Error);
        let called = Arc::new(Mutex::new(0u32));
        let c = called.clone();
        log_lazy(
            LogLevel::Verbose,
            Box::new(move || {
                *c.lock().unwrap() += 1;
                LogData::Message("nope".to_owned())
            }),
            None,
        );
        assert_eq!(*called.lock().unwrap(), 0);
    }

    #[test]
    #[serial]
    fn log_fans_out_to_multiple_sinks() {
        reset();
        let a: Arc<Mutex<Vec<LogEntry>>> = Arc::new(Mutex::new(Vec::new()));
        let b: Arc<Mutex<Vec<LogEntry>>> = Arc::new(Mutex::new(Vec::new()));
        let (aa, bb) = (a.clone(), b.clone());
        add_log_sink(Arc::new(move |e: &LogEntry| {
            aa.lock().unwrap().push(e.clone())
        }));
        add_log_sink(Arc::new(move |e: &LogEntry| {
            bb.lock().unwrap().push(e.clone())
        }));
        log(LogLevel::Info, "multi", None);
        assert_eq!(a.lock().unwrap().len(), 1);
        assert_eq!(b.lock().unwrap().len(), 1);
    }

    #[test]
    #[serial]
    fn log_assert_emits_when_false() {
        reset();
        let (entries, _s) = recording_sink();
        log_assert(false, "assertion failed", None);
        let entries = entries.lock().unwrap();
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].level, LogLevel::Error);
    }

    #[test]
    #[serial]
    fn log_assert_no_emit_when_true() {
        reset();
        let (entries, _s) = recording_sink();
        log_assert(true, "should not emit", None);
        assert_eq!(entries.lock().unwrap().len(), 0);
    }

    #[test]
    #[serial]
    fn log_debug_emits_at_debug() {
        reset();
        let (entries, _s) = recording_sink();
        log_debug("d", Some("chan"));
        let entries = entries.lock().unwrap();
        assert_eq!(entries[0].level, LogLevel::Debug);
        assert_eq!(entries[0].channel.as_deref(), Some("chan"));
        assert_eq!(entries[0].data, LogData::Message("d".to_owned()));
    }

    #[test]
    #[serial]
    fn log_debug_with_merges_context() {
        reset();
        let (entries, _s) = recording_sink();
        let ctx = create_log_context(
            Some("ch"),
            rec(&[("reqId", LogValue::String("abc".to_owned()))]),
        );
        log_debug_with(&ctx, "msg");
        let entries = entries.lock().unwrap();
        assert_eq!(entries[0].level, LogLevel::Debug);
        assert_eq!(entries[0].channel.as_deref(), Some("ch"));
        if let LogData::Record(r) = &entries[0].data {
            assert_eq!(r.get("msg"), Some(&LogValue::String("msg".to_owned())));
            assert_eq!(r.get("reqId"), Some(&LogValue::String("abc".to_owned())));
        } else {
            panic!("expected record");
        }
    }

    #[test]
    #[serial]
    fn log_error_emits_at_error() {
        reset();
        let (entries, _s) = recording_sink();
        log_error("e", None);
        assert_eq!(entries.lock().unwrap()[0].level, LogLevel::Error);
    }

    #[test]
    #[serial]
    fn log_error_with_merges_context() {
        reset();
        let (entries, _s) = recording_sink();
        let ctx = create_log_context(
            Some("ch"),
            rec(&[("reqId", LogValue::String("1".to_owned()))]),
        );
        log_error_with(&ctx, "fail");
        let entries = entries.lock().unwrap();
        assert_eq!(entries[0].level, LogLevel::Error);
        if let LogData::Record(r) = &entries[0].data {
            assert_eq!(r.get("msg"), Some(&LogValue::String("fail".to_owned())));
            assert_eq!(r.get("reqId"), Some(&LogValue::String("1".to_owned())));
        } else {
            panic!("expected record");
        }
    }

    #[test]
    #[serial]
    fn log_info_emits_at_info() {
        reset();
        let (entries, _s) = recording_sink();
        log_info("i", None);
        assert_eq!(entries.lock().unwrap()[0].level, LogLevel::Info);
    }

    #[test]
    #[serial]
    fn log_info_with_merges_context() {
        reset();
        let (entries, _s) = recording_sink();
        let ctx = create_log_context(Some("ch"), rec(&[("v", LogValue::Number(2.0))]));
        log_info_with(&ctx, rec(&[("extra", LogValue::Bool(true))]));
        let entries = entries.lock().unwrap();
        if let LogData::Record(r) = &entries[0].data {
            assert_eq!(r.get("v"), Some(&LogValue::Number(2.0)));
            assert_eq!(r.get("extra"), Some(&LogValue::Bool(true)));
        } else {
            panic!("expected record");
        }
    }

    #[test]
    #[serial]
    fn log_once_emits_only_first() {
        reset();
        clear_once_keys();
        let (entries, _s) = recording_sink();
        log_once("key1", LogLevel::Warn, "first", None);
        log_once("key1", LogLevel::Warn, "second", None);
        let entries = entries.lock().unwrap();
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].data, LogData::Message("first".to_owned()));
    }

    #[test]
    #[serial]
    fn log_once_different_keys_independent() {
        reset();
        clear_once_keys();
        let (entries, _s) = recording_sink();
        log_once("key2a", LogLevel::Info, "a", None);
        log_once("key2b", LogLevel::Info, "b", None);
        assert_eq!(entries.lock().unwrap().len(), 2);
    }

    #[test]
    #[serial]
    fn log_once_returns_true_then_false() {
        reset();
        clear_once_keys();
        recording_sink();
        assert!(log_once("key3", LogLevel::Info, "x", None));
        assert!(!log_once("key3", LogLevel::Info, "x", None));
    }

    #[test]
    #[serial]
    fn log_verbose_emits_at_verbose() {
        reset();
        let (entries, _s) = recording_sink();
        log_verbose("v", None);
        assert_eq!(entries.lock().unwrap()[0].level, LogLevel::Verbose);
    }

    #[test]
    #[serial]
    fn log_verbose_with_merges_context() {
        reset();
        let (entries, _s) = recording_sink();
        let ctx = create_log_context(None, rec(&[("trace", LogValue::Bool(true))]));
        log_verbose_with(&ctx, "trace-msg");
        let entries = entries.lock().unwrap();
        if let LogData::Record(r) = &entries[0].data {
            assert_eq!(
                r.get("msg"),
                Some(&LogValue::String("trace-msg".to_owned()))
            );
            assert_eq!(r.get("trace"), Some(&LogValue::Bool(true)));
        } else {
            panic!("expected record");
        }
    }

    #[test]
    #[serial]
    fn log_warn_emits_at_warn() {
        reset();
        let (entries, _s) = recording_sink();
        log_warn("w", None);
        assert_eq!(entries.lock().unwrap()[0].level, LogLevel::Warn);
    }

    #[test]
    #[serial]
    fn log_warn_with_merges_context() {
        reset();
        let (entries, _s) = recording_sink();
        let ctx = create_log_context(
            Some("ch"),
            rec(&[("ctx", LogValue::String("val".to_owned()))]),
        );
        log_warn_with(&ctx, "warning");
        let entries = entries.lock().unwrap();
        if let LogData::Record(r) = &entries[0].data {
            assert_eq!(r.get("msg"), Some(&LogValue::String("warning".to_owned())));
            assert_eq!(r.get("ctx"), Some(&LogValue::String("val".to_owned())));
        } else {
            panic!("expected record");
        }
    }

    #[test]
    #[serial]
    fn log_with_emits_at_level_with_channel() {
        reset();
        let (entries, _s) = recording_sink();
        let ctx = create_log_context(Some("render"), rec(&[("frame", LogValue::Number(1.0))]));
        log_with(&ctx, LogLevel::Info, "update");
        let entries = entries.lock().unwrap();
        assert_eq!(entries[0].level, LogLevel::Info);
        assert_eq!(entries[0].channel.as_deref(), Some("render"));
        if let LogData::Record(r) = &entries[0].data {
            assert_eq!(r.get("msg"), Some(&LogValue::String("update".to_owned())));
            assert_eq!(r.get("frame"), Some(&LogValue::Number(1.0)));
        } else {
            panic!("expected record");
        }
    }

    #[test]
    #[serial]
    fn log_with_passes_record_merged() {
        reset();
        let (entries, _s) = recording_sink();
        let ctx = create_log_context(None, rec(&[("base", LogValue::Number(1.0))]));
        log_with(
            &ctx,
            LogLevel::Debug,
            rec(&[("extra", LogValue::Number(2.0))]),
        );
        let entries = entries.lock().unwrap();
        if let LogData::Record(r) = &entries[0].data {
            assert_eq!(r.get("base"), Some(&LogValue::Number(1.0)));
            assert_eq!(r.get("extra"), Some(&LogValue::Number(2.0)));
        } else {
            panic!("expected record");
        }
    }

    #[test]
    #[serial]
    fn parse_log_level_canonical() {
        assert_eq!(parse_log_level("error"), Some(LogLevel::Error));
        assert_eq!(parse_log_level("warn"), Some(LogLevel::Warn));
        assert_eq!(parse_log_level("info"), Some(LogLevel::Info));
        assert_eq!(parse_log_level("debug"), Some(LogLevel::Debug));
        assert_eq!(parse_log_level("verbose"), Some(LogLevel::Verbose));
        assert_eq!(parse_log_level("none"), Some(LogLevel::None));
    }

    #[test]
    #[serial]
    fn parse_log_level_case_insensitive() {
        assert_eq!(parse_log_level("ERROR"), Some(LogLevel::Error));
        assert_eq!(parse_log_level("Warn"), Some(LogLevel::Warn));
    }

    #[test]
    #[serial]
    fn parse_log_level_unknown_is_none() {
        assert_eq!(parse_log_level("unknown"), None);
        assert_eq!(parse_log_level(""), None);
    }

    #[test]
    #[serial]
    fn register_log_serializer_applies_on_match() {
        reset();
        register_log_serializer(
            "acme.Point",
            Arc::new(|v| {
                let (x, y) = if let LogValue::Object(o) = v {
                    (
                        o.get("x").cloned().unwrap_or(LogValue::Null),
                        o.get("y").cloned().unwrap_or(LogValue::Null),
                    )
                } else {
                    (LogValue::Null, LogValue::Null)
                };
                rec(&[(
                    "serialized",
                    LogValue::String(format!(
                        "({},{})",
                        value_to_display(&x),
                        value_to_display(&y)
                    )),
                )])
            }),
        );
        let fmt = create_json_log_formatter();
        let entry = LogEntry {
            level: LogLevel::Info,
            channel: None,
            data: LogData::Record(rec(&[(
                "pt",
                LogValue::Object(rec(&[
                    ("__kind", LogValue::String("acme.Point".to_owned())),
                    ("x", LogValue::Number(3.0)),
                    ("y", LogValue::Number(4.0)),
                ])),
            )])),
        };
        let result = fmt(&entry);
        assert!(result.contains("\"serialized\":\"(3,4)\""));
    }

    #[test]
    #[serial]
    fn remove_log_sink_removes_and_returns_true() {
        reset();
        let entries: Arc<Mutex<Vec<LogEntry>>> = Arc::new(Mutex::new(Vec::new()));
        let captured = entries.clone();
        let sink: LogSink = Arc::new(move |e: &LogEntry| captured.lock().unwrap().push(e.clone()));
        add_log_sink(sink.clone());
        assert!(remove_log_sink(&sink));
        log(LogLevel::Info, "x", None);
        assert_eq!(entries.lock().unwrap().len(), 0);
    }

    #[test]
    #[serial]
    fn remove_log_sink_returns_false_when_absent() {
        reset();
        let sink: LogSink = Arc::new(|_: &LogEntry| {});
        assert!(!remove_log_sink(&sink));
    }

    #[test]
    #[serial]
    fn serialize_log_error_extracts_fields() {
        let err = LogValue::Object(rec(&[
            ("name", LogValue::String("Error".to_owned())),
            ("message", LogValue::String("boom".to_owned())),
            ("stack", LogValue::String("at x".to_owned())),
        ]));
        let result = serialize_log_error(&err);
        assert_eq!(
            result.get("name"),
            Some(&LogValue::String("Error".to_owned()))
        );
        assert_eq!(
            result.get("message"),
            Some(&LogValue::String("boom".to_owned()))
        );
        assert!(matches!(result.get("stack"), Some(LogValue::String(_))));
    }

    #[test]
    #[serial]
    fn serialize_log_error_recurses_cause() {
        let outer = LogValue::Object(rec(&[
            ("name", LogValue::String("Error".to_owned())),
            ("message", LogValue::String("outer".to_owned())),
            (
                "cause",
                LogValue::Object(rec(&[
                    ("name", LogValue::String("Error".to_owned())),
                    ("message", LogValue::String("inner".to_owned())),
                ])),
            ),
        ]));
        let result = serialize_log_error(&outer);
        if let Some(LogValue::Object(cause)) = result.get("cause") {
            assert_eq!(
                cause.get("message"),
                Some(&LogValue::String("inner".to_owned()))
            );
        } else {
            panic!("expected cause object");
        }
    }

    #[test]
    #[serial]
    fn serialize_log_error_wraps_non_error() {
        let result = serialize_log_error(&LogValue::String("oops".to_owned()));
        assert_eq!(
            result.get("value"),
            Some(&LogValue::String("oops".to_owned()))
        );
        let result = serialize_log_error(&LogValue::Number(42.0));
        assert_eq!(
            result.get("value"),
            Some(&LogValue::String("42".to_owned()))
        );
    }

    #[test]
    #[serial]
    fn set_log_channel_level_suppresses_below() {
        reset();
        let (entries, _s) = recording_sink();
        set_log_channel_level("render", LogLevel::Error);
        log(LogLevel::Info, "info", Some("render"));
        log(LogLevel::Error, "error", Some("render"));
        let entries = entries.lock().unwrap();
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].level, LogLevel::Error);
    }

    #[test]
    #[serial]
    fn set_log_channel_level_does_not_affect_others() {
        reset();
        let (entries, _s) = recording_sink();
        set_log_channel_level("render", LogLevel::Error);
        log(LogLevel::Info, "other", Some("audio"));
        assert_eq!(entries.lock().unwrap().len(), 1);
    }

    #[test]
    #[serial]
    fn set_log_level_suppresses_below() {
        reset();
        let (entries, _s) = recording_sink();
        set_log_level(LogLevel::Error);
        log(LogLevel::Info, "suppressed", None);
        log(LogLevel::Error, "emitted", None);
        let entries = entries.lock().unwrap();
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].data, LogData::Message("emitted".to_owned()));
    }

    #[test]
    #[serial]
    fn set_log_level_none_always_suppresses() {
        reset();
        let (entries, _s) = recording_sink();
        set_log_level(LogLevel::None);
        log(LogLevel::None, "should not emit", None);
        assert_eq!(entries.lock().unwrap().len(), 0);
    }

    #[test]
    #[serial]
    fn set_log_redaction_paths_top_level() {
        reset();
        set_log_redaction_paths(&["password"]);
        let fmt = create_json_log_formatter();
        let entry = LogEntry {
            level: LogLevel::Info,
            channel: None,
            data: LogData::Record(rec(&[
                ("user", LogValue::String("alice".to_owned())),
                ("password", LogValue::String("secret".to_owned())),
            ])),
        };
        let result = fmt(&entry);
        assert!(result.contains("\"password\":\"[REDACTED]\""));
        assert!(result.contains("\"user\":\"alice\""));
    }

    #[test]
    #[serial]
    fn set_log_redaction_paths_nested() {
        reset();
        set_log_redaction_paths(&["auth.secret"]);
        let fmt = create_json_log_formatter();
        let entry = LogEntry {
            level: LogLevel::Info,
            channel: None,
            data: LogData::Record(rec(&[(
                "auth",
                LogValue::Object(rec(&[
                    ("secret", LogValue::String("tok".to_owned())),
                    ("name", LogValue::String("jwt".to_owned())),
                ])),
            )])),
        };
        let result = fmt(&entry);
        assert!(result.contains("\"secret\":\"[REDACTED]\""));
        assert!(result.contains("\"name\":\"jwt\""));
    }

    #[test]
    #[serial]
    fn set_log_redaction_paths_alias_safe() {
        reset();
        set_log_redaction_paths(&["key"]);
        let original = rec(&[
            ("key", LogValue::String("value".to_owned())),
            ("other", LogValue::String("safe".to_owned())),
        ]);
        let entry = LogEntry {
            level: LogLevel::Info,
            channel: None,
            data: LogData::Record(original.clone()),
        };
        let fmt = create_json_log_formatter();
        fmt(&entry);
        // The original record is unchanged.
        assert_eq!(
            original.get("key"),
            Some(&LogValue::String("value".to_owned()))
        );
    }

    #[test]
    #[serial]
    fn set_log_sink_null_clears() {
        reset();
        let (entries, _s) = recording_sink();
        set_log_sink(None);
        log(LogLevel::Info, "x", None);
        assert_eq!(entries.lock().unwrap().len(), 0);
    }

    #[test]
    #[serial]
    fn set_log_sink_replaces_existing() {
        reset();
        let a: Arc<Mutex<Vec<LogEntry>>> = Arc::new(Mutex::new(Vec::new()));
        let b: Arc<Mutex<Vec<LogEntry>>> = Arc::new(Mutex::new(Vec::new()));
        let aa = a.clone();
        add_log_sink(Arc::new(move |e: &LogEntry| {
            aa.lock().unwrap().push(e.clone())
        }));
        let bb = b.clone();
        set_log_sink(Some(Arc::new(move |e: &LogEntry| {
            bb.lock().unwrap().push(e.clone())
        })));
        log(LogLevel::Info, "x", None);
        assert_eq!(a.lock().unwrap().len(), 0);
        assert_eq!(b.lock().unwrap().len(), 1);
    }

    #[test]
    #[serial]
    fn set_log_transport_backend_set_and_clear() {
        reset();
        let backend = create_web_log_transport_backend();
        set_log_transport_backend(Some(backend));
        assert!(get_log_transport_backend().is_some());
        set_log_transport_backend(None);
        assert!(get_log_transport_backend().is_none());
    }

    #[test]
    #[serial]
    fn start_log_timer_holds_label_and_channel() {
        reset();
        let timer = start_log_timer("render", Some("perf"));
        assert_eq!(timer.label, "render");
        assert_eq!(timer.channel.as_deref(), Some("perf"));
        assert!(timer.started_at >= 0.0);
    }

    // --- Helpers/backends used only by tests ---

    fn clear_once_keys() {
        state().once_keys.clear();
    }

    struct VecBackend {
        lines: Arc<Mutex<Vec<String>>>,
    }
    impl LogTransportBackend for VecBackend {
        fn write(&self, line: &str) {
            self.lines.lock().unwrap().push(line.to_owned());
        }
    }

    struct CountingBackend {
        flushed: Arc<Mutex<u32>>,
        disposed: Arc<Mutex<u32>>,
    }
    impl LogTransportBackend for CountingBackend {
        fn write(&self, _line: &str) {}
        fn flush(&self) {
            *self.flushed.lock().unwrap() += 1;
        }
        fn dispose(&self) {
            *self.disposed.lock().unwrap() += 1;
        }
    }
}
