import { TAU } from '@flighthq/math';
import type { SpringConfig } from '@flighthq/types';

// Allocate a `SpringConfig` from the designer-intuitive `frequency` (Hz) and `dampingRatio`
// (0 undamped, <1 underdamped/overshoots, 1 critical/fastest-no-overshoot, >1 overdamped). This is
// the primary constructor; use `createSpringConfigFromPhysical` when starting from raw physics.
export function createSpringConfig(frequency: number, dampingRatio: number): SpringConfig {
  return { dampingRatio, frequency };
}

// Allocate a `SpringConfig` from a physical spring: `stiffness` (k), `damping` (c), and `mass` (m).
// Converts to the mass-independent form via `frequency = sqrt(k / m) / (2 * PI)` and
// `dampingRatio = c / (2 * sqrt(k * m))`, the standard undamped-natural-frequency and
// damping-ratio identities. Expects positive `stiffness` and `mass`.
export function createSpringConfigFromPhysical(stiffness: number, damping: number, mass: number): SpringConfig {
  return {
    dampingRatio: damping / (2 * Math.sqrt(stiffness * mass)),
    frequency: Math.sqrt(stiffness / mass) / TAU,
  };
}
