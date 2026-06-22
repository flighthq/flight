import type { EasingFunction } from '@flighthq/types';

// Returns an easing function for the CSS cubic-bézier curve whose control
// points are P1=(x1,y1) and P2=(x2,y2); the endpoints are fixed at (0,0) and
// (1,1). The returned function maps an input progress `t` (interpreted as the
// curve's x) to the curve's y. This is the canonical WebKit `UnitBezier`
// solver: a forward x->y evaluation that first inverts x->parameter via
// Newton-Raphson, falling back to bisection when the derivative is too small.
export function easeCubicBezier(x1: number, y1: number, x2: number, y2: number): EasingFunction {
  // Polynomial coefficients of the bézier in each axis, derived from the
  // control points with the endpoints fixed at 0 and 1.
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;

  const sampleX = (s: number): number => ((ax * s + bx) * s + cx) * s;
  const sampleY = (s: number): number => ((ay * s + by) * s + cy) * s;
  const sampleDerivativeX = (s: number): number => (3 * ax * s + 2 * bx) * s + cx;

  const solveParameterForX = (x: number, epsilon: number): number => {
    let s = x;
    // Newton-Raphson: fast when the slope is well-behaved.
    for (let i = 0; i < 8; i++) {
      const xError = sampleX(s) - x;
      if (Math.abs(xError) < epsilon) {
        return s;
      }
      const derivative = sampleDerivativeX(s);
      if (Math.abs(derivative) < 1e-6) {
        break;
      }
      s -= xError / derivative;
    }
    // Bisection fallback over the guaranteed-bracketing [0,1] interval.
    let low = 0;
    let high = 1;
    s = x;
    if (s < low) {
      return low;
    }
    if (s > high) {
      return high;
    }
    while (low < high) {
      const sampled = sampleX(s);
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
  };

  return (t) => {
    if (t <= 0) {
      return 0;
    }
    if (t >= 1) {
      return 1;
    }
    return sampleY(solveParameterForX(t, 1e-7));
  };
}
