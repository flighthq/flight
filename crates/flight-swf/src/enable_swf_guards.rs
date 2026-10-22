//! Opt-in SWF import guards (TS `enableSwfGuards.ts`). The core parser's safe-stop behavior is
//! unconditional; enabling guards only adds an unknown-filter warning.

use std::collections::HashMap;
use std::sync::Arc;

use flight_log::{LogData, LogLevel, LogStateRef, LogValue, log_once};

use crate::{SwfFilterListGuard, SwfGuardStateRef, set_swf_filter_list_guard};

/// Reports whether unknown-filter diagnostics are installed (TS `areSwfGuardsEnabled`).
// flight-lint: allow(conform-params) D5: caller-owned SwfGuardState replaces the source module-level enabled flag
pub fn are_swf_guards_enabled(guard_state: &SwfGuardStateRef) -> bool {
    return guard_state.read().unwrap().enabled;
}

/// Restores silent safe-stop behavior (TS `disableSwfGuards`).
// flight-lint: allow(conform-params) D5: caller-owned SwfGuardState replaces the source module-level hook
pub fn disable_swf_guards(guard_state: &SwfGuardStateRef) {
    set_swf_filter_list_guard(guard_state, None);
    guard_state.write().unwrap().enabled = false;
}

/// Installs opt-in reporting for an unknown variable-width filter (TS `enableSwfGuards`).
// flight-lint: allow(f64) D1: the injected clock returns millisecond operation timestamps
// flight-lint: allow(conform-params) D5: caller-owned guard/log state and injected clock replace source module globals
pub fn enable_swf_guards(
    guard_state: &SwfGuardStateRef,
    log_state: &LogStateRef,
    clock: Arc<dyn Fn() -> f64 + Send + Sync>,
) {
    let log_state = log_state.clone();
    let guard: SwfFilterListGuard = Arc::new(move |filter_id, filter_index| {
        warn_on_unknown_swf_filter(&log_state, clock(), filter_id, filter_index);
    });
    set_swf_filter_list_guard(guard_state, Some(guard));
    guard_state.write().unwrap().enabled = true;
}

// flight-lint: allow(f64) D1: operation time is a millisecond timestamp
fn warn_on_unknown_swf_filter(
    log_state: &LogStateRef,
    now_ms: f64,
    filter_id: u32,
    filter_index: u32,
) {
    let mut data = HashMap::new();
    data.insert("filterId".to_string(), LogValue::Int(i64::from(filter_id)));
    data.insert(
        "filterIndex".to_string(),
        LogValue::Int(i64::from(filter_index)),
    );
    data.insert(
        "message".to_string(),
        LogValue::Str(
            "readSwfFilterList: an unknown variable-width filter prevents safe parsing of the remaining filters and trailing blend mode — remove the unsupported filter from the asset before importing it."
                .to_string(),
        ),
    );
    let _ = log_once(
        log_state,
        now_ms,
        &format!("swf:unknown-filter:{filter_id}"),
        LogLevel::Warn,
        LogData::Record(data).into(),
        Some("swf".to_string()),
    );
}
