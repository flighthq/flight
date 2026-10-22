mod enable_statechart_guards;
mod statechart;
mod statechart_signals;
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

pub use contract::ChartWeakRef;
pub use contract::STATECHART_ATOMIC_STATE_KIND;
pub use contract::STATECHART_NESTED_STATE_KIND;
pub use contract::Statechart;
pub use contract::StatechartChartIdEntry;
pub use contract::StatechartComparison;
pub use contract::StatechartCondition;
pub use contract::StatechartDurationGuard;
pub use contract::StatechartGuardState;
pub use contract::StatechartGuardStateRef;
pub use contract::StatechartInput;
pub use contract::StatechartInputKind;
pub use contract::StatechartInstance;
pub use contract::StatechartRegion;
pub use contract::StatechartSignals;
pub use contract::StatechartState;
pub use contract::StatechartStateChangeEvent;
pub use contract::StatechartTransition;
pub use contract::StatechartTransitionExplanation;
pub use contract::StatechartTransitionStatus;
pub use contract::get_statechart_comparison_string;
pub use contract::get_statechart_input_kind_string;
pub use contract::get_statechart_transition_status_string;
pub use contract::parse_statechart_comparison;
pub use contract::parse_statechart_input_kind;
pub use contract::parse_statechart_transition_status;
