// Generated from crates/flight-input/src/input_timer.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import { allocateEntity } from '@flighthq/entity/contract';

import type {
  InputKeyRepeatOptions,
  InputKeyRepeatTimerRaw,
  InputKeyRepeatTimerState,
  InputRepeatCallback,
} from './types.ts';
import { inputKeyRepeatTimerCycleStore } from './types.ts';

/**
 * Drives the timer against the caller's clock (explicit-clock replacement for the source's real
 * timers). Fires every due tick in order: the delayed tick, then one tick per elapsed interval.
 */
export function advanceInputKeyRepeatTimer(timer: InputKeyRepeatTimerRaw, nowMs: number): void {
  for (;;) {
    const tick = takeDueInputKeyRepeatTick(timer, nowMs);
    if (tick === undefined) {
      return;
    }
    const [callback, immediate] = tick;
    if (callback !== undefined) {
      callback();
    }
    if (immediate) {
      return;
    }
  }
}

/**
 * Allocates a reusable key-repeat timer from the supplied timings (TS
 * `createInputKeyRepeatTimer`). Timing is caller-driven; no real timer is created.
 */
export function createInputKeyRepeatTimer(options: Readonly<InputKeyRepeatOptions>): InputKeyRepeatTimerRaw {
  let out: InputKeyRepeatTimerRaw = allocateEntity<InputKeyRepeatTimerRaw>();
  initializeInputKeyRepeatTimer(out, options);
  return out;
}

/**
 * Gives a timer under construction its timings and an inactive cycle (TS
 * `initializeInputKeyRepeatTimer`).
 */
export function initializeInputKeyRepeatTimer(
  out: InputKeyRepeatTimerRaw,
  options: Readonly<InputKeyRepeatOptions>,
): void {
  inputKeyRepeatTimerCycleStore.set(out, {
    callback: undefined,
    delayMs: options.delay,
    intervalMs: options.interval,
    nextFireMs: 0.0,
    repeating: false,
    started: false,
  });
}

function beginInputKeyRepeatCycle(timer: InputKeyRepeatTimerRaw, callback: InputRepeatCallback, nowMs: number): void {
  let locked = timer!;
  const cycle = getInputKeyRepeatTimerCycle(locked);
  cycle.callback = callback;
  cycle.nextFireMs = nowMs + cycle.delayMs;
  cycle.repeating = false;
  cycle.started = true;
}

function getInputKeyRepeatTimerCycle(timer: InputKeyRepeatTimerRaw): InputKeyRepeatTimerState {
  return inputKeyRepeatTimerCycleStore.get(timer)!;
}

/**
 * Starts the repeat cycle at the caller's clock: invokes the callback immediately, then schedules
 * the delayed tick and the interval ticks (TS `InputKeyRepeatTimer.start`).
 */
export function startInputKeyRepeatTimer(
  timer: InputKeyRepeatTimerRaw,
  callback: InputRepeatCallback,
  nowMs: number,
): void {
  beginInputKeyRepeatCycle(timer, callback, nowMs);
  callback();
}

/**
 * Cancels the repeat cycle and drops its callback (TS `InputKeyRepeatTimer.stop`).
 */
export function stopInputKeyRepeatTimer(timer: InputKeyRepeatTimerRaw): void {
  let locked = timer!;
  const cycle = getInputKeyRepeatTimerCycle(locked);
  cycle.callback = undefined;
  cycle.started = false;
}

function takeDueInputKeyRepeatTick(
  timer: InputKeyRepeatTimerRaw,
  nowMs: number,
): readonly [InputRepeatCallback | undefined, boolean] | undefined {
  let locked = timer!;
  const cycle = getInputKeyRepeatTimerCycle(locked);
  if (!cycle.started || nowMs < cycle.nextFireMs) {
    return undefined;
  }
  const callback = cycle.callback;
  const interval = cycle.intervalMs;
  cycle.repeating = true;
  if (interval <= 0.0) {
    cycle.nextFireMs = nowMs;
  } else {
    cycle.nextFireMs += interval;
  }
  return [callback, interval <= 0.0];
}
