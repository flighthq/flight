// Generated from crates/flight-easing/src/ease_cubic.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

/**
 * Ease-in cubic: slow start, accelerating.
 */
export function easeInCubic(t: number): number {
  return t * t * t;
}

/**
 * Ease-in-out cubic: slow start and end.
 */
export function easeInOutCubic(t: number): number {
  if (t < 0.5) {
    return 4.0 * t * t * t;
  }
  return 1.0 - Math.pow(-2.0 * t + 2.0, 3) / 2.0;
}

/**
 * Ease-out cubic: fast start, decelerating.
 */
export function easeOutCubic(t: number): number {
  return 1.0 - Math.pow(1.0 - t, 3);
}
