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
