// Generated from crates/flight-easing/src/ease_back.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

const S: number = 1.70158;

const S2: number = 1.70158 * 1.525;

/**
 * Ease-in with overshoot: starts by pulling back before accelerating forward.
 */
export function easeInBack(t: number): number {
  return t * t * ((S + 1.0) * t - S);
}

/**
 * Ease-in-out with overshoot at both ends.
 */
export function easeInOutBack(t: number): number {
  let t2 = t * 2.0;
  if (t2 < 1.0) {
    return 0.5 * (t2 * t2 * ((S2 + 1.0) * t2 - S2));
  }
  t2 = t2 - 2.0;
  return 0.5 * (t2 * t2 * ((S2 + 1.0) * t2 + S2) + 2.0);
}

/**
 * Ease-out with overshoot: decelerates past the target before settling back.
 */
export function easeOutBack(t: number): number {
  t = t - 1.0;
  return t * t * ((S + 1.0) * t + S) + 1.0;
}
