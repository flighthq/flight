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
