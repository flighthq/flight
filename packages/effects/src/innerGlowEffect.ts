import type { InnerGlowEffect } from '@flighthq/types';

// Inner-glow composite effect: tint the inverted silhouette, blur inward, clip to the source alpha, then draw or hide the source.
export function createInnerGlowEffect(options: Readonly<Omit<InnerGlowEffect, 'kind'>> = {}): InnerGlowEffect {
  return { kind: 'InnerGlowEffect', ...options };
}
