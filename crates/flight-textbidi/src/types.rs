use std::cell::Cell;
use std::cell::RefCell;
use std::collections::HashSet;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
#[repr(u8)]
pub enum BidiClass {
    L = 0,
    R = 1,
    AL = 2,
    EN = 3,
    ES = 4,
    ET = 5,
    AN = 6,
    CS = 7,
    NSM = 8,
    BN = 9,
    B = 10,
    S = 11,
    WS = 12,
    ON = 13,
    LRE = 14,
    RLE = 15,
    LRO = 16,
    RLO = 17,
    PDF = 18,
    LRI = 19,
    RLI = 20,
    FSI = 21,
    PDI = 22,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum BidiDirection {
    Ltr,
    Rtl,
    Auto,
}

#[derive(Clone, Debug, PartialEq)]
pub struct BidiRun {
    pub start: usize,
    pub end: usize,
    pub level: u8,
    pub direction: BidiDirection,
}

#[derive(Clone)]
pub struct BidiClassKernel {
    pub get_bidi_class: fn(u32) -> BidiClass,
    pub is_compact: bool,
}

impl Default for BidiClassKernel {
    fn default() -> Self {
        BidiClassKernel {
            get_bidi_class: |_| BidiClass::L,
            is_compact: false,
        }
    }
}

#[derive(Clone, Debug, PartialEq)]
pub struct BidiClassKernelExplanation {
    pub kernel: &'static str,
    pub coverage: &'static str,
    pub covered_code_point_ranges: Vec<BidiCodePointRange>,
    pub fallback_class: Option<BidiClass>,
    pub table_valid: Option<bool>,
}

#[derive(Clone, Debug, PartialEq)]
pub struct BidiCodePointRange {
    pub start: u32,
    pub end: u32,
}

pub type TextBidiGuard = fn(u32);

#[derive(Clone, Copy, Debug, PartialEq)]
#[repr(u8)]
pub enum LogLevel {
    Warn = 0,
}

#[derive(Clone, Debug)]
pub struct LogData {
    pub message: String,
}

#[derive(Clone, Debug)]
pub struct LogEntry {
    pub key: String,
    pub level: LogLevel,
    pub data: LogData,
    pub source: String,
}

thread_local! {
    static LOG_SINK_ACTIVE: Cell<bool> = const { Cell::new(false) };
    static LOG_ENTRIES: RefCell<Vec<LogEntry>> = const { RefCell::new(Vec::new()) };
    static LOG_ONCE_KEYS: RefCell<HashSet<String>> = RefCell::new(HashSet::new());
}

pub fn log_once(key: &str, level: LogLevel, data: LogData, source: &str) {
    let is_active = LOG_SINK_ACTIVE.with(|s| s.get());
    if !is_active {
        return;
    }

    let already_logged = LOG_ONCE_KEYS.with(|keys| {
        let keys = keys.borrow();
        keys.contains(key)
    });

    if already_logged {
        return;
    }

    LOG_ONCE_KEYS.with(|keys| {
        keys.borrow_mut().insert(key.to_string());
    });

    LOG_ENTRIES.with(|entries| {
        entries.borrow_mut().push(LogEntry {
            key: key.to_string(),
            level,
            data,
            source: source.to_string(),
        });
    });
}

pub fn set_log_sink(active: bool) {
    LOG_SINK_ACTIVE.with(|s| s.set(active));
    if !active {
        LOG_ENTRIES.with(|e| e.borrow_mut().clear());
    }
}

pub fn clear_log_once_keys() {
    LOG_ONCE_KEYS.with(|k| k.borrow_mut().clear());
}

pub fn get_log_entries() -> Vec<LogEntry> {
    LOG_ENTRIES.with(|e| e.borrow().clone())
}

pub fn clear_log_entries() {
    LOG_ENTRIES.with(|e| e.borrow_mut().clear());
}
