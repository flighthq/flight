//! flight-compiler: nullable-options
//! flight-compiler: numeric-union FlowGuardLogLevel

use std::sync::Arc;

use flight_entity::Ref;
use flight_log::{LogDataOrProvider, LogLevel, LogState, log_once};

use crate::flow::FlowGuardStateRef;
use crate::flow_guard_log::{create_flow_guard_log_data, get_flow_guard_log_level};
use crate::types::{FlowGuardContext, FlowGuardKind};

struct FlowGuardLogRecord {
    kind: String,
}

type FlowGuardLogData = FlowGuardLogRecord;

#[derive(Clone, Copy)]
#[repr(u8)]
pub(crate) enum FlowGuardLogLevel {
    Warn = 2,
}

// flight-lint: allow(conform-params) D5: caller-owned guard state replaces the hidden module flag
pub fn disable_flow_guards(state: FlowGuardStateRef) {
    let mut guard_state = state.write().unwrap();
    guard_state.enabled = false;
    guard_state.context = None;
}

/// Install the opt-in guards with the approved enable-time context: a caller-owned log state and a
/// live clock invoked at operation time.
// flight-lint: allow(f64) D1: the injected clock returns millisecond operation time
// flight-lint: allow(conform-params) D5: approved enable-time log state and live clock capability
pub fn enable_flow_guards(
    state: FlowGuardStateRef,
    log_state: Ref<LogState>,
    clock: Arc<dyn Fn() -> f64 + Send + Sync>,
) {
    let mut guard_state = state.write().unwrap();
    guard_state.enabled = true;
    guard_state.context = Some(FlowGuardContext { log_state, clock });
}

/// The canonical TS string for a guard kind (D9e).
// flight-lint: allow(conform-extra) D9e: Rust string-table helper for the TS string union
pub fn get_flow_guard_kind_string(value: FlowGuardKind) -> &'static str {
    return match value {
        FlowGuardKind::DuplicateStatePush => "duplicate-state-push",
        FlowGuardKind::TransitionDuringTransition => "transition-during-transition",
    };
}

fn get_flow_guard_log_kind(value: &FlowGuardLogData) -> &str {
    return &value.kind;
}

fn normalize_flow_guard_log_level(value: FlowGuardLogLevel) -> FlowGuardLogLevel {
    return value;
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

/// Reports a flow guard violation when enabled, with the exact TS key/channel/payload. The clock is
/// invoked at call time; no hidden state or frozen timestamp is involved.
pub fn report_flow_guard(state: &FlowGuardStateRef, kind: FlowGuardKind) {
    let (maybe_context, enabled) = {
        let guard_state = state.read().unwrap();
        (guard_state.context.clone(), guard_state.enabled)
    };
    if !enabled {
        return;
    }
    if maybe_context.is_none() {
        return;
    }
    let active_context = maybe_context.unwrap();
    let kind_string = get_flow_guard_kind_string(kind);
    let data = FlowGuardLogRecord {
        kind: kind_string.to_string(),
    };
    let data_kind = get_flow_guard_log_kind(&data);
    let key = format!("flow:{}", data_kind);
    let log_data: LogDataOrProvider = data.into();
    let level = normalize_flow_guard_log_level(FlowGuardLogLevel::Warn);
    let _ = log_once(
        &active_context.log_state,
        (active_context.clock)(),
        &key,
        level.into(),
        log_data,
        Some("flow".to_string()),
    );
}

impl From<FlowGuardLogRecord> for LogDataOrProvider {
    fn from(record: FlowGuardLogRecord) -> Self {
        return create_flow_guard_log_data(record.kind);
    }
}

impl From<FlowGuardLogLevel> for LogLevel {
    fn from(value: FlowGuardLogLevel) -> Self {
        return get_flow_guard_log_level(value);
    }
}
