import type { LogState } from '@flighthq/log/contract';
import { endLogTimer, logDebug, startLogTimer } from '@flighthq/log/contract';
import type { LogTimer } from '@flighthq/types/contract';

import type { DebugState } from './debug.ts';
import { isDebugEnabled } from './debug.ts';

// Opens a named timing span at the caller's clock reading `nowMs`, but only while a debug session is
// active: returns a LogTimer to hand to endDebugSpan, or null when debug is disabled (production, or
// before enableDebug). Gating here is the point — with debug off, opening a span is one boolean check
// and allocates nothing, so span instrumentation left in shipping code costs effectively nothing. Pair
// every non-null result with endDebugSpan (measureDebugSpan brackets both for a single synchronous call).
export function beginDebugSpan(
  state: Readonly<DebugState>,
  nowMs: number,
  name: string,
  channel: string | null = null,
): LogTimer | null {
  return isDebugEnabled(state) ? startLogTimer(name, channel, nowMs) : null;
}

// Closes a span opened by beginDebugSpan, emitting its elapsed-time Debug entry through `logState` and
// returning the elapsed milliseconds. A null timer — debug was disabled when the span opened — is a
// no-op returning -1, the sentinel for "not measured".
export function endDebugSpan(logState: LogState, nowMs: number, timer: Readonly<LogTimer> | null): number {
  return timer === null ? -1 : endLogTimer(logState, nowMs, timer);
}

// Emits a frame-boundary marker while a debug session is active, so the per-frame span entries between
// two markers can be read against the frame they fell in. `label` names the frame; omit it to tag the
// marker with the state's ascending frame counter, which a new session does not reset. No-op (and no
// counter advance) when debug is disabled, so a per-frame call in the app loop costs a single boolean
// check in production.
export function markDebugFrame(
  state: DebugState,
  logState: LogState,
  nowMs: number,
  label?: string,
  channel: string | null = null,
): void {
  if (!isDebugEnabled(state)) return;
  logDebug(logState, nowMs, { frame: label ?? ++state.frameNumber }, channel);
}

// Brackets a synchronous function as a timing span: times `fn` while a debug session is active,
// emitting one elapsed-time entry, and returns `fn`'s result. When debug is disabled `fn` still runs —
// only the timing is skipped — so wrapping a call never changes behavior, only observability. The span
// is closed even if `fn` throws. `clock` is read once when the span opens and once when it closes.
export function measureDebugSpan<T>(
  state: Readonly<DebugState>,
  logState: LogState,
  clock: () => number,
  name: string,
  fn: () => T,
  channel: string | null = null,
): T {
  const timer = beginDebugSpan(state, clock(), name, channel);
  try {
    return fn();
  } finally {
    if (timer !== null) endDebugSpan(logState, clock(), timer);
  }
}
