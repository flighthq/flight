import { createEntity } from '@flighthq/entity/contract';
import { TAU } from '@flighthq/math/contract';
import type { SpringConfig } from '@flighthq/types/contract';

// Frozen plain-data presets: spread one into a mutable object to customize it without changing the
// shared profile. Bouncy is quick and underdamped for visible overshoot.
export const SpringPresetBouncy: Readonly<SpringConfig> = Object.freeze(
  createEntity({ dampingRatio: 0.35, frequency: 2 }),
);

// A slower, well-damped profile for soft UI movement with only a restrained overshoot.
export const SpringPresetGentle: Readonly<SpringConfig> = Object.freeze(
  createEntity({ dampingRatio: 0.8, frequency: 1.5 }),
);

// A high-frequency critical profile for a fast response without overshoot.
export const SpringPresetStiff: Readonly<SpringConfig> = Object.freeze(createEntity({ dampingRatio: 1, frequency: 4 }));

// Allocate a `SpringConfig` from the designer-intuitive `frequency` (Hz) and `dampingRatio`
// (0 undamped, <1 underdamped/overshoots, 1 critical/fastest-no-overshoot, >1 overdamped). This is
// the primary constructor; use `createSpringConfigFromPhysical` when starting from raw physics.
export function createSpringConfig(frequency: number, dampingRatio: number): SpringConfig {
  return createEntity({ dampingRatio, frequency });
}

// Allocate a `SpringConfig` from a physical spring: `stiffness` (k), `damping` (c), and `mass` (m).
// Converts to the mass-independent form via `frequency = sqrt(k / m) / (2 * PI)` and
// `dampingRatio = c / (2 * sqrt(k * m))`, the standard undamped-natural-frequency and
// damping-ratio identities. Expects positive `stiffness` and `mass`.
export function createSpringConfigFromPhysical(stiffness: number, damping: number, mass: number): SpringConfig {
  return createEntity({
    dampingRatio: damping / (2 * Math.sqrt(stiffness * mass)),
    frequency: Math.sqrt(stiffness / mass) / TAU,
  });
}
