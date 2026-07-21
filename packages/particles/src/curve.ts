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

/** Linearly interpolate two sRGB colors through HSV space, writing into `out[offset..+3]`.
 *  Used by the `colorInterpolation: 'hsv'` path in updateParticleEmitter2D. */
export function lerpHsvDirect(
  out: Float32Array | number[],
  offset: number,
  r0: number,
  g0: number,
  b0: number,
  r1: number,
  g1: number,
  b1: number,
  t: number,
): void {
  const [h0, s0, v0] = rgbToHsv(r0, g0, b0);
  const [h1, s1, v1] = rgbToHsv(r1, g1, b1);
  // Hue wraps around — take the shorter arc.
  let dh = h1 - h0;
  if (dh > 0.5) dh -= 1;
  else if (dh < -0.5) dh += 1;
  const [r, g, b] = hsvToRgb(h0 + dh * t, s0 + (s1 - s0) * t, v0 + (v1 - v0) * t);
  out[offset] = r;
  out[offset + 1] = g;
  out[offset + 2] = b;
}

/** Interpolate through HSV space using per-particle birth/death color arrays. */
export function lerpHsvInPlace(
  colorsOut: Float32Array | number[],
  offset: number,
  birth: Float32Array,
  death: Float32Array,
  t: number,
): void {
  lerpHsvDirect(
    colorsOut,
    offset,
    birth[offset],
    birth[offset + 1],
    birth[offset + 2],
    death[offset],
    death[offset + 1],
    death[offset + 2],
    t,
  );
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

/** Convert HSV to sRGB [0, 1]. Internal helper for HSV interpolation. */
function hsvToRgb(h: number, s: number, v: number): [number, number, number] {
  const c = v * s;
  const x = c * (1 - Math.abs(((h * 6) % 2) - 1));
  const m = v - c;
  const hi = Math.floor(h * 6) % 6;
  let r = 0;
  let g = 0;
  let b = 0;
  switch (hi) {
    case 0:
      r = c;
      g = x;
      b = 0;
      break;
    case 1:
      r = x;
      g = c;
      b = 0;
      break;
    case 2:
      r = 0;
      g = c;
      b = x;
      break;
    case 3:
      r = 0;
      g = x;
      b = c;
      break;
    case 4:
      r = x;
      g = 0;
      b = c;
      break;
    default:
      r = c;
      g = 0;
      b = x;
      break;
  }
  return [r + m, g + m, b + m];
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

/** Convert sRGB [0, 1] to HSV. Internal helper for HSV interpolation. */
function rgbToHsv(r: number, g: number, b: number): [number, number, number] {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  let h = 0;
  if (delta > 0) {
    if (max === r) h = ((g - b) / delta) % 6;
    else if (max === g) h = (b - r) / delta + 2;
    else h = (r - g) / delta + 4;
    h /= 6;
    if (h < 0) h += 1;
  }
  return [h, max === 0 ? 0 : delta / max, max];
}

/** Sample an interleaved RGB curve (length N×3) at t∈[0,1], writing the three
 *  channels into `out` starting at `offset`. */
export function sampleParticleColorCurve(
  out: { [index: number]: number },
  offset: number,
  lut: ParticleCurve,
  t: number,
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
