import type { Clock } from '@flighthq/types';

// Sets the clock's local time scale (1 = realtime, 0.5 = half speed, 2 = double, 0 = frozen without the
// paused flag). Composes with ancestors on the next advance — see getClockEffectiveScale.
export function setClockScale(clock: Clock, scale: number): void {
  clock.scale = scale;
}
