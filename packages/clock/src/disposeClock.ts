import { clearSignal } from '@flighthq/signals';
import type { Clock } from '@flighthq/types';

import { removeClockChild } from './addClockChild';

// Detaches a clock from its parent, releases its children, and drops any onTick listeners so nothing
// keeps the subtree — or the clock's subscribers — reachable through it: the parent no longer references
// this clock, each child becomes a root, and the onTick slot list is cleared. The clock is then plain
// GC-managed memory (there is no GPU or native resource to free — that would be destroy*).
export function disposeClock(clock: Clock): void {
  if (clock.parent !== null) removeClockChild(clock.parent, clock);
  const children = clock.children;
  for (let i = 0; i < children.length; i++) {
    children[i].parent = null;
  }
  children.length = 0;
  if (clock.onTick !== null) clearSignal(clock.onTick);
}
