import type { FlightLogData, FlightLogEntry, FlightLogSink } from '@flighthq/types';
import { LogLevel } from '@flighthq/types';

// Logging is split into two faces of one contract so each consumer tree-shakes its half:
//
//   Emit side  — flightLog and the log* wrappers. Featherweight: each forwards an entry to the
//                installed sink and nothing else. A build that never installs a sink (a shipped
//                example measured by the size suite, a production bundle) carries only the forwarder
//                and the LogLevel enum; everything below tree-shakes away.
//   Listener side — createConsoleCaptureSink and the threshold setters. Imported by tools (the
//                explorer, the capture harness). This is where levels gate output: the sink records
//                EVERY level (the machine record is complete) and additionally prints a human console
//                line for levels at or above the configured threshold.

// Listener side. A sink that records every entry as a tagged JSON envelope on console.debug — low
// visual noise, but the Playwright capture script reads every console level, so it always lands in
// logs.jsonl. Entries at or above the console threshold (setFlightLogConsoleLevel) are ALSO printed
// as a human-readable line via the matching console method. Install with setFlightLogSink.
export function createConsoleCaptureSink(): FlightLogSink {
  return writeConsoleCaptureEntry;
}

// Emit side. Emits a log entry at an explicit level. `channel` is a free categorization tag (e.g.
// 'batch', 'shader', 'user') for filtering captured output. No-ops until a sink is installed.
export function flightLog(level: LogLevel, data: FlightLogData, channel: string | null = null): void {
  _sink?.({ level, channel, data });
}

// Listener side. Reads the human-readable console threshold (default LogLevel.Info). Capture is
// unaffected by it — the sink records every level regardless.
export function getFlightLogConsoleLevel(): LogLevel {
  return _consoleLevel;
}

// Emit side. Severity-named convenience wrappers over flightLog (mirrors console.debug/info/warn/error).
export function logDebug(data: FlightLogData, channel: string | null = null): void {
  _sink?.({ level: LogLevel.Debug, channel, data });
}

export function logError(data: FlightLogData, channel: string | null = null): void {
  _sink?.({ level: LogLevel.Error, channel, data });
}

export function logInfo(data: FlightLogData, channel: string | null = null): void {
  _sink?.({ level: LogLevel.Info, channel, data });
}

export function logVerbose(data: FlightLogData, channel: string | null = null): void {
  _sink?.({ level: LogLevel.Verbose, channel, data });
}

export function logWarn(data: FlightLogData, channel: string | null = null): void {
  _sink?.({ level: LogLevel.Warn, channel, data });
}

// Listener side. Sets the highest level printed as a human-readable console line. LogLevel.None
// silences those lines; the capture record still receives every level.
export function setFlightLogConsoleLevel(level: LogLevel): void {
  _consoleLevel = level;
}

// Installs (or clears, with null) the sink every emit forwards to.
export function setFlightLogSink(sink: FlightLogSink | null): void {
  _sink = sink;
}

const _consoleMethods: Readonly<Record<LogLevel, 'debug' | 'error' | 'info' | 'log' | 'warn'>> = {
  [LogLevel.None]: 'log',
  [LogLevel.Error]: 'error',
  [LogLevel.Warn]: 'warn',
  [LogLevel.Info]: 'info',
  [LogLevel.Debug]: 'debug',
  [LogLevel.Verbose]: 'log',
};

const _levelNames: Readonly<Record<LogLevel, string>> = {
  [LogLevel.None]: 'none',
  [LogLevel.Error]: 'error',
  [LogLevel.Warn]: 'warn',
  [LogLevel.Info]: 'info',
  [LogLevel.Debug]: 'debug',
  [LogLevel.Verbose]: 'verbose',
};

let _consoleLevel: LogLevel = LogLevel.Info;
let _sink: FlightLogSink | null = null;

function timestamp(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

/* eslint-disable no-console -- this is the console-capture sink; writing to the console is its job */
function writeConsoleCaptureEntry(entry: Readonly<FlightLogEntry>): void {
  if (typeof console === 'undefined') return;
  const { level, channel, data } = entry;
  // The capture record: every level, as a tagged JSON line the collector parses. console.debug keeps
  // it visually out of the way while still being captured.
  console.debug(
    JSON.stringify({
      __flight: true,
      t: timestamp(),
      level: _levelNames[level],
      channel,
      data: typeof data === 'string' ? { msg: data } : data,
    }),
  );
  // The human-readable subset.
  if (level !== LogLevel.None && _consoleLevel >= level) {
    const method = _consoleMethods[level];
    const prefix = channel !== null ? `[${channel}]` : '[flight]';
    if (typeof data === 'string') console[method](`${prefix} ${data}`);
    else console[method](prefix, data);
  }
}
/* eslint-enable no-console */
