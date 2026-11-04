// Generated from crates/flight-math/src/constants.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

/**
 * Control-point distance, as a fraction of the radius, for approximating a quarter circle with one
 * cubic Bezier: `4 * (sqrt(2) - 1) / 3`.
 */
export const CIRCLE_KAPPA: number = 0.5522848;

/**
 * Default absolute tolerance for approximate floating-point comparisons.
 */
export const EPSILON: number = 1e-6;

/**
 * Full circle in radians (2pi).
 */
export const TAU: number = Math.PI * 2.0;

/**
 * Half of pi (pi / 2).
 */
export const HALF_PI: number = Math.PI / 2.0;

/**
 * Multiply degrees by this constant to get radians.
 */
export const DEG_TO_RAD: number = Math.PI / 180.0;

/**
 * Multiply radians by this constant to get degrees.
 */
export const RAD_TO_DEG: number = 180.0 / Math.PI;
