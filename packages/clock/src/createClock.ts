import type { Clock, ClockOptions } from '@flighthq/types';

import { addClockChild } from './addClockChild';

// Allocates a child clock and attaches it to `parent` in one step. Equivalent to createClock followed by
// addClockChild; the child inherits `parent`'s scale and pause state through the advanceClock cascade.
export function createChildClock(parent: Clock, options?: Readonly<ClockOptions>): Clock {
  const child = createClock(options);
  addClockChild(parent, child);
  return child;
}

// Allocates a root clock (no parent). Defaults to realtime and running; pass options to start scaled or
// paused. Drive it each frame with advanceClock(clock, dtSeconds).
export function createClock(options?: Readonly<ClockOptions>): Clock {
  return {
    scale: options?.scale ?? 1,
    paused: options?.paused ?? false,
    deltaTime: 0,
    elapsed: 0,
    parent: null,
    children: [],
    onTick: null,
  };
}
