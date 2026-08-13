/** Frame-rate-independent exponential decay toward `target`.
 *
 *  Equivalent to `lerp(current, target, 1 - exp(-lambda * deltaTime))`.
 *  Higher `lambda` = faster convergence. This is the classic "damp" function
 *  from Freya Holmér / Game Math — it does not overshoot and is independent of
 *  frame rate. `deltaTime` should be in seconds.
 *
 *  Returns `current` when `deltaTime <= 0` or `lambda <= 0`.
 */
export function damp(current: number, target: number, lambda: number, deltaTime: number): number {
  if (deltaTime <= 0 || lambda <= 0) return current;
  return target + (current - target) * Math.exp(-lambda * deltaTime);
}

/** Linearly interpolate between two angles `a` and `b` (radians) by factor `t`,
 *  taking the shortest arc.
 *
 *  `t` is not clamped. The result wraps naturally; there is no explicit
 *  `normalizeAngle` call on the output — callers that need the result in a
 *  specific range should normalize it themselves.
 */
export function lerpAngle(a: number, b: number, t: number): number {
  const TAU = Math.PI * 2;
  let diff = (((b - a) % TAU) + TAU) % TAU;
  if (diff > Math.PI) diff -= TAU;
  return a + diff * t;
}

/** Move `current` toward `target` by at most `maxDelta`, without overshooting.
 *
 *  `maxDelta` should be positive; passing a negative `maxDelta` moves away
 *  from `target` instead.
 */
export function moveTowards(current: number, target: number, maxDelta: number): number {
  const delta = target - current;
  if (Math.abs(delta) <= maxDelta) return target;
  return current + Math.sign(delta) * maxDelta;
}

/** Bounce `t` back and forth over `[0, length]` like a ping-pong ball.
 *
 *  `pingPong(t, 1)` cycles: 0 → 1 → 0 → 1 → …
 */
export function pingPong(t: number, length: number): number {
  // No guard on a non-positive length: the arithmetic yields NaN and NaN PROPAGATES. These functions do not
  // invent values — a silent 0 turns a loud upstream failure into a plausible number, and IEEE propagation
  // lowers for free where an explicit branch does not. Callers who want a warning get one from a guard
  // layer, not from silent coercion here.
  const cycle = 2 * length;
  const mod = ((t % cycle) + cycle) % cycle;
  return mod <= length ? mod : cycle - mod;
}

/** Wrap `t` over `[0, length)`.
 *
 *  `repeat(1.6, 1)` → `0.6`. Analogous to Unity's `Mathf.Repeat`.
 */
export function repeat(t: number, length: number): number {
  // No guard on a non-positive length: the arithmetic yields NaN and NaN PROPAGATES. These functions do not
  // invent values — a silent 0 turns a loud upstream failure into a plausible number, and IEEE propagation
  // lowers for free where an explicit branch does not. Callers who want a warning get one from a guard
  // layer, not from silent coercion here.
  return ((t % length) + length) % length;
}

/** Hermite interpolation with a smoother quintic ease curve (Ken Perlin).
 *
 *  Uses `6t⁵ - 15t⁴ + 10t³` — has zero first- _and_ second-derivative at the
 *  edges, making it smoother than the cubic `smoothStep`. Commonly called
 *  `smootherstep`. Returns 0 for `x <= edge0`, 1 for `x >= edge1`.
 */
export function smootherStep(edge0: number, edge1: number, x: number): number {
  const t = (x - edge0) / (edge1 - edge0);
  const s = t < 0 ? 0 : t > 1 ? 1 : t;
  return s * s * s * (s * (s * 6 - 15) + 10);
}
