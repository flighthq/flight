use std::sync::Arc;

use flight_entity::{EntityRuntimeSlot, Ref};
use flight_log::LogStateRef;

/// A lifecycle callback stored on a flow state (D9 stored capturing form).
pub type FlowCallback = Arc<dyn Fn() + Send + Sync>;

/// A per-frame update callback stored on a flow state.
pub type FlowUpdateCallback = Arc<dyn Fn(f32) + Send + Sync>;

/// The kind of flow guard violation detected during a stack transition. The strings match the TS
/// string union exactly (D9e).
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub enum FlowGuardKind {
    DuplicateStatePush,
    TransitionDuringTransition,
}

/// A single application state in a flow stack. Plain data: callers construct it with a literal
/// (TS `FlowState` does not extend Entity). The stack stores it behind `Ref`, matching TS object
/// identity and enabling real re-entrant transitions.
#[derive(Clone)]
pub struct FlowState {
    pub name: Option<String>,
    pub on_enter: Option<FlowCallback>,
    pub on_exit: Option<FlowCallback>,
    pub on_pause: Option<FlowCallback>,
    pub on_resume: Option<FlowCallback>,
    pub on_update: Option<FlowUpdateCallback>,
    pub render_below: Option<bool>,
    pub update_below: Option<bool>,
}

/// The flow-state stack (TS `FlowStack` extends Entity). `states` is ordered bottom-to-top, so the
/// last element is the active top; each state is a shared `Ref`, so duplicate detection is
/// `Arc::ptr_eq` exactly as TS compares object references.
#[derive(Clone)]
pub struct FlowStack {
    pub states: Vec<Ref<FlowState>>,
    runtime: EntityRuntimeSlot,
}

/// Approved enable-time guard context: explicit caller-owned log state plus a live clock invoked at
/// operation time (never a frozen timestamp or hidden clock).
#[derive(Clone)]
// flight-lint: allow(f64) D1: the injected clock returns millisecond operation time
pub struct FlowGuardContext {
    pub log_state: LogStateRef,
    pub clock: Arc<dyn Fn() -> f64 + Send + Sync>,
}

/// Explicit diagnostics state for the opt-in flow guards (D5). Plain Rust-only dispatch state: the
/// caller creates it with a literal and shares it with re-entrant transition callbacks.
pub struct FlowGuardState {
    pub enabled: bool,
    pub transition_depth: u32,
    pub context: Option<FlowGuardContext>,
}

/// Shared caller-owned flow-guard state.
pub type FlowGuardStateRef = Ref<FlowGuardState>;

flight_entity::impl_entity!(FlowStack);

impl Default for FlowStack {
    fn default() -> Self {
        return FlowStack {
            states: Vec::new(),
            runtime: EntityRuntimeSlot::default(),
        };
    }
}
