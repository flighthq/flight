import type { GlitchEffect } from '@flighthq/types';

export function createGlitchEffect(options: Readonly<Omit<GlitchEffect, 'kind'>> = {}): GlitchEffect {
  return { kind: 'GlitchEffect', ...options };
}
