// Log contracts are owned by `@flighthq/log`. These deprecated re-exports keep existing
// `@flighthq/types` imports compiling until consumers import the owning package.

// A structural copy, not a re-export: a core package may not import `@flighthq/log` values outside its
// guard modules. `LogLevel` is a plain numeric const object in both places, so the two are interchangeable.
/** @deprecated Import `LogLevel` from `@flighthq/log/contract`. */
export const LogLevel = {
  None: 0,
  Error: 1,
  Warn: 2,
  Info: 3,
  Debug: 4,
  Verbose: 5,
} as const;
export type LogLevel = (typeof LogLevel)[keyof typeof LogLevel];
/** @deprecated Import from `@flighthq/log/contract`. */
export type {
  LogData,
  LogContext,
  LogDataProvider,
  LogFormatter,
  LogSpan,
  LogTimer,
  LogTransportWriteOutcome,
  LogTransportDeliveryBoundary,
  LogTransportFlushOutcome,
  LogTransportDestroyOutcome,
  LogTransport,
  LogEntry,
  LogSink,
} from '@flighthq/log/contract';
