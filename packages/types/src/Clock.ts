import type { Signal } from './Signal';

// The shared time primitive: a node in a clock tree that turns a real per-frame delta into scaled,
// pausable time. Driven by whoever owns the frame loop (@flighthq/application) via advanceClock on the
// root; time-driven consumers (tween, timeline, spritesheet) read deltaTime/elapsed instead of a raw
// delta. Scale and pause compose down the tree — a child's effective rate is the product of its own and
// every ancestor's scale, and any paused ancestor freezes the whole subtree. Times are in seconds.
export interface Clock {
  // Local time scale applied to the incoming delta (1 = realtime, 0.5 = half speed, 2 = double).
  scale: number;
  // When true, this clock and its whole subtree receive a zero delta while advancing (elapsed frozen).
  paused: boolean;
  // Scaled seconds from the most recent advanceClock pass — the value consumers read each frame.
  deltaTime: number;
  // Accumulated scaled seconds this clock has advanced through since creation or the last resetClock.
  elapsed: number;
  // Parent whose scaled delta feeds this clock, or null for a root clock. Set via addClockChild /
  // createChildClock / removeClockChild — do not reassign directly.
  parent: Clock | null;
  // Child clocks advanced from this clock's scaled delta. Owned here; managed via addClockChild /
  // removeClockChild — do not mutate directly.
  children: Clock[];
  // Opt-in per-advance signal carrying the scaled deltaTime; null until enableClockSignals allocates it,
  // so a bare clock pays no signal cost. Plugs directly into signals' connectSignalAtFrameRate /
  // connectSignalThrottled / connectSignalDebounced.
  onTick: Signal<(deltaTime: number) => void> | null;
}
