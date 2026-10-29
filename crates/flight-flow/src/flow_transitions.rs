//! flight-compiler: target-native

use std::sync::Arc;

use crate::flow::FlowGuardStateRef;

type FlowTransitionOperation = Arc<dyn Fn(u32) + Send + Sync>;

// Rust's narrow unwind adapter for a transition. Portable transition behavior remains in
// `flow.rs`; this adapter supplies Rust `Drop`, paired with TypeScript's `try/finally` adapter.
struct FlowTransition<'a> {
    guards: &'a FlowGuardStateRef,
}

pub(crate) fn run_flow_transition(guards: &FlowGuardStateRef, operation: FlowTransitionOperation) {
    let depth = {
        let mut guard_state = guards.write().unwrap();
        let depth = guard_state.transition_depth;
        guard_state.transition_depth += 1;
        depth
    };
    let _transition = FlowTransition { guards };
    operation(depth);
}

impl Drop for FlowTransition<'_> {
    fn drop(&mut self) {
        self.guards.write().unwrap().transition_depth -= 1;
    }
}
