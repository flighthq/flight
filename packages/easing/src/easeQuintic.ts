// Generated from crates/flight-easing/src/ease_quintic.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

/**
 * Ease-in-out quintic: slow start and end.
 */
export function easeInOutQuintic(t: number): number {
  if (t < 0.5) {
    return 16.0 * t * t * t * t * t;
  }
  return 1.0 - Math.pow(-2.0 * t + 2.0, 5) / 2.0;
}

/**
 * Ease-in quintic: slow start, accelerating.
 */
export function easeInQuintic(t: number): number {
  return t * t * t * t * t;
}

/**
 * Ease-out quintic: fast start, decelerating.
 */
export function easeOutQuintic(t: number): number {
  return 1.0 - Math.pow(1.0 - t, 5);
}
