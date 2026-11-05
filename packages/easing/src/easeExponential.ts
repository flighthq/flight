// Generated from crates/flight-easing/src/ease_exponential.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

/**
 * Ease-in exponential: very slow start, then rapid acceleration.
 */
export function easeInExponential(t: number): number {
  if (t === 0) {
    return 0;
  }
  return Math.pow(2, 10 * t - 10);
}

/**
 * Ease-in-out exponential: exponential acceleration and deceleration.
 */
export function easeInOutExponential(t: number): number {
  if (t === 0 || t === 1) {
    return t;
  }
  if (t < 0.5) {
    return Math.pow(2, 20 * t - 10) / 2;
  }
  return (2 - Math.pow(2, -20 * t + 10)) / 2;
}

/**
 * Ease-out exponential: fast start, then rapid deceleration.
 */
export function easeOutExponential(t: number): number {
  if (t === 1) {
    return 1;
  }
  return 1 - Math.pow(2, -10 * t);
}
