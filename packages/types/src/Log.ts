// Severity doubles as a verbosity threshold. Console output shows an entry when the configured
// console level is at or above the entry's level (so Error surfaces first, Verbose only at the top);
// None disables console output. The capture sink, by contrast, receives every level regardless of
// the console threshold — the machine record is always complete; the console is the human-facing
// subset. See @flighthq/log.
export enum LogLevel {
  None = 0,
  Error = 1,
  Warn = 2,
  Info = 3,
  Debug = 4,
  Verbose = 5,
}

// A log payload: a plain message string, or a structured record for machine-readable capture.
export type LogData = string | Readonly<Record<string, unknown>>;

// A bound logging context: a channel plus base fields merged into every entry emitted through it.
// Created with createLogContext / createChildLogContext; consumed by logWith and the *With wrappers.
export interface LogContext {
  channel: string | null;
  fields: Readonly<Record<string, unknown>>;
}

// A deferred log payload. The thunk is invoked only when the entry passes the level gate, so a
// suppressed verbose call allocates nothing.
export type LogDataProvider = () => LogData;

// Renders an entry to a single line of text (JSON envelope or human-readable). Used by sinks and
// transports.
export type LogFormatter = (entry: Readonly<LogEntry>) => string;

// A named tracing span — a plain value, inert until enterLogSpan. While active, its fields merge
// into every emitted entry (lower priority than the entry's own fields).
export interface LogSpan {
  name: string;
  fields: Readonly<Record<string, unknown>>;
  channel: string | null;
}

// A running timer started with startLogTimer. Pass to endLogTimer to record elapsed time.
// `startedAt` is a high-resolution timestamp in milliseconds.
export interface LogTimer {
  label: string;
  channel: string | null;
  startedAt: number;
}

// A line-oriented transport for file/remote log sinks. The web default is a no-op; native hosts
// register an fs-backed implementation via setLogTransportBackend. `flush` and `dispose` are
// optional — sinks call them when present.
export interface LogTransportBackend {
  write(line: string): void;
  flush?(): void;
  dispose?(): void;
}

// One emitted log entry. `channel` is a free categorization tag (for example 'batch', 'shader',
// 'user') used to filter captured output; null when uncategorized.
export interface LogEntry {
  level: LogLevel;
  channel: string | null;
  data: LogData;
}

// Receives every emitted entry regardless of the console verbosity threshold. The capture harness
// installs one to record structured output; tests install one to assert. A free function (not a
// class) so it stays trivially swappable and portable. Installed via setLogSink in
// @flighthq/log.
export type LogSink = (entry: Readonly<LogEntry>) => void;
