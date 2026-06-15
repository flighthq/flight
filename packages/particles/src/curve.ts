import type { ColorKeyframe, CurveKeyframe, ParticleCurve } from '@flighthq/types';

export type { ColorKeyframe, CurveKeyframe, ParticleCurve };

/** Bake an RGB function f:[0,1]→[r,g,b] into an interleaved curve LUT (length N×3). */
export function buildParticleColorCurve(f: (t: number) => readonly [number, number, number], samples = 33): number[] {
  const n = Math.max(2, samples | 0);
  const lut = new Array<number>(n * 3);
  for (let i = 0; i < n; i++) {
    const [r, g, b] = f(i / (n - 1));
    lut[i * 3] = r;
    lut[i * 3 + 1] = g;
    lut[i * 3 + 2] = b;
  }
  return lut;
}

/** Bake a scalar function f:[0,1]→value into an `samples`-entry curve LUT. */
export function buildParticleCurve(f: (t: number) => number, samples = 33): number[] {
  const n = Math.max(2, samples | 0);
  const lut = new Array<number>(n);
  for (let i = 0; i < n; i++) lut[i] = f(i / (n - 1));
  return lut;
}

/** Bake a piecewise-linear RGB timeline (e.g. an imported color gradient) into a
 *  uniform interleaved LUT (length N×3). */
export function particleColorCurveFromKeyframes(keys: ReadonlyArray<ColorKeyframe>, samples = 33): number[] {
  if (keys.length === 0) return [0, 0, 0, 0, 0, 0];
  const sorted = keys.slice().sort((a, b) => a.time - b.time);
  return buildParticleColorCurve((t) => {
    const seg = locateKeyframe(sorted, t);
    if (seg.f === 0) return [sorted[seg.i].r, sorted[seg.i].g, sorted[seg.i].b];
    const a = sorted[seg.i];
    const b = sorted[seg.i + 1];
    return [a.r + (b.r - a.r) * seg.f, a.g + (b.g - a.g) * seg.f, a.b + (b.b - a.b) * seg.f];
  }, samples);
}

/** Convert a baked interleaved RGB curve LUT (length N×3) back into color
 *  keyframes (one per sample, at uniform times). */
export function particleColorCurveToKeyframes(lut: ParticleCurve): ColorKeyframe[] {
  const n = Math.floor(lut.length / 3);
  if (n === 0) return [];
  if (n === 1) return [{ time: 0, r: lut[0], g: lut[1], b: lut[2] }];
  const keys: ColorKeyframe[] = new Array(n);
  for (let i = 0; i < n; i++) keys[i] = { time: i / (n - 1), r: lut[i * 3], g: lut[i * 3 + 1], b: lut[i * 3 + 2] };
  return keys;
}

/** Bake a piecewise-linear scalar timeline (e.g. an imported alpha-over-lifetime
 *  curve) into a uniform LUT. Keyframes need not be sorted; times are clamped to
 *  the [first, last] range. */
export function particleCurveFromKeyframes(keys: ReadonlyArray<CurveKeyframe>, samples = 33): number[] {
  if (keys.length === 0) return [0, 0];
  const sorted = keys.slice().sort((a, b) => a.time - b.time);
  return buildParticleCurve((t) => interpKeyframe(sorted, t), samples);
}

/** Convert a baked scalar curve LUT back into keyframes (one per sample, at
 *  uniform times). The inverse of {@link particleCurveFromKeyframes} for the common case
 *  of a 33-sample LUT — used by format serializers to round-trip authored curves. */
export function particleCurveToKeyframes(lut: ParticleCurve): CurveKeyframe[] {
  const n = lut.length;
  if (n === 0) return [];
  if (n === 1) return [{ time: 0, value: lut[0] }];
  const keys: CurveKeyframe[] = new Array(n);
  for (let i = 0; i < n; i++) keys[i] = { time: i / (n - 1), value: lut[i] };
  return keys;
}

function interpKeyframe(sorted: ReadonlyArray<CurveKeyframe>, t: number): number {
  const seg = locateKeyframe(sorted, t);
  if (seg.f === 0) return sorted[seg.i].value;
  const a = sorted[seg.i].value;
  const b = sorted[seg.i + 1].value;
  return a + (b - a) * seg.f;
}

// Find the keyframe segment containing t: returns the lower index `i` and the
// fractional position `f` into segment [i, i+1] (f = 0 means "use sorted[i] exactly").
function locateKeyframe(sorted: ReadonlyArray<{ time: number }>, t: number): { f: number; i: number } {
  const n = sorted.length;
  if (t <= sorted[0].time) return { f: 0, i: 0 };
  if (t >= sorted[n - 1].time) return { f: 0, i: n - 1 };
  for (let i = 0; i < n - 1; i++) {
    const t0 = sorted[i].time;
    const t1 = sorted[i + 1].time;
    if (t <= t1) {
      const span = t1 - t0;
      return { f: span <= 0 ? 0 : (t - t0) / span, i };
    }
  }
  return { f: 0, i: n - 1 };
}

/** Sample an interleaved RGB curve (length N×3) at t∈[0,1], writing the three
 *  channels into `out` starting at `offset`. */
export function sampleParticleColorCurve(
  lut: ParticleCurve,
  t: number,
  out: { [index: number]: number },
  offset: number,
): void {
  const n = lut.length / 3;
  if (n <= 0) {
    out[offset] = 0;
    out[offset + 1] = 0;
    out[offset + 2] = 0;
    return;
  }
  if (n === 1) {
    out[offset] = lut[0];
    out[offset + 1] = lut[1];
    out[offset + 2] = lut[2];
    return;
  }
  const x = (t <= 0 ? 0 : t >= 1 ? 1 : t) * (n - 1);
  const i = x | 0;
  if (i >= n - 1) {
    const base = (n - 1) * 3;
    out[offset] = lut[base];
    out[offset + 1] = lut[base + 1];
    out[offset + 2] = lut[base + 2];
    return;
  }
  const f = x - i;
  const a = i * 3;
  const b = a + 3;
  out[offset] = lut[a] + (lut[b] - lut[a]) * f;
  out[offset + 1] = lut[a + 1] + (lut[b + 1] - lut[a + 1]) * f;
  out[offset + 2] = lut[a + 2] + (lut[b + 2] - lut[a + 2]) * f;
}

/** Sample a uniformly-spaced scalar curve at t∈[0,1] with linear interpolation.
 *  Out-of-range t is clamped. An empty curve samples to 0; a single value is
 *  returned as-is. */
export function sampleParticleCurve(lut: ParticleCurve, t: number): number {
  const n = lut.length;
  if (n === 0) return 0;
  if (n === 1) return lut[0];
  const x = (t <= 0 ? 0 : t >= 1 ? 1 : t) * (n - 1);
  const i = x | 0;
  if (i >= n - 1) return lut[n - 1];
  return lut[i] + (lut[i + 1] - lut[i]) * (x - i);
}
