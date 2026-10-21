use std::cell::RefCell;
use std::collections::HashSet;
use std::rc::Rc;

pub use flight_signals::Signal;

// ============================================================================
// Statechart signals
// ============================================================================

/// Payload of `StatechartSignals.on_state_change`
/// (TS `(regionIndex, previousStateIndex, stateIndex)`).
#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct StatechartStateChangeEvent {
    pub region_index: i32,
    pub previous_state_index: i32,
    pub state_index: i32,
}

// ============================================================================
// Statechart enums
// ============================================================================

#[derive(Clone, Copy, Debug, PartialEq)]
#[repr(u8)]
pub enum StatechartComparison {
    Equal = 0,
    GreaterThan = 1,
    GreaterThanOrEqual = 2,
    LessThan = 3,
    LessThanOrEqual = 4,
    NotEqual = 5,
}

impl Default for StatechartComparison {
    fn default() -> Self {
        return StatechartComparison::Equal;
    }
}

#[derive(Clone, Copy, Debug, PartialEq)]
#[repr(u8)]
pub enum StatechartInputKind {
    Boolean = 0,
    Number = 1,
    Trigger = 2,
}

impl Default for StatechartInputKind {
    fn default() -> Self {
        return StatechartInputKind::Boolean;
    }
}

#[derive(Clone, Copy, Debug, PartialEq)]
#[repr(u8)]
pub enum StatechartTransitionStatus {
    ConditionsUnmet = 0,
    ExitTimePending = 1,
    InvalidRegion = 2,
    MissingRegionDuration = 3,
    NoTransitions = 4,
    Ready = 5,
    Transitioning = 6,
}

impl Default for StatechartTransitionStatus {
    fn default() -> Self {
        return StatechartTransitionStatus::InvalidRegion;
    }
}

// Built-in state kinds. StatechartState.kind is an open string; custom states
// use vendor-prefixed kinds and composition layers interpret those kinds without
// extending a central union.
pub const STATECHART_ATOMIC_STATE_KIND: &str = "Statechart.Atomic";
pub const STATECHART_NESTED_STATE_KIND: &str = "Statechart.Nested";

// ============================================================================
// Statechart data types
// ============================================================================

#[derive(Clone, Debug, Default, PartialEq)]
pub struct StatechartCondition {
    pub comparison: StatechartComparison,
    pub input_index: i32,
    pub value: f64,
}

#[derive(Clone, Debug, PartialEq)]
pub struct StatechartTransition {
    pub conditions: Vec<StatechartCondition>,
    pub duration_ms: f64,
    pub exit_time_ratio: f64,
    pub target_state_index: i32,
}

impl Default for StatechartTransition {
    fn default() -> Self {
        return StatechartTransition {
            conditions: Vec::new(),
            duration_ms: 0.0,
            exit_time_ratio: -1.0,
            target_state_index: 0,
        };
    }
}

#[derive(Clone, Debug, Default, PartialEq)]
pub struct StatechartInput {
    pub initial_value: f64,
    pub kind: StatechartInputKind,
    pub name: String,
}

#[derive(Clone, Debug, Default, PartialEq)]
pub struct StatechartState {
    pub kind: String,
    pub transitions: Vec<StatechartTransition>,
}

#[derive(Clone, Debug, Default, PartialEq)]
pub struct StatechartRegion {
    pub initial_state_index: i32,
    pub states: Vec<StatechartState>,
}

#[derive(Clone, Debug, Default, PartialEq)]
pub struct Statechart {
    pub inputs: Vec<StatechartInput>,
    pub name: Option<String>,
    pub regions: Vec<StatechartRegion>,
}

// ============================================================================
// StatechartSignals
// ============================================================================

#[derive(Clone)]
pub struct StatechartSignals {
    pub on_state_change: Signal<StatechartStateChangeEvent>,
}

impl Default for StatechartSignals {
    fn default() -> Self {
        return StatechartSignals {
            on_state_change: Signal::default(),
        };
    }
}

// ============================================================================
// StatechartTransitionExplanation
// ============================================================================

#[derive(Clone, Debug, PartialEq)]
pub struct StatechartTransitionExplanation {
    pub blend: f32,
    pub condition_index: i32,
    pub region_index: i32,
    pub source_state_index: i32,
    pub status: StatechartTransitionStatus,
    pub target_state_index: i32,
    pub transition_index: i32,
}

impl Default for StatechartTransitionExplanation {
    fn default() -> Self {
        return StatechartTransitionExplanation {
            blend: 0.0,
            condition_index: -1,
            region_index: 0,
            source_state_index: -1,
            status: StatechartTransitionStatus::InvalidRegion,
            target_state_index: -1,
            transition_index: -1,
        };
    }
}

// ============================================================================
// DurationGuard callback type
// ============================================================================

pub type StatechartDurationGuard = fn(&StatechartInstance, &StatechartTransitionExplanation);

// ============================================================================
// StatechartInstance
// ============================================================================

pub struct StatechartInstance {
    pub chart: Statechart,
    pub duration_guard: Option<StatechartDurationGuard>,
    pub input_values: Vec<f64>,
    pub region_blend: Vec<f32>,
    pub region_duration: Vec<f64>,
    pub region_elapsed: Vec<f64>,
    pub region_states: Vec<i32>,
    pub region_transitions: Vec<i32>,
    pub signals: Option<StatechartSignals>,
}

impl Default for StatechartInstance {
    fn default() -> Self {
        return StatechartInstance {
            chart: Statechart::default(),
            duration_guard: None,
            input_values: Vec::new(),
            region_blend: Vec::new(),
            region_duration: Vec::new(),
            region_elapsed: Vec::new(),
            region_states: Vec::new(),
            region_transitions: Vec::new(),
            signals: None,
        };
    }
}

// ============================================================================
// Log types (local definitions, since flight-log is not yet populated)
// ============================================================================

#[derive(Clone, Copy, Debug, PartialEq)]
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
        return LogLevel::Verbose;
    }
}

/// A log data value that can hold numbers, strings, or statechart status values.
#[derive(Clone, Debug)]
pub enum LogDataValue {
    F64(f64),
    I32(i32),
    String(String),
    Status(StatechartTransitionStatus),
}

/// Structured log data: a flat string or a key-value record.
#[derive(Clone, Debug)]
pub enum LogData {
    Text(String),
    Record(Vec<(String, LogDataValue)>),
}

/// One emitted log entry.
#[derive(Clone, Debug)]
pub struct LogEntry {
    pub level: LogLevel,
    pub channel: Option<String>,
    pub data: LogData,
}

/// Reference-counted log sink function for identity comparison.
pub type LogSinkFn = Rc<dyn Fn(&LogEntry)>;

struct MemoryLogSinkState {
    buf: Vec<LogEntry>,
    head: usize,
    capacity: usize,
}

/// Opaque handle to a memory log sink.
pub struct MemoryLogSink {
    pub sink: LogSinkFn,
    state: Rc<RefCell<MemoryLogSinkState>>,
}

// ============================================================================
// Log functions
// ============================================================================

thread_local! {
    static LOG_SINKS: RefCell<Vec<LogSinkFn>> = RefCell::new(Vec::new());
    static LOG_ONCE_KEYS: RefCell<HashSet<String>> = RefCell::new(HashSet::new());
}

pub fn add_log_sink(sink: LogSinkFn) {
    LOG_SINKS.with(|sinks| {
        let mut sinks = sinks.borrow_mut();
        if sinks.iter().any(|s| Rc::ptr_eq(s, &sink)) {
            return;
        }
        sinks.push(sink);
    });
}

pub fn remove_log_sink(sink: &LogSinkFn) -> bool {
    return LOG_SINKS.with(|sinks| {
        let mut sinks = sinks.borrow_mut();
        if let Some(pos) = sinks.iter().position(|s| Rc::ptr_eq(s, sink)) {
            sinks.remove(pos);
            return true;
        }
        return false;
    });
}

pub fn clear_log_once_keys() {
    LOG_ONCE_KEYS.with(|keys| {
        keys.borrow_mut().clear();
    });
}

pub fn log_entry(level: LogLevel, data: LogData, channel: Option<&str>) {
    let entry = LogEntry {
        level,
        channel: channel.map(|s| s.to_string()),
        data,
    };
    LOG_SINKS.with(|sinks| {
        let sinks = sinks.borrow();
        for sink in sinks.iter() {
            sink(&entry);
        }
    });
}

pub fn log_once(key: &str, level: LogLevel, data: LogData, channel: Option<&str>) -> bool {
    let is_new = LOG_ONCE_KEYS.with(|keys| {
        let mut keys = keys.borrow_mut();
        return keys.insert(key.to_string());
    });
    if !is_new {
        return false;
    }
    log_entry(level, data, channel);
    return true;
}

pub fn create_memory_log_sink(capacity: usize) -> MemoryLogSink {
    let state = Rc::new(RefCell::new(MemoryLogSinkState {
        buf: Vec::new(),
        head: 0,
        capacity,
    }));
    let state_clone = state.clone();

    let sink: LogSinkFn = Rc::new(move |entry: &LogEntry| {
        let mut st = state_clone.borrow_mut();
        let stored = entry.clone();
        if st.buf.len() < st.capacity {
            st.buf.push(stored);
        } else {
            let head = st.head;
            st.buf[head] = stored;
            st.head = (head + 1) % st.capacity;
        }
    });

    return MemoryLogSink { sink, state };
}

pub fn get_memory_log_sink_entries(handle: &MemoryLogSink) -> Vec<LogEntry> {
    let state = handle.state.borrow();
    if state.head == 0 {
        return state.buf.clone();
    }
    let mut result = state.buf[state.head..].to_vec();
    result.extend_from_slice(&state.buf[..state.head]);
    return result;
}
