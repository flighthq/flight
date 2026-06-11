/** A baked lifetime curve: values sampled at uniform positions across the
 *  particle's normalised age (t = 0 at birth, 1 at death), evaluated with linear
 *  interpolation between samples. A plain number array so it round-trips through
 *  JSON configs. Build one with {@link bakeCurve} / {@link bakeColorCurve}, or
 *  supply your own samples (a `colorCurve` is interleaved RGB, length = N×3).
 *
 *  Lifetime curves are entirely opt-in: an emitter with no curves runs the
 *  original linear interpolation path and pays nothing for the feature. */
export type ParticleCurve = ReadonlyArray<number>;

/** Bake an RGB function f:[0,1]→[r,g,b] into an interleaved curve LUT (length N×3). */
export function bakeColorCurve(f: (t: number) => readonly [number, number, number], samples = 33): number[] {
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
export function bakeCurve(f: (t: number) => number, samples = 33): number[] {
  const n = Math.max(2, samples | 0);
  const lut = new Array<number>(n);
  for (let i = 0; i < n; i++) lut[i] = f(i / (n - 1));
  return lut;
}

/** Sample an interleaved RGB curve (length N×3) at t∈[0,1], writing the three
 *  channels into `out` starting at `offset`. */
export function sampleColorCurve(
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
export function sampleCurve(lut: ParticleCurve, t: number): number {
  const n = lut.length;
  if (n === 0) return 0;
  if (n === 1) return lut[0];
  const x = (t <= 0 ? 0 : t >= 1 ? 1 : t) * (n - 1);
  const i = x | 0;
  if (i >= n - 1) return lut[n - 1];
  return lut[i] + (lut[i + 1] - lut[i]) * (x - i);
}
