// Generated from crates/flight-easing/src/ease_quartic.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

/**
 * Ease-in-out quartic: slow start and end.
 */
export function easeInOutQuartic(t: number): number {
  if (t < 0.5) {
    return 8.0 * t * t * t * t;
  }
  return 1.0 - Math.pow(-2.0 * t + 2.0, 4) / 2.0;
}

/**
 * Ease-in quartic: slow start, accelerating.
 */
export function easeInQuartic(t: number): number {
  return t * t * t * t;
}

/**
 * Ease-out quartic: fast start, decelerating.
 */
export function easeOutQuartic(t: number): number {
  return 1.0 - Math.pow(1.0 - t, 4);
}
