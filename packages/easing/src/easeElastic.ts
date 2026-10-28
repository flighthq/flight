// Generated from crates/flight-easing/src/ease_elastic.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

const PI = Math.PI;

const P: number = 0.4;

const P2: number = 0.45;

const S: number = P / 4.0;

const S2: number = P2 / 4.0;

/**
 * Ease-in elastic: oscillates below zero before reaching the target.
 */
export function easeInElastic(t: number): number {
  if (t === 0.0 || t === 1.0) {
    return t;
  }
  const time = t - 1.0;
  return -(Math.pow(2.0, 10.0 * time) * Math.sin(((time - S) * (2.0 * PI)) / P));
}

/**
 * Ease-in-out elastic: oscillates at both ends.
 */
export function easeInOutElastic(t: number): number {
  if (t === 0.0 || t === 1.0) {
    return t;
  }
  let t2 = t * 2.0;
  if (t2 < 1.0) {
    t2 = t2 - 1.0;
    return -0.5 * (Math.pow(2.0, 10.0 * t2) * Math.sin(((t2 - S2) * (2.0 * PI)) / P2));
  }
  t2 = t2 - 1.0;
  return 0.5 * Math.pow(2.0, -10.0 * t2) * Math.sin(((t2 - S2) * (2.0 * PI)) / P2) + 1.0;
}

/**
 * Ease-out elastic: overshoots past 1 and oscillates back.
 */
export function easeOutElastic(t: number): number {
  if (t === 0.0 || t === 1.0) {
    return t;
  }
  return Math.pow(2.0, -10.0 * t) * Math.sin(((t - S) * (2.0 * PI)) / P) + 1.0;
}
