import type { Clock } from '@flighthq/types';

// Clears the clock's accumulated time back to the start: elapsed and deltaTime become 0. Does not touch
// scale, pause, or the hierarchy, and does not reset children (each child owns its own elapsed).
export function resetClock(clock: Clock): void {
  clock.elapsed = 0;
  clock.deltaTime = 0;
}
