mod enable_statechart_guards;
mod statechart;
mod statechart_compat;
mod statechart_instance_fields;
mod statechart_instance_init;
mod statechart_runtime;
mod statechart_signal_emit;
mod statechart_signals;
mod statechart_typed_arrays;
mod types;

pub mod contract;

// Public lane: the pinned TS `index.ts` exports plus the types and string helpers their
// signatures require. Diagnostics constructors (`initialize_*`) stay contract-only.
pub use contract::advance_statechart_instance;
pub use contract::are_statechart_guards_enabled;
pub use contract::create_statechart_instance;
pub use contract::disable_statechart_guards;
pub use contract::enable_statechart_guards;
pub use contract::enable_statechart_signals;
pub use contract::explain_statechart_transition;
pub use contract::fire_statechart_trigger;
pub use contract::get_statechart_input_index;
pub use contract::get_statechart_region_blend;
pub use contract::get_statechart_region_state;
pub use contract::get_statechart_signals;
pub use contract::set_statechart_boolean_input;
pub use contract::set_statechart_number_input;
pub use contract::set_statechart_region_duration;

pub use contract::Statechart;
pub use contract::StatechartAtomicStateKind;
pub use contract::StatechartComparison;
pub use contract::StatechartCondition;
pub use contract::StatechartDurationGuard;
pub use contract::StatechartInput;
pub use contract::StatechartInputKind;
pub use contract::StatechartInstance;
pub use contract::StatechartInstanceRaw;
pub use contract::StatechartNestedStateKind;
pub use contract::StatechartRaw;
pub use contract::StatechartRegion;
pub use contract::StatechartSignals;
pub use contract::StatechartState;
pub use contract::StatechartTransition;
pub use contract::StatechartTransitionExplanation;
pub use contract::StatechartTransitionStatus;
