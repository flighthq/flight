use flight_log::{log_once, LogData, LogLevel, LogStateRef, LogValue};
use std::collections::HashMap;

use crate::types::{FlowGuardKind, FlowGuardStateRef};

// flight-lint: allow(conform-params) D5: caller-owned guard state replaces the hidden module flag
pub fn disable_flow_guards(state: &FlowGuardStateRef) {
    state.write().unwrap().enabled = false;
}

// flight-lint: allow(conform-params) D5: caller-owned guard state replaces the hidden module flag
pub fn enable_flow_guards(state: &FlowGuardStateRef) {
    state.write().unwrap().enabled = true;
}

/// The canonical TS string for a guard kind (D9e).
// flight-lint: allow(conform-extra) D9e: Rust string-table helper for the TS string union
pub fn get_flow_guard_kind_string(value: FlowGuardKind) -> &'static str {
    return match value {
        FlowGuardKind::DuplicateStatePush => "duplicate-state-push",
        FlowGuardKind::TransitionDuringTransition => "transition-during-transition",
    };
}

/// Parses a guard kind string back to the enum (D9e); None for unknown names.
// flight-lint: allow(conform-extra) D9e: Rust string-table helper for the TS string union
pub fn parse_flow_guard_kind(value: &str) -> Option<FlowGuardKind> {
    return match value {
        "duplicate-state-push" => Some(FlowGuardKind::DuplicateStatePush),
        "transition-during-transition" => Some(FlowGuardKind::TransitionDuringTransition),
        _ => None,
    };
}

/// Reports a flow guard violation when guards are enabled; no-op otherwise. Logging goes through
/// the caller-owned log state at the operation's time (D5), with the exact TS strings and key.
// flight-lint: allow(f64) D1: operation time is a millisecond timestamp
pub fn report_flow_guard(
    state: &FlowGuardStateRef,
    log_state: &LogStateRef,
    now_ms: f64,
    kind: FlowGuardKind,
) {
    if !state.read().unwrap().enabled {
        return;
    }
    let kind_string = get_flow_guard_kind_string(kind);
    let key = format!("flow:{}", kind_string);
    let mut data = HashMap::new();
    data.insert("kind".to_string(), LogValue::Str(kind_string.to_string()));
    let _ = log_once(
        log_state,
        now_ms,
        &key,
        LogLevel::Warn,
        LogData::Record(data).into(),
        Some("flow".to_string()),
    );
}
