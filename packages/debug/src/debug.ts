import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type { EntityConstruction } from '@flighthq/entity/contract';
import type { LogState } from '@flighthq/log/contract';
import {
  addLogSink,
  clearLogChannelLevel,
  createConsoleLogSink,
  getLogChannelLevel,
  getLogLevel,
  removeLogSink,
  setLogChannelLevel,
  setLogLevel,
} from '@flighthq/log/contract';
import { enableColorAdjustmentGuards, enableRenderRegistriesGuards } from '@flighthq/render/contract';
import type {
  DebugOptions,
  DebugSubsystemHooks,
  DebugSubsystemName,
  Entity,
  LogSink,
  RenderState,
} from '@flighthq/types/contract';
import { LogLevel } from '@flighthq/types/contract';

// The debug umbrella's state: the subsystem registry, the active session and the frame counter, held by
// the caller instead of in module globals. Registration order is kept, as `subsystems` is a Map.
export interface DebugState extends Entity {
  enabled: boolean;
  enabledSubsystems: Readonly<DebugSubsystemHooks>[];
  frameNumber: number;
  installedSink: LogSink | null;
  savedChannelLevels: Map<string, LogLevel | null>;
  savedGlobalLevel: LogLevel;
  subsystems: Map<string, Readonly<DebugSubsystemHooks>>;
}

// Creates an empty debug state: no registered subsystems and no active session.
export function createDebugState(): DebugState {
  const out = allocateEntity<DebugState>();
  initializeDebugState(out);
  return finishEntity(out);
}

// The one call that returns Flight to the zero-debug baseline: removes the sink enableDebug
// installed, restores the log levels it raised, and runs the disable-guards binding of every
// subsystem it switched on. No-op when debug is not enabled (idempotent, sentinel — not a throw).
// After this, importing @flighthq/debug costs nothing and no debug output is produced.
export function disableDebug(state: DebugState, logState: LogState): void {
  if (!state.enabled) return;
  for (const hooks of state.enabledSubsystems) hooks.disableGuards?.();
  state.enabledSubsystems.length = 0;
  _removeDebugSink(state, logState);
  _restoreDebugLevels(state, logState);
  state.enabled = false;
}

// The friendly entry point to Flight's diagnostics. Installs a dev console LogSink on `logState` (a
// text-formatted one by default; override with `options.sink`), raises the global log level (default
// LogLevel.Debug) and the per-channel levels of the selected subsystems plus any explicit
// `options.channels`, and runs each selected subsystem's registered guard-enabler. `options.subsystems`
// selects which registered subsystems to switch on; omit it to switch on every registered subsystem.
// Idempotent: a second call while already enabled is a no-op (disableDebug first to re-enable with
// different options).
export function enableDebug(state: DebugState, logState: LogState, options: Readonly<DebugOptions> = {}): void {
  if (state.enabled) return;
  const level = options.level ?? LogLevel.Debug;
  const subsystems = _resolveDebugSubsystems(state, options.subsystems);
  const channels = _collectDebugChannels(subsystems, options.channels);

  state.savedGlobalLevel = getLogLevel(logState);
  const savedChannelLevels = new Map(channels.map((channel) => [channel, getLogChannelLevel(logState, channel)]));
  try {
    _applyDebugLevels(logState, level, channels);
    _installDebugSink(state, logState, options.sink ?? createConsoleLogSink(logState));
    for (const hooks of subsystems) {
      state.enabledSubsystems.push(hooks);
      hooks.enableGuards?.();
    }
  } catch (error) {
    for (let index = state.enabledSubsystems.length - 1; index >= 0; index--) {
      try {
        state.enabledSubsystems[index].disableGuards?.();
      } catch {
        // Keep unwinding; the original enable error owns this failed transaction.
      }
    }
    state.enabledSubsystems.length = 0;
    try {
      _removeDebugSink(state, logState);
    } catch {
      // Keep restoring levels; the original enable error must not be masked.
    }
    for (const [channel, savedLevel] of savedChannelLevels) {
      try {
        if (savedLevel === null) clearLogChannelLevel(logState, channel);
        else setLogChannelLevel(logState, channel, savedLevel);
      } catch {
        // Keep restoring the remaining levels; the original enable error must survive.
      }
    }
    try {
      setLogLevel(logState, state.savedGlobalLevel);
    } catch {
      // The original enable error remains the public failure even if rollback also fails.
    }
    throw error;
  }
  state.savedChannelLevels = savedChannelLevels;
  state.enabled = true;
}

// Enables a debug session with the default options, then the generic render guards for one render
// state, reporting through the same caller-owned log state.
export function enableFlightDiagnostics(debugState: DebugState, logState: LogState, state: RenderState): void {
  enableDebug(debugState, logState);
  enableColorAdjustmentGuards(state, logState);
  enableRenderRegistriesGuards(state, logState);
}

// Resets a debug state to no registered subsystems and no active session (the construction
// initializer of createDebugState).
export function initializeDebugState(out: EntityConstruction<DebugState>): void {
  out.enabled = false;
  out.enabledSubsystems = [];
  out.frameNumber = 0;
  out.installedSink = null;
  out.savedChannelLevels = new Map();
  out.savedGlobalLevel = LogLevel.Verbose;
  out.subsystems = new Map();
}

// Whether enableDebug is currently in effect (a sink is installed and levels/guards are raised).
export function isDebugEnabled(state: Readonly<DebugState>): boolean {
  return state.enabled;
}

// Registers a diagnostic subsystem's wiring — the log channels whose verbosity enableDebug should
// raise and the guard-enabler/-disabler bindings it should run for `name`. A package's thin debug
// adapter (or the app) calls this so enableDebug(['render']) can drive the subsystem without
// @flighthq/debug importing it. Last-write-wins; vendor-prefix custom subsystem names ('acme.Foo')
// to avoid colliding with built-ins.
export function registerDebugSubsystem(
  state: DebugState,
  name: DebugSubsystemName,
  hooks: Readonly<DebugSubsystemHooks>,
): void {
  state.subsystems.set(name, hooks);
}

// Removes a subsystem registration. Returns false when nothing was registered under `name`
// (sentinel, not a throw). Does not affect an already-active debug session.
export function unregisterDebugSubsystem(state: DebugState, name: DebugSubsystemName): boolean {
  return state.subsystems.delete(name);
}

// Raises the global level and every selected channel's level to `level` for the session.
function _applyDebugLevels(logState: LogState, level: LogLevel, channels: readonly string[]): void {
  setLogLevel(logState, level);
  for (const channel of channels) setLogChannelLevel(logState, channel, level);
}

// Gathers the channels to raise: every selected subsystem's channels plus any explicit extras.
function _collectDebugChannels(
  subsystems: readonly Readonly<DebugSubsystemHooks>[],
  extra: readonly string[] | undefined,
): string[] {
  const channels: string[] = [];
  for (const hooks of subsystems) {
    if (hooks.channels !== undefined) channels.push(...hooks.channels);
  }
  if (extra !== undefined) channels.push(...extra);
  return channels;
}

// Installs the debug sink and records it so disableDebug can remove exactly this one.
function _installDebugSink(state: DebugState, logState: LogState, sink: LogSink): void {
  state.installedSink = sink;
  addLogSink(logState, sink);
}

// Removes the installed debug sink, if any.
function _removeDebugSink(state: DebugState, logState: LogState): void {
  if (state.installedSink === null) return;
  removeLogSink(logState, state.installedSink);
  state.installedSink = null;
}

// Resolves the subsystem hooks to drive: the named ones when `names` is given (unregistered names
// are skipped), otherwise every registered subsystem.
function _resolveDebugSubsystems(
  state: Readonly<DebugState>,
  names: readonly DebugSubsystemName[] | undefined,
): Readonly<DebugSubsystemHooks>[] {
  if (names === undefined) return [...state.subsystems.values()];
  const resolved: Readonly<DebugSubsystemHooks>[] = [];
  for (const name of names) {
    const hooks = state.subsystems.get(name);
    if (hooks !== undefined) resolved.push(hooks);
  }
  return resolved;
}

// Restores the global level and per-channel overrides enableDebug saved. Only the channels debug
// raised are touched; channel overrides the caller set before the session are preserved.
function _restoreDebugLevels(state: DebugState, logState: LogState): void {
  setLogLevel(logState, state.savedGlobalLevel);
  for (const [channel, savedLevel] of state.savedChannelLevels) {
    if (savedLevel === null) clearLogChannelLevel(logState, channel);
    else setLogChannelLevel(logState, channel, savedLevel);
  }
  state.savedChannelLevels = new Map();
}
