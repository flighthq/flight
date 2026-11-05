// Generated from crates/flight-debug/src/debug_timing.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import { endLogTimer, logDebug, startLogTimer } from '@flighthq/log/contract';
import type { LogStateRef } from '@flighthq/log/contract';
import type { LogTimer } from '@flighthq/types/contract';

import { isDebugEnabled } from './debug.ts';
import type { DebugState } from './debug.ts';

/**
 * Opens a named timing span only while a debug session is active (TS `beginDebugSpan`): a running
 * `LogTimer` to hand to `endDebugSpan`, or TypeScript `null` when debug is disabled (nothing is
 * allocated).
 */
export function beginDebugSpan(
  state: Readonly<DebugState>,
  nowMs: number,
  name: string,
  channel: string | null = null,
): LogTimer | null {
  if (!isDebugEnabled(state)) {
    return null;
  }
  return startLogTimer(name, channel, nowMs);
}

/**
 * Closes a span opened by `beginDebugSpan` (TS `endDebugSpan`), emitting its elapsed-time Debug
 * entry and returning the elapsed milliseconds. A TypeScript `null` timer (debug was disabled when
 * the span opened) is a no-op returning -1, the "not measured" sentinel.
 */
export function endDebugSpan(logState: Readonly<LogStateRef>, nowMs: number, timer: Readonly<LogTimer> | null): number {
  if (timer === null) {
    return -1.0;
  }
  return endLogTimer(logState, nowMs, timer);
}

/**
 * Emits a frame-boundary marker while a debug session is active (TS `markDebugFrame`): a Debug entry
 * `{ frame: label }`, or, unlabeled, the next value of the state's ascending frame counter, which a
 * new session does not reset. A no-op, with no counter advance, when debug is disabled.
 */
export function markDebugFrame(
  state: DebugState,
  logState: Readonly<LogStateRef>,
  nowMs: number,
  label?: string,
  channel: string | null = null,
): void {
  if (!isDebugEnabled(state)) {
    return;
  }
  const frame = (() => {
    const matchValue = label;
    if (matchValue !== undefined) {
      const label = matchValue;
      return String(label);
    } else {
      return (() => {
        let current = state!;
        current.frameNumber += 1;
        return current.frameNumber;
      })();
    }
  })();
  const data: Record<string, unknown> = {};
  data['frame'] = frame;
  logDebug(logState, nowMs, data, channel);
}

/**
 * Times a synchronous function as one span while a debug session is active (TS
 * `measureDebugSpan`) and returns its result. With debug disabled the function still runs and only
 * the timing is skipped. The span is closed, and its entry emitted, even when the function throws
 * (the source's throw), and the panic then resumes. `clock` is read once when the span opens and
 * once when it closes.
 */
export function measureDebugSpan<T>(
  state: Readonly<DebugState>,
  logState: Readonly<LogStateRef>,
  clock: () => number,
  name: string,
  fn: () => T,
  channel: string | null = null,
): T {
  const timer = beginDebugSpan(state, clock(), name, channel ?? null) ?? undefined;
  let value: T | undefined = undefined;
  try {
    (() => {
      value = fn();
    })();
  } catch (error) {
    if (timer !== undefined) {
      endDebugSpan(logState, clock(), timer ?? null);
    }
    throw error;
  }
  if (timer !== undefined) {
    endDebugSpan(logState, clock(), timer ?? null);
  }
  return value!;
}
