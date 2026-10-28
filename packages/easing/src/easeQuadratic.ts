// Generated from crates/flight-easing/src/ease_quadratic.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

/**
 * Ease-in-out quadratic: slow start and end.
 */
export function easeInOutQuadratic(t: number): number {
  if (t < 0.5) {
    return 2.0 * t * t;
  }
  return 1.0 - Math.pow(-2.0 * t + 2.0, 2) / 2.0;
}

/**
 * Ease-in quadratic: slow start, accelerating.
 */
export function easeInQuadratic(t: number): number {
  return t * t;
}

/**
 * Ease-out quadratic: fast start, decelerating.
 */
export function easeOutQuadratic(t: number): number {
  return t * (2.0 - t);
}
