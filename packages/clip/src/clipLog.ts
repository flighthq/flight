// Generated from crates/flight-clip/src/clip_log.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import type { LogState } from '@flighthq/log/contract';
import { logOnce } from '@flighthq/log/contract';
import { LogLevel } from '@flighthq/types/contract';

export function logClipWarning(logState: Readonly<LogState>, nowMs: number, key: string, message: string): void {
  const data = { message: String(message) };
  logOnce(logState, nowMs, key, LogLevel.Warn, data, 'clip');
}
