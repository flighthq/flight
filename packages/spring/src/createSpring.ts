import type { Spring } from '@flighthq/types';

// Allocate a scalar spring at `value` (default 0) with `velocity` (default 0). This is the only
// allocating function for scalar springs; `updateSpring`, `resetSpring`, and the settle query all
// write into or read an existing spring.
export function createSpring(value: number = 0, velocity: number = 0): Spring {
  return { value, velocity };
}
