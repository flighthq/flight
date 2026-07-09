import type { Clock } from '@flighthq/types';

// Pauses the clock: it and its whole subtree receive a zero delta on subsequent advances, so elapsed
// freezes until resumed. Local state — a child paused this way stays paused even if its parent resumes.
export function pauseClock(clock: Clock): void {
  clock.paused = true;
}

// Resumes a locally-paused clock. The clock still receives a zero delta while any ancestor remains
// paused (see isClockEffectivelyPaused).
export function resumeClock(clock: Clock): void {
  clock.paused = false;
}
