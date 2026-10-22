use std::sync::Arc;

use flight_log::{LogData, LogLevel, LogValue, log_once};
use std::collections::HashMap;

use crate::types::{FlowGuardKind, FlowGuardStateRef};

#[cfg(test)]
mod sugar_tests {
    use super::*;
    use crate::types::FlowGuardState;
    use std::sync::RwLock;

    fn guard_state() -> FlowGuardStateRef {
        return Arc::new(RwLock::new(FlowGuardState {
            enabled: false,
            transition_depth: 0,
            context: None,
        }));
    }

    fn log_state() -> flight_log::LogStateRef {
        return Arc::new(RwLock::new(flight_log::create_log_state()));
    }

    #[test]
    fn guard_enable_matches_the_free_function() {
        let via_method = guard_state();
        let via_free = guard_state();
        let state = log_state();
        via_method.enable_guards(&state, Arc::new(|| 0.0));
        enable_flow_guards(&via_free, &state, Arc::new(|| 0.0));
        assert_eq!(
            via_method.read().unwrap().enabled,
            via_free.read().unwrap().enabled
        );
    }

    #[test]
    fn guard_disable_matches_the_free_function() {
        let via_method = guard_state();
        let via_free = guard_state();
        let state = log_state();
        enable_flow_guards(&via_method, &state, Arc::new(|| 0.0));
        enable_flow_guards(&via_free, &state, Arc::new(|| 0.0));
        via_method.disable_guards();
        disable_flow_guards(&via_free);
        assert_eq!(
            via_method.read().unwrap().enabled,
            via_free.read().unwrap().enabled
        );
    }
}

// flight-lint: allow(conform-params) D5: caller-owned guard state replaces the hidden module flag
pub fn disable_flow_guards(state: &FlowGuardStateRef) {
    let mut guard_state = state.write().unwrap();
    guard_state.enabled = false;
    guard_state.context = None;
}

/// Install the opt-in guards with the approved enable-time context: a caller-owned log state and a
/// live clock invoked at operation time.
// flight-lint: allow(f64) D1: the injected clock returns millisecond operation time
// flight-lint: allow(conform-params) D5: approved enable-time log state and live clock capability
pub fn enable_flow_guards(
    state: &FlowGuardStateRef,
    log_state: &flight_log::LogStateRef,
    clock: Arc<dyn Fn() -> f64 + Send + Sync>,
) {
    let mut guard_state = state.write().unwrap();
    guard_state.enabled = true;
    guard_state.context = Some(crate::types::FlowGuardContext {
        log_state: log_state.clone(),
        clock,
    });
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
    let (context, enabled) = {
        let guard_state = state.read().unwrap();
        (guard_state.context.clone(), guard_state.enabled)
    };
    if !enabled {
        return;
    }
    let Some(context) = context else {
        return;
    };
    let kind_string = get_flow_guard_kind_string(kind);
    let key = format!("flow:{}", kind_string);
    let mut data = HashMap::new();
    data.insert("kind".to_string(), LogValue::Str(kind_string.to_string()));
    let _ = log_once(
        &context.log_state,
        (context.clock)(),
        &key,
        LogLevel::Warn,
        LogData::Record(data).into(),
        Some("flow".to_string()),
    );
}

// ============================================================================
// D18 sugar: extension methods on the shared guard handle
// ============================================================================

/// Sugar for the shared guard state handle; delegates to the contract.
pub trait FlowGuardStateMethods {
    fn disable_guards(&self);
    // flight-lint: allow(f64) D1: the injected clock returns millisecond operation time
    // flight-lint: allow(f64) D1: the injected clock returns millisecond operation time
    fn enable_guards(
        &self,
        log_state: &flight_log::LogStateRef,
        clock: Arc<dyn Fn() -> f64 + Send + Sync>,
    );
}

impl FlowGuardStateMethods for FlowGuardStateRef {
    fn disable_guards(&self) {
        disable_flow_guards(self);
    }

    // flight-lint: allow(f64) D1: the injected clock returns millisecond operation time
    fn enable_guards(
        &self,
        log_state: &flight_log::LogStateRef,
        clock: Arc<dyn Fn() -> f64 + Send + Sync>,
    ) {
        enable_flow_guards(self, log_state, clock);
    }
}
