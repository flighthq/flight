use std::cell::RefCell;
use std::collections::HashMap;
use std::rc::Rc;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::Instant;

use flight_signals::{create_signal, emit_signal, Signal};

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

impl Default for LogLevel {
    fn default() -> Self {
        return LogLevel::None;
    }
}

/// Structured log data: either a plain string message or a map of key-value pairs.
#[derive(Clone, Debug)]
pub enum LogData {
    Message(String),
    Record(HashMap<String, LogValue>),
}

/// Values that can appear inside a LogData::Record.
#[derive(Clone, Debug)]
pub enum LogValue {
    Null,
    Bool(bool),
    Int(i64),
    Float(f64),
    Str(String),
    Record(HashMap<String, LogValue>),
    Array(Vec<LogValue>),
}

/// A single log entry forwarded to sinks.
#[derive(Clone, Debug)]
pub struct LogEntry {
    pub level: LogLevel,
    pub channel: Option<String>,
    pub data: LogData,
}

/// Callback type for receiving log entries.
pub type LogSink = Rc<dyn Fn(&LogEntry)>;

/// A bound logging context with a channel and optional base fields.
#[derive(Clone, Debug)]
pub struct LogContext {
    pub channel: Option<String>,
    pub fields: HashMap<String, LogValue>,
}

static SPAN_ID_COUNTER: AtomicU64 = AtomicU64::new(1);

/// A named tracing span.
#[derive(Clone, Debug)]
pub struct LogSpan {
    pub id: u64,
    pub name: String,
    pub channel: Option<String>,
    pub fields: HashMap<String, LogValue>,
}

/// A timer handle returned by start_log_timer.
#[derive(Clone, Debug)]
pub struct LogTimer {
    pub label: String,
    pub channel: Option<String>,
    pub started_at: f64,
}

/// A handle to a memory sink.
#[derive(Clone)]
pub struct MemoryLogSink {
    pub sink: LogSink,
    state: Rc<RefCell<MemoryLogSinkState>>,
}

/// A handle to a buffered log sink.
#[derive(Clone)]
pub struct BufferedLogSink {
    pub sink: LogSink,
    state: Rc<RefCell<BufferedLogSinkState>>,
}

/// A handle to a rate-limited log sink.
#[derive(Clone)]
pub struct RateLimitedLogSink {
    pub sink: LogSink,
}

/// Log signals entity.
pub struct LogSignals {
    pub on_log_entry: Signal<LogEntry>,
    pub on_log_error: Signal<LogEntry>,
}

/// Log formatter: a function that takes a LogEntry and produces a String.
pub type LogFormatter = Rc<dyn Fn(&LogEntry) -> String>;

/// Log data provider: lazy evaluation for expensive data construction.
pub type LogDataProvider = Rc<dyn Fn() -> LogData>;

/// Either direct data or a lazy provider.
pub enum LogDataOrProvider {
    Data(LogData),
    Provider(LogDataProvider),
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

// ---------------------------------------------------------------------------
// Internal state
// ---------------------------------------------------------------------------

struct MemoryLogSinkState {
    buf: Vec<LogEntry>,
    head: usize,
}

struct BufferedLogSinkState {
    buf: Vec<LogEntry>,
    target: LogSink,
    size: usize,
}

thread_local! {
    static SINKS: RefCell<Vec<LogSink>> = RefCell::new(Vec::new());
    static LEVEL: RefCell<LogLevel> = RefCell::new(LogLevel::Verbose);
    static CONSOLE_LEVEL: RefCell<LogLevel> = RefCell::new(LogLevel::Info);
    static CHANNEL_LEVELS: RefCell<HashMap<String, LogLevel>> = RefCell::new(HashMap::new());
    static ONCE_KEYS: RefCell<std::collections::HashSet<String>> = RefCell::new(std::collections::HashSet::new());
    static REDACTION_PATHS: RefCell<Vec<String>> = RefCell::new(Vec::new());
    static SERIALIZERS: RefCell<HashMap<String, Rc<dyn Fn(&HashMap<String, LogValue>) -> HashMap<String, LogValue>>>> = RefCell::new(HashMap::new());
    static GROUP_DEPTH: RefCell<i32> = RefCell::new(0);
    static SPAN_STACK: RefCell<Vec<LogSpan>> = RefCell::new(Vec::new());
    static LOG_SIGNALS: RefCell<Option<Rc<LogSignals>>> = RefCell::new(None);
    static START_INSTANT: RefCell<Option<Instant>> = RefCell::new(None);
}

fn timestamp() -> f64 {
    return START_INSTANT.with(|cell| {
        let mut opt = cell.borrow_mut();
        if opt.is_none() {
            *opt = Some(Instant::now());
        }
        return opt.unwrap().elapsed().as_secs_f64() * 1000.0;
    });
}

// ---------------------------------------------------------------------------
// Level name lookups
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

fn passes_level_gate(level: LogLevel, channel: &Option<String>) -> bool {
    let has_sinks = SINKS.with(|s| !s.borrow().is_empty());
    let has_signals = LOG_SIGNALS.with(|s| s.borrow().is_some());
    if !has_sinks && !has_signals {
        return false;
    }
    let gate = match channel {
        Some(ch) => CHANNEL_LEVELS.with(|cl| {
            let map = cl.borrow();
            match map.get(ch) {
                Some(&lvl) => lvl,
                None => LEVEL.with(|l| *l.borrow()),
            }
        }),
        None => LEVEL.with(|l| *l.borrow()),
    };
    return level <= gate && level != LogLevel::None;
}

fn emit_to_sinks(entry: &LogEntry) {
    SINKS.with(|s| {
        let sinks = s.borrow();
        for sink in sinks.iter() {
            sink(entry);
        }
    });
    LOG_SIGNALS.with(|s| {
        let signals_opt = s.borrow();
        if let Some(ref signals) = *signals_opt {
            emit_signal(&signals.on_log_entry, entry);
            if entry.level == LogLevel::Error {
                emit_signal(&signals.on_log_error, entry);
            }
        }
    });
}

fn resolve_data(data: LogDataOrProvider) -> LogData {
    return match data {
        LogDataOrProvider::Data(d) => d,
        LogDataOrProvider::Provider(p) => p(),
    };
}

fn merge_span_fields(data: LogData, _channel: &Option<String>) -> LogData {
    return SPAN_STACK.with(|stack| {
        let spans = stack.borrow();
        if spans.is_empty() {
            return data;
        }
        // Accumulate span fields oldest-first so newer spans overwrite older ones.
        let mut span_fields: HashMap<String, LogValue> = HashMap::new();
        for span in spans.iter() {
            for (k, v) in span.fields.iter() {
                span_fields.insert(k.clone(), v.clone());
            }
        }
        if span_fields.is_empty() {
            return data;
        }
        // Data fields win over span fields on key collision.
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
    });
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

// ---------------------------------------------------------------------------
// Serializer / redaction helpers
// ---------------------------------------------------------------------------

fn apply_serializers(data: HashMap<String, LogValue>) -> HashMap<String, LogValue> {
    return SERIALIZERS.with(|s| {
        let serializers = s.borrow();
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
    });
}

fn apply_redaction(data: HashMap<String, LogValue>) -> HashMap<String, LogValue> {
    return REDACTION_PATHS.with(|paths| {
        let paths = paths.borrow();
        if paths.is_empty() {
            return data;
        }
        let mut result = data;
        for path in paths.iter() {
            let parts: Vec<&str> = path.split('.').collect();
            redact_path(&mut result, &parts, 0);
        }
        return result;
    });
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
    // Deep-copy one level before mutating.
    let should_recurse = matches!(obj.get(key), Some(LogValue::Record(_)));
    if should_recurse {
        if let Some(LogValue::Record(inner)) = obj.remove(key) {
            let mut inner_copy = inner;
            redact_path(&mut inner_copy, parts, idx + 1);
            obj.insert(key.to_string(), LogValue::Record(inner_copy));
        }
    }
}

// ---------------------------------------------------------------------------
// JSON formatting helper
// ---------------------------------------------------------------------------

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
    };
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

// ---------------------------------------------------------------------------
// create_* / initialize_* functions (constructors first)
// ---------------------------------------------------------------------------

/// Creates a sink that batches entries and forwards them to `target` in bulk.
/// The buffer flushes when it reaches `size` entries. Use flush_log_sink to
/// flush manually, dispose_log_sink to release the resource.
pub fn create_buffered_log_sink(target: LogSink, size: Option<usize>) -> BufferedLogSink {
    let size = size.unwrap_or(100);
    let state = Rc::new(RefCell::new(BufferedLogSinkState {
        buf: Vec::new(),
        target: target.clone(),
        size,
    }));

    let state_for_sink = state.clone();
    let target_for_flush = target.clone();
    let sink: LogSink = Rc::new(move |entry: &LogEntry| {
        let should_flush;
        {
            let mut s = state_for_sink.borrow_mut();
            s.buf.push(entry.clone());
            should_flush = s.buf.len() >= s.size;
        }
        if should_flush {
            let batch: Vec<LogEntry>;
            {
                let mut s = state_for_sink.borrow_mut();
                batch = s.buf.drain(..).collect();
            }
            for e in batch.iter() {
                target_for_flush(e);
            }
        }
    });

    return BufferedLogSink {
        sink,
        state,
    };
}

/// Creates a child context that inherits the parent's channel and fields. The child wins on key
/// collision. An explicit channel overrides the parent's channel.
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
    return LogContext {
        channel: ch,
        fields: merged,
    };
}

/// Creates a fan-out sink that forwards every entry to all supplied sinks.
pub fn create_fanout_log_sink(sinks: Vec<LogSink>) -> LogSink {
    let list = sinks;
    return Rc::new(move |entry: &LogEntry| {
        for s in list.iter() {
            s(entry);
        }
    });
}

/// Creates a sink that forwards only entries matching a predicate.
pub fn create_filter_log_sink(
    target: LogSink,
    predicate: Rc<dyn Fn(&LogEntry) -> bool>,
) -> LogSink {
    return Rc::new(move |entry: &LogEntry| {
        if predicate(entry) {
            target(entry);
        }
    });
}

/// Creates a formatter that produces the __flight JSON envelope.
pub fn create_json_log_formatter() -> LogFormatter {
    return Rc::new(|entry: &LogEntry| {
        let data_record = match &entry.data {
            LogData::Message(msg) => {
                let mut m = HashMap::new();
                m.insert("msg".to_string(), LogValue::Str(msg.clone()));
                m
            }
            LogData::Record(rec) => rec.clone(),
        };
        let serialized = apply_serializers(data_record);
        let redacted = apply_redaction(serialized);
        let t = timestamp();
        let level_str = level_name(entry.level);
        let channel_str = match &entry.channel {
            Some(ch) => format!("\"{}\"", escape_json_string(ch)),
            None => "null".to_string(),
        };
        let data_json = log_value_to_json(&LogValue::Record(redacted));
        return format!(
            "{{\"__flight\":true,\"t\":{},\"level\":\"{}\",\"channel\":{},\"data\":{}}}",
            t, level_str, channel_str, data_json
        );
    });
}

/// Creates a bound logging context with a channel and optional base fields.
pub fn create_log_context(
    channel: Option<String>,
    fields: Option<HashMap<String, LogValue>>,
) -> LogContext {
    return LogContext {
        channel,
        fields: fields.unwrap_or_default(),
    };
}

/// Creates a named tracing span.
pub fn create_log_span(
    name: &str,
    fields: Option<HashMap<String, LogValue>>,
    channel: Option<String>,
) -> LogSpan {
    return LogSpan {
        id: SPAN_ID_COUNTER.fetch_add(1, Ordering::Relaxed),
        name: name.to_string(),
        channel,
        fields: fields.unwrap_or_default(),
    };
}

/// Creates a sink that captures the last `capacity` entries in a ring buffer.
pub fn create_memory_log_sink(capacity: usize) -> MemoryLogSink {
    let state = Rc::new(RefCell::new(MemoryLogSinkState {
        buf: Vec::new(),
        head: 0,
    }));
    let state_for_sink = state.clone();
    let sink: LogSink = Rc::new(move |entry: &LogEntry| {
        let stored = entry.clone();
        let mut s = state_for_sink.borrow_mut();
        if s.buf.len() < capacity {
            s.buf.push(stored);
        } else {
            let head = s.head;
            s.buf[head] = stored;
            s.head = (head + 1) % capacity;
        }
    });
    return MemoryLogSink { sink, state };
}

/// Creates a sink that forwards at most `max_per_interval` entries per `interval_ms` window.
pub fn create_rate_limited_log_sink(
    target: LogSink,
    max_per_interval: usize,
    interval_ms: f64,
    per_channel: bool,
) -> RateLimitedLogSink {
    let counts: Rc<RefCell<HashMap<Option<String>, usize>>> = Rc::new(RefCell::new(HashMap::new()));
    let window_start: Rc<RefCell<f64>> = Rc::new(RefCell::new(timestamp()));

    let sink: LogSink = Rc::new(move |entry: &LogEntry| {
        let now = timestamp();
        {
            let mut ws = window_start.borrow_mut();
            if now - *ws >= interval_ms {
                counts.borrow_mut().clear();
                *ws = now;
            }
        }
        let key = if per_channel { entry.channel.clone() } else { None };
        let current = {
            let c = counts.borrow();
            *c.get(&key).unwrap_or(&0)
        };
        if current >= max_per_interval {
            return;
        }
        counts.borrow_mut().insert(key, current + 1);
        target(entry);
    });
    return RateLimitedLogSink { sink };
}

/// Creates a sink that forwards approximately 1-in-N entries.
pub fn create_sampled_log_sink(target: LogSink, rate: usize) -> LogSink {
    if rate <= 1 {
        return Rc::new(move |entry: &LogEntry| target(entry));
    }
    let counter = Rc::new(RefCell::new(0usize));
    return Rc::new(move |entry: &LogEntry| {
        let mut c = counter.borrow_mut();
        *c = (*c + 1) % rate;
        if *c == 0 {
            target(entry);
        }
    });
}

/// Creates a formatter that produces a human-readable line.
pub fn create_text_log_formatter(
    indent_groups: bool,
    level_prefix: bool,
    with_timestamp: bool,
) -> LogFormatter {
    return Rc::new(move |entry: &LogEntry| {
        let mut parts: Vec<String> = Vec::new();
        if with_timestamp {
            parts.push(format!("t={:.2}", timestamp()));
        }
        if level_prefix {
            parts.push(level_name(entry.level).to_string());
        }
        match &entry.channel {
            Some(ch) => parts.push(format!("[{}]", ch)),
            None => parts.push("[flight]".to_string()),
        }
        if indent_groups {
            let depth = GROUP_DEPTH.with(|d| *d.borrow());
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

// ---------------------------------------------------------------------------
// Alphabetical public functions
// ---------------------------------------------------------------------------

/// Adds a sink to the fan-out list. No-op if already present (compares by Rc pointer).
pub fn add_log_sink(sink: LogSink) {
    SINKS.with(|s| {
        let mut sinks = s.borrow_mut();
        for existing in sinks.iter() {
            if Rc::ptr_eq(existing, &sink) {
                return;
            }
        }
        sinks.push(sink);
    });
}

/// Opens a named log group.
pub fn begin_log_group(label: &str, channel: Option<String>) {
    GROUP_DEPTH.with(|d| {
        *d.borrow_mut() += 1;
    });
    if !passes_level_gate(LogLevel::Debug, &channel) {
        return;
    }
    let depth = GROUP_DEPTH.with(|d| *d.borrow());
    let mut data = HashMap::new();
    data.insert("msg".to_string(), LogValue::Str(label.to_string()));
    data.insert("group".to_string(), LogValue::Str("begin".to_string()));
    data.insert("depth".to_string(), LogValue::Int(depth as i64));
    emit_to_sinks(&LogEntry {
        level: LogLevel::Debug,
        channel,
        data: LogData::Record(data),
    });
}

/// Clears one per-channel level override.
pub fn clear_log_channel_level(channel: &str) {
    CHANNEL_LEVELS.with(|cl| {
        cl.borrow_mut().remove(channel);
    });
}

/// Clears all per-channel level overrides.
pub fn clear_log_channel_levels() {
    CHANNEL_LEVELS.with(|cl| {
        cl.borrow_mut().clear();
    });
}

/// Resets the group nesting depth to zero without emitting any entries.
pub fn clear_log_groups() {
    GROUP_DEPTH.with(|d| {
        *d.borrow_mut() = 0;
    });
}

/// Clears the set of keys that log_once has already emitted.
pub fn clear_log_once_keys() {
    ONCE_KEYS.with(|keys| {
        keys.borrow_mut().clear();
    });
}

/// Clears all field redaction paths.
pub fn clear_log_redaction_paths() {
    REDACTION_PATHS.with(|paths| {
        paths.borrow_mut().clear();
    });
}

/// Clears all custom serializer registrations.
pub fn clear_log_serializers() {
    SERIALIZERS.with(|s| {
        s.borrow_mut().clear();
    });
}

/// Clears all installed sinks.
pub fn clear_log_sinks() {
    SINKS.with(|s| {
        s.borrow_mut().clear();
    });
}

/// Clears all captured entries from a memory sink.
pub fn clear_memory_log_sink(handle: &MemoryLogSink) {
    let mut s = handle.state.borrow_mut();
    s.buf.clear();
    s.head = 0;
}

/// Disposes a buffered sink: flushes remaining entries.
pub fn dispose_log_sink(handle: &BufferedLogSink) {
    let batch: Vec<LogEntry>;
    let target: LogSink;
    {
        let mut s = handle.state.borrow_mut();
        batch = s.buf.drain(..).collect();
        target = s.target.clone();
    }
    for e in batch.iter() {
        target(e);
    }
}

/// Enables the log signals group. Returns the process-global LogSignals entity.
pub fn enable_log_signals() -> Rc<LogSignals> {
    return LOG_SIGNALS.with(|s| {
        let mut opt = s.borrow_mut();
        if let Some(ref signals) = *opt {
            return signals.clone();
        }
        let signals = Rc::new(LogSignals {
            on_log_entry: create_signal(),
            on_log_error: create_signal(),
        });
        *opt = Some(signals.clone());
        return signals;
    });
}

/// Closes the innermost open log group.
pub fn end_log_group(channel: Option<String>) {
    let depth = GROUP_DEPTH.with(|d| *d.borrow());
    if depth <= 0 {
        return;
    }
    GROUP_DEPTH.with(|d| {
        *d.borrow_mut() -= 1;
    });
    if !passes_level_gate(LogLevel::Debug, &channel) {
        return;
    }
    let mut data = HashMap::new();
    data.insert("group".to_string(), LogValue::Str("end".to_string()));
    data.insert("depth".to_string(), LogValue::Int(depth as i64));
    emit_to_sinks(&LogEntry {
        level: LogLevel::Debug,
        channel,
        data: LogData::Record(data),
    });
}

/// Ends a timer, emits a structured Debug entry with the elapsed milliseconds.
pub fn end_log_timer(timer: &LogTimer) -> f64 {
    let elapsed = timestamp() - timer.started_at;
    let mut data = HashMap::new();
    data.insert("label".to_string(), LogValue::Str(timer.label.clone()));
    data.insert("elapsedMs".to_string(), LogValue::Float(elapsed));
    log_debug(LogData::Record(data).into(), timer.channel.clone());
    return elapsed;
}

/// Activates a log span, pushing it onto the active-span stack.
pub fn enter_log_span(span: &LogSpan) {
    SPAN_STACK.with(|stack| {
        stack.borrow_mut().push(span.clone());
    });
}

/// Deactivates a log span by removing it from the active-span stack.
pub fn exit_log_span(span: &LogSpan) {
    SPAN_STACK.with(|stack| {
        let mut spans = stack.borrow_mut();
        // Remove by unique span ID (matching TS behavior of identity-based removal).
        if let Some(idx) = spans.iter().position(|s| s.id == span.id) {
            spans.remove(idx);
        }
    });
}

/// Flushes a buffered sink immediately.
pub fn flush_log_sink(handle: &BufferedLogSink) {
    let batch: Vec<LogEntry>;
    let target: LogSink;
    {
        let mut s = handle.state.borrow_mut();
        if s.buf.is_empty() {
            return;
        }
        batch = s.buf.drain(..).collect();
        target = s.target.clone();
    }
    for e in batch.iter() {
        target(e);
    }
}

/// Returns the per-channel level override, or None if not set.
pub fn get_log_channel_level(channel: &str) -> Option<LogLevel> {
    return CHANNEL_LEVELS.with(|cl| {
        cl.borrow().get(channel).copied()
    });
}

/// Returns the current console threshold level.
pub fn get_log_console_level() -> LogLevel {
    return CONSOLE_LEVEL.with(|l| *l.borrow());
}

/// Returns the current global minimum emit level.
pub fn get_log_level() -> LogLevel {
    return LEVEL.with(|l| *l.borrow());
}

/// Returns the canonical lowercase name for a LogLevel value.
pub fn get_log_level_name(level: LogLevel) -> &'static str {
    return level_name(level);
}

/// Returns the captured log entries from a memory sink in insertion order (oldest-first).
pub fn get_memory_log_sink_entries(handle: &MemoryLogSink) -> Vec<LogEntry> {
    let s = handle.state.borrow();
    let head = s.head;
    if head == 0 {
        return s.buf.clone();
    }
    // Ring buffer wrapped.
    let mut result = Vec::with_capacity(s.buf.len());
    result.extend_from_slice(&s.buf[head..]);
    result.extend_from_slice(&s.buf[..head]);
    return result;
}

/// Emits a log entry at an explicit level.
pub fn log(level: LogLevel, data: LogDataOrProvider, channel: Option<String>) {
    if !passes_level_gate(level, &channel) {
        return;
    }
    let resolved = resolve_data(data);
    let merged = merge_span_fields(resolved, &channel);
    emit_to_sinks(&LogEntry {
        level,
        channel,
        data: merged,
    });
}

/// Emits an Error-level entry only when condition is false.
pub fn log_assert(condition: bool, data: LogDataOrProvider, channel: Option<String>) {
    if condition {
        return;
    }
    if !passes_level_gate(LogLevel::Error, &channel) {
        return;
    }
    let resolved = resolve_data(data);
    let merged = merge_span_fields(resolved, &channel);
    emit_to_sinks(&LogEntry {
        level: LogLevel::Error,
        channel,
        data: merged,
    });
}

/// Emits at Debug level.
pub fn log_debug(data: LogDataOrProvider, channel: Option<String>) {
    if !passes_level_gate(LogLevel::Debug, &channel) {
        return;
    }
    let resolved = resolve_data(data);
    let merged = merge_span_fields(resolved, &channel);
    emit_to_sinks(&LogEntry {
        level: LogLevel::Debug,
        channel,
        data: merged,
    });
}

/// Emits at Debug level with merged context fields.
pub fn log_debug_with(context: &LogContext, data: LogDataOrProvider) {
    let channel = context.channel.clone();
    if !passes_level_gate(LogLevel::Debug, &channel) {
        return;
    }
    let resolved = resolve_data(data);
    let merged = merge_span_fields(resolved, &channel);
    let merged = merge_context_fields(context, merged);
    emit_to_sinks(&LogEntry {
        level: LogLevel::Debug,
        channel,
        data: merged,
    });
}

/// Emits at Error level.
pub fn log_error(data: LogDataOrProvider, channel: Option<String>) {
    if !passes_level_gate(LogLevel::Error, &channel) {
        return;
    }
    let resolved = resolve_data(data);
    let merged = merge_span_fields(resolved, &channel);
    emit_to_sinks(&LogEntry {
        level: LogLevel::Error,
        channel,
        data: merged,
    });
}

/// Emits at Error level with merged context fields.
pub fn log_error_with(context: &LogContext, data: LogDataOrProvider) {
    let channel = context.channel.clone();
    if !passes_level_gate(LogLevel::Error, &channel) {
        return;
    }
    let resolved = resolve_data(data);
    let merged = merge_span_fields(resolved, &channel);
    let merged = merge_context_fields(context, merged);
    emit_to_sinks(&LogEntry {
        level: LogLevel::Error,
        channel,
        data: merged,
    });
}

/// Emits at Info level.
pub fn log_info(data: LogDataOrProvider, channel: Option<String>) {
    if !passes_level_gate(LogLevel::Info, &channel) {
        return;
    }
    let resolved = resolve_data(data);
    let merged = merge_span_fields(resolved, &channel);
    emit_to_sinks(&LogEntry {
        level: LogLevel::Info,
        channel,
        data: merged,
    });
}

/// Emits at Info level with merged context fields.
pub fn log_info_with(context: &LogContext, data: LogDataOrProvider) {
    let channel = context.channel.clone();
    if !passes_level_gate(LogLevel::Info, &channel) {
        return;
    }
    let resolved = resolve_data(data);
    let merged = merge_span_fields(resolved, &channel);
    let merged = merge_context_fields(context, merged);
    emit_to_sinks(&LogEntry {
        level: LogLevel::Info,
        channel,
        data: merged,
    });
}

/// Emits a given key at most once per process lifetime.
pub fn log_once(
    key: &str,
    level: LogLevel,
    data: LogDataOrProvider,
    channel: Option<String>,
) -> bool {
    let already = ONCE_KEYS.with(|keys| {
        let k = keys.borrow();
        k.contains(key)
    });
    if already {
        return false;
    }
    ONCE_KEYS.with(|keys| {
        keys.borrow_mut().insert(key.to_string());
    });
    log(level, data, channel);
    return true;
}

/// Emits at Verbose level.
pub fn log_verbose(data: LogDataOrProvider, channel: Option<String>) {
    if !passes_level_gate(LogLevel::Verbose, &channel) {
        return;
    }
    let resolved = resolve_data(data);
    let merged = merge_span_fields(resolved, &channel);
    emit_to_sinks(&LogEntry {
        level: LogLevel::Verbose,
        channel,
        data: merged,
    });
}

/// Emits at Verbose level with merged context fields.
pub fn log_verbose_with(context: &LogContext, data: LogDataOrProvider) {
    let channel = context.channel.clone();
    if !passes_level_gate(LogLevel::Verbose, &channel) {
        return;
    }
    let resolved = resolve_data(data);
    let merged = merge_span_fields(resolved, &channel);
    let merged = merge_context_fields(context, merged);
    emit_to_sinks(&LogEntry {
        level: LogLevel::Verbose,
        channel,
        data: merged,
    });
}

/// Emits at Warn level.
pub fn log_warn(data: LogDataOrProvider, channel: Option<String>) {
    if !passes_level_gate(LogLevel::Warn, &channel) {
        return;
    }
    let resolved = resolve_data(data);
    let merged = merge_span_fields(resolved, &channel);
    emit_to_sinks(&LogEntry {
        level: LogLevel::Warn,
        channel,
        data: merged,
    });
}

/// Emits at Warn level with merged context fields.
pub fn log_warn_with(context: &LogContext, data: LogDataOrProvider) {
    let channel = context.channel.clone();
    if !passes_level_gate(LogLevel::Warn, &channel) {
        return;
    }
    let resolved = resolve_data(data);
    let merged = merge_span_fields(resolved, &channel);
    let merged = merge_context_fields(context, merged);
    emit_to_sinks(&LogEntry {
        level: LogLevel::Warn,
        channel,
        data: merged,
    });
}

/// Emits a log entry using the bound channel and merged fields from a LogContext.
pub fn log_with(context: &LogContext, level: LogLevel, data: LogDataOrProvider) {
    let channel = context.channel.clone();
    if !passes_level_gate(level, &channel) {
        return;
    }
    let resolved = resolve_data(data);
    let merged = merge_span_fields(resolved, &channel);
    let merged = merge_context_fields(context, merged);
    emit_to_sinks(&LogEntry {
        level,
        channel,
        data: merged,
    });
}

/// Parses a level name (case-insensitive) back to a LogLevel.
pub fn parse_log_level(name: &str) -> Option<LogLevel> {
    return level_by_name(&name.to_lowercase());
}

/// Registers a custom serializer for a named kind.
pub fn register_log_serializer(
    kind: &str,
    func: Rc<dyn Fn(&HashMap<String, LogValue>) -> HashMap<String, LogValue>>,
) {
    SERIALIZERS.with(|s| {
        s.borrow_mut().insert(kind.to_string(), func);
    });
}

/// Removes a sink from the fan-out list. Returns false if not present.
pub fn remove_log_sink(sink: &LogSink) -> bool {
    return SINKS.with(|s| {
        let mut sinks = s.borrow_mut();
        if let Some(idx) = sinks.iter().position(|existing| Rc::ptr_eq(existing, sink)) {
            sinks.remove(idx);
            return true;
        }
        return false;
    });
}

/// Extracts name/message from an error string into a record.
pub fn serialize_log_error(value: &str) -> HashMap<String, LogValue> {
    let mut result = HashMap::new();
    result.insert("value".to_string(), LogValue::Str(value.to_string()));
    return result;
}

/// Sets a per-channel minimum emit level.
pub fn set_log_channel_level(channel: &str, level: LogLevel) {
    CHANNEL_LEVELS.with(|cl| {
        cl.borrow_mut().insert(channel.to_string(), level);
    });
}

/// Sets the console threshold level.
pub fn set_log_console_level(level: LogLevel) {
    CONSOLE_LEVEL.with(|l| {
        *l.borrow_mut() = level;
    });
}

/// Sets the global minimum emit level.
pub fn set_log_level(level: LogLevel) {
    LEVEL.with(|l| {
        *l.borrow_mut() = level;
    });
}

/// Sets the redaction paths applied by the JSON formatter.
pub fn set_log_redaction_paths(paths: &[String]) {
    REDACTION_PATHS.with(|rp| {
        let mut p = rp.borrow_mut();
        p.clear();
        for path in paths {
            p.push(path.clone());
        }
    });
}

/// Installs (or clears, with None) the single sink.
pub fn set_log_sink(sink: Option<LogSink>) {
    SINKS.with(|s| {
        let mut sinks = s.borrow_mut();
        sinks.clear();
        if let Some(sink) = sink {
            sinks.push(sink);
        }
    });
}

/// Starts a named timer.
pub fn start_log_timer(label: &str, channel: Option<String>) -> LogTimer {
    return LogTimer {
        label: label.to_string(),
        channel,
        started_at: timestamp(),
    };
}
