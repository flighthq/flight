// Generated from crates/flight-easing/src/ease_sine.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

const PI = Math.PI;

/**
 * Ease-in-out sine: sinusoidal acceleration and deceleration.
 */
export function easeInOutSine(t: number): number {
  return -(Math.cos(PI * t) - 1.0) / 2.0;
}

/**
 * Ease-in sine: sinusoidal slow start.
 */
export function easeInSine(t: number): number {
  return 1.0 - Math.cos((t * PI) / 2.0);
}

/**
 * Ease-out sine: sinusoidal fast start.
 */
export function easeOutSine(t: number): number {
  return Math.sin((t * PI) / 2.0);
}
