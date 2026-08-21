import {
  addLogSink,
  clearLogChannelLevel,
  clearLogChannelLevels,
  createConsoleLogSink,
  getLogChannelLevel,
  getLogLevel,
  removeLogSink,
  setLogChannelLevel,
  setLogLevel,
} from '@flighthq/log/contract';
import { enableColorAdjustmentGuards, enableRenderRegistryGuards } from '@flighthq/render/contract';
import type {
  DebugOptions,
  DebugSubsystemHooks,
  DebugSubsystemName,
  LogSink,
  RenderState,
} from '@flighthq/types/contract';
import { LogLevel } from '@flighthq/types/contract';

// The one call that returns Flight to the zero-debug baseline: removes the sink enableDebug
// installed, restores the log levels it raised, and runs the disable-guards binding of every
// subsystem it switched on. No-op when debug is not enabled (idempotent, sentinel — not a throw).
// After this, importing @flighthq/debug costs nothing and no debug output is produced.
export function disableDebug(): void {
  if (!_enabled) return;
  for (const hooks of _enabledSubsystems) hooks.disableGuards?.();
  _enabledSubsystems.length = 0;
  _removeDebugSink();
  _restoreDebugLevels();
  _enabled = false;
}

// The friendly entry point to Flight's diagnostics. Installs a dev console LogSink (a text-formatted
// one by default; override with `options.sink`), raises the global log level (default
// LogLevel.Debug) and the per-channel levels of the selected subsystems plus any explicit
// `options.channels`, and runs each selected subsystem's registered guard-enabler. `options.subsystems`
// selects which registered subsystems to switch on; omit it to switch on every registered subsystem.
// Idempotent: a second call while already enabled is a no-op (disableDebug first to re-enable with
// different options).
export function enableDebug(options: Readonly<DebugOptions> = {}): void {
  if (_enabled) return;
  const level = options.level ?? LogLevel.Debug;
  const subsystems = _resolveDebugSubsystems(options.subsystems);
  const channels = _collectDebugChannels(subsystems, options.channels);

  _savedGlobalLevel = getLogLevel();
  const savedChannelLevels = new Map(channels.map((channel) => [channel, getLogChannelLevel(channel)]));
  try {
    _applyDebugLevels(level, channels);
    _installDebugSink(options.sink ?? createConsoleLogSink());
    for (const hooks of subsystems) {
      _enabledSubsystems.push(hooks);
      hooks.enableGuards?.();
    }
  } catch (error) {
    for (let index = _enabledSubsystems.length - 1; index >= 0; index--) {
      try {
        _enabledSubsystems[index].disableGuards?.();
      } catch {
        // Keep unwinding; the original enable error owns this failed transaction.
      }
    }
    _enabledSubsystems.length = 0;
    try {
      _removeDebugSink();
    } catch {
      // Keep restoring levels; the original enable error must not be masked.
    }
    for (const [channel, savedLevel] of savedChannelLevels) {
      try {
        if (savedLevel === null) clearLogChannelLevel(channel);
        else setLogChannelLevel(channel, savedLevel);
      } catch {
        // Keep restoring the remaining levels; the original enable error must survive.
      }
    }
    try {
      setLogLevel(_savedGlobalLevel);
    } catch {
      // The original enable error remains the public failure even if rollback also fails.
    }
    throw error;
  }
  _enabled = true;
}

export function enableFlightDiagnostics(state: RenderState): void {
  enableDebug();
  enableColorAdjustmentGuards(state);
  enableRenderRegistryGuards(state);
}

// Whether enableDebug is currently in effect (a sink is installed and levels/guards are raised).
export function isDebugEnabled(): boolean {
  return _enabled;
}

// Registers a diagnostic subsystem's wiring — the log channels whose verbosity enableDebug should
// raise and the guard-enabler/-disabler bindings it should run for `name`. A package's thin debug
// adapter (or the app) calls this so enableDebug(['render']) can drive the subsystem without
// @flighthq/debug importing it. Last-write-wins; vendor-prefix custom subsystem names ('acme.Foo')
// to avoid colliding with built-ins.
export function registerDebugSubsystem(name: DebugSubsystemName, hooks: Readonly<DebugSubsystemHooks>): void {
  _subsystems.set(name, hooks);
}

// Removes a subsystem registration. Returns false when nothing was registered under `name`
// (sentinel, not a throw). Does not affect an already-active debug session.
export function unregisterDebugSubsystem(name: DebugSubsystemName): boolean {
  return _subsystems.delete(name);
}

const _subsystems = new Map<string, Readonly<DebugSubsystemHooks>>();
const _enabledSubsystems: Readonly<DebugSubsystemHooks>[] = [];

let _enabled = false;
let _installedSink: LogSink | null = null;
let _savedGlobalLevel: LogLevel = LogLevel.Verbose;

// Raises the global level and every selected channel's level to `level` for the session.
function _applyDebugLevels(level: LogLevel, channels: readonly string[]): void {
  setLogLevel(level);
  for (const channel of channels) setLogChannelLevel(channel, level);
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
function _installDebugSink(sink: LogSink): void {
  _installedSink = sink;
  addLogSink(sink);
}

// Removes the installed debug sink, if any.
function _removeDebugSink(): void {
  if (_installedSink === null) return;
  removeLogSink(_installedSink);
  _installedSink = null;
}

// Resolves the subsystem hooks to drive: the named ones when `names` is given (unregistered names
// are skipped), otherwise every registered subsystem.
function _resolveDebugSubsystems(names: readonly DebugSubsystemName[] | undefined): Readonly<DebugSubsystemHooks>[] {
  if (names === undefined) return [..._subsystems.values()];
  const resolved: Readonly<DebugSubsystemHooks>[] = [];
  for (const name of names) {
    const hooks = _subsystems.get(name);
    if (hooks !== undefined) resolved.push(hooks);
  }
  return resolved;
}

// Restores the global level enableDebug saved and clears the per-channel overrides it raised. Debug
// owns per-channel verbosity for the duration of a session, so disabling wipes those overrides back
// to inheriting the global level.
function _restoreDebugLevels(): void {
  setLogLevel(_savedGlobalLevel);
  clearLogChannelLevels();
}
