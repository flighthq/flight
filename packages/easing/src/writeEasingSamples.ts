// Generated from crates/flight-easing/src/write_easing_samples.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import type { EasingFunction } from './easingTypes.ts';

/**
 * Samples `ease` uniformly over the caller's entire output buffer.
 * The single-entry case samples the midpoint; larger buffers include both endpoints.
 * Throws the source count error before invoking `ease` when `out` is empty.
 */
export function writeEasingSamples(out: Float32Array, ease: EasingFunction): void {
  const count = out.length;
  if (count === 0) {
    throw new Error('createEasingSamples: count must be a finite integer >= 1');
  }
  if (count === 1) {
    out[0] = ease(0.5);
    return;
  }
  const step = 1.0 / (count - 1.0);
  for (let i = 0; i < count; i += 1) {
    const t = i * step;
    const clampedT = t < 0.0 ? 0.0 : t > 1.0 ? 1.0 : t;
    out[i] = ease(clampedT);
  }
  out[0] = ease(0.0);
  out[count - 1] = ease(1.0);
}
