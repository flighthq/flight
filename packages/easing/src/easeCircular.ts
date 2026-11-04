// Generated from crates/flight-easing/src/ease_circular.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

/**
 * Ease-in circular: slow start with a circular arc.
 */
export function easeInCircular(t: number): number {
  return 1.0 - Math.sqrt(1.0 - t * t);
}

/**
 * Ease-in-out circular: circular arc at both ends.
 */
export function easeInOutCircular(t: number): number {
  if (t < 0.5) {
    return (1.0 - Math.sqrt(1.0 - 4.0 * t * t)) / 2.0;
  }
  return (Math.sqrt(1.0 - Math.pow(-2.0 * t + 2.0, 2)) + 1.0) / 2.0;
}

/**
 * Ease-out circular: fast start with a circular arc.
 */
export function easeOutCircular(t: number): number {
  return Math.sqrt(1.0 - (t - 1.0) * (t - 1.0));
}
