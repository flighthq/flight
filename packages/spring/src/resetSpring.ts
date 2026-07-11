import type { Spring } from '@flighthq/types';

// Snap `spring` to `value` with `velocity` (default 0), discarding its current motion. Use this to
// teleport a spring to a new state — e.g. initializing it at a target, or cutting a running spring
// dead. Unlike `updateSpring`, this applies no dynamics; the spring simply becomes what is passed.
export function resetSpring(spring: Spring, value: number, velocity: number = 0): void {
  spring.value = value;
  spring.velocity = velocity;
}
