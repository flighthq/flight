import { emitSignal } from '@flighthq/signals';
import type { Clock } from '@flighthq/types';

// Advances a clock tree by one step. `deltaSeconds` is the real elapsed seconds for a root clock (the
// value the frame loop supplies); the cascade feeds each child its parent's already-scaled delta. Each
// clock's scaled delta is `paused ? 0 : deltaSeconds * scale`; that becomes its deltaTime, accumulates
// into elapsed, emits its (opt-in) onTick, and drives its children — so scale and pause compose down the
// whole subtree in one pass. Pre-order: a clock's onTick fires before its children advance. Call once per
// frame on the root: advanceClock(root, dtSeconds).
export function advanceClock(clock: Clock, deltaSeconds: number): void {
  const scaledDelta = clock.paused ? 0 : deltaSeconds * clock.scale;
  clock.deltaTime = scaledDelta;
  clock.elapsed += scaledDelta;
  if (clock.onTick !== null) emitSignal(clock.onTick, scaledDelta);
  const children = clock.children;
  for (let i = 0; i < children.length; i++) {
    advanceClock(children[i], scaledDelta);
  }
}
