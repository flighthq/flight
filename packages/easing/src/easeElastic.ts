// Generated from crates/flight-easing/src/ease_elastic.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

const P: number = 0.4;

const P2: number = 0.45;

const S: number = P / 4;

const S2: number = P2 / 4;

/**
 * Ease-in elastic: oscillates below zero before reaching the target.
 */
export function easeInElastic(t: number): number {
  if (t === 0 || t === 1) {
    return t;
  }
  const time = t - 1;
  return -(Math.pow(2, 10 * time) * Math.sin(((time - S) * (2 * Math.PI)) / P));
}

/**
 * Ease-in-out elastic: oscillates at both ends.
 */
export function easeInOutElastic(t: number): number {
  if (t === 0 || t === 1) {
    return t;
  }
  let t2 = t * 2;
  if (t2 < 1) {
    const t2_1 = t2 - 1;
    return -0.5 * (Math.pow(2, 10 * t2_1) * Math.sin(((t2_1 - S2) * (2 * Math.PI)) / P2));
  }
  t2 = t2 - 1;
  return 0.5 * Math.pow(2, -10 * t2) * Math.sin(((t2 - S2) * (2 * Math.PI)) / P2) + 1;
}

/**
 * Ease-out elastic: overshoots past 1 and oscillates back.
 */
export function easeOutElastic(t: number): number {
  if (t === 0 || t === 1) {
    return t;
  }
  return Math.pow(2, -10 * t) * Math.sin(((t - S) * (2 * Math.PI)) / P) + 1;
}
