// Generated from crates/flight-easing/src/easing_types.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

/**
 * A scalar easing function over the normalized unit interval.
 */
export type EasingFunction = (t: number) => number;

/**
 * A scalar remapping function over an arbitrary input domain.
 */
export type ScalarRemap = (x: number) => number;
