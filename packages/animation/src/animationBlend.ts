import { createEntity } from '@flighthq/entity';
import type { AnimationSampleAccumulator } from '@flighthq/types';

// Adds a non-negative weighted sample into caller-owned accumulation state. Quaternion samples are
// sign-aligned with the current sum so equivalent q/-q inputs do not cancel. No target or clip state
// is hidden here; callers decide which samples belong in one accumulator.
export function accumulateAnimationSample(
  accumulator: AnimationSampleAccumulator,
  sample: ArrayLike<number>,
  weight: number,
): void {
  if (!(weight > 0)) return;
  const components = Math.min(accumulator.components, accumulator.values.length, sample.length);
  let sign = 1;
  if (accumulator.quaternion && components >= 4 && accumulator.weight > 0) {
    const values = accumulator.values;
    const dot = values[0] * sample[0] + values[1] * sample[1] + values[2] * sample[2] + values[3] * sample[3];
    if (dot < 0) sign = -1;
  }
  for (let component = 0; component < components; component++) {
    accumulator.values[component] += sample[component] * weight * sign;
  }
  accumulator.weight += weight;
}

// Adds an additive animation delta to a base sample. Scalar/vector components use
// `base + delta * weight`. Quaternion deltas are weighted from identity, multiplied onto base, and
// normalized; this keeps additive rotation compositional rather than treating quaternion components
// as a vector. `out` may alias either input.
export function addAnimationSample(
  out: number[] | Float32Array,
  base: ArrayLike<number>,
  delta: ArrayLike<number>,
  weight: number,
  quaternion = false,
): void {
  if (quaternion && out.length >= 4 && base.length >= 4 && delta.length >= 4) {
    writeWeightedQuaternion(_quaternion, delta, weight);
    const ax = base[0],
      ay = base[1],
      az = base[2],
      aw = base[3];
    const bx = _quaternion[0],
      by = _quaternion[1],
      bz = _quaternion[2],
      bw = _quaternion[3];
    writeNormalizedQuaternion(
      out,
      aw * bx + ax * bw + ay * bz - az * by,
      aw * by - ax * bz + ay * bw + az * bx,
      aw * bz + ax * by - ay * bx + az * bw,
      aw * bw - ax * bx - ay * by - az * bz,
    );
    return;
  }

  const components = Math.min(out.length, base.length, delta.length);
  for (let component = 0; component < components; component++) {
    out[component] = base[component] + delta[component] * weight;
  }
}

// Blends two samples by `alpha` (clamped to [0,1]). Scalar/vector components lerp; quaternion inputs
// slerp over the shortest arc and normalize. `out` may alias either input.
export function blendAnimationSamples(
  out: number[] | Float32Array,
  a: ArrayLike<number>,
  b: ArrayLike<number>,
  alpha: number,
  quaternion = false,
): void {
  const t = alpha < 0 ? 0 : alpha > 1 ? 1 : alpha;
  if (quaternion && out.length >= 4 && a.length >= 4 && b.length >= 4) {
    slerpQuaternion(out, a, b, t);
    return;
  }
  const components = Math.min(out.length, a.length, b.length);
  for (let component = 0; component < components; component++) {
    out[component] = a[component] + (b[component] - a[component]) * t;
  }
}

// Allocates reusable target-free accumulation state. The result is an Entity, matching every Flight
// `create*` product; a bare scalar/vector accumulator pays only its component buffer.
export function createAnimationSampleAccumulator(components: number, quaternion = false): AnimationSampleAccumulator {
  const width = Math.max(0, components | 0);
  return createEntity({ components: width, quaternion, values: new Float32Array(width), weight: 0 });
}

// Writes a normalized weighted result. Returns false without changing `out` for an empty
// accumulator. Scalar/vector sums divide by total weight; quaternion sums normalize geometrically.
export function finishAnimationSample(
  out: number[] | Float32Array,
  accumulator: Readonly<AnimationSampleAccumulator>,
): boolean {
  if (!(accumulator.weight > 0)) return false;
  const components = Math.min(out.length, accumulator.components, accumulator.values.length);
  if (accumulator.quaternion && components >= 4) {
    const values = accumulator.values;
    writeNormalizedQuaternion(out, values[0], values[1], values[2], values[3]);
    return true;
  }
  const inverseWeight = 1 / accumulator.weight;
  for (let component = 0; component < components; component++) {
    out[component] = accumulator.values[component] * inverseWeight;
  }
  return true;
}

// Clears weighted state in place for reuse without reallocating the component buffer.
export function resetAnimationSampleAccumulator(accumulator: AnimationSampleAccumulator): void {
  accumulator.values.fill(0);
  accumulator.weight = 0;
}

function slerpQuaternion(
  out: number[] | Float32Array,
  a: ArrayLike<number>,
  b: ArrayLike<number>,
  alpha: number,
): void {
  const ax = a[0],
    ay = a[1],
    az = a[2],
    aw = a[3];
  let bx = b[0],
    by = b[1],
    bz = b[2],
    bw = b[3];
  let dot = ax * bx + ay * by + az * bz + aw * bw;
  if (dot < 0) {
    dot = -dot;
    bx = -bx;
    by = -by;
    bz = -bz;
    bw = -bw;
  }
  let scaleA: number;
  let scaleB: number;
  if (1 - dot > 1e-6) {
    const angle = Math.acos(Math.min(1, dot));
    const inverseSin = 1 / Math.sin(angle);
    scaleA = Math.sin((1 - alpha) * angle) * inverseSin;
    scaleB = Math.sin(alpha * angle) * inverseSin;
  } else {
    scaleA = 1 - alpha;
    scaleB = alpha;
  }
  writeNormalizedQuaternion(
    out,
    scaleA * ax + scaleB * bx,
    scaleA * ay + scaleB * by,
    scaleA * az + scaleB * bz,
    scaleA * aw + scaleB * bw,
  );
}

function writeNormalizedQuaternion(out: number[] | Float32Array, x: number, y: number, z: number, w: number): void {
  const length = Math.hypot(x, y, z, w);
  if (length === 0) {
    out[0] = 0;
    out[1] = 0;
    out[2] = 0;
    out[3] = 1;
    return;
  }
  const inverseLength = 1 / length;
  out[0] = x * inverseLength;
  out[1] = y * inverseLength;
  out[2] = z * inverseLength;
  out[3] = w * inverseLength;
}

function writeWeightedQuaternion(out: Float32Array, delta: ArrayLike<number>, weight: number): void {
  slerpQuaternion(out, IDENTITY_QUATERNION, delta, weight);
}

const IDENTITY_QUATERNION = new Float32Array([0, 0, 0, 1]);
const _quaternion = new Float32Array(4);
