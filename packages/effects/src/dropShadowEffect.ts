import type { DropShadowEffect } from '@flighthq/types';

// Drop-shadow composite effect: tint the scene silhouette, blur it, offset it by angle/distance, then composite the source over the shadow.
export function createDropShadowEffect(options: Readonly<Omit<DropShadowEffect, 'kind'>> = {}): DropShadowEffect {
  return { kind: 'DropShadowEffect', ...options };
}
