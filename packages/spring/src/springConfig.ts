import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import { TAU } from '@flighthq/math/contract';
import type { SpringConfig } from '@flighthq/types/contract';

// Frozen plain-data presets: spread one into a mutable object to customize it without changing the
// shared profile. Bouncy is quick and underdamped for visible overshoot.
export const SpringPresetBouncy: Readonly<SpringConfig> = Object.freeze(
  (() => {
    const out = allocateEntity<SpringConfig>();
    out.dampingRatio = 0.35;
    out.frequency = 2;
    return finishEntity(out);
  })(),
);

// A slower, well-damped profile for soft UI movement with only a restrained overshoot.
export const SpringPresetGentle: Readonly<SpringConfig> = Object.freeze(
  (() => {
    const out = allocateEntity<SpringConfig>();
    out.dampingRatio = 0.8;
    out.frequency = 1.5;
    return finishEntity(out);
  })(),
);

// A high-frequency critical profile for a fast response without overshoot.
export const SpringPresetStiff: Readonly<SpringConfig> = Object.freeze(
  (() => {
    const out = allocateEntity<SpringConfig>();
    out.dampingRatio = 1;
    out.frequency = 4;
    return finishEntity(out);
  })(),
);

// Allocate a `SpringConfig` from the designer-intuitive `frequency` (Hz) and `dampingRatio`
// (0 undamped, <1 underdamped/overshoots, 1 critical/fastest-no-overshoot, >1 overdamped). This is
// the primary constructor; use `createSpringConfigFromPhysical` when starting from raw physics.
export function createSpringConfig(frequency: number, dampingRatio: number): SpringConfig {
  const out = allocateEntity<SpringConfig>();
  out.dampingRatio = dampingRatio;
  out.frequency = frequency;
  return finishEntity(out);
}

// Allocate a `SpringConfig` from a physical spring: `stiffness` (k), `damping` (c), and `mass` (m).
// Converts to the mass-independent form via `frequency = sqrt(k / m) / (2 * PI)` and
// `dampingRatio = c / (2 * sqrt(k * m))`, the standard undamped-natural-frequency and
// damping-ratio identities. Expects positive `stiffness` and `mass`.
export function createSpringConfigFromPhysical(stiffness: number, damping: number, mass: number): SpringConfig {
  const out = allocateEntity<SpringConfig>();
  out.dampingRatio = damping / (2 * Math.sqrt(stiffness * mass));
  out.frequency = Math.sqrt(stiffness / mass) / TAU;
  return finishEntity(out);
}
