//! Debug timing spans and frame markers (TS `debugTiming.ts`), gated on an active debug session so
//! instrumentation left in shipping code costs one boolean check. Timestamps are injected (D5).

use std::collections::HashMap;
use std::panic::{AssertUnwindSafe, catch_unwind, resume_unwind};
use std::sync::Arc;

use flight_log::{
    LogData, LogStateRef, LogTimer, LogValue, end_log_timer, log_debug, start_log_timer,
};

use crate::debug::is_debug_enabled;
use crate::types::DebugStateRef;

/// Opens a named timing span only while a debug session is active (TS `beginDebugSpan`): a running
/// `LogTimer` to hand to `end_debug_span`, or `None` when debug is disabled (nothing is allocated).
// flight-lint: allow(conform-params, f64) D5: the caller-owned debug state and injected now_ms replace the source module global and clock; D1: a JS-number millisecond timestamp
pub fn begin_debug_span(
    state: &DebugStateRef,
    now_ms: f64,
    name: &str,
    channel: Option<String>,
) -> Option<LogTimer> {
    if !is_debug_enabled(state) {
        return None;
    }
    return Some(start_log_timer(name, channel, now_ms));
}

/// Closes a span opened by `begin_debug_span` (TS `endDebugSpan`), emitting its elapsed-time Debug
/// entry and returning the elapsed milliseconds. A `None` timer (debug was disabled when the span
/// opened) is a no-op returning -1, the "not measured" sentinel.
// flight-lint: allow(conform-params, f64) D5: caller-owned log state and injected now_ms replace the source singleton and clock; D1: JS-number milliseconds
pub fn end_debug_span(log_state: &LogStateRef, now_ms: f64, timer: Option<&LogTimer>) -> f64 {
    let Some(timer) = timer else {
        return -1.0;
    };
    return end_log_timer(log_state, now_ms, timer);
}

/// Emits a frame-boundary marker while a debug session is active (TS `markDebugFrame`): a Debug entry
/// `{ frame: label }`, or, unlabeled, the next value of the state's ascending frame counter, which a
/// new session does not reset. A no-op, with no counter advance, when debug is disabled.
// flight-lint: allow(conform-params, f64) D5: caller-owned debug and log state and injected now_ms replace the source module globals and clock; D1: a JS-number millisecond timestamp
pub fn mark_debug_frame(
    state: &DebugStateRef,
    log_state: &LogStateRef,
    now_ms: f64,
    label: Option<&str>,
    channel: Option<String>,
) {
    if !is_debug_enabled(state) {
        return;
    }
    let frame = match label {
        Some(label) => LogValue::Str(label.to_string()),
        None => {
            let mut current = state.write().unwrap();
            current.frame_number += 1;
            LogValue::Number((current.frame_number) as f64)
        }
    };
    let mut data = HashMap::new();
    data.insert("frame".to_string(), frame);
    log_debug(log_state, now_ms, LogData::Record(data).into(), channel);
}

/// Times a synchronous function as one span while a debug session is active (TS
/// `measureDebugSpan`) and returns its result. With debug disabled the function still runs and only
/// the timing is skipped. The span is closed, and its entry emitted, even when the function panics
/// (the source's throw), and the panic then resumes. `clock` is read once when the span opens and
/// once when it closes.
// flight-lint: allow(conform-params, contract-vocabulary, f64) D5: caller-owned debug and log state and an injected clock replace the source module globals and clock; the source `fn: () => T` is run once inline and never stored; D1: JS-number milliseconds
pub fn measure_debug_span<T>(
    state: &DebugStateRef,
    log_state: &LogStateRef,
    clock: &Arc<dyn Fn() -> f64 + Send + Sync>,
    name: &str,
    run: impl FnOnce() -> T,
    channel: Option<String>,
) -> T {
    let timer = begin_debug_span(state, clock(), name, channel);
    let result = catch_unwind(AssertUnwindSafe(run));
    if timer.is_some() {
        end_debug_span(log_state, clock(), timer.as_ref());
    }
    return match result {
        Ok(value) => value,
        Err(error) => resume_unwind(error),
    };
}
