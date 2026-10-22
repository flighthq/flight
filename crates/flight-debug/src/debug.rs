//! The debug umbrella (TS `debug.ts`): a registry of diagnostic subsystems and one debug session
//! over a caller-owned log state. Enabling installs a dev sink, raises the global and per-channel log
//! levels, and runs each selected subsystem's guard enabler; disabling undoes exactly that. The
//! registry and session live in a caller-owned `DebugState` (D5), and no lock is held while a
//! subsystem's guard binding runs.

use flight_entity::allocate_entity;
use flight_log::{
    LogLevel, LogSink, LogStateRef, add_log_sink, clear_log_channel_level, create_console_log_sink,
    get_log_channel_level, get_log_level, remove_log_sink, set_log_channel_level, set_log_level,
};
use flight_render::{RenderState, enable_color_adjustment_guards, enable_render_registries_guards};
use std::panic::{AssertUnwindSafe, catch_unwind, resume_unwind};

use crate::types::*;

/// Creates an empty debug state: no registered subsystems and no active session (D5: the source
/// module's globals, owned by the caller).
// flight-lint: allow(conform-extra) D5: the caller-owned state replaces the source module globals
pub fn create_debug_state() -> DebugState {
    let mut out: DebugState = allocate_entity();
    initialize_debug_state(&mut out);
    return out;
}

/// Resets a debug state to the source module's initial values (the construction initializer of
/// `create_debug_state`).
// flight-lint: allow(conform-extra) D5: the construction initializer of the caller-owned state
pub fn initialize_debug_state(out: &mut DebugState) {
    out.enabled = false;
    out.enabled_subsystems = Vec::new();
    out.frame_number = 0;
    out.installed_sink = None;
    out.saved_channel_levels = Vec::new();
    out.saved_global_level = LogLevel::Verbose;
    out.subsystems = Vec::new();
}

// Raises the global level and every selected channel's level to `level` for the session.
fn apply_debug_levels(log_state: &LogStateRef, level: LogLevel, channels: &[String]) {
    set_log_level(log_state, level);
    for channel in channels {
        set_log_channel_level(log_state, channel, level);
    }
}

// Gathers the channels to raise: every selected subsystem's channels plus any explicit extras.
fn collect_debug_channels(
    subsystems: &[DebugSubsystemHooks],
    extra: Option<&[String]>,
) -> Vec<String> {
    let mut channels = Vec::new();
    for hooks in subsystems {
        if let Some(own) = &hooks.channels {
            channels.extend(own.iter().cloned());
        }
    }
    if let Some(extra) = extra {
        channels.extend(extra.iter().cloned());
    }
    return channels;
}

/// Returns Flight to the zero-debug baseline (TS `disableDebug`): runs the disable-guards binding of
/// every subsystem the session switched on, removes the sink it installed, and restores the log
/// levels it raised. A no-op when debug is not enabled.
// flight-lint: allow(conform-params) D5: caller-owned debug and log state replace the source module globals
pub fn disable_debug(state: &DebugStateRef, log_state: &LogStateRef) {
    if !state.read().unwrap().enabled {
        return;
    }
    let enabled = state.read().unwrap().enabled_subsystems.clone();
    for hooks in &enabled {
        if let Some(disable_guards) = &hooks.disable_guards {
            disable_guards();
        }
    }
    state.write().unwrap().enabled_subsystems.clear();
    remove_debug_sink(state, log_state);
    restore_debug_levels(state, log_state);
    state.write().unwrap().enabled = false;
}

/// Enables a debug session (TS `enableDebug`). It installs `options.sink`, raises the global level
/// (default `LogLevel::Debug`) and the channels of the selected subsystems plus `options.channels`,
/// then runs each selected subsystem's guard enabler in order. `options.subsystems` selects
/// registered subsystems by name (unregistered names are skipped); omitted, every registered
/// subsystem is switched on. A second call while enabled is a no-op.
///
/// A guard enabler that panics (the source's throw) unwinds the whole transaction: every subsystem
/// already switched on, the failing one included, runs its disabler newest first, the sink is
/// removed and every level is restored, each step continuing past its own failure, and then the
/// original panic resumes. An omitted `options.sink` installs a console sink with the level-prefixed
/// text formatter (`create_console_log_sink`), as the source does.
// flight-lint: allow(conform-params) D5: caller-owned debug and log state replace the source module globals
pub fn enable_debug(
    state: &DebugStateRef,
    log_state: &LogStateRef,
    options: Option<&DebugOptions>,
) {
    if state.read().unwrap().enabled {
        return;
    }
    let level = options
        .and_then(|options| options.level)
        .unwrap_or(LogLevel::Debug);
    let subsystems = resolve_debug_subsystems(
        state,
        options.and_then(|options| options.subsystems.as_deref()),
    );
    let channels = collect_debug_channels(
        &subsystems,
        options.and_then(|options| options.channels.as_deref()),
    );
    let saved_global_level = get_log_level(log_state);
    state.write().unwrap().saved_global_level = saved_global_level;
    let mut saved_channel_levels: Vec<(String, Option<LogLevel>)> = Vec::new();
    for channel in &channels {
        if !saved_channel_levels
            .iter()
            .any(|(saved, _)| saved == channel)
        {
            saved_channel_levels.push((channel.clone(), get_log_channel_level(log_state, channel)));
        }
    }
    let sink = options
        .and_then(|options| options.sink.clone())
        .unwrap_or_else(|| create_console_log_sink(log_state, None));
    let enabled = catch_unwind(AssertUnwindSafe(|| {
        apply_debug_levels(log_state, level, &channels);
        install_debug_sink(state, log_state, &sink);
        for hooks in &subsystems {
            state
                .write()
                .unwrap()
                .enabled_subsystems
                .push(hooks.clone());
            if let Some(enable_guards) = &hooks.enable_guards {
                enable_guards();
            }
        }
    }));
    if let Err(error) = enabled {
        let switched_on = std::mem::take(&mut state.write().unwrap().enabled_subsystems);
        for hooks in switched_on.iter().rev() {
            if let Some(disable_guards) = &hooks.disable_guards {
                // Keep unwinding; the original enable failure owns this transaction.
                let _ = catch_unwind(AssertUnwindSafe(|| disable_guards()));
            }
        }
        let _ = catch_unwind(AssertUnwindSafe(|| remove_debug_sink(state, log_state)));
        for (channel, saved_level) in &saved_channel_levels {
            let _ = catch_unwind(AssertUnwindSafe(|| match saved_level {
                None => clear_log_channel_level(log_state, channel),
                Some(saved_level) => set_log_channel_level(log_state, channel, *saved_level),
            }));
        }
        let _ = catch_unwind(AssertUnwindSafe(|| {
            set_log_level(log_state, saved_global_level)
        }));
        resume_unwind(error);
    }
    let mut current = state.write().unwrap();
    current.saved_channel_levels = saved_channel_levels;
    current.enabled = true;
}

/// Enables a debug session with the default options, then the generic render guards for one render
/// state (TS `enableFlightDiagnostics`), reporting through the same caller-owned log state.
// flight-lint: allow(conform-params, contract-vocabulary) D5: caller-owned debug and log state replace the source module globals; the RenderState bound is flight-render's own guard-enabler signature (TS `state: RenderState`)
pub fn enable_flight_diagnostics<S: RenderState>(
    debug_state: &DebugStateRef,
    log_state: &LogStateRef,
    state: &mut S,
) {
    enable_debug(debug_state, log_state, None);
    enable_color_adjustment_guards(state, Some(log_state.clone()));
    enable_render_registries_guards(state, Some(log_state.clone()));
}

// Installs the debug sink and records it so disable_debug removes exactly this one.
fn install_debug_sink(state: &DebugStateRef, log_state: &LogStateRef, sink: &LogSink) {
    state.write().unwrap().installed_sink = Some(sink.clone());
    add_log_sink(log_state, sink.clone());
}

/// Whether a debug session is in effect (TS `isDebugEnabled`).
// flight-lint: allow(conform-params) D5: the caller-owned debug state replaces the source module global
pub fn is_debug_enabled(state: &DebugStateRef) -> bool {
    return state.read().unwrap().enabled;
}

/// Registers a subsystem's channels and guard bindings under `name` (TS `registerDebugSubsystem`).
/// Last write wins, and a replaced name keeps its registration position, as the source `Map` does.
// flight-lint: allow(conform-params) D5: the caller-owned debug state replaces the source module global
pub fn register_debug_subsystem(state: &DebugStateRef, name: &str, hooks: &DebugSubsystemHooks) {
    let mut current = state.write().unwrap();
    if let Some(entry) = current
        .subsystems
        .iter_mut()
        .find(|(registered, _)| registered == name)
    {
        entry.1 = hooks.clone();
        return;
    }
    current.subsystems.push((name.to_string(), hooks.clone()));
}

// Removes the installed debug sink, if any.
fn remove_debug_sink(state: &DebugStateRef, log_state: &LogStateRef) {
    let installed = state.write().unwrap().installed_sink.take();
    if let Some(sink) = installed {
        remove_log_sink(log_state, &sink);
    }
}

// The hooks to drive: the named ones in the given order when `names` is given (unregistered names
// are skipped), otherwise every registered subsystem in registration order.
fn resolve_debug_subsystems(
    state: &DebugStateRef,
    names: Option<&[DebugSubsystemName]>,
) -> Vec<DebugSubsystemHooks> {
    let current = state.read().unwrap();
    let Some(names) = names else {
        return current
            .subsystems
            .iter()
            .map(|(_, hooks)| hooks.clone())
            .collect();
    };
    let mut resolved = Vec::new();
    for name in names {
        if let Some((_, hooks)) = current
            .subsystems
            .iter()
            .find(|(registered, _)| registered == name)
        {
            resolved.push(hooks.clone());
        }
    }
    return resolved;
}

// Restores the global level and the per-channel levels the session saved. Only the channels debug
// raised are touched; overrides the caller set before the session survive.
fn restore_debug_levels(state: &DebugStateRef, log_state: &LogStateRef) {
    let (saved_global_level, saved_channel_levels) = {
        let mut current = state.write().unwrap();
        (
            current.saved_global_level,
            std::mem::take(&mut current.saved_channel_levels),
        )
    };
    set_log_level(log_state, saved_global_level);
    for (channel, saved_level) in &saved_channel_levels {
        match saved_level {
            None => clear_log_channel_level(log_state, channel),
            Some(saved_level) => set_log_channel_level(log_state, channel, *saved_level),
        }
    }
}

/// Removes a subsystem registration (TS `unregisterDebugSubsystem`): false when nothing was
/// registered under `name`. An already active session is not affected.
// flight-lint: allow(conform-params) D5: the caller-owned debug state replaces the source module global
pub fn unregister_debug_subsystem(state: &DebugStateRef, name: &str) -> bool {
    let mut current = state.write().unwrap();
    let Some(index) = current
        .subsystems
        .iter()
        .position(|(registered, _)| registered == name)
    else {
        return false;
    };
    current.subsystems.remove(index);
    return true;
}
