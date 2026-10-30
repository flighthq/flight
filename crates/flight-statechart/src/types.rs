//! flight-compiler: target-native
//! flight-compiler: contract StatechartAtomicStateKind StatechartComparison StatechartCondition
//! flight-compiler: contract StatechartDurationGuard StatechartInput StatechartInputKind StatechartInstanceRaw
//! flight-compiler: contract StatechartNestedStateKind StatechartRegion StatechartSignals StatechartState
//! flight-compiler: contract StatechartRaw StatechartTransition StatechartTransitionExplanation StatechartTransitionStatus
//! flight-compiler: string-union StatechartComparison=exact
//! flight-compiler: string-union-value StatechartComparison Equal "Equal"
//! flight-compiler: string-union-value StatechartComparison GreaterThan "GreaterThan"
//! flight-compiler: string-union-value StatechartComparison GreaterThanOrEqual "GreaterThanOrEqual"
//! flight-compiler: string-union-value StatechartComparison LessThan "LessThan"
//! flight-compiler: string-union-value StatechartComparison LessThanOrEqual "LessThanOrEqual"
//! flight-compiler: string-union-value StatechartComparison NotEqual "NotEqual"
//! flight-compiler: string-union StatechartInputKind=exact
//! flight-compiler: string-union-value StatechartInputKind Boolean "Boolean"
//! flight-compiler: string-union-value StatechartInputKind Number "Number"
//! flight-compiler: string-union-value StatechartInputKind Trigger "Trigger"
//! flight-compiler: string-union StatechartTransitionStatus=exact
//! flight-compiler: string-union-value StatechartTransitionStatus ConditionsUnmet "ConditionsUnmet"
//! flight-compiler: string-union-value StatechartTransitionStatus ExitTimePending "ExitTimePending"
//! flight-compiler: string-union-value StatechartTransitionStatus InvalidRegion "InvalidRegion"
//! flight-compiler: string-union-value StatechartTransitionStatus MissingRegionDuration "MissingRegionDuration"
//! flight-compiler: string-union-value StatechartTransitionStatus NoTransitions "NoTransitions"
//! flight-compiler: string-union-value StatechartTransitionStatus Ready "Ready"
//! flight-compiler: string-union-value StatechartTransitionStatus Transitioning "Transitioning"
//! flight-compiler: readonly-fields StatechartRaw StatechartCondition StatechartInput StatechartInstanceRaw StatechartRegion StatechartState
//! flight-compiler: readonly-fields StatechartTransition StatechartTransitionExplanation
//! flight-compiler: callable-parameters StatechartDurationGuard instance explanation
//! flight-compiler: entity-runtime-state StatechartInstanceRaw.builtin_guard
// flight-lint: allow-file(f64) D1: authored input/condition numbers, transition durations and region timing carry millisecond/f64 values from TS `number`
use std::sync::{Arc, RwLock, Weak};

use flight_entity::{EntityRuntimeSlot, Ref};

pub use flight_signals::Signal;

// ============================================================================
// Statechart enums and string tables (D9e: exact TS strings)
// ============================================================================

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum StatechartComparison {
    Equal,
    GreaterThan,
    GreaterThanOrEqual,
    LessThan,
    LessThanOrEqual,
    NotEqual,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum StatechartInputKind {
    Boolean,
    Number,
    Trigger,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum StatechartTransitionStatus {
    ConditionsUnmet,
    ExitTimePending,
    InvalidRegion,
    MissingRegionDuration,
    NoTransitions,
    Ready,
    Transitioning,
}

// Built-in state kinds. `StatechartState.kind` is an open string; custom states use
// vendor-prefixed kinds and composition layers interpret those kinds.
#[allow(non_upper_case_globals)]
pub const StatechartAtomicStateKind: &str = "Statechart.Atomic";
#[allow(non_upper_case_globals)]
pub const StatechartNestedStateKind: &str = "Statechart.Nested";

// ============================================================================
// Statechart data types (plain literals; none of these extends Entity in TS)
// ============================================================================

#[derive(Clone, Debug, PartialEq)]
pub struct StatechartCondition {
    pub comparison: StatechartComparison,
    pub input_index: i32,
    pub value: f64,
}

#[derive(Clone, Debug, PartialEq)]
pub struct StatechartTransition {
    pub conditions: Vec<StatechartCondition>,
    pub duration_ms: f64,
    pub exit_time_ratio: f64,
    pub target_state_index: i32,
}

#[derive(Clone, Debug, PartialEq)]
pub struct StatechartInput {
    pub initial_value: f64,
    pub kind: StatechartInputKind,
    pub name: Option<String>,
}

#[derive(Clone, Debug, PartialEq)]
pub struct StatechartState {
    pub kind: String,
    pub name: Option<String>,
    pub transitions: Vec<StatechartTransition>,
}

#[derive(Clone, Debug, PartialEq)]
pub struct StatechartRegion {
    pub initial_state_index: i32,
    pub name: Option<String>,
    pub states: Vec<StatechartState>,
}

#[derive(Clone, Debug, PartialEq)]
pub struct StatechartRaw {
    pub inputs: Vec<StatechartInput>,
    pub name: Option<String>,
    pub regions: Vec<StatechartRegion>,
}

// ============================================================================
// StatechartSignals (entity)
// ============================================================================

#[derive(Clone)]
pub struct StatechartSignals {
    /// TS `(regionIndex, previousStateIndex, stateIndex)` positional callback.
    pub on_state_change: Signal<(i32, i32, i32)>,
    runtime: EntityRuntimeSlot,
}

// ============================================================================
// StatechartTransitionExplanation
// ============================================================================

#[derive(Clone, Debug, PartialEq)]
pub struct StatechartTransitionExplanation {
    pub blend: f32,
    pub condition_index: i32,
    pub region_index: i32,
    pub source_state_index: i32,
    pub status: StatechartTransitionStatus,
    pub target_state_index: i32,
    pub transition_index: i32,
}

// ============================================================================
// Duration guard callback type
// ============================================================================

/// Stored, capturing callback (D9), source-shaped: `(instance, explanation) => void`.
pub type StatechartDurationGuard =
    Arc<dyn Fn(&Ref<StatechartInstanceRaw>, &StatechartTransitionExplanation) + Send + Sync>;

/// Non-owning chart handle used by the diagnostic id map (D5 non-owning cache; D15 WeakMap analogue).
// flight-lint: allow(contract-vocabulary) D5: non-owning diagnostics cache key (WeakRef vocabulary row)
pub type ChartWeakRef = Weak<RwLock<StatechartRaw>>;

/// One diagnostic chart id, keyed by a non-owning chart handle.
pub struct StatechartChartIdEntry {
    pub chart: ChartWeakRef,
    pub id: i32,
}

/// Explicit guard-owned diagnostic id state (no semantic global): a counter plus weak chart keys.
pub struct StatechartGuardState {
    pub chart_ids: Vec<StatechartChartIdEntry>,
    pub next_chart_id: i32,
}

/// Shared caller-owned guard/diagnostic state.
pub type StatechartGuardStateRef = Ref<StatechartGuardState>;

// ============================================================================
// StatechartInstance (TS extends Entity)
// ============================================================================

pub struct StatechartInstanceRaw {
    pub chart: Ref<StatechartRaw>,
    pub duration_guard: Option<StatechartDurationGuard>,
    pub input_values: Box<[f64]>,
    pub region_blend: Box<[f32]>,
    pub region_duration: Box<[f64]>,
    pub region_elapsed: Box<[f64]>,
    pub region_states: Box<[i32]>,
    pub region_transitions: Box<[i32]>,
    pub signals: Option<StatechartSignals>,
    pub(crate) builtin_guard: Option<StatechartDurationGuard>,
    runtime: EntityRuntimeSlot,
}

// ============================================================================
// Exact TS string tables (D9e)
// ============================================================================

// flight-lint: allow(conform-extra) D9e: Rust string-table helper for the TS string union
pub fn get_statechart_comparison_string(value: StatechartComparison) -> &'static str {
    return match value {
        StatechartComparison::Equal => "Equal",
        StatechartComparison::GreaterThan => "GreaterThan",
        StatechartComparison::GreaterThanOrEqual => "GreaterThanOrEqual",
        StatechartComparison::LessThan => "LessThan",
        StatechartComparison::LessThanOrEqual => "LessThanOrEqual",
        StatechartComparison::NotEqual => "NotEqual",
    };
}

// flight-lint: allow(conform-extra) D9e: Rust string-table helper for the TS string union
pub fn get_statechart_input_kind_string(value: StatechartInputKind) -> &'static str {
    return match value {
        StatechartInputKind::Boolean => "Boolean",
        StatechartInputKind::Number => "Number",
        StatechartInputKind::Trigger => "Trigger",
    };
}

// flight-lint: allow(conform-extra) D9e: Rust string-table helper for the TS string union
pub fn get_statechart_transition_status_string(value: StatechartTransitionStatus) -> &'static str {
    return match value {
        StatechartTransitionStatus::ConditionsUnmet => "ConditionsUnmet",
        StatechartTransitionStatus::ExitTimePending => "ExitTimePending",
        StatechartTransitionStatus::InvalidRegion => "InvalidRegion",
        StatechartTransitionStatus::MissingRegionDuration => "MissingRegionDuration",
        StatechartTransitionStatus::NoTransitions => "NoTransitions",
        StatechartTransitionStatus::Ready => "Ready",
        StatechartTransitionStatus::Transitioning => "Transitioning",
    };
}

// flight-lint: allow(conform-extra) D9e: Rust string-table helper for the TS string union
pub fn parse_statechart_comparison(value: &str) -> Option<StatechartComparison> {
    return match value {
        "Equal" => Some(StatechartComparison::Equal),
        "GreaterThan" => Some(StatechartComparison::GreaterThan),
        "GreaterThanOrEqual" => Some(StatechartComparison::GreaterThanOrEqual),
        "LessThan" => Some(StatechartComparison::LessThan),
        "LessThanOrEqual" => Some(StatechartComparison::LessThanOrEqual),
        "NotEqual" => Some(StatechartComparison::NotEqual),
        _ => None,
    };
}

// flight-lint: allow(conform-extra) D9e: Rust string-table helper for the TS string union
pub fn parse_statechart_input_kind(value: &str) -> Option<StatechartInputKind> {
    return match value {
        "Boolean" => Some(StatechartInputKind::Boolean),
        "Number" => Some(StatechartInputKind::Number),
        "Trigger" => Some(StatechartInputKind::Trigger),
        _ => None,
    };
}

// flight-lint: allow(conform-extra) D9e: Rust string-table helper for the TS string union
pub fn parse_statechart_transition_status(value: &str) -> Option<StatechartTransitionStatus> {
    return match value {
        "ConditionsUnmet" => Some(StatechartTransitionStatus::ConditionsUnmet),
        "ExitTimePending" => Some(StatechartTransitionStatus::ExitTimePending),
        "InvalidRegion" => Some(StatechartTransitionStatus::InvalidRegion),
        "MissingRegionDuration" => Some(StatechartTransitionStatus::MissingRegionDuration),
        "NoTransitions" => Some(StatechartTransitionStatus::NoTransitions),
        "Ready" => Some(StatechartTransitionStatus::Ready),
        "Transitioning" => Some(StatechartTransitionStatus::Transitioning),
        _ => None,
    };
}

impl Default for StatechartComparison {
    fn default() -> Self {
        return StatechartComparison::Equal;
    }
}

impl Default for StatechartInputKind {
    fn default() -> Self {
        return StatechartInputKind::Boolean;
    }
}

impl Default for StatechartTransitionStatus {
    fn default() -> Self {
        return StatechartTransitionStatus::InvalidRegion;
    }
}

impl Default for StatechartTransition {
    fn default() -> Self {
        return StatechartTransition {
            conditions: Vec::new(),
            duration_ms: 0.0,
            exit_time_ratio: -1.0,
            target_state_index: 0,
        };
    }
}

impl Default for StatechartInput {
    fn default() -> Self {
        return StatechartInput {
            initial_value: 0.0,
            kind: StatechartInputKind::Boolean,
            name: None,
        };
    }
}

impl Default for StatechartState {
    fn default() -> Self {
        return StatechartState {
            kind: String::new(),
            name: None,
            transitions: Vec::new(),
        };
    }
}

impl Default for StatechartRegion {
    fn default() -> Self {
        return StatechartRegion {
            initial_state_index: 0,
            name: None,
            states: Vec::new(),
        };
    }
}

impl Default for StatechartRaw {
    fn default() -> Self {
        return StatechartRaw {
            inputs: Vec::new(),
            name: None,
            regions: Vec::new(),
        };
    }
}

impl Default for StatechartSignals {
    fn default() -> Self {
        return StatechartSignals {
            on_state_change: Signal::default(),
            runtime: EntityRuntimeSlot::default(),
        };
    }
}

impl Default for StatechartTransitionExplanation {
    fn default() -> Self {
        return StatechartTransitionExplanation {
            blend: 0.0,
            condition_index: -1,
            region_index: 0,
            source_state_index: -1,
            status: StatechartTransitionStatus::InvalidRegion,
            target_state_index: -1,
            transition_index: -1,
        };
    }
}

impl Default for StatechartInstanceRaw {
    fn default() -> Self {
        return StatechartInstanceRaw {
            chart: Ref::new(RwLock::new(StatechartRaw::default())),
            duration_guard: None,
            input_values: Box::new([]),
            region_blend: Box::new([]),
            region_duration: Box::new([]),
            region_elapsed: Box::new([]),
            region_states: Box::new([]),
            region_transitions: Box::new([]),
            signals: None,
            builtin_guard: None,
            runtime: EntityRuntimeSlot::default(),
        };
    }
}

flight_entity::impl_entity!(StatechartInstanceRaw);
flight_entity::impl_entity!(StatechartSignals);
