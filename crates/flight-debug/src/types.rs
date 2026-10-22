//! The debug contract types (TS `types/src/Debug.ts`) and the caller-owned debug state (D5).

use std::sync::Arc;

use flight_entity::{EntityRuntimeSlot, Ref};
use flight_log::{LogLevel, LogSink};

/// The name of a diagnostic subsystem (TS `DebugSubsystemName`): an open string union whose seeded
/// built-ins are `animation`, `audio`, `input`, `loader`, `connectivity`, `particles`, `render` and
/// `text`. Custom subsystems use a vendor prefix (`acme.physics`).
pub type DebugSubsystemName = String;

/// One subsystem guard binding (TS `() => void`).
pub type DebugGuardBinding = Arc<dyn Fn() + Send + Sync>;

/// The wiring a subsystem contributes to a debug session (TS `DebugSubsystemHooks`): the log
/// channels raised while it is enabled, and its guard enabler and disabler. Every field is optional.
/// `disable_guards` must be safe after a missing or partially completed `enable_guards`, so a failed
/// enable can be unwound.
#[derive(Clone, Default)]
pub struct DebugSubsystemHooks {
    pub channels: Option<Vec<String>>,
    pub disable_guards: Option<DebugGuardBinding>,
    pub enable_guards: Option<DebugGuardBinding>,
}

/// Options for `enable_debug` (TS `DebugOptions`). `subsystems` selects the registered subsystems
/// to switch on (all of them when omitted); `level` is the session's global level (default
/// `LogLevel::Debug`); `channels` raises extra channels; `sink` overrides the installed dev sink
/// (default a level-prefixed text console sink).
#[derive(Clone, Default)]
pub struct DebugOptions {
    pub channels: Option<Vec<String>>,
    pub level: Option<LogLevel>,
    pub sink: Option<LogSink>,
    pub subsystems: Option<Vec<DebugSubsystemName>>,
}

/// The debug umbrella's state (D5): the source module's subsystem registry, active session and
/// frame counter, held by the caller instead of in module globals. Registration order is kept, as
/// the source `Map` keeps insertion order.
pub struct DebugState {
    runtime: EntityRuntimeSlot,
    pub(crate) enabled: bool,
    pub(crate) enabled_subsystems: Vec<DebugSubsystemHooks>,
    pub(crate) frame_number: i64,
    pub(crate) installed_sink: Option<LogSink>,
    pub(crate) saved_channel_levels: Vec<(String, Option<LogLevel>)>,
    pub(crate) saved_global_level: LogLevel,
    pub(crate) subsystems: Vec<(DebugSubsystemName, DebugSubsystemHooks)>,
}

/// Shared caller-owned debug state.
pub type DebugStateRef = Ref<DebugState>;

impl Default for DebugState {
    fn default() -> Self {
        return DebugState {
            runtime: EntityRuntimeSlot::default(),
            enabled: false,
            enabled_subsystems: Vec::new(),
            frame_number: 0,
            installed_sink: None,
            saved_channel_levels: Vec::new(),
            saved_global_level: LogLevel::Verbose,
            subsystems: Vec::new(),
        };
    }
}

flight_entity::impl_entity!(DebugState);
