//! flight-compiler: data-union FlowGuardLogData
//! flight-compiler: nullable-options
//! flight-compiler: numeric-union FlowGuardLogLevel

use std::collections::HashMap;
use std::sync::Arc;

use flight_entity::Ref;
use flight_log::{LogData, LogDataOrProvider, LogLevel, LogState, LogValue, log_once};

use crate::flow::FlowGuardStateRef;
use crate::types::{FlowGuardContext, FlowGuardKind};

// Portable one-field log payload. The compiler lowers this transparent data union to the same
// `{ kind }` object used by TypeScript; the conversion impl supplies Rust's canonical log enum.
struct FlowGuardLogRecord {
    kind: String,
}

enum FlowGuardLogData {
    Record(FlowGuardLogRecord),
}

#[derive(Clone, Copy)]
#[repr(u8)]
enum FlowGuardLogLevel {
    Warn = 2,
}

impl From<FlowGuardLogData> for LogDataOrProvider {
    fn from(value: FlowGuardLogData) -> Self {
        return match value {
            FlowGuardLogData::Record(record) => LogData::Record(HashMap::from([(
                "kind".to_string(),
                LogValue::Str(record.kind),
            )]))
            .into(),
        };
    }
}

impl From<FlowGuardLogLevel> for LogLevel {
    fn from(value: FlowGuardLogLevel) -> Self {
        return match value {
            FlowGuardLogLevel::Warn => LogLevel::Warn,
        };
    }
}

// Keep the portable bridge types explicit on both targets. The compiler lowers the conversion
// impls at their call sites, while these identity helpers preserve the corresponding TS aliases.
fn normalize_flow_guard_log_data(value: FlowGuardLogData) -> FlowGuardLogData {
    return value;
}

fn normalize_flow_guard_log_level(value: FlowGuardLogLevel) -> FlowGuardLogLevel {
    return value;
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
    let key = format!("flow:{}", kind_string);
    let data = normalize_flow_guard_log_data(FlowGuardLogData::Record(FlowGuardLogRecord {
        kind: kind_string.to_string(),
    }));
    let level = normalize_flow_guard_log_level(FlowGuardLogLevel::Warn);
    let _ = log_once(
        &active_context.log_state,
        (active_context.clock)(),
        &key,
        level.into(),
        data.into(),
        Some("flow".to_string()),
    );
}
