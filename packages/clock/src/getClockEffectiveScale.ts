import type { Clock } from '@flighthq/types';

// The clock's realtime rate accounting for the hierarchy: the product of its own scale and every
// ancestor's scale. A root clock's effective scale is just its own. This is what `deltaTime` divided by
// the loop's real delta would equal (when nothing in the chain is paused).
export function getClockEffectiveScale(clock: Readonly<Clock>): number {
  let scale = clock.scale;
  let current: Readonly<Clock> | null = clock.parent;
  while (current !== null) {
    scale *= current.scale;
    current = current.parent;
  }
  return scale;
}
