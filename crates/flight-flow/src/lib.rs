mod flow;
mod flow_guard_log;
mod flow_guards;
mod flow_stack_compat;
mod flow_transitions;
mod flow_types;
mod sugar;
mod types;

pub mod contract;

// Public lane: exactly the pinned TS `index.ts` exports. Rust-only callback, shared-handle, and
// method-sugar types stay available from `contract`; `report_flow_guard` is contract-only too.
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

pub use contract::FlowGuardContext;
pub use contract::FlowGuardKind;
pub use contract::FlowGuardState;
pub use contract::FlowStack;
pub use contract::FlowState;
pub use contract::get_flow_guard_kind_string;
pub use contract::parse_flow_guard_kind;
