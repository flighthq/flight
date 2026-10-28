import type { EasingFunction } from '@flighthq/types/contract';

// Samples `ease` at uniformly spaced values of t in [0,1] and writes into the caller-owned `out`
// array. The first sample is ease(0) and the last is ease(1) when the output has at least two entries;
// a single-entry output samples ease(0.5). An empty output is a programmer error.
export function writeEasingSamples(out: Float32Array, ease: EasingFunction): void {
  const count = out.length;
  if (count === 0) throw new Error('writeEasingSamples: out must not be empty');
  if (count === 1) {
    out[0] = ease(0.5);
    return;
  }
  const step = 1 / (count - 1);
  for (let i = 0; i < count; i++) {
    const t = i * step;
    out[i] = ease(t < 0 ? 0 : t > 1 ? 1 : t);
  }
  out[0] = ease(0);
  out[count - 1] = ease(1);
}
