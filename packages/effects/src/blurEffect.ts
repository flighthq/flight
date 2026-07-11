import type { BlurEffect } from '@flighthq/types';

// Plain separable Gaussian blur intent. `blurX`/`blurY` are the per-axis Gaussian standard deviations
// in pixels; the backends realize them as a two-pass separable blur bouncing through an offscreen
// target. The spatial-effect sibling of the directional/radial/motion blur variants.
export function createBlurEffect(options: Readonly<Omit<BlurEffect, 'kind'>> = {}): BlurEffect {
  return { kind: 'BlurEffect', ...options };
}
