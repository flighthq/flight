import type { EntityRaw, EntityRuntime, EntityRuntimeKey } from '@flighthq/entity/contract';
import type { LogLevel, LogSink } from '@flighthq/log/contract';

interface DebugEntity extends EntityRaw {
  [EntityRuntimeKey]: EntityRuntime | undefined;
}

// The name of a diagnostic subsystem switched on through @flighthq/debug. The seeded names retain
// autocomplete while the string tail permits package- and vendor-owned subsystems.
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

// One subsystem's log channels and optional guard lifecycle.
export interface DebugSubsystemHooks {
  channels?: readonly string[];
  enableGuards?: () => void;
  disableGuards?: () => void;
}

// Options for one debug session. Omitted subsystems select every registered subsystem.
export interface DebugOptions {
  subsystems?: readonly DebugSubsystemName[];
  level?: LogLevel;
  channels?: readonly string[];
  sink?: LogSink;
}

// Caller-owned debug session state. Mutable implementation state stays on this entity rather than
// in module globals so independent hosts cannot redirect one another.
export interface DebugState extends DebugEntity {
  enabled: boolean;
  enabledSubsystems: Readonly<DebugSubsystemHooks>[];
  frameNumber: number;
  installedSink: LogSink | null;
  savedChannelLevels: Map<string, LogLevel | null>;
  savedGlobalLevel: LogLevel;
  subsystems: Map<string, Readonly<DebugSubsystemHooks>>;
}
