//! flight-compiler: string-union FlowGuardKind=kebab-case
//! flight-compiler: nullable-options

use std::sync::Arc;

use flight_entity::Ref;
use flight_log::LogState;

/// The kind of flow guard violation detected during a stack transition. The strings match the TS
/// string union exactly (D9e).
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub enum FlowGuardKind {
    DuplicateStatePush,
    TransitionDuringTransition,
}

/// Approved enable-time guard context: explicit caller-owned log state plus a live clock invoked at
/// operation time (never a frozen timestamp or hidden clock).
#[derive(Clone)]
// flight-lint: allow(f64) D1: the injected clock returns millisecond operation time
pub struct FlowGuardContext {
    pub log_state: Ref<LogState>,
    pub clock: Arc<dyn Fn() -> f64 + Send + Sync>,
}

/// Explicit diagnostics state for the opt-in flow guards (D5). Plain Rust-only dispatch state: the
/// caller creates it with a literal and shares it with re-entrant transition callbacks.
pub struct FlowGuardState {
    pub enabled: bool,
    pub transition_depth: u32,
    pub context: Option<FlowGuardContext>,
}
