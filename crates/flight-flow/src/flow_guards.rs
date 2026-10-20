use std::cell::Cell;

use crate::FlowGuardKind;

/// Turns off the opt-in flow guards installed by `enable_flow_guards`.
pub fn disable_flow_guards() {
    ENABLED.with(|e| e.set(false));
}

/// Installs the opt-in flow guards. While enabled, diagnostic warnings are
/// emitted when a transition is started inside another transition or when
/// the same state is pushed twice.
///
/// In the TypeScript original this calls `logOnce` from `@flighthq/log`.
/// The Rust port uses `eprintln` as a placeholder until `flight-log` is
/// available.
pub fn enable_flow_guards() {
    ENABLED.with(|e| e.set(true));
}

/// Reports a flow guard violation when guards are enabled; no-op otherwise.
pub fn report_flow_guard(kind: FlowGuardKind) {
    ENABLED.with(|e| {
        if !e.get() {
            return;
        }
        match kind {
            FlowGuardKind::DuplicateStatePush => {
                eprintln!("flow:duplicate-state-push");
            }
            FlowGuardKind::TransitionDuringTransition => {
                eprintln!("flow:transition-during-transition");
            }
        }
    });
}

thread_local! {
    static ENABLED: Cell<bool> = const { Cell::new(false) };
}
