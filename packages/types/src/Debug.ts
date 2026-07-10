import type { LogLevel, LogSink } from './Log';

// The name of a diagnostic subsystem switched on through @flighthq/debug — a curated label
// ('render', 'input', 'audio', …) grouping a set of log channels and a guard-enabler. An open
// string union: the seeded names carry the common built-ins with editor autocomplete, and the
// `(string & {})` arm keeps the type open so a package or app can register a vendor-prefixed
// custom subsystem ('acme.physics') without widening to a bare `string`. Registered via
// registerDebugSubsystem.
export type DebugSubsystemName =
  | 'animation'
  | 'audio'
  | 'input'
  | 'loader'
  | 'connectivity'
  | 'particles'
  | 'render'
  | 'text'
  | (string & {});

// The wiring a subsystem contributes to the debug umbrella: the log channels whose verbosity is
// raised when the subsystem is enabled, and its guard-enabler / -disabler bindings (the owning
// package's own `enable*Guards` / `disable*Guards`, wired in without @flighthq/debug importing the
// package). All fields are optional — a subsystem may contribute channels only, guards only, or
// both. Registered as a unit via registerDebugSubsystem.
export interface DebugSubsystemHooks {
  channels?: readonly string[];
  enableGuards?: () => void;
  disableGuards?: () => void;
}

// Options for enableDebug. `subsystems` selects which registered subsystems to switch on (their
// channels raised + their guards enabled); omitting it enables every registered subsystem.
// `level` sets the global minimum log level for the debug session (default LogLevel.Debug).
// `channels` raises extra channels beyond those the chosen subsystems contribute. `sink` overrides
// the installed dev sink (default a text-formatted console sink).
export interface DebugOptions {
  subsystems?: readonly DebugSubsystemName[];
  level?: LogLevel;
  channels?: readonly string[];
  sink?: LogSink;
}
