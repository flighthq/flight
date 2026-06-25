import type { RandomSource, Vector2Like, Vector3Like } from '@flighthq/types';

/** Pick a random element from `items`, returning `undefined` for an empty array.
 *
 *  Does not mutate `items`. Deterministic: same `random` sequence → same picks.
 */
export function pick<T>(random: RandomSource, items: Readonly<T[]>): T | undefined {
  if (items.length === 0) return undefined;
  return items[Math.floor(random() * items.length)];
}

/** Return an exponentially-distributed random number with the given `rate`
 *  (λ > 0, mean = 1/λ).
 *
 *  Uses the inverse CDF method: `-ln(U) / rate` where U is uniform on (0, 1].
 *  Suitable for modeling inter-arrival times in a Poisson process, particle
 *  lifetimes, and decay events.
 *
 *  The result is always non-negative. Throws if `rate <= 0`.
 *
 *  Deterministic: same `random` sequence → same output sequence.
 */
export function randomExponential(random: RandomSource, rate: number = 1): number {
  if (rate <= 0) throw new RangeError('randomExponential: rate must be > 0');
  const u = random();
  // Avoid ln(0) — replace exactly 0 with the smallest usable positive value.
  return -Math.log(u === 0 ? Number.EPSILON : u) / rate;
}

/** Return a normally-distributed random number with the given `mean` and
 *  `standardDeviation`, using the Box–Muller transform.
 *
 *  Each call consumes two values from `random` and discards one (the simplest
 *  variant — use `randomGaussianPair` if you need both). The result can be any
 *  finite number; it is not clamped.
 *
 *  Deterministic: same `random` sequence → same output sequence.
 */
export function randomGaussian(random: RandomSource, mean: number = 0, standardDeviation: number = 1): number {
  // Box–Muller: uses two uniform samples to produce two independent standard
  // normal values. We discard the second one for simplicity.
  const u1 = random();
  const u2 = random();
  const z = Math.sqrt(-2 * Math.log(u1 === 0 ? Number.EPSILON : u1)) * Math.cos(Math.PI * 2 * u2);
  return mean + z * standardDeviation;
}

/** Return two independent normally-distributed random numbers as `[z0, z1]`
 *  sharing the same Box–Muller pair.
 *
 *  Prefer this over calling `randomGaussian` twice when both samples are
 *  needed — it consumes exactly 2 values from `random` instead of 4.
 */
export function randomGaussianPair(
  random: RandomSource,
  mean: number = 0,
  standardDeviation: number = 1,
): readonly [number, number] {
  const u1 = random();
  const u2 = random();
  const mag = Math.sqrt(-2 * Math.log(u1 === 0 ? Number.EPSILON : u1));
  const angle = Math.PI * 2 * u2;
  const z0 = mean + mag * Math.cos(angle) * standardDeviation;
  const z1 = mean + mag * Math.sin(angle) * standardDeviation;
  return [z0, z1];
}

/** Sample a uniformly-distributed point inside the unit disc (including the
 *  boundary) and write it into `out.x` / `out.y`.
 *
 *  Uses rejection sampling to avoid the over-dense centre that polar-radius
 *  sampling without a square-root correction produces.
 *
 *  The `out` parameter may be the same object as any other argument (alias-safe).
 *  No allocation.
 */
export function randomInsideUnitDisc(random: RandomSource, out: Vector2Like): void {
  // Square rejection sampling: draw from [-1, 1]² until inside the unit disc.
  let x: number;
  let y: number;
  do {
    x = random() * 2 - 1;
    y = random() * 2 - 1;
  } while (x * x + y * y > 1);
  out.x = x;
  out.y = y;
}

/** Sample a uniformly-distributed point inside the unit sphere (radius ≤ 1)
 *  and write it into `out.x` / `out.y` / `out.z`.
 *
 *  Uses 3D box rejection sampling: repeatedly draw from [-1, 1]³ until the
 *  point is inside the sphere. Expected draws per call ≈ 1.91 (sphere:cube
 *  volume ratio π/6 ≈ 0.524, so ~1.9× draws on average — fast in practice).
 *
 *  The `out` parameter may be the same object as any other argument (alias-safe:
 *  all reads are complete before any write). No allocation.
 */
export function randomInsideUnitSphere(random: RandomSource, out: Vector3Like): void {
  let x: number;
  let y: number;
  let z: number;
  do {
    x = random() * 2 - 1;
    y = random() * 2 - 1;
    z = random() * 2 - 1;
  } while (x * x + y * y + z * z > 1);
  out.x = x;
  out.y = y;
  out.z = z;
}

/** Sample a uniformly-distributed point on the unit circle and write it into
 *  `out.x` / `out.y`. The result has unit length (x² + y² = 1).
 *
 *  The `out` parameter may be the same object as any other argument (alias-safe:
 *  all reads complete before any write). No allocation.
 */
export function randomOnUnitCircle(random: RandomSource, out: Vector2Like): void {
  const angle = random() * Math.PI * 2;
  const x = Math.cos(angle);
  const y = Math.sin(angle);
  out.x = x;
  out.y = y;
}

/** Sample a uniformly-distributed point on the surface of the unit sphere
 *  and write it into `out.x` / `out.y` / `out.z`.
 *
 *  Uses the Marsaglia (1972) method — two uniform samples → rejection → a point
 *  on the sphere. The result has unit length (x² + y² + z² = 1).
 *
 *  The `out` parameter may be the same object as any other argument (alias-safe).
 *  No allocation.
 */
export function randomOnUnitSphere(random: RandomSource, out: Vector3Like): void {
  let x: number;
  let y: number;
  let s: number;
  // Marsaglia's method: sample inside the unit disc in 2D, then project.
  do {
    x = random() * 2 - 1;
    y = random() * 2 - 1;
    s = x * x + y * y;
  } while (s >= 1);
  const f = 2 * Math.sqrt(1 - s);
  const rx = x * f;
  const ry = y * f;
  const rz = 1 - 2 * s;
  out.x = rx;
  out.y = ry;
  out.z = rz;
}

/** Return a Poisson-distributed random integer with mean `lambda` (λ > 0).
 *
 *  Uses Knuth's multiplicative algorithm: multiply independent uniform samples
 *  until their product falls below `exp(-λ)`. Accurate and simple for small
 *  `lambda` (λ ≤ ~30); for large lambda, `randomGaussian(random, lambda,
 *  Math.sqrt(lambda))` is a faster approximation.
 *
 *  The result is a non-negative integer. Throws if `lambda <= 0`.
 *
 *  Deterministic: same `random` sequence → same output sequence.
 */
export function randomPoisson(random: RandomSource, lambda: number = 1): number {
  if (lambda <= 0) throw new RangeError('randomPoisson: lambda must be > 0');
  const limit = Math.exp(-lambda);
  let k = 0;
  let product = random();
  while (product > limit) {
    k++;
    product *= random();
  }
  return k;
}

/** Return a random index from a weight array, selected proportionally to
 *  each weight. Weights do not need to sum to 1.
 *
 *  Returns `-1` for an empty or all-zero weight array.
 *
 *  Useful for weighted spawn rules in particle emitters.
 */
export function randomWeighted(random: RandomSource, weights: Readonly<number[]>): number {
  let total = 0;
  for (let i = 0; i < weights.length; i++) total += weights[i];
  if (total <= 0) return -1;
  let r = random() * total;
  for (let i = 0; i < weights.length; i++) {
    r -= weights[i];
    if (r <= 0) return i;
  }
  return weights.length - 1;
}

/** Return a new array with the elements of `items` shuffled in a random order
 *  (Fisher–Yates / Knuth shuffle). Allocates a copy; does not mutate `items`.
 *
 *  Deterministic: same `random` state → same shuffled order.
 */
export function shuffle<T>(random: RandomSource, items: Readonly<T[]>): T[] {
  const copy = items.slice();
  shuffleInPlace(random, copy);
  return copy;
}

/** Shuffle `items` in place using the Fisher–Yates algorithm.
 *
 *  Mutates `items`. Deterministic: same `random` state → same shuffled order.
 */
export function shuffleInPlace<T>(random: RandomSource, items: T[]): void {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    const tmp = items[i];
    items[i] = items[j];
    items[j] = tmp;
  }
}
