/**
 * Control-point distance, as a fraction of the radius, for approximating a quarter circle with one
 * cubic Bezier: `4 * (sqrt(2) - 1) / 3`.
 *
 * Named for the circle that defines it rather than the arcs that use it. It is computed rather than
 * written out because a transcribed decimal is a second copy of a number nothing recomputes — the
 * digits are long enough that a wrong one reads as correct and draws a circle that still looks round.
 */
export const CIRCLE_KAPPA = (4 * (Math.SQRT2 - 1)) / 3;

/** Smallest positive number distinguishable from zero in floating-point comparisons. */
export const EPSILON = 1e-6;

/** Full circle in radians (2π). Prefer `TAU` over `2 * Math.PI` for clarity. */
export const TAU = Math.PI * 2;

/** Half of π (π / 2). */
export const HALF_PI = Math.PI / 2;

/** Multiply degrees by this constant to get radians. */
export const DEG_TO_RAD = Math.PI / 180;

/** Multiply radians by this constant to get degrees. */
export const RAD_TO_DEG = 180 / Math.PI;
