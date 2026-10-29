use std::sync::Arc;

use flight_entity::{EntityRuntimeSlot, Ref};

/// A lifecycle callback stored on a flow state (D9 stored capturing form).
pub type FlowCallback = Arc<dyn Fn() + Send + Sync>;

/// A per-frame update callback stored on a flow state.
pub type FlowUpdateCallback = Arc<dyn Fn(f32) + Send + Sync>;

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

/// The flow-state stack. `states` is ordered bottom-to-top, so the last element is the active top;
/// each state is a shared `Ref`, so duplicate detection is `Arc::ptr_eq` exactly as TS compares
/// object references.
#[derive(Clone)]
pub struct FlowStack {
    pub states: Vec<Ref<FlowState>>,
    runtime: EntityRuntimeSlot,
}

flight_entity::impl_entity!(FlowStack);

impl Default for FlowStack {
    fn default() -> Self {
        return FlowStack {
            states: Vec::new(),
            runtime: EntityRuntimeSlot::default(),
        };
    }
}
