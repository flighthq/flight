//! The debug umbrella (TS `@flighthq/debug`): a registry of diagnostic subsystems, one debug session
//! that installs a dev sink, raises log levels and runs subsystem guard enablers, and debug-gated
//! timing spans. All state is caller-owned (D5): a `DebugState` for the registry and session, and
//! the flight-log `LogState` it reports through. There is no native provider and no aggregate host.

mod debug;
mod debug_timing;
mod types;

pub mod contract;

// Public lane: the pinned TS `index.ts` names the ten functions; the debug types and the D5 state
// constructors their signatures require are public too.
pub use contract::DebugGuardBinding;
pub use contract::DebugOptions;
pub use contract::DebugState;
pub use contract::DebugStateRef;
pub use contract::DebugSubsystemHooks;
pub use contract::DebugSubsystemName;
pub use contract::begin_debug_span;
pub use contract::create_debug_state;
pub use contract::disable_debug;
pub use contract::enable_debug;
pub use contract::enable_flight_diagnostics;
pub use contract::end_debug_span;
pub use contract::initialize_debug_state;
pub use contract::is_debug_enabled;
pub use contract::mark_debug_frame;
pub use contract::measure_debug_span;
pub use contract::register_debug_subsystem;
pub use contract::unregister_debug_subsystem;
