import type { Clock } from '@flighthq/types';

// Whether this clock receives a zero delta on the next advance: true if the clock itself or any ancestor
// is paused. A clock can be locally running yet effectively paused because a parent is paused.
export function isClockEffectivelyPaused(clock: Readonly<Clock>): boolean {
  let current: Readonly<Clock> | null = clock;
  while (current !== null) {
    if (current.paused) return true;
    current = current.parent;
  }
  return false;
}
