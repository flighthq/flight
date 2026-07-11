import type { InnerShadowEffect } from '@flighthq/types';

// Inner-shadow composite effect: tint the inverted silhouette, blur, offset by angle/distance, clip to the source alpha, then composite over the source.
export function createInnerShadowEffect(options: Readonly<Omit<InnerShadowEffect, 'kind'>> = {}): InnerShadowEffect {
  return { kind: 'InnerShadowEffect', ...options };
}
