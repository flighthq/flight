/**
 * Control-point distance, as a fraction of the radius, for approximating a quarter circle with one
 * cubic Bezier: `4 * (sqrt(2) - 1) / 3`.
 *
 * Named for the circle that defines it rather than the arcs that use it. Written as a literal and
 * pinned to that formula by the colocated test, which IS the recomputation a transcribed decimal
 * would otherwise lack — the digits are long enough that a wrong one reads as correct and still
 * draws a circle that looks round.
 *
 * A literal rather than the expression because `Math.SQRT2` is a property of a mutable global: no
 * correct minifier may evaluate `4 * (Math.SQRT2 - 1) / 3` at build time, so that form reaches the
 * bundle as a runtime computation of a compile-time-known number. Neither form is inlined at its
 * use sites and both measure the same gzipped size, so this buys evaluation, not bytes.
 */
export const CIRCLE_KAPPA = 0.5522847498307936;

/** Default absolute tolerance for approximate floating-point comparisons. */
export const EPSILON = 1e-6;

/** Full circle in radians (2π). Prefer `TAU` over `2 * Math.PI` for clarity. */
export const TAU = Math.PI * 2;

/** Half of π (π / 2). */
export const HALF_PI = Math.PI / 2;

/** Multiply degrees by this constant to get radians. */
export const DEG_TO_RAD = Math.PI / 180;

/** Multiply radians by this constant to get degrees. */
export const RAD_TO_DEG = 180 / Math.PI;
