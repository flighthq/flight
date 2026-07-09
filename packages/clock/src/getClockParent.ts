import type { Clock } from '@flighthq/types';

// The clock's parent, or null if it is a root. Convenience accessor for the `parent` field; hierarchy is
// changed through addClockChild / removeClockChild, not by assigning this.
export function getClockParent(clock: Readonly<Clock>): Clock | null {
  return clock.parent;
}
