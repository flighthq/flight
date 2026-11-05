// Generated from crates/flight-easing/src/ease_circular.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

/**
 * Ease-in circular: slow start with a circular arc.
 */
export function easeInCircular(t: number): number {
  return 1 - Math.sqrt(1 - t * t);
}

/**
 * Ease-in-out circular: circular arc at both ends.
 */
export function easeInOutCircular(t: number): number {
  if (t < 0.5) {
    return (1 - Math.sqrt(1 - 4 * t * t)) / 2;
  }
  return (Math.sqrt(1 - Math.pow(-2 * t + 2, 2)) + 1) / 2;
}

/**
 * Ease-out circular: fast start with a circular arc.
 */
export function easeOutCircular(t: number): number {
  return Math.sqrt(1 - (t - 1) * (t - 1));
}
