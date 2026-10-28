// Generated from crates/flight-easing/src/ease_bounce.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

function bounceOut(t: number): number {
  if (t < 1.0 / 2.75) {
    return 7.5625 * t * t;
  }
  if (t < 2.0 / 2.75) {
    t = t - 1.5 / 2.75;
    return 7.5625 * t * t + 0.75;
  }
  if (t < 2.5 / 2.75) {
    t = t - 2.25 / 2.75;
    return 7.5625 * t * t + 0.9375;
  }
  t = t - 2.625 / 2.75;
  return 7.5625 * t * t + 0.984375;
}

/**
 * Ease-in bounce: slow bouncing start.
 */
export function easeInBounce(t: number): number {
  return 1.0 - bounceOut(1.0 - t);
}

/**
 * Ease-in-out bounce: bounces at both ends.
 */
export function easeInOutBounce(t: number): number {
  if (t < 0.5) {
    return (1.0 - bounceOut(1.0 - 2.0 * t)) / 2.0;
  }
  return (1.0 + bounceOut(2.0 * t - 1.0)) / 2.0;
}

/**
 * Ease-out bounce: decelerating bounces toward the target.
 */
export function easeOutBounce(t: number): number {
  return bounceOut(t);
}
