// Generated from crates/flight-easing/src/ease_cubic_bezier.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import type { EasingFunction } from './easingTypes.ts';

/**
 * Returns an easing function for the CSS cubic-bezier curve whose control
 * points are P1=(x1,y1) and P2=(x2,y2); the endpoints are fixed at (0,0) and
 * (1,1). The returned function maps an input progress `t` (interpreted as the
 * curve's x) to the curve's y.
 */
export function easeCubicBezier(x1: number, y1: number, x2: number, y2: number): EasingFunction {
  const cx = 3.0 * x1;
  const bx = 3.0 * (x2 - x1) - cx;
  const ax = 1.0 - cx - bx;
  const cy = 3.0 * y1;
  const by = 3.0 * (y2 - y1) - cy;
  const ay = 1.0 - cy - by;
  return (t: number): number => {
    if (t <= 0.0) {
      return 0.0;
    }
    if (t >= 1.0) {
      return 1.0;
    }
    return sampleY(ay, by, cy, solveParameterForX(ax, bx, cx, t, 1e-7));
  };
}

function sampleDerivativeX(ax: number, bx: number, cx: number, s: number): number {
  return (3.0 * ax * s + 2.0 * bx) * s + cx;
}

function sampleX(ax: number, bx: number, cx: number, s: number): number {
  return ((ax * s + bx) * s + cx) * s;
}

function sampleY(ay: number, by: number, cy: number, s: number): number {
  return ((ay * s + by) * s + cy) * s;
}

function solveParameterForX(ax: number, bx: number, cx: number, x: number, epsilon: number): number {
  let s = x;
  for (let _ = 0; _ < 8; _ += 1) {
    const xError = sampleX(ax, bx, cx, s) - x;
    if (Math.abs(xError) < epsilon) {
      return s;
    }
    const derivative = sampleDerivativeX(ax, bx, cx, s);
    if (Math.abs(derivative) < 1e-6) {
      break;
    }
    s -= xError / derivative;
  }
  let low = 0.0;
  let high = 1.0;
  s = x;
  if (s < low) {
    return low;
  }
  if (s > high) {
    return high;
  }
  while (low < high) {
    const sampled = sampleX(ax, bx, cx, s);
    if (Math.abs(sampled - x) < epsilon) {
      return s;
    }
    if (x > sampled) {
      low = s;
    } else {
      high = s;
    }
    s = (high - low) * 0.5 + low;
  }
  return s;
}
