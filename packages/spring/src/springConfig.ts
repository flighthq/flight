// Generated from crates/flight-spring/src/spring_config.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

/**
 * A spring configuration defined by frequency and damping ratio.
 *
 * - `dampingRatio`: 0 = undamped, <1 = underdamped (overshoots), 1 = critically damped
 * (fastest no-overshoot), >1 = overdamped
 * - `frequency`: oscillation frequency in Hz (cycles per second)
 */
export interface SpringConfig {
  dampingRatio: number;
  frequency: number;
}

/**
 * Frozen plain-data preset: quick and underdamped for visible overshoot.
 */
export const SpringPresetBouncy: Readonly<SpringConfig> = Object.freeze({ dampingRatio: 0.35, frequency: 2 });

/**
 * A slower, well-damped profile for soft UI movement with only a restrained overshoot.
 */
export const SpringPresetGentle: Readonly<SpringConfig> = Object.freeze({ dampingRatio: 0.8, frequency: 1.5 });

/**
 * A high-frequency critical profile for a fast response without overshoot.
 */
export const SpringPresetStiff: Readonly<SpringConfig> = Object.freeze({ dampingRatio: 1, frequency: 4 });

/**
 * Builds a `SpringConfig` from the designer-intuitive `frequency` (Hz) and `dampingRatio`
 * (0 undamped, <1 underdamped/overshoots, 1 critical/fastest-no-overshoot, >1 overdamped). This is
 * the primary constructor; use `createSpringConfigFromPhysical` when starting from raw physics.
 */
export function createSpringConfig(frequency: number, dampingRatio: number): SpringConfig {
  let out = { dampingRatio: 0, frequency: 0 };
  initializeSpringConfig(out, frequency, dampingRatio);
  return out;
}

/**
 * Builds a `SpringConfig` from a physical spring: `stiffness` (k), `damping` (c), and `mass` (m).
 * Converts to the mass-independent form via `frequency = sqrt(k / m) / TAU` and
 * `dampingRatio = c / (2 * sqrt(k * m))`, the standard undamped-natural-frequency and
 * damping-ratio identities. Expects positive `stiffness` and `mass`.
 */
export function createSpringConfigFromPhysical(stiffness: number, damping: number, mass: number): SpringConfig {
  const frequency = Math.sqrt(stiffness / mass) / (Math.PI * 2);
  const dampingRatio = damping / (2 * Math.sqrt(stiffness * mass));
  return createSpringConfig(frequency, dampingRatio);
}

/**
 * The construction initializer of `createSpringConfig`: writes `frequency` (Hz) and
 * `dampingRatio` into a pre-allocated `SpringConfig`.
 */
export function initializeSpringConfig(out: SpringConfig, frequency: number, dampingRatio: number): void {
  out.dampingRatio = dampingRatio;
  out.frequency = frequency;
}
