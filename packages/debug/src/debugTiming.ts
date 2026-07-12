import { endLogTimer, logDebug, startLogTimer } from '@flighthq/log';
import type { LogTimer } from '@flighthq/types';

import { isDebugEnabled } from './debug';

// Opens a named timing span, but only while a debug session is active: returns a LogTimer to hand to
// endDebugSpan, or null when debug is disabled (production, or before enableDebug). Gating here is the
// point — with debug off, opening a span is one boolean check and allocates nothing, so span
// instrumentation left in shipping code costs effectively nothing. Pair every non-null result with
// endDebugSpan (measureDebugSpan brackets both for a single synchronous call).
export function beginDebugSpan(name: string, channel: string | null = null): LogTimer | null {
  return isDebugEnabled() ? startLogTimer(name, channel) : null;
}

// Closes a span opened by beginDebugSpan, emitting its elapsed-time Debug entry through the active
// debug sink and returning the elapsed milliseconds. A null timer — debug was disabled when the span
// opened — is a no-op returning -1, the sentinel for "not measured".
export function endDebugSpan(timer: Readonly<LogTimer> | null): number {
  return timer === null ? -1 : endLogTimer(timer);
}

// Emits a frame-boundary marker while a debug session is active, so the per-frame span entries between
// two markers can be read against the frame they fell in. `label` names the frame; omit it to tag the
// marker with a process-monotonic frame counter. No-op (and no counter advance) when debug is disabled,
// so a per-frame call in the app loop costs a single boolean check in production.
export function markDebugFrame(label?: string, channel: string | null = null): void {
  if (!isDebugEnabled()) return;
  logDebug({ frame: label ?? ++_debugFrameNumber }, channel);
}

// Brackets a synchronous function as a timing span: times `fn` while a debug session is active,
// emitting one elapsed-time entry, and returns `fn`'s result. When debug is disabled `fn` still runs —
// only the timing is skipped — so wrapping a call never changes behavior, only observability. The span
// is closed even if `fn` throws.
export function measureDebugSpan<T>(name: string, fn: () => T, channel: string | null = null): T {
  const timer = beginDebugSpan(name, channel);
  try {
    return fn();
  } finally {
    endDebugSpan(timer);
  }
}

// Monotonic id handed to unlabeled frame markers. Not reset between sessions — a marker's job is to
// correlate span entries with a frame boundary, for which a unique ascending id suffices.
let _debugFrameNumber = 0;
