import type { LogEntry, LogFormatter, LogSink } from '@flighthq/types/contract';
import { LogLevel } from '@flighthq/types/contract';

import type { LogState } from './log.ts';
import { createTextLogFormatter, getLogLevelName } from './log.ts';

// The console write is a host API: TS `console[method]`, natively stdout/stderr. The Rust source
// (crates/flight-log/src/console_log_sink.rs) is target-native for that reason, and this module is
// its hand-maintained TypeScript. Formatting lives in log.ts; only the write happens here.

// Options for createConsoleLogSink and createConsoleCaptureSink.
export interface ConsoleLogSinkOptions {
  formatter?: LogFormatter;
}

// Creates a sink that records every entry as a tagged JSON envelope on console.debug — low
// visual noise, but the Playwright capture script reads every console level, so it always
// lands in logs.jsonl. Entries at or above `state`'s console threshold (setLogConsoleLevel) are
// ALSO printed as a human-readable line via the matching console method. Install with addLogSink
// or setLogSink.
export function createConsoleCaptureSink(
  state: Readonly<LogState>,
  options?: Readonly<ConsoleLogSinkOptions>,
): LogSink {
  const envelopeFormatter = options?.formatter ?? _defaultEnvelopeFormatter;
  return (entry: Readonly<LogEntry>): void => _writeConsoleCaptureEntry(state, entry, envelopeFormatter);
}

// Creates a sink that writes each entry, formatted, to the console method matching its level: Error
// to `error`, Warn to `warn`, Info to `info`, Debug to `debug`, and None and Verbose to `log`. The
// default formatter is the level-prefixed text formatter over `state`. There is no console-level
// threshold here; that belongs to the capture sink.
export function createConsoleLogSink(state: Readonly<LogState>, options?: Readonly<ConsoleLogSinkOptions>): LogSink {
  const formatter = options?.formatter ?? createTextLogFormatter(state, { levelPrefix: true });
  return (entry: Readonly<LogEntry>): void => _writeConsoleLogEntry(entry, formatter);
}

const _consoleMethods: Readonly<Record<LogLevel, 'debug' | 'error' | 'info' | 'log' | 'warn'>> = {
  [LogLevel.None]: 'log',
  [LogLevel.Error]: 'error',
  [LogLevel.Warn]: 'warn',
  [LogLevel.Info]: 'info',
  [LogLevel.Debug]: 'debug',
  [LogLevel.Verbose]: 'log',
};

const _defaultEnvelopeFormatter: LogFormatter = (entry: Readonly<LogEntry>): string => {
  const { level, channel, data } = entry;
  return JSON.stringify({
    __flight: true,
    t: entry.timestampMs,
    level: getLogLevelName(level),
    channel,
    data: typeof data === 'string' ? { msg: data } : data,
  });
};

/* eslint-disable no-console -- these are the console sinks; writing to the console is their job */
function _writeConsoleCaptureEntry(
  state: Readonly<LogState>,
  entry: Readonly<LogEntry>,
  envelopeFormatter: LogFormatter,
): void {
  if (typeof console === 'undefined') return;
  const { level, channel } = entry;
  // The capture record: every level, as a tagged JSON line the collector parses.
  console.debug(envelopeFormatter(entry));
  // The human-readable subset.
  if (level !== LogLevel.None && state.consoleLevel >= level) {
    const method = _consoleMethods[level];
    const prefix = channel !== null ? `[${channel}]` : '[flight]';
    const { data } = entry;
    if (typeof data === 'string') console[method](`${prefix} ${data}`);
    else console[method](prefix, data);
  }
}

function _writeConsoleLogEntry(entry: Readonly<LogEntry>, formatter: LogFormatter): void {
  if (typeof console === 'undefined') return;
  console[_consoleMethods[entry.level]](formatter(entry));
}
/* eslint-enable no-console */
