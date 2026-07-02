/* eslint-disable @typescript-eslint/no-explicit-any */

import { emitSignal } from '@flighthq/signals';
import type { Tween } from '@flighthq/types';

import { initializeTween } from './internal';

/**
 * Return the normalized playback progress of a tween in the range 0..1.
 * Returns 0 if the tween is still in its delay phase; returns 1 when complete.
 * Does not account for repeat; each cycle starts at 0 and ends at 1.
 */
export function getTweenProgress(tween: Tween<any>): number {
  if (tween.complete) return 1;
  const activeElapsed = tween.elapsed - tween.delay;
  if (activeElapsed <= 0) return 0;
  return Math.min(activeElapsed / tween.duration, 1);
}

/**
 * Drop all captured start values so the next update re-captures them from the current
 * target state. Equivalent to GSAP `invalidate()`. Resets elapsed and complete state.
 */
export function invalidateTween(tween: Tween<any>): void {
  tween.initialized = false;
  tween.complete = false;
  tween.elapsed = 0;
}

/**
 * Rewind and replay a tween from the beginning. Re-initializes start values from the
 * current target state. Optionally keeps the initial delay.
 */
export function restartTween(tween: Tween<any>, includeDelay = true): void {
  tween.initialized = false;
  tween.complete = false;
  tween.elapsed = includeDelay ? 0 : tween.delay;
}

// Seeking to the exact end (delay + duration) marks the tween complete and
// fires onComplete. Seeking to any earlier time does not.
/**
 * Jump the tween to an absolute elapsed time and immediately apply the resulting
 * property values to the target. The time is measured from the start of the tween
 * (before any delay). Clamps to 0..delay+duration.
 *
 * This is alias-safe: all input values are read before any writes occur.
 */
export function seekTween(tween: Tween<any>, timeSeconds: number): void {
  if (!tween.initialized) initializeTween(tween);
  // Clamp to valid range
  const maxElapsed = tween.delay + tween.duration;
  const clampedElapsed = Math.max(0, Math.min(timeSeconds, maxElapsed));
  tween.elapsed = clampedElapsed;
  const activeElapsed = clampedElapsed - tween.delay;
  if (activeElapsed <= 0) return;
  const t = Math.min(activeElapsed / tween.duration, 1);
  const effectiveT = tween.reverse ? 1 - t : t;
  const easedT = tween.ease(effectiveT);
  // Read all start/change values before writing
  const writes: { key: string; value: number }[] = [];
  for (const detail of tween.properties) {
    let value = detail.start + detail.change * easedT;
    if (tween.snapping) value = Math.round(value);
    writes.push({ key: detail.key, value });
  }
  const target = tween.target as Record<string, number>;
  for (const { key, value } of writes) {
    target[key] = value;
  }
  emitSignal(tween.onUpdate);
  if (t >= 1 && !tween.complete) {
    tween.complete = true;
    emitSignal(tween.onComplete);
  }
}

// Setting progress to exactly 1 marks the tween complete and fires onComplete.
/**
 * Set the normalized progress of a tween to a value in 0..1 and immediately apply
 * the resulting property values to the target. Safe to call before the delay has elapsed.
 *
 * This is alias-safe: all input values are read before any writes occur.
 */
export function setTweenProgress(tween: Tween<any>, progress: number): void {
  const clamped = Math.max(0, Math.min(progress, 1));
  const targetElapsed = tween.delay + clamped * tween.duration;
  seekTween(tween, targetElapsed);
}
