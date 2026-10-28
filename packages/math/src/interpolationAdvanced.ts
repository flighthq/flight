// Generated from crates/flight-math/src/interpolation_advanced.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

/**
 * Frame-rate-independent exponential decay toward `target`.
 *
 * Equivalent to `lerp(current, target, 1 - exp(-lambda * deltaTime))`.
 * Higher `lambda` = faster convergence. `deltaTime` should be in seconds.
 *
 * Returns `current` when `deltaTime <= 0` or `lambda <= 0`.
 */
export function damp(current: number, target: number, lambda: number, deltaTime: number): number {
  if (deltaTime <= 0.0 || lambda <= 0.0) {
    return current;
  }
  return target + (current - target) * Math.exp(-lambda * deltaTime);
}

/**
 * Linearly interpolate between two angles `a` and `b` (radians) by factor `t`,
 * taking the shortest arc.
 *
 * `t` is not clamped. The result wraps naturally; there is no explicit
 * normalize call on the output.
 */
export function lerpAngle(a: number, b: number, t: number): number {
  const tau = Math.PI * 2.0;
  let diff = (((b - a) % tau) + tau) % tau;
  if (diff > Math.PI) {
    diff -= tau;
  }
  return a + diff * t;
}

/**
 * Move `current` toward `target` by at most `maxDelta`, without overshooting.
 *
 * `maxDelta` should be positive; passing a negative `maxDelta` moves away
 * from `target` instead.
 */
export function moveTowards(current: number, target: number, maxDelta: number): number {
  const delta = target - current;
  if (Math.abs(delta) <= maxDelta) {
    return target;
  }
  return current + Math.sign(delta) * maxDelta;
}

/**
 * Bounce `t` back and forth over `[0, length]` like a ping-pong ball.
 *
 * `pingPong(t, 1)` cycles: 0 -> 1 -> 0 -> 1 -> ...
 */
export function pingPong(t: number, length: number): number {
  const cycle = 2.0 * length;
  const modulo = ((t % cycle) + cycle) % cycle;
  return modulo <= length ? modulo : cycle - modulo;
}

/**
 * Wrap `t` over `[0, length)`.
 *
 * `repeat(1.6, 1)` -> `0.6`. Analogous to Unity's `Mathf.Repeat`.
 */
export function repeat(t: number, length: number): number {
  return ((t % length) + length) % length;
}

/**
 * Hermite interpolation with a smoother quintic ease curve (Ken Perlin).
 *
 * Uses `6t^5 - 15t^4 + 10t^3` — has zero first- and second-derivative at the
 * edges, making it smoother than the cubic `smoothStep`. Returns 0 for
 * `x <= edge0`, 1 for `x >= edge1`.
 */
export function smootherStep(edge0: number, edge1: number, x: number): number {
  const t = (x - edge0) / (edge1 - edge0);
  const s = t < 0.0 ? 0.0 : t > 1.0 ? 1.0 : t;
  return s * s * s * (s * (s * 6.0 - 15.0) + 10.0);
}
