use std::sync::Arc;

use flight_entity::EntityRuntimeSlot;

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
/// (TS `FlowState` does not extend Entity).
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
/// last element is the active top.
#[derive(Clone)]
pub struct FlowStack {
    pub states: Vec<FlowState>,
    runtime: EntityRuntimeSlot,
}

/// Explicit diagnostics state for the opt-in flow guards (D5). Plain Rust-only dispatch state: the
/// caller creates it with a literal and shares it with any re-entrant transition callbacks.
pub struct FlowGuardState {
    pub enabled: bool,
    pub transition_depth: u32,
}

/// Shared caller-owned flow-guard state.
pub type FlowGuardStateRef = flight_entity::Ref<FlowGuardState>;

flight_entity::impl_entity!(FlowStack);

impl Default for FlowStack {
    fn default() -> Self {
        return FlowStack {
            states: Vec::new(),
            runtime: EntityRuntimeSlot::default(),
        };
    }
}

impl Default for FlowGuardState {
    fn default() -> Self {
        return FlowGuardState {
            enabled: false,
            transition_depth: 0,
        };
    }
}

