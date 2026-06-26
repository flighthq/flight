import type { AnimationInterpolation, AnimationTrack } from '@flighthq/types';
import { AnimationInterpolationLinear } from '@flighthq/types';

// Allocates an AnimationTrack. `times` must be ascending; `values` is the flat keyframe buffer
// (`components` numbers per keyframe for step/linear, 3 * `components` for cubic). Defaults:
// linear interpolation, 1 component, non-quaternion, no easing.
export function createAnimationTrack(opts: {
  times: ArrayLike<number>;
  values: ArrayLike<number>;
  components?: number;
  interpolation?: AnimationInterpolation;
  quaternion?: boolean;
  easing?: AnimationTrack['easing'];
}): AnimationTrack {
  return {
    components: opts.components ?? 1,
    easing: opts.easing ?? null,
    interpolation: opts.interpolation ?? AnimationInterpolationLinear,
    quaternion: opts.quaternion ?? false,
    times: opts.times,
    values: opts.values,
  };
}

// Samples `track` at time `t`, writing `track.components` numbers into `out`. `t` is clamped to the
// track's time range (before the first keyframe yields the first value; after the last yields the
// last). Step holds the previous keyframe; Linear interpolates component-wise (or slerps a quaternion
// track); Cubic is a glTF-style Hermite spline over the per-keyframe in/out tangents. A non-null
// `track.easing` reshapes the per-segment alpha first. Alloc-free; safe for hot loops.
export function sampleAnimationTrack(out: number[] | Float32Array, track: Readonly<AnimationTrack>, t: number): void {
  const { components, times, values } = track;
  const count = times.length;
  if (count === 0) {
    for (let c = 0; c < components; c++) out[c] = 0;
    return;
  }
  if (count === 1 || t <= times[0]) {
    copyKeyframeValue(out, track, 0);
    return;
  }
  if (t >= times[count - 1]) {
    copyKeyframeValue(out, track, count - 1);
    return;
  }

  // Locate the segment [i, i+1] containing t (times are ascending; t is strictly inside the range).
  let i = 0;
  while (i < count - 1 && times[i + 1] <= t) i++;
  const t0 = times[i];
  const dt = times[i + 1] - t0;
  let alpha = dt > 0 ? (t - t0) / dt : 0;
  if (track.easing !== null) alpha = track.easing(alpha);

  if (track.interpolation === 'Step') {
    copyKeyframeValue(out, track, i);
    return;
  }
  if (track.interpolation === 'Cubic') {
    sampleCubicSegment(out, track, i, alpha, dt);
    return;
  }

  // Linear.
  const oi = keyframeValueOffset(track, i);
  const oj = keyframeValueOffset(track, i + 1);
  if (track.quaternion && components === 4) {
    slerpFlatQuaternion(out, values, oi, oj, alpha);
    return;
  }
  for (let c = 0; c < components; c++) {
    const a = values[oi + c];
    out[c] = a + (values[oj + c] - a) * alpha;
  }
}

// Byte width of one keyframe block in the flat value buffer (cubic stores in/out tangents alongside
// the value, so 3x).
function keyframeStride(track: Readonly<AnimationTrack>): number {
  return track.interpolation === 'Cubic' ? track.components * 3 : track.components;
}

// Offset of keyframe `k`'s VALUE within the flat buffer (the middle slot for cubic, where the layout
// is [inTangent, value, outTangent]).
function keyframeValueOffset(track: Readonly<AnimationTrack>, k: number): number {
  const stride = keyframeStride(track);
  return track.interpolation === 'Cubic' ? k * stride + track.components : k * stride;
}

function copyKeyframeValue(out: number[] | Float32Array, track: Readonly<AnimationTrack>, k: number): void {
  const off = keyframeValueOffset(track, k);
  for (let c = 0; c < track.components; c++) out[c] = track.values[off + c];
}

// glTF cubic-spline (Hermite) interpolation of segment [i, i+1] at `alpha`, with `dt` the segment
// duration (tangents are derivatives, scaled by dt). Quaternion tracks are interpolated component-wise
// then renormalized.
function sampleCubicSegment(
  out: number[] | Float32Array,
  track: Readonly<AnimationTrack>,
  i: number,
  alpha: number,
  dt: number,
): void {
  const { components, values } = track;
  const stride = components * 3;
  const a2 = alpha * alpha;
  const a3 = a2 * alpha;
  const h00 = 2 * a3 - 3 * a2 + 1;
  const h10 = a3 - 2 * a2 + alpha;
  const h01 = -2 * a3 + 3 * a2;
  const h11 = a3 - a2;
  const base0 = i * stride;
  const base1 = (i + 1) * stride;
  for (let c = 0; c < components; c++) {
    const p0 = values[base0 + components + c]; // value at i
    const m0 = values[base0 + components * 2 + c]; // out-tangent at i
    const p1 = values[base1 + components + c]; // value at i+1
    const m1 = values[base1 + c]; // in-tangent at i+1
    out[c] = h00 * p0 + h10 * dt * m0 + h01 * p1 + h11 * dt * m1;
  }
  if (track.quaternion && components === 4) normalizeFlatQuaternion(out);
}

// Spherical-linear interpolation of two unit quaternions stored flat at `oa`/`ob` in `values`, written
// to `out[0..3]`. Picks the shorter arc; falls back to normalized-lerp for nearly-parallel quaternions.
function slerpFlatQuaternion(
  out: number[] | Float32Array,
  values: ArrayLike<number>,
  oa: number,
  ob: number,
  alpha: number,
): void {
  const ax = values[oa],
    ay = values[oa + 1],
    az = values[oa + 2],
    aw = values[oa + 3];
  let bx = values[ob],
    by = values[ob + 1],
    bz = values[ob + 2],
    bw = values[ob + 3];
  let cosom = ax * bx + ay * by + az * bz + aw * bw;
  if (cosom < 0) {
    cosom = -cosom;
    bx = -bx;
    by = -by;
    bz = -bz;
    bw = -bw;
  }
  let scale0: number;
  let scale1: number;
  if (1 - cosom > 1e-6) {
    const omega = Math.acos(cosom);
    const sinom = Math.sin(omega);
    scale0 = Math.sin((1 - alpha) * omega) / sinom;
    scale1 = Math.sin(alpha * omega) / sinom;
  } else {
    scale0 = 1 - alpha;
    scale1 = alpha;
  }
  out[0] = scale0 * ax + scale1 * bx;
  out[1] = scale0 * ay + scale1 * by;
  out[2] = scale0 * az + scale1 * bz;
  out[3] = scale0 * aw + scale1 * bw;
}

function normalizeFlatQuaternion(out: number[] | Float32Array): void {
  const x = out[0],
    y = out[1],
    z = out[2],
    w = out[3];
  const len = Math.hypot(x, y, z, w);
  if (len > 0) {
    const inv = 1 / len;
    out[0] = x * inv;
    out[1] = y * inv;
    out[2] = z * inv;
    out[3] = w * inv;
  }
}
