import type { OuterGlowEffect } from '@flighthq/types';

// Outer-glow composite effect: tint the scene silhouette, blur it centered (no offset), then composite the source over the glow.
export function createOuterGlowEffect(options: Readonly<Omit<OuterGlowEffect, 'kind'>> = {}): OuterGlowEffect {
  return { kind: 'OuterGlowEffect', ...options };
}
