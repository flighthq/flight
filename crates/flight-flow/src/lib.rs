mod flow;
mod flow_guards;
mod types;

pub mod contract;

// Public lane: the pinned TS `index.ts` exports plus the Rust types and string helpers their
// signatures require. `report_flow_guard` stays contract-only.
pub use contract::clear_flow_stack;
pub use contract::create_flow_stack;
pub use contract::disable_flow_guards;
pub use contract::enable_flow_guards;
pub use contract::get_active_flow_state;
pub use contract::get_flow_stack_depth;
pub use contract::get_flow_stack_visible_states;
pub use contract::pop_flow_state;
pub use contract::push_flow_state;
pub use contract::replace_flow_state;
pub use contract::update_flow_stack;

pub use contract::get_flow_guard_kind_string;
pub use contract::parse_flow_guard_kind;
pub use contract::FlowCallback;
pub use contract::FlowGuardKind;
pub use contract::FlowGuardState;
pub use contract::FlowGuardStateRef;
pub use contract::FlowStack;
pub use contract::FlowState;
pub use contract::FlowUpdateCallback;
