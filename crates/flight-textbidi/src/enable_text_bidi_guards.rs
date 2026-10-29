//! flight-compiler: target-native
//! flight-compiler: root disableTextBidiGuards enableTextBidiGuards

use std::collections::HashMap;
use std::sync::Arc;

use flight_entity::Ref;
use flight_log::{LogData, LogLevel, LogState, LogValue, log_once};

use crate::text_bidi_guards::set_text_bidi_guard;

pub fn disable_text_bidi_guards() {
    set_text_bidi_guard(None);
}

// flight-lint: allow(conform-params) D5: caller-owned log state and injected operation-time clock replace the hidden log singleton and clock
// flight-lint: allow(f64) D1: the injected clock returns a millisecond timestamp for flight-log
pub fn enable_text_bidi_guards(
    log_state: &Ref<LogState>,
    clock: Arc<dyn Fn() -> f64 + Send + Sync>,
) {
    let log_state = log_state.clone();
    set_text_bidi_guard(Some(Arc::new(move |codepoint| {
        warn_on_compact_table_miss(&log_state, clock(), codepoint);
    })));
}

// flight-lint: allow(f64) D1: operation time is a millisecond timestamp
fn warn_on_compact_table_miss(log_state: &Ref<LogState>, now_ms: f64, codepoint: u32) {
    let mut data = HashMap::new();
    data.insert(
        "message".to_string(),
        LogValue::Str(format!(
            "resolveBidiLevels: U+{:04X} is outside the compact bidi-class table and defaulted to L. Pass a full-coverage BidiClassKernel to resolveBidiLevels or getBidiRuns.",
            codepoint
        )),
    );
    let _ = log_once(
        log_state,
        now_ms,
        "textbidi:compact-table-miss",
        LogLevel::Warn,
        LogData::Record(data).into(),
        Some("textbidi".to_string()),
    );
}
