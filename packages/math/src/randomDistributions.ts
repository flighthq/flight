// Generated from crates/flight-math/src/random_distributions.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

const ZERO_SAMPLE_EPSILON: number = 1.0 / 4503599627370496.0;

/**
 * Pick a random element from `items`, returning `undefined` when `items` is empty.
 *
 * Does not mutate `items`. Deterministic: same random sequence -> same picks.
 */
export function pick<T>(random: () => number, items: Readonly<T[]>): T | undefined {
  if (items.length === 0) {
    return undefined;
  }
  const index = Math.floor(random() * items.length);
  return items[index];
}

/**
 * Return an exponentially-distributed random number with the given `rate`
 * (lambda > 0, mean = 1/lambda).
 *
 * Uses the inverse CDF method: `-ln(U) / rate` where U is uniform on (0, 1].
 * The result is always non-negative. Throws if `rate` is not finite or not
 * positive.
 */
export function randomExponential(random: () => number, rate?: number): number {
  rate = rate ?? 1.0;
  if (!Number.isFinite(rate) || rate <= 0.0) {
    throw new RangeError('randomExponential: rate must be finite and > 0');
  }
  const u = random();
  const safeU = u === 0.0 ? ZERO_SAMPLE_EPSILON : u;
  return -Math.log(safeU) / rate;
}

/**
 * Return a normally-distributed random number with the given `mean` and
 * `standardDeviation`, using the Box-Muller transform.
 *
 * Each call consumes two values from `random` and discards one.
 */
export function randomGaussian(random: () => number, mean?: number, standardDeviation?: number): number {
  mean = mean ?? 0.0;
  standardDeviation = standardDeviation ?? 1.0;
  const u1 = random();
  const u2 = random();
  const safeU1 = u1 === 0.0 ? ZERO_SAMPLE_EPSILON : u1;
  const angle = Math.PI * 2 * u2;
  const z = Math.sqrt(-2.0 * Math.log(safeU1)) * Math.cos(angle);
  return mean + z * standardDeviation;
}

/**
 * Return two independent normally-distributed random numbers as `(z0, z1)`
 * sharing the same Box-Muller pair.
 *
 * Prefer this over calling `randomGaussian` twice when both samples are
 * needed — it consumes exactly 2 values from `random` instead of 4.
 */
export function randomGaussianPair(
  random: () => number,
  mean?: number,
  standardDeviation?: number,
): readonly [number, number] {
  mean = mean ?? 0.0;
  standardDeviation = standardDeviation ?? 1.0;
  const u1 = random();
  const u2 = random();
  const safeU1 = u1 === 0.0 ? ZERO_SAMPLE_EPSILON : u1;
  const mag = Math.sqrt(-2.0 * Math.log(safeU1));
  const angle = Math.PI * 2 * u2;
  const z0 = mean + mag * Math.cos(angle) * standardDeviation;
  const z1 = mean + mag * Math.sin(angle) * standardDeviation;
  return [z0, z1];
}

/**
 * Sample a uniformly-distributed point inside the unit disc (including the
 * boundary) and write it into `out[0]` / `out[1]`.
 *
 * Uses rejection sampling to avoid the over-dense centre that polar-radius
 * sampling without a square-root correction produces.
 */
export function randomInsideUnitDisc(out: number[], random: () => number): void {
  for (;;) {
    const x = random() * 2.0 - 1.0;
    const y = random() * 2.0 - 1.0;
    if (x * x + y * y <= 1.0) {
      out[0] = x;
      out[1] = y;
      return;
    }
  }
}

/**
 * Sample a uniformly-distributed point inside the unit sphere (radius <= 1)
 * and write it into `out[0]` / `out[1]` / `out[2]`.
 *
 * Uses 3D box rejection sampling.
 */
export function randomInsideUnitSphere(out: number[], random: () => number): void {
  for (;;) {
    const x = random() * 2.0 - 1.0;
    const y = random() * 2.0 - 1.0;
    const z = random() * 2.0 - 1.0;
    if (x * x + y * y + z * z <= 1.0) {
      out[0] = x;
      out[1] = y;
      out[2] = z;
      return;
    }
  }
}

/**
 * Sample a uniformly-distributed point on the unit circle and write it into
 * `out[0]` / `out[1]`. The result has unit length.
 */
export function randomOnUnitCircle(out: number[], random: () => number): void {
  const angle = random() * Math.PI * 2;
  const x = Math.cos(angle);
  const y = Math.sin(angle);
  out[0] = x;
  out[1] = y;
}

/**
 * Sample a uniformly-distributed point on the surface of the unit sphere
 * and write it into `out[0]` / `out[1]` / `out[2]`.
 *
 * Uses the Marsaglia (1972) method.
 */
export function randomOnUnitSphere(out: number[], random: () => number): void {
  let x: number;
  let y: number;
  let s: number;
  for (;;) {
    x = random() * 2.0 - 1.0;
    y = random() * 2.0 - 1.0;
    s = x * x + y * y;
    if (s < 1.0) {
      break;
    }
  }
  const f = 2.0 * Math.sqrt(1.0 - s);
  const rx = x * f;
  const ry = y * f;
  const rz = 1.0 - 2.0 * s;
  out[0] = rx;
  out[1] = ry;
  out[2] = rz;
}

/**
 * Return a Poisson-distributed random integer with mean `lambda` (lambda > 0).
 *
 * Uses Knuth's multiplicative algorithm. Accurate and simple for small
 * lambda (lambda <= ~30). Throws if `lambda` is not finite or not positive.
 */
export function randomPoisson(random: () => number, lambda?: number): number {
  lambda = lambda ?? 1.0;
  if (!Number.isFinite(lambda) || lambda <= 0.0) {
    throw new RangeError('randomPoisson: lambda must be finite and > 0');
  }
  const limit = Math.exp(-lambda);
  let k = 0;
  let product = random();
  while (product > limit) {
    k += 1;
    product *= random();
  }
  return k;
}

/**
 * Return a random index from a weight array, selected proportionally to
 * each weight. Weights do not need to sum to 1.
 *
 * Returns `-1` for an empty or all-zero weight array.
 */
export function randomWeighted(random: () => number, weights: Readonly<number[]>): number {
  let total = 0.0;
  let i = 0;
  while (i < weights.length) {
    total += weights[i];
    i += 1;
  }
  if (total <= 0.0) {
    return -1;
  }
  let r = random() * total;
  i = 0;
  while (i < weights.length) {
    r -= weights[i];
    if (r <= 0.0) {
      return i | 0;
    }
    i += 1;
  }
  return (weights.length - 1) | 0;
}

/**
 * Clear and fill `out` with the elements of `items` shuffled in a random order
 * (Fisher-Yates / Knuth shuffle). Reuses the caller's allocation and does not mutate `items`.
 */
export function shuffle<T>(out: T[], random: () => number, items: Readonly<T[]>): void {
  out.length = 0;
  out.push(...items);
  shuffleInPlace(random, out);
}

/**
 * Shuffle `items` in place using the Fisher-Yates algorithm.
 *
 * Mutates `items`. Deterministic: same random state -> same shuffled order.
 */
export function shuffleInPlace<T>(random: () => number, items: T[]): void {
  const len = items.length;
  if (len <= 1) {
    return;
  }
  let i = len - 1;
  while (i > 0) {
    const j = Math.floor(random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
    i -= 1;
  }
}
