/* eslint-disable @typescript-eslint/no-explicit-any */

import type { Signal } from '@flighthq/types';

import { connectSignal, disconnectSignal } from './slot';

/**
 * Options for `connectSignalThrottled` and `connectSignalDebounced`.
 */
export interface SignalThrottleOptions {
  /**
   * Whether to fire on the leading edge of the interval (before the delay).
   * Default: `true`.
   */
  leading?: boolean;
  /**
   * Whether to fire on the trailing edge of the interval (after the delay).
   * Default: `true`.
   */
  trailing?: boolean;
}

/**
 * Connects a frame-tick signal to a slot at a reduced frame rate. The slot
 * receives the total accumulated `deltaTime` (in ms) since the last fire, not
 * the individual source deltas. Returns a cleanup function that disconnects
 * the internal handler.
 *
 * This is specialized to `(deltaTime: number) => void` frame-tick signals and
 * accumulates time rather than forwarding source args. For a payload-preserving
 * throttle over any signal shape, use `connectSignalThrottled`.
 */
export function connectSignalAtFrameRate(
  source: Signal<(deltaTime: number) => void>,
  fps: number,
  slot: (deltaTime: number) => void,
): () => void {
  const period = 1000 / fps;
  let elapsed = 0;
  const handler = (delta: number) => {
    elapsed += delta;
    if (elapsed >= period) {
      slot(elapsed);
      elapsed %= period;
    }
  };
  connectSignal(source, handler);
  return () => disconnectSignal(source, handler);
}

/**
 * @deprecated Renamed to `connectSignalAtFrameRate`. Will be removed in a
 * future release.
 */
export const connectSignalAtRate = connectSignalAtFrameRate;

/**
 * Connects a slot to a signal with debounce semantics: the slot fires only
 * after the signal has been quiet for `delayMs` milliseconds. Each emission
 * resets the timer. Returns a cleanup function.
 *
 * `leading: true` fires immediately on the first invocation and suppresses
 * subsequent calls until the delay window expires. `trailing: true` (default)
 * fires at the end of the quiet period with the most recent args.
 *
 * Uses `Date.now()` as the clock — suitable for UI/interaction signals (e.g.
 * resize, search input).
 */
export function connectSignalDebounced<T extends (...args: any[]) => void>(
  source: Signal<T>,
  delayMs: number,
  slot: T,
  options?: Readonly<SignalThrottleOptions>,
): () => void {
  const leading = options?.leading ?? false;
  const trailing = options?.trailing ?? true;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let lastArgs: any[] | null = null;
  let leadingFired = false;
  const clearTimer = () => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  };
  const handler = ((...args: any[]) => {
    lastArgs = args;
    if (leading && timer === null && !leadingFired) {
      leadingFired = true;
      slot(...args);
    }
    clearTimer();
    timer = setTimeout(() => {
      timer = null;
      leadingFired = false;
      if (trailing && lastArgs !== null) {
        slot(...lastArgs);
        lastArgs = null;
      }
    }, delayMs);
  }) as T;
  connectSignal(source, handler);
  return () => {
    disconnectSignal(source, handler);
    clearTimer();
  };
}

/**
 * Connects a slot to a signal with throttle semantics: the slot fires at most
 * once per `intervalMs` milliseconds. Unlike `connectSignalAtFrameRate`, this
 * preserves the original signal args (payload-preserving throttle). Returns a
 * cleanup function.
 *
 * `leading: true` (default) fires immediately on the first invocation; the
 * trailing call fires after the interval if additional invocations occurred
 * during the cooldown.
 *
 * Uses `Date.now()` as the clock — suitable for UI/interaction signals.
 */
export function connectSignalThrottled<T extends (...args: any[]) => void>(
  source: Signal<T>,
  intervalMs: number,
  slot: T,
  options?: Readonly<SignalThrottleOptions>,
): () => void {
  const leading = options?.leading ?? true;
  const trailing = options?.trailing ?? true;
  let lastFiredAt = -Infinity;
  let trailingTimer: ReturnType<typeof setTimeout> | null = null;
  let lastArgs: any[] | null = null;
  const clearTrailing = () => {
    if (trailingTimer !== null) {
      clearTimeout(trailingTimer);
      trailingTimer = null;
    }
  };
  const handler = ((...args: any[]) => {
    const now = Date.now();
    const remaining = intervalMs - (now - lastFiredAt);
    if (remaining <= 0 || remaining > intervalMs) {
      clearTrailing();
      lastFiredAt = now;
      if (leading) {
        slot(...args);
      } else {
        lastArgs = args;
      }
    } else if (trailing) {
      clearTrailing();
      lastArgs = args;
      trailingTimer = setTimeout(() => {
        lastFiredAt = Date.now();
        trailingTimer = null;
        if (lastArgs !== null) {
          slot(...lastArgs);
          lastArgs = null;
        }
      }, remaining);
    }
  }) as T;
  connectSignal(source, handler);
  return () => {
    disconnectSignal(source, handler);
    clearTrailing();
  };
}
