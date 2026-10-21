//! Opt-in diagnostics for graph operations that decline rather than invent a result
//! (TS `enableNodeGuards.ts`).

use std::sync::Arc;

use flight_log::{LogData, LogLevel, LogStateRef, LogValue, log_once};

use crate::hierarchy::{NodeGuardState, set_reparent_node_guard};
use crate::types::Node;

/// The injected clock used by the installed guard (D5: no ambient clock).
// flight-lint: allow(f64) D0: the injected clock returns millisecond timestamps
pub type NodeGuardClock = Arc<dyn Fn() -> f64 + Send + Sync>;

/// Whether the node guards are installed (TS `areNodeGuardsEnabled`).
// flight-lint: allow(conform-params) D5: caller-owned guard state replaces the hidden module flag
pub fn are_node_guards_enabled(guards: &NodeGuardState) -> bool {
    return guards.enabled;
}

/// Uninstalls the guards installed by `enable_node_guards` (TS `disableNodeGuards`).
// flight-lint: allow(conform-params) D5: caller-owned guard state replaces the hidden module flag
pub fn disable_node_guards(guards: &mut NodeGuardState) {
    set_reparent_node_guard(guards, None);
    guards.enabled = false;
}

/// Installs opt-in diagnostics for graph operations that decline (TS `enableNodeGuards`).
///
/// D5: the source reads its module-level log singleton and clock; this takes them explicitly.
// flight-lint: allow(f64) D0: the injected clock returns millisecond timestamps
// flight-lint: allow(conform-params) D5: caller-owned guard state, log state and clock replace hidden process state
pub fn enable_node_guards(
    guards: &mut NodeGuardState,
    log_state: &LogStateRef,
    clock: NodeGuardClock,
) {
    let log_state = log_state.clone();
    let guard: crate::hierarchy::NodeReparentGuard = Arc::new(move |child, new_parent| {
        warn_on_declined_reparent(&log_state, clock(), child, new_parent);
    });
    set_reparent_node_guard(guards, Some(guard));
    guards.enabled = true;
}

// flight-lint: allow(f64) D1: operation time is a millisecond timestamp
fn warn_on_declined_reparent(
    log_state: &LogStateRef,
    now_ms: f64,
    child: &dyn Node,
    new_parent: &dyn Node,
) {
    let child_name = child
        .node_fields()
        .name
        .clone()
        .unwrap_or_else(|| String::from("<unnamed>"));
    let new_parent_name = new_parent
        .node_fields()
        .name
        .clone()
        .unwrap_or_else(|| String::from("<unnamed>"));
    let mut data = std::collections::HashMap::new();
    data.insert(String::from("child"), LogValue::Str(child_name));
    data.insert(
        String::from("message"),
        LogValue::Str(String::from(
            "reparentNode: the new parent has no invertible world matrix, so no local transform could preserve the child’s world transform — nothing was changed. A zero scale on the parent or an ancestor is the usual cause; use addNodeChild to attach without preserving world position.",
        )),
    );
    data.insert(
        String::from("newParent"),
        LogValue::Str(new_parent_name.clone()),
    );
    let key = format!("node:reparent-singular-parent:{}", new_parent_name);
    let _ = log_once(
        log_state,
        now_ms,
        &key,
        LogLevel::Warn,
        LogData::Record(data).into(),
        None,
    );
}
